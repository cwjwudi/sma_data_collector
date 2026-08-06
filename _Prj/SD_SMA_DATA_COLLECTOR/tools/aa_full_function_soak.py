"""Run a bounded, mixed poll/subscription soak against the real PLC and database."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from runtime.collector_runtime import DataCollectionSystem  # noqa: E402


def count_rows(system: DataCollectionSystem) -> dict[str, int | None]:
    assert system.config and system.db_manager
    counts: dict[str, int | None] = {}
    for group in system.config.groups:
        table = system.db_manager.current_table_names.get(group.name)
        if group.partition_interval_years == 0:
            table = group.name
        try:
            if not table:
                raise RuntimeError(f"no active table for {group.name}")
            rows = system.db_manager.execute_query(f"SELECT COUNT(*) FROM `{table}`")
            counts[group.name] = int(rows[0][0]) if rows else 0
        except Exception:  # noqa: BLE001
            counts[group.name] = None
    return counts


async def wait_until(predicate, timeout: float, interval: float = 0.1) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        await asyncio.sleep(interval)
    return bool(predicate())


async def run(
    config: Path,
    duration: float,
    disconnect_at: list[float],
    report: Path,
) -> int:
    system = DataCollectionSystem(str(config.resolve()))
    started_at = datetime.now().astimezone()
    started = time.monotonic()
    events: Counter[str] = Counter()
    trigger_types: dict[str, Counter[str]] = {}
    faults: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    rows_before: dict[str, int | None] = {}
    rows_after: dict[str, int | None] = {}
    start_task: asyncio.Task | None = None
    expected_fault_count = 0

    def capture(row: dict[str, Any]) -> None:
        group_name = str(row.get("group_name"))
        events[group_name] += 1
        trigger_types.setdefault(group_name, Counter())[
            str(row.get("trigger_type"))
        ] += 1

    try:
        if not await system.initialize():
            raise RuntimeError("collector initialization failed")
        assert (
            system.config
            and system.communication_manager
            and system.data_collector
            and system.storage_processor
        )
        system.data_collector.register_data_callback(capture)
        rows_before = count_rows(system)
        start_task = asyncio.create_task(
            system.start(),
            name="aa-full-function-soak-collector",
        )
        ready = await wait_until(
            lambda: all(
                client.is_connected()
                for client in system.communication_manager.clients.values()
            ),
            timeout=30.0,
        )
        if not ready:
            raise RuntimeError("OPC UA clients did not become ready")

        pending_faults = sorted(item for item in disconnect_at if 0 < item < duration)
        expected_fault_count = len(pending_faults) * len(
            system.communication_manager.clients
        )
        next_progress = 60.0
        logging.getLogger().setLevel(logging.WARNING)

        while time.monotonic() - started < duration:
            elapsed = time.monotonic() - started
            while pending_faults and elapsed >= pending_faults[0]:
                scheduled = pending_faults.pop(0)
                for name, client in system.communication_manager.clients.items():
                    before_handles = sum(
                        registration.handle is not None
                        for registration in client._subscriptions.values()
                    )
                    raw_client = client.client
                    fault_started = time.monotonic()
                    if raw_client is not None:
                        await raw_client.disconnect()
                        await client._mark_disconnected(
                            ConnectionError("soak test injected transport disconnect"),
                            expected_client=raw_client,
                        )
                    recovered = await wait_until(
                        lambda client=client, before_handles=before_handles: (
                            client.is_connected()
                            and sum(
                                registration.handle is not None
                                for registration in client._subscriptions.values()
                            )
                            == before_handles
                        ),
                        timeout=30.0,
                    )
                    fault = {
                        "scheduled_at_seconds": scheduled,
                        "communication": name,
                        "recovered": recovered,
                        "recovery_seconds": time.monotonic() - fault_started,
                        "subscription_handles_before": before_handles,
                        "subscription_handles_after": sum(
                            registration.handle is not None
                            for registration in client._subscriptions.values()
                        ),
                    }
                    faults.append(fault)
                    if not recovered:
                        errors.append(
                            {
                                "communication": name,
                                "error": "reconnect/subscription restore timeout",
                            }
                        )

            if elapsed >= next_progress:
                metrics = system.storage_processor.get_runtime_metrics()
                print(
                    json.dumps(
                        {
                            "elapsed_seconds": round(elapsed, 1),
                            "events": dict(events),
                            "connection_states": {
                                name: client.get_connection_state()
                                for name, client
                                in system.communication_manager.clients.items()
                            },
                            "subscription_events": system.data_collector.metrics.get(
                                "subscription_events_received", 0
                            ),
                            "db_rows_committed": metrics.get("db_rows_committed", 0),
                            "outbox_pending": metrics.get("outbox_pending_size", 0),
                            "outbox_retry": metrics.get("outbox_retry_size", 0),
                            "outbox_dead_letter": metrics.get(
                                "outbox_dead_letter_size", 0
                            ),
                            "faults": len(faults),
                            "errors": len(errors),
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
                next_progress += 60.0
            await asyncio.sleep(0.5)
    except Exception as exc:  # noqa: BLE001
        errors.append({"fatal": repr(exc)})
    finally:
        elapsed = time.monotonic() - started
        if system.db_manager and system.config:
            rows_after = count_rows(system)
        connection_states = (
            {
                name: client.get_connection_state()
                for name, client in system.communication_manager.clients.items()
            }
            if system.communication_manager
            else {}
        )
        await system.stop()
        if start_task is not None:
            await asyncio.gather(start_task, return_exceptions=True)

    collector_metrics = (
        dict(system.data_collector.metrics) if system.data_collector else {}
    )
    storage_metrics = (
        system.storage_processor.get_runtime_metrics()
        if system.storage_processor
        else {}
    )
    row_deltas = {
        name: (
            None
            if rows_after.get(name) is None
            else rows_after[name] - (rows_before.get(name) or 0)
        )
        for name in set(rows_before) | set(rows_after)
    }
    configured_groups = (
        [group.name for group in system.config.groups] if system.config else []
    )
    passed = bool(
        elapsed >= duration
        and configured_groups
        and all(events[name] > 0 for name in configured_groups)
        and all((row_deltas.get(name) or 0) > 0 for name in configured_groups)
        and len(faults) == expected_fault_count
        and all(fault["recovered"] for fault in faults)
        and connection_states
        and all(state == "connected" for state in connection_states.values())
        and not errors
        and storage_metrics.get("outbox_pending_size", 0) == 0
        and storage_metrics.get("outbox_processing_size", 0) == 0
        and storage_metrics.get("outbox_retry_size", 0) == 0
        and storage_metrics.get("outbox_dead_letter_size", 0) == 0
        and storage_metrics.get("shutdown_rows_remaining", 0) == 0
    )
    result = {
        "test": "aa_full_function_mixed_mode_soak",
        "config": str(config.resolve()),
        "started_at": started_at.isoformat(),
        "ended_at": datetime.now().astimezone().isoformat(),
        "duration_requested_seconds": duration,
        "duration_actual_seconds": elapsed,
        "passed": passed,
        "events": dict(events),
        "trigger_types": {
            name: dict(counter) for name, counter in trigger_types.items()
        },
        "faults": faults,
        "errors": errors,
        "connection_states_before_shutdown": connection_states,
        "collector_metrics": collector_metrics,
        "storage_metrics": storage_metrics,
        "database_rows_before": rows_before,
        "database_rows_after": rows_after,
        "database_row_delta_rule": (
            "A partition table absent before startup is treated as a zero-row baseline."
        ),
        "database_row_deltas": row_deltas,
    }
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str), flush=True)
    return 0 if passed else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--duration", type=float, default=3605.0)
    parser.add_argument("--disconnect-at", type=float, action="append", default=[])
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    return asyncio.run(
        run(
            args.config,
            args.duration,
            args.disconnect_at,
            args.report.resolve(),
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
