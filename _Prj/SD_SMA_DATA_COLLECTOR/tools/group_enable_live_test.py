"""Run a bounded real PLC/MySQL stability test for per-group external enable control."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import tempfile
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from runtime.collector_runtime import DataCollectionSystem


GROUP_ENABLE_POINTS = {
    "Data_Recipe": "RecipeCollectEnable",
    "Data_Product": "ProductCollectEnable",
    "Data_Alarm": "AlarmCollectEnable",
    "Data_Audit": "AuditCollectEnable",
    "Data_Batch": "BatchCollectEnable",
    "Data_BatchInfo": "BatchInfoCollectEnable",
}
POINT_PREFIX = "ns=6;s=::AsGlobalPV:gDataSQLOperate."


def build_test_config(source: Path) -> dict[str, Any]:
    payload = json.loads(source.read_text(encoding="utf-8"))
    known_points = {point["name"] for point in payload.get("points", [])}
    for point_name in GROUP_ENABLE_POINTS.values():
        if point_name not in known_points:
            payload.setdefault("points", []).append(
                {
                    "name": point_name,
                    "path": f"{POINT_PREFIX}{point_name}",
                    "description": f"采集组外部启用控制-{point_name}",
                    "datatype": "bool",
                }
            )
    for group in payload.get("groups", []):
        point_name = GROUP_ENABLE_POINTS.get(group.get("name"))
        if point_name:
            group["enable_point"] = point_name
    return payload


def configure_disable_flush_test(
    payload: dict[str, Any], toggle_group: str, outbox_path: Path
) -> None:
    """Force partial batches so every disable transition must flush cached rows."""
    payload["database"]["data_groups"] = [toggle_group]
    for group in payload.get("groups", []):
        if group.get("name") == toggle_group:
            group["batch_insert_size"] = 100000
            break
    payload["persistent_queue"] = {
        "enabled": True,
        "path": str(outbox_path),
        "synchronous": "FULL",
        "busy_timeout_ms": 5000,
        "lease_seconds": 60,
        "retry_interval_seconds": 2,
        "max_retry_interval_seconds": 30,
        "max_attempts": 0,
        "completed_retention_days": 1,
        "cleanup_interval_seconds": 3600,
        "max_queue_rows": 100000,
    }


async def wait_for_count_increase(
    counts: Counter[str], group_name: str, baseline: int, timeout: float
) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if counts[group_name] > baseline:
            return True
        await asyncio.sleep(0.25)
    return False


async def run_test(
    source_config: Path,
    duration: float,
    evidence_path: Path,
    toggle_group: str,
    cycle_seconds: float,
    off_seconds: float,
    verify_disable_flush: bool,
) -> int:
    if toggle_group not in GROUP_ENABLE_POINTS:
        raise ValueError(f"unsupported toggle group: {toggle_group}")
    if cycle_seconds <= off_seconds + 5:
        raise ValueError("cycle_seconds must be at least off_seconds + 5")

    test_payload = build_test_config(source_config)
    outbox_path = Path(tempfile.gettempdir()) / (
        f"sd_sma_group_disable_flush_{os.getpid()}_{time.time_ns()}.db"
    )
    if verify_disable_flush:
        configure_disable_flush_test(test_payload, toggle_group, outbox_path)
    temp_path = ""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", encoding="utf-8", delete=False
    ) as temp_file:
        json.dump(test_payload, temp_file, ensure_ascii=False, indent=2)
        temp_path = temp_file.name

    started_at = datetime.now()
    started_monotonic = time.monotonic()
    counts: Counter[str] = Counter()
    transitions: list[dict[str, Any]] = []
    off_windows: list[dict[str, Any]] = []
    flush_windows: list[dict[str, Any]] = []
    error: str | None = None
    db_summary: dict[str, Any] = {}
    system = DataCollectionSystem(temp_path)
    start_task: asyncio.Task | None = None
    control_task: asyncio.Task | None = None
    opcua_client = None

    def capture(row: dict[str, Any]) -> None:
        counts[str(row.get("group_name"))] += 1

    try:
        initialized = await system.initialize()
        if not initialized or system.data_collector is None or system.config is None:
            raise RuntimeError("collector initialization failed")
        system.data_collector.register_data_callback(capture)
        start_task = asyncio.create_task(system.start(), name="group-enable-live-collector")

        target_group = next(group for group in system.config.groups if group.name == toggle_group)
        enable_point = next(
            point for point in system.config.points if point.name == target_group.enable_point
        )
        opcua_client = system.communication_manager.get_client_for_group(toggle_group)
        if opcua_client is None:
            raise RuntimeError(f"no OPC UA client for {toggle_group}")

        async def set_enable(value: bool) -> None:
            if not await opcua_client.write_boolean_value(enable_point.path, value):
                raise RuntimeError(f"failed to write {enable_point.name}={value}")
            readback = await opcua_client.read_data_points([enable_point])
            actual = readback.get(enable_point.name, {}).get("value")
            if bool(actual) is not value:
                raise RuntimeError(
                    f"readback mismatch for {enable_point.name}: expected {value}, got {actual!r}"
                )
            transitions.append(
                {
                    "at": datetime.now().isoformat(timespec="milliseconds"),
                    "value": value,
                    "readback": actual,
                }
            )

        for group_name, point_name in GROUP_ENABLE_POINTS.items():
            point = next(point for point in system.config.points if point.name == point_name)
            group_client = system.communication_manager.get_client_for_group(group_name)
            if not await group_client.write_boolean_value(point.path, True):
                raise RuntimeError(f"failed to initialize {point_name}=True")

        async def control_loop() -> None:
            await asyncio.sleep(5.0)
            cycle = 0
            while time.monotonic() - started_monotonic < duration - 5:
                cycle_started = time.monotonic()
                cycle += 1
                queued_before_disable = sum(
                    1
                    for row in system.storage_processor.data_queue
                    if row.get("group_name") == toggle_group
                )
                requested_before = system.storage_processor.metrics.get(
                    "group_flush_rows_requested", 0
                )
                committed_before = system.storage_processor.metrics.get(
                    "group_flush_rows_committed", 0
                )
                disable_started = time.monotonic()
                await set_enable(False)
                if verify_disable_flush:
                    deadline = time.monotonic() + 10.0
                    while (
                        system.storage_processor.metrics.get(
                            "group_flush_rows_requested", 0
                        )
                        <= requested_before
                        and time.monotonic() < deadline
                    ):
                        await asyncio.sleep(0.05)
                    requested_rows = (
                        system.storage_processor.metrics.get(
                            "group_flush_rows_requested", 0
                        )
                        - requested_before
                    )
                    while (
                        system.storage_processor.metrics.get(
                            "group_flush_rows_committed", 0
                        )
                        < committed_before + requested_rows
                        and time.monotonic() < deadline
                    ):
                        await asyncio.sleep(0.05)
                    committed_rows = (
                        system.storage_processor.metrics.get(
                            "group_flush_rows_committed", 0
                        )
                        - committed_before
                    )
                    queued_after_flush = sum(
                        1
                        for row in system.storage_processor.data_queue
                        if row.get("group_name") == toggle_group
                    )
                    flush_latency = time.monotonic() - disable_started
                    flush_windows.append(
                        {
                            "cycle": cycle,
                            "queued_before_disable": queued_before_disable,
                            "rows_requested": requested_rows,
                            "rows_committed": committed_rows,
                            "queued_after_flush": queued_after_flush,
                            "flush_latency_seconds": flush_latency,
                        }
                    )
                    if requested_rows <= 0:
                        raise RuntimeError(
                            f"{toggle_group} had no partial batch to flush on disable"
                        )
                    if committed_rows != requested_rows or queued_after_flush != 0:
                        raise RuntimeError(
                            f"{toggle_group} disable flush incomplete: "
                            f"requested={requested_rows}, committed={committed_rows}, "
                            f"queued={queued_after_flush}"
                        )
                    if flush_latency > 5.0:
                        raise RuntimeError(
                            f"{toggle_group} disable flush took {flush_latency:.3f}s"
                        )
                else:
                    await asyncio.sleep(2.0)
                baseline = counts[toggle_group]
                disabled_at = datetime.now().isoformat(timespec="milliseconds")
                await asyncio.sleep(off_seconds)
                after_off = counts[toggle_group]
                await set_enable(True)
                resumed = await wait_for_count_increase(
                    counts, toggle_group, after_off, timeout=min(20.0, cycle_seconds / 2)
                )
                off_windows.append(
                    {
                        "cycle": cycle,
                        "disabled_at": disabled_at,
                        "baseline_after_grace": baseline,
                        "count_before_enable": after_off,
                        "events_while_disabled": after_off - baseline,
                        "resumed": resumed,
                    }
                )
                if after_off != baseline:
                    raise RuntimeError(
                        f"{toggle_group} produced {after_off - baseline} event(s) while disabled"
                    )
                if not resumed:
                    raise RuntimeError(f"{toggle_group} did not resume after re-enable")
                remaining = cycle_seconds - (time.monotonic() - cycle_started)
                if remaining > 0:
                    await asyncio.sleep(remaining)

        control_task = asyncio.create_task(control_loop(), name="group-enable-controller")
        next_progress = 60.0
        while True:
            elapsed = time.monotonic() - started_monotonic
            if start_task.done():
                start_task.result()
                raise RuntimeError("collector stopped before requested duration")
            if control_task.done():
                control_task.result()
            if elapsed >= duration:
                break
            if elapsed >= next_progress:
                print(
                    f"progress elapsed={elapsed:.1f}s counts={dict(counts)} "
                    f"off_windows={len(off_windows)}",
                    flush=True,
                )
                next_progress += 60.0
            await asyncio.sleep(min(1.0, duration - elapsed))

        await asyncio.sleep(2.0)
        for group in system.config.groups:
            table = system.db_manager.get_current_table_name(
                group.name,
                partition_time=started_at,
                partition_interval_years=group.partition_interval_years,
            )
            rows = system.db_manager.execute_query(
                f"SELECT COUNT(*) FROM `{table}` WHERE `created_at` >= :started_at",
                {"started_at": started_at.replace(microsecond=0)},
            )
            db_summary[group.name] = {
                "table": table,
                "rows_since_start": int(rows[0][0] or 0) if rows else 0,
            }
    except Exception as exc:  # noqa: BLE001
        error = f"{type(exc).__name__}: {exc}"
    finally:
        if control_task is not None:
            control_task.cancel()
            await asyncio.gather(control_task, return_exceptions=True)
        if opcua_client is not None and system.config is not None:
            for group_name, point_name in GROUP_ENABLE_POINTS.items():
                try:
                    point = next(point for point in system.config.points if point.name == point_name)
                    group_client = system.communication_manager.get_client_for_group(group_name)
                    await group_client.write_boolean_value(point.path, True)
                except Exception:  # noqa: BLE001
                    pass
        await system.stop()
        if start_task is not None:
            if not start_task.done():
                await asyncio.wait_for(start_task, timeout=10.0)
            else:
                await asyncio.gather(start_task, return_exceptions=True)
        if (
            system.storage_processor is not None
            and system.storage_processor.persistent_store is not None
        ):
            system.storage_processor.persistent_store.close()
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        if verify_disable_flush:
            for candidate in (outbox_path, Path(f"{outbox_path}-wal"), Path(f"{outbox_path}-shm")):
                try:
                    candidate.unlink()
                except OSError:
                    pass

    elapsed = time.monotonic() - started_monotonic
    collector_metrics = dict(system.data_collector.metrics) if system.data_collector else {}
    storage_metrics = dict(system.storage_processor.metrics) if system.storage_processor else {}
    passed = bool(
        error is None
        and elapsed >= duration
        and off_windows
        and all(window["events_while_disabled"] == 0 for window in off_windows)
        and all(window["resumed"] for window in off_windows)
        and counts[toggle_group] > len(off_windows)
        and db_summary.get(toggle_group, {}).get("rows_since_start", 0) > 0
        and collector_metrics.get("group_enable_read_failed", 0) == 0
        and collector_metrics.get("group_enable_invalid", 0) == 0
        and (
            not verify_disable_flush
            or (
                len(flush_windows) == len(off_windows)
                and all(window["rows_requested"] > 0 for window in flush_windows)
                and all(
                    window["rows_committed"] == window["rows_requested"]
                    and window["queued_after_flush"] == 0
                    and window["flush_latency_seconds"] <= 5.0
                    for window in flush_windows
                )
            )
        )
    )
    evidence = {
        "test": "group_external_enable_live",
        "source_config": str(source_config.resolve()),
        "started_at": started_at.isoformat(timespec="milliseconds"),
        "ended_at": datetime.now().isoformat(timespec="milliseconds"),
        "requested_duration_seconds": duration,
        "elapsed_seconds": elapsed,
        "toggle_group": toggle_group,
        "cycle_seconds": cycle_seconds,
        "off_seconds": off_seconds,
        "verify_disable_flush": verify_disable_flush,
        "passed": passed,
        "error": error,
        "event_counts": dict(counts),
        "off_windows": off_windows,
        "flush_windows": flush_windows,
        "transitions": transitions,
        "db_summary": db_summary,
        "collector_metrics": collector_metrics,
        "storage_metrics": storage_metrics,
    }
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(json.dumps(evidence, ensure_ascii=False, default=str))
    return 0 if passed else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--duration", type=float, default=3605.0)
    parser.add_argument("--toggle-group", default="Data_Product")
    parser.add_argument("--cycle-seconds", type=float, default=120.0)
    parser.add_argument("--off-seconds", type=float, default=15.0)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--verify-disable-flush", action="store_true")
    args = parser.parse_args()
    return asyncio.run(
        run_test(
            args.config,
            args.duration,
            args.evidence,
            args.toggle_group,
            args.cycle_seconds,
            args.off_seconds,
            args.verify_disable_flush,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
