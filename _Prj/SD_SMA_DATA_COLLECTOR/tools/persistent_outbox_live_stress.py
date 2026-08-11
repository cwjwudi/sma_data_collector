"""Drive every configured variable-trigger group and audit the persistent outbox."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from runtime.collector_runtime import DataCollectionSystem
from core.config_models import TriggerType


async def wait_reset(
    client, path: str, parallel: bool, timeout: float = 10.0, indices: list[int] | None = None
) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = await client.read_value_by_path(path)
        if parallel:
            selected = indices if indices is not None else list(range(len(value)))
            if not any(bool(value[index]) for index in selected):
                return True
        elif not bool(value):
            return True
        await asyncio.sleep(0.02)
    return False


async def trigger_group(
    client, path: str, parallel: bool, parallel_width: int, parallel_start_index: int
) -> bool:
    if parallel:
        current = list(await client.read_value_by_path(path))
        start = min(max(0, parallel_start_index), max(0, len(current) - 1))
        width = min(max(1, parallel_width), len(current) - start)
        indices = list(range(start, start + width))
        if not await wait_reset(client, path, True, indices=indices):
            return False
        values = list(await client.read_value_by_path(path))
        for index in indices:
            values[index] = True
        if not await client.write_array_value(path, values):
            return False
        return await wait_reset(client, path, True, indices=indices)
    if not await wait_reset(client, path, False):
        return False
    if not await client.write_boolean_value(path, True):
        return False
    return await wait_reset(client, path, False)


async def run(config_path: Path, duration: float, interval: float, parallel_width: int,
              parallel_start_index: int, report: Path) -> int:
    system = DataCollectionSystem(str(config_path))
    if not await system.initialize():
        raise RuntimeError("collector initialization failed")
    logging.getLogger().setLevel(logging.WARNING)
    assert system.config and system.communication_manager and system.storage_processor
    points = {point.name: point.path for point in system.config.points}
    groups = list(system.config.groups)
    trigger_groups = [
        group for group in groups
        if group.trigger_point and group.trigger in {TriggerType.VARIABLE, TriggerType.TIME_AND_VARIABLE}
    ]
    collected = {group.name: 0 for group in groups}

    def count_collection(row: dict[str, Any]) -> None:
        name = row.get("group_name")
        if name in collected:
            collected[name] += 1

    system.data_collector.register_data_callback(count_collection)
    start_task = asyncio.create_task(system.start())
    await asyncio.sleep(2)

    # Clean up trigger points which are configured but not used by time-only groups.
    for group in groups:
        if group.trigger == TriggerType.TIME and group.trigger_point:
            client = system.communication_manager.get_client_for_group(group.name)
            if client and client.is_connected():
                await client.write_boolean_value(points[group.trigger_point], False)

    started = time.monotonic()
    attempts = {group.name: 0 for group in trigger_groups}
    confirmed = {group.name: 0 for group in trigger_groups}
    errors: list[dict[str, Any]] = []
    final_triggers: dict[str, Any] = {}
    last_progress = started
    try:
        while time.monotonic() - started < duration:
            for group in trigger_groups:
                client = system.communication_manager.get_client_for_group(group.name)
                if client is None or not client.is_connected():
                    errors.append({"group": group.name, "error": "client disconnected"})
                    continue
                attempts[group.name] += 1
                try:
                    ok = await trigger_group(
                        client, points[group.trigger_point], group.is_parallel, parallel_width,
                        parallel_start_index,
                    )
                except Exception as exc:  # noqa: BLE001
                    ok = False
                    errors.append({"group": group.name, "error": repr(exc)})
                if ok:
                    confirmed[group.name] += 1
                else:
                    errors.append({"group": group.name, "error": "trigger reset timeout"})
            now = time.monotonic()
            if now - last_progress >= 60:
                metrics = system.storage_processor.get_runtime_metrics()
                print(json.dumps({
                    "elapsed_seconds": round(now - started, 1),
                    "confirmed": confirmed,
                    "collected": collected,
                    "outbox_pending": metrics.get("outbox_pending_size"),
                    "outbox_retry": metrics.get("outbox_retry_size"),
                    "outbox_dead_letter": metrics.get("outbox_dead_letter_size"),
                }, ensure_ascii=False), flush=True)
                last_progress = now
            await asyncio.sleep(max(0.0, interval))
    finally:
        for group in groups:
            if not group.trigger_point:
                continue
            client = system.communication_manager.get_client_for_group(group.name)
            if client and client.client:
                try:
                    final_triggers[group.name] = await client.read_value_by_path(
                        points[group.trigger_point]
                    )
                except Exception as exc:  # noqa: BLE001
                    final_triggers[group.name] = repr(exc)
        await system.stop()
        await asyncio.gather(start_task, return_exceptions=True)

    elapsed = time.monotonic() - started
    metrics = system.storage_processor.get_runtime_metrics()
    result = {
        "started_at": datetime.now().astimezone().isoformat(),
        "config": str(config_path),
        "duration_requested_seconds": duration,
        "duration_actual_seconds": elapsed,
        "attempts": attempts,
        "confirmed": confirmed,
        "collected": collected,
        "errors": errors,
        "metrics": metrics,
        "final_triggers": final_triggers,
        "passed": (
            all(confirmed[name] == attempts[name] and attempts[name] > 0 for name in attempts)
            and all(collected[name] > 0 for name in collected)
            and not errors
            and metrics.get("outbox_pending_size", 0) == 0
            and metrics.get("outbox_processing_size", 0) == 0
            and metrics.get("outbox_retry_size", 0) == 0
            and metrics.get("outbox_dead_letter_size", 0) == 0
            and metrics.get("shutdown_rows_remaining", 0) == 0
        ),
    }
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str), flush=True)
    return 0 if result["passed"] else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--duration", type=float, default=3600)
    parser.add_argument("--interval", type=float, default=0.1)
    parser.add_argument("--parallel-width", type=int, default=10)
    parser.add_argument("--parallel-start-index", type=int, default=70)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    return asyncio.run(run(args.config.resolve(), args.duration, args.interval, args.parallel_width,
                           args.parallel_start_index, args.report.resolve()))


if __name__ == "__main__":
    raise SystemExit(main())
