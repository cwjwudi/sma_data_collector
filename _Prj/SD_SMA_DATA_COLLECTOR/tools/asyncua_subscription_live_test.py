"""真实 PLC/MySQL 的 asyncua、订阅、重连与持续采集验证。"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config_models import TriggerType  # noqa: E402
from runtime.collector_runtime import DataCollectionSystem  # noqa: E402


def build_subscription_config(source: Path) -> tuple[Path, dict[str, Any]]:
    """在原配置目录生成临时派生配置，以复用同目录的加密口令密钥。"""
    payload = json.loads(source.read_text(encoding="utf-8"))
    for group in payload.get("groups", []):
        if group.get("trigger") in {
            TriggerType.VARIABLE.value,
            TriggerType.TIME_AND_VARIABLE.value,
        }:
            group["trigger_mode"] = "subscription"
            group["trigger_interval_seconds"] = (
                group.get("trigger_interval_seconds", 1) or 1
            )
    payload.setdefault("logging", {})["level"] = "WARNING"
    temp_path = source.with_name(
        f".{source.stem}.asyncua-live-{os.getpid()}-{time.time_ns()}.json"
    )
    temp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return temp_path, payload


async def wait_reset(
    client,
    path: str,
    parallel: bool,
    *,
    timeout: float = 12.0,
    indices: list[int] | None = None,
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
    client,
    path: str,
    parallel: bool,
    parallel_width: int,
    parallel_start_index: int,
) -> bool:
    if parallel:
        current = list(await client.read_value_by_path(path))
        start = min(max(0, parallel_start_index), max(0, len(current) - 1))
        width = min(max(1, parallel_width), len(current) - start)
        indices = list(range(start, start + width))
        if not await wait_reset(client, path, True, indices=indices):
            return False
        current = list(await client.read_value_by_path(path))
        for index in indices:
            current[index] = True
        return bool(
            await client.write_array_value(path, current)
            and await wait_reset(client, path, True, indices=indices)
        )

    if not await wait_reset(client, path, False):
        return False
    return bool(
        await client.write_boolean_value(path, True)
        and await wait_reset(client, path, False)
    )


async def wait_until(predicate, timeout: float, interval: float = 0.1) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        await asyncio.sleep(interval)
    return bool(predicate())


def count_rows(system: DataCollectionSystem) -> dict[str, int | None]:
    assert system.config and system.db_manager and system.storage_processor
    counts: dict[str, int | None] = {}
    fixed_group = system.storage_processor.batch_master_group_name
    for group in system.config.groups:
        try:
            table = system.db_manager.get_current_table_name(
                group.name,
                fixed_table=group.name == fixed_group,
                partition_interval_years=group.partition_interval_years,
            )
            result = system.db_manager.execute_query(f"SELECT COUNT(*) FROM `{table}`")
            counts[group.name] = int(result[0][0]) if result else 0
        except Exception:
            counts[group.name] = None
    return counts


async def run(
    source_config: Path,
    duration: float,
    interval: float,
    parallel_width: int,
    parallel_start_index: int,
    disconnect_at: list[float],
    report: Path,
) -> int:
    temp_config, _payload = build_subscription_config(source_config)
    system = DataCollectionSystem(str(temp_config))
    start_task: asyncio.Task | None = None
    started_at = datetime.now().astimezone()
    started = time.monotonic()
    collected: dict[str, int] = {}
    attempts: dict[str, int] = {}
    confirmed: dict[str, int] = {}
    faults: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    row_counts_before: dict[str, int | None] = {}
    row_counts_after: dict[str, int | None] = {}
    final_states: dict[str, str] = {}

    def capture(row: dict[str, Any]) -> None:
        name = str(row.get("group_name"))
        collected[name] = collected.get(name, 0) + 1

    try:
        if not await system.initialize():
            raise RuntimeError("collector initialization failed")
        assert (
            system.config
            and system.communication_manager
            and system.data_collector
            and system.storage_processor
        )
        groups = list(system.config.groups)
        points = {point.name: point.path for point in system.config.points}
        trigger_groups = [
            group
            for group in groups
            if group.trigger_point
            and group.trigger in {TriggerType.VARIABLE, TriggerType.TIME_AND_VARIABLE}
        ]
        collected = {group.name: 0 for group in groups}
        attempts = {group.name: 0 for group in trigger_groups}
        confirmed = {group.name: 0 for group in trigger_groups}
        system.data_collector.register_data_callback(capture)
        row_counts_before = count_rows(system)

        start_task = asyncio.create_task(
            system.start(), name="asyncua-subscription-live-collector"
        )
        expected_subscriptions = len(trigger_groups)
        ready = await wait_until(
            lambda: (
                all(
                    client.is_connected()
                    for client in system.communication_manager.clients.values()
                )
                and sum(
                    len(client._subscriptions)
                    for client in system.communication_manager.clients.values()
                )
                == expected_subscriptions
            ),
            timeout=30,
        )
        if not ready:
            raise RuntimeError("OPC UA connection/subscriptions did not become ready")

        pending_faults = sorted(item for item in disconnect_at if 0 < item < duration)
        last_progress = started
        round_index = 0
        logging.getLogger().setLevel(logging.WARNING)

        while time.monotonic() - started < duration:
            round_index += 1
            elapsed = time.monotonic() - started
            while pending_faults and elapsed >= pending_faults[0]:
                scheduled = pending_faults.pop(0)
                client = next(iter(system.communication_manager.clients.values()))
                before_handles = sum(
                    registration.handle is not None
                    for registration in client._subscriptions.values()
                )
                raw_client = client.client
                fault_started = time.monotonic()
                if raw_client is not None:
                    await raw_client.disconnect()
                    await client._mark_disconnected(
                        ConnectionError("live test injected transport disconnect"),
                        expected_client=raw_client,
                    )
                recovered = await wait_until(
                    lambda: (
                        client.is_connected()
                        and all(
                            registration.handle is not None
                            for registration in client._subscriptions.values()
                        )
                    ),
                    timeout=30,
                )
                faults.append(
                    {
                        "scheduled_at_seconds": scheduled,
                        "recovered": recovered,
                        "recovery_seconds": time.monotonic() - fault_started,
                        "subscription_handles_before": before_handles,
                        "subscription_handles_after": sum(
                            registration.handle is not None
                            for registration in client._subscriptions.values()
                        ),
                    }
                )
                if not recovered:
                    errors.append({"error": "reconnect/subscription restore timeout"})

            for group in trigger_groups:
                cadence = {
                    "Data_Recipe": 2,
                    "Data_BatchInfo": 5,
                    "Data_Batch": 20,
                }.get(group.name, 1)
                if round_index % cadence:
                    continue
                client = system.communication_manager.get_client_for_group(group.name)
                attempts[group.name] += 1
                if client is None or not client.is_connected():
                    errors.append({"group": group.name, "error": "client disconnected"})
                    continue
                try:
                    ok = await trigger_group(
                        client,
                        points[group.trigger_point],
                        group.is_parallel,
                        parallel_width,
                        parallel_start_index,
                    )
                except Exception as exc:  # noqa: BLE001
                    ok = False
                    errors.append({"group": group.name, "error": repr(exc)})
                if ok:
                    confirmed[group.name] += 1
                else:
                    errors.append(
                        {"group": group.name, "error": "trigger reset timeout"}
                    )

            now = time.monotonic()
            if now - last_progress >= 60:
                metrics = system.storage_processor.get_runtime_metrics()
                print(
                    json.dumps(
                        {
                            "elapsed_seconds": round(now - started, 1),
                            "confirmed": confirmed,
                            "collected": collected,
                            "subscription_events": system.data_collector.metrics.get(
                                "subscription_events_received", 0
                            ),
                            "connection_states": {
                                name: client.get_connection_state()
                                for name, client in system.communication_manager.clients.items()
                            },
                            "outbox_pending": metrics.get("outbox_pending_size"),
                            "outbox_retry": metrics.get("outbox_retry_size"),
                            "errors": len(errors),
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
                last_progress = now
            await asyncio.sleep(max(0.0, interval))

    except Exception as exc:  # noqa: BLE001
        errors.append({"fatal": repr(exc)})
    finally:
        elapsed = time.monotonic() - started
        if system.db_manager and system.config and system.storage_processor:
            row_counts_after = count_rows(system)
        if system.communication_manager:
            final_states = {
                name: client.get_connection_state()
                for name, client in system.communication_manager.clients.items()
            }
        if system.running or start_task is not None:
            await system.stop()
        if start_task:
            await asyncio.gather(start_task, return_exceptions=True)
        temp_config.unlink(missing_ok=True)

    metrics = (
        system.storage_processor.get_runtime_metrics()
        if system.storage_processor
        else {}
    )
    collector_metrics = (
        dict(system.data_collector.metrics) if system.data_collector else {}
    )
    row_deltas = {
        name: (
            None
            if row_counts_before.get(name) is None or row_counts_after.get(name) is None
            else row_counts_after[name] - row_counts_before[name]
        )
        for name in set(row_counts_before) | set(row_counts_after)
    }
    passed = (
        elapsed >= duration
        and attempts
        and all(
            attempts[name] > 0 and confirmed[name] == attempts[name]
            for name in attempts
        )
        and all(collected.get(name, 0) > 0 for name in collected)
        and collector_metrics.get("subscription_events_received", 0) > 0
        and all(item.get("recovered") for item in faults)
        and not errors
        and metrics.get("outbox_retry_size", 0) == 0
        and metrics.get("outbox_dead_letter_size", 0) == 0
        and metrics.get("shutdown_rows_remaining", 0) == 0
    )
    result = {
        "started_at": started_at.isoformat(),
        "ended_at": datetime.now().astimezone().isoformat(),
        "source_config": str(source_config),
        "duration_requested_seconds": duration,
        "duration_actual_seconds": elapsed,
        "attempts": attempts,
        "confirmed": confirmed,
        "collected": collected,
        "faults": faults,
        "errors": errors,
        "connection_states_before_shutdown": final_states,
        "collector_metrics": collector_metrics,
        "storage_metrics": metrics,
        "database_rows_before": row_counts_before,
        "database_rows_after": row_counts_after,
        "database_row_deltas": row_deltas,
        "passed": passed,
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
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--parallel-width", type=int, default=2)
    parser.add_argument("--parallel-start-index", type=int, default=70)
    parser.add_argument("--disconnect-at", type=float, action="append", default=[])
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    return asyncio.run(
        run(
            args.config.resolve(),
            args.duration,
            args.interval,
            args.parallel_width,
            args.parallel_start_index,
            args.disconnect_at,
            args.report.resolve(),
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
