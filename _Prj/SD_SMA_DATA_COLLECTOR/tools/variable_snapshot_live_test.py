"""Run a bounded real PLC/MySQL test for variable point overrides."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from runtime.collector_runtime import DataCollectionSystem


def _value(row: dict[str, Any], point_name: str) -> Any:
    return (row.get("data") or {}).get(point_name, {}).get("value")


async def run_test(
    config: Path,
    duration: float,
    evidence_path: Path,
    trigger_period: float,
    group_name: str,
) -> int:
    started_at = datetime.now()
    started_monotonic = time.monotonic()
    events: list[dict[str, Any]] = []
    system = DataCollectionSystem(str(config))
    initialized = await system.initialize()
    if not initialized or system.data_collector is None:
        await system.stop()
        raise RuntimeError("collector initialization failed")

    def capture(row: dict[str, Any]) -> None:
        if row.get("group_name") != group_name:
            return
        events.append(
            {
                "received_at": datetime.now().isoformat(timespec="milliseconds"),
                "collection_time": str(row.get("collection_time")),
                "trigger_type": row.get("trigger_type"),
                "BatchCode": _value(row, "BatchCode"),
            }
        )

    system.data_collector.register_data_callback(capture)
    start_task = asyncio.create_task(system.start(), name="snapshot-live-collector")
    group = next(
        (item for item in system.config.groups if item.name == group_name),
        None,
    )
    if group is None:
        await system.stop()
        raise ValueError(f"data group not found: {group_name}")
    if not group.variable_point_overrides:
        await system.stop()
        raise ValueError(f"data group has no variable_point_overrides: {group_name}")
    trigger_point = next(
        point for point in system.config.points if point.name == group.trigger_point
    )
    opcua_client = system.communication_manager.get_client_for_group(group.name)
    trigger_writes = Counter()

    async def drive_trigger() -> None:
        while True:
            await asyncio.sleep(trigger_period)
            trigger_writes["attempted"] += 1
            if await opcua_client.write_boolean_value(trigger_point.path, True):
                trigger_writes["succeeded"] += 1
            else:
                trigger_writes["failed"] += 1

    trigger_task = asyncio.create_task(drive_trigger(), name="snapshot-trigger-driver")
    next_progress = 60.0
    error: str | None = None
    db_summary: dict[str, Any] = {}
    try:
        while True:
            elapsed = time.monotonic() - started_monotonic
            if start_task.done():
                start_task.result()
                raise RuntimeError("collector stopped before requested duration")
            if elapsed >= duration:
                break
            if elapsed >= next_progress:
                counts = Counter(event["trigger_type"] for event in events)
                print(
                    f"progress elapsed={elapsed:.1f}s time={counts['time']} "
                    f"variable={counts['variable']}",
                    flush=True,
                )
                next_progress += 60.0
            await asyncio.sleep(min(1.0, duration - elapsed))

        await asyncio.sleep(2.0)
        if system.db_manager and system.config:
            if system.storage_processor:
                system.storage_processor.request_group_flush(group.name)
                flush_deadline = time.monotonic() + 5.0
                while (
                    any(
                        item.get("group_name") == group.name
                        for item in system.storage_processor.data_queue
                    )
                    and time.monotonic() < flush_deadline
                ):
                    await asyncio.sleep(0.1)
            table = system.db_manager.current_table_names.get(group.name)
            if not table:
                raise RuntimeError(f"no active database table for {group.name}")
            rows = system.db_manager.execute_query(
                f"SELECT COUNT(*), "
                f"SUM(CASE WHEN `BatchCode` = :snapshot_value THEN 1 ELSE 0 END) "
                f"FROM `{table}` WHERE `created_at` >= :started_at",
                {
                    "snapshot_value": "SMA Tablet",
                    "started_at": started_at.replace(microsecond=0),
                },
            )
            if rows:
                db_summary = {
                    "table": table,
                    "rows_since_start": int(rows[0][0] or 0),
                    "snapshot_rows_since_start": int(rows[0][1] or 0),
                }
    except Exception as exc:  # noqa: BLE001
        error = f"{type(exc).__name__}: {exc}"
    finally:
        trigger_task.cancel()
        await asyncio.gather(trigger_task, return_exceptions=True)
        await opcua_client.write_boolean_value(trigger_point.path, False)
        await system.stop()
        if not start_task.done():
            await asyncio.wait_for(start_task, timeout=5.0)
        else:
            await asyncio.gather(start_task, return_exceptions=True)

    ended_at = datetime.now()
    elapsed = time.monotonic() - started_monotonic
    counts = Counter(event["trigger_type"] for event in events)
    time_values = [event["BatchCode"] for event in events if event["trigger_type"] == "time"]
    variable_values = [
        event["BatchCode"] for event in events if event["trigger_type"] == "variable"
    ]
    unexpected_variable_values = sorted(
        {str(value) for value in variable_values if value != "SMA Tablet"}
    )
    unexpected_time_values = sorted(
        {str(value) for value in time_values if value == "SMA Tablet"}
    )
    passed = bool(
        error is None
        and elapsed >= duration
        and counts["time"] > 0
        and counts["variable"] > 0
        and not unexpected_variable_values
        and not unexpected_time_values
        and db_summary.get("rows_since_start", 0) >= max(1, len(events) - 2)
        and db_summary.get("snapshot_rows_since_start", 0) >= counts["variable"]
    )
    evidence = {
        "test": "variable_point_overrides_live",
        "config": str(config.resolve()),
        "group": group.name,
        "started_at": started_at.isoformat(timespec="milliseconds"),
        "ended_at": ended_at.isoformat(timespec="milliseconds"),
        "requested_duration_seconds": duration,
        "elapsed_seconds": elapsed,
        "passed": passed,
        "error": error,
        "event_counts": dict(counts),
        "unexpected_variable_values": unexpected_variable_values,
        "unexpected_time_values": unexpected_time_values,
        "db_summary": db_summary,
        "trigger_writes": dict(trigger_writes),
        "collector_metrics": dict(system.data_collector.metrics),
        "storage_metrics": dict(system.storage_processor.metrics) if system.storage_processor else {},
        "events": events,
    }
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(json.dumps({key: evidence[key] for key in evidence if key != "events"}, ensure_ascii=False, default=str))
    return 0 if passed else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--duration", type=float, default=3605.0)
    parser.add_argument("--trigger-period", type=float, default=10.0)
    parser.add_argument("--group", default="Data_Product")
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    return asyncio.run(
        run_test(
            args.config,
            args.duration,
            args.evidence,
            args.trigger_period,
            args.group,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
