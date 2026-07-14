"""Run a database-free live test for one dynamically timed collector group."""

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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from communication.communication_manager import CommunicationManager
from communication.data_collector import DataCollector
from core.config_loader import ConfigLoader


async def run(config_path: Path, group_name: str, duration: float, report_path: Path) -> int:
    config = ConfigLoader.load_from_file(str(config_path))
    group = next((item for item in config.groups if item.name == group_name), None)
    if group is None:
        raise ValueError(f"data group not found: {group_name}")

    point_by_name = {point.name: point for point in config.points}
    manager = CommunicationManager(config)
    collector = DataCollector(manager)
    started_monotonic = time.monotonic()
    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    events: list[dict[str, Any]] = []

    def record(payload: dict[str, Any]) -> None:
        now = time.monotonic()
        event = {
            "elapsed_seconds": round(now - started_monotonic, 6),
            "observed_at": datetime.now().astimezone().isoformat(timespec="milliseconds"),
            "trigger_type": payload.get("trigger_type"),
            "trigger_point": payload.get("trigger_point"),
            "collection_time": str(payload.get("collection_time")),
            "data_point_count": len(payload.get("data", {})),
        }
        events.append(event)
        print(json.dumps(event, ensure_ascii=False), flush=True)

    collector.register_data_callback(record)
    initialized = False
    try:
        initialized = await manager.initialize_connections()
        if not initialized:
            raise RuntimeError("OPC UA connection initialization failed")
        await collector.start_collection([group], point_by_name)
        await asyncio.sleep(duration)
    finally:
        await collector.stop_collection()
        await manager.disconnect_all()

    report = {
        "config": str(config_path.resolve()),
        "group": group_name,
        "static_interval_seconds": group.interval_seconds,
        "interval_point": group.interval_point,
        "duration_seconds": duration,
        "started_at": started_at,
        "collector_metrics": dict(collector.metrics),
        "event_count": len(events),
        "events": events,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"REPORT={report_path.resolve()}", flush=True)
    return 0 if events else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--group", default="Data_Product")
    parser.add_argument("--duration", default=30.0, type=float)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    return asyncio.run(run(args.config, args.group, args.duration, args.report))


if __name__ == "__main__":
    raise SystemExit(main())
