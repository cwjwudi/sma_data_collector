"""Inject a bounded database-write outage and verify persistent outbox recovery."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from runtime.collector_runtime import DataCollectionSystem  # noqa: E402


def build_test_config(source: Path) -> tuple[Path, Path]:
    payload = json.loads(source.read_text(encoding="utf-8"))
    payload["database"]["name"] = (
        f"{payload['database']['name']}_outbox_fault_test"
    )
    payload["database"]["data_groups"] = ["Data_Product"]
    for group in payload.get("groups", []):
        group["partition_interval_years"] = 0
        if group.get("name") == "Data_Product":
            group["trigger"] = "time"
            group["trigger_point"] = None
            group["trigger_mode"] = "poll"
            group["interval_seconds"] = 0.2
            group["interval_point"] = None
            group.pop("variable_point_overrides", None)
            group["batch_insert_size"] = 3
    for connection in payload.get("connections", []):
        connection["heartbeats"] = []

    queue_path = Path(tempfile.gettempdir()) / (
        f"sd_sma_outbox_fault_{os.getpid()}_{time.time_ns()}.db"
    )
    payload["persistent_queue"] = {
        "enabled": True,
        "path": str(queue_path),
        "synchronous": "FULL",
        "busy_timeout_ms": 5000,
        "lease_seconds": 2,
        "retry_interval_seconds": 0.5,
        "max_retry_interval_seconds": 2,
        "max_attempts": 10,
        "completed_retention_days": 1,
        "cleanup_interval_seconds": 3600,
        "max_queue_rows": 10000,
    }
    logging_config = payload.setdefault("logging", {})
    logging_config["level"] = "WARNING"
    logging_config["output_dir"] = str(
        Path(tempfile.gettempdir()) / f"sd_sma_outbox_fault_logs_{os.getpid()}"
    )

    source = source.resolve()
    temp_config = source.with_name(
        f".{source.stem}.outbox-fault-{os.getpid()}-{time.time_ns()}.json"
    )
    temp_config.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return temp_config, queue_path


async def wait_until(predicate, timeout: float, interval: float = 0.1) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        await asyncio.sleep(interval)
    return bool(predicate())


async def run(source: Path, outage_seconds: float, report: Path) -> int:
    temp_config, queue_path = build_test_config(source)
    system = DataCollectionSystem(str(temp_config))
    started_at = datetime.now().astimezone()
    start_task: asyncio.Task | None = None
    error: str | None = None
    injected_metrics: dict[str, Any] = {}
    recovered = False

    try:
        if not await system.initialize():
            raise RuntimeError("collector initialization failed")
        assert system.db_manager and system.storage_processor
        start_task = asyncio.create_task(
            system.start(),
            name="persistent-outbox-fault-collector",
        )
        initial_commit = await wait_until(
            lambda: system.storage_processor.metrics.get("db_rows_committed", 0) >= 3,
            timeout=15,
        )
        if not initial_commit:
            raise RuntimeError("initial database commit timeout")

        original_execute_insert_many = system.db_manager.execute_insert_many

        def fail_insert_many(
            _table_name: str,
            _rows: list[dict[str, Any]],
            _retry_on_disconnect: bool = True,
        ) -> int:
            return -1

        system.db_manager.execute_insert_many = fail_insert_many
        retry_observed = await wait_until(
            lambda: (
                system.storage_processor.get_runtime_metrics().get(
                    "outbox_retry_size", 0
                )
                > 0
            ),
            timeout=max(5.0, outage_seconds),
        )
        await asyncio.sleep(max(0.0, outage_seconds))
        injected_metrics = system.storage_processor.get_runtime_metrics()
        system.db_manager.execute_insert_many = original_execute_insert_many
        recovered = await wait_until(
            lambda: (
                system.storage_processor.get_runtime_metrics().get(
                    "outbox_pending_size", 0
                )
                == 0
                and system.storage_processor.get_runtime_metrics().get(
                    "outbox_processing_size", 0
                )
                == 0
                and system.storage_processor.get_runtime_metrics().get(
                    "outbox_retry_size", 0
                )
                == 0
                and system.storage_processor.metrics.get("db_rows_retried", 0) > 0
            ),
            timeout=20,
        )
        if not retry_observed:
            raise RuntimeError("outbox retry state was not observed")
    except Exception as exc:  # noqa: BLE001
        error = f"{type(exc).__name__}: {exc}"
    finally:
        await system.stop()
        if start_task is not None:
            await asyncio.gather(start_task, return_exceptions=True)

    final_metrics = (
        system.storage_processor.get_runtime_metrics()
        if system.storage_processor
        else {}
    )
    passed = bool(
        error is None
        and injected_metrics.get("outbox_retry_size", 0) > 0
        and recovered
        and final_metrics.get("outbox_pending_size", 0) == 0
        and final_metrics.get("outbox_processing_size", 0) == 0
        and final_metrics.get("outbox_retry_size", 0) == 0
        and final_metrics.get("outbox_dead_letter_size", 0) == 0
        and final_metrics.get("shutdown_rows_remaining", 0) == 0
    )
    result = {
        "test": "persistent_outbox_database_write_fault",
        "source_config": str(source.resolve()),
        "started_at": started_at.isoformat(),
        "ended_at": datetime.now().astimezone().isoformat(),
        "outage_seconds": outage_seconds,
        "passed": passed,
        "error": error,
        "recovered": recovered,
        "metrics_during_outage": injected_metrics,
        "final_metrics": final_metrics,
    }
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str), flush=True)

    if (
        system.storage_processor is not None
        and system.storage_processor.persistent_store is not None
    ):
        system.storage_processor.persistent_store.close()
    temp_config.unlink(missing_ok=True)
    for candidate in (
        queue_path,
        Path(f"{queue_path}-wal"),
        Path(f"{queue_path}-shm"),
    ):
        candidate.unlink(missing_ok=True)
    return 0 if passed else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--outage-seconds", type=float, default=3.0)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    return asyncio.run(
        run(args.config, args.outage_seconds, args.report.resolve())
    )


if __name__ == "__main__":
    raise SystemExit(main())
