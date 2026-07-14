import asyncio
import math
import time

import pytest

from communication.data_collector import DataCollector
from core.config_loader import ConfigLoader
from core.config_models import DataGroup, DataPoint, TriggerType


class FakeOpcUaClient:
    def __init__(self, interval=0.04):
        self.values = {
            "Interval": interval,
            "Trigger": False,
            "Value": 12.5,
        }
        self.writes = []

    async def read_data_points(self, points):
        return {
            point.name: {
                "value": self.values.get(point.name),
                "path": point.path,
                "timestamp": None,
            }
            for point in points
        }

    async def write_boolean_value(self, path, value):
        self.writes.append((path, value))
        if path == "ns=6;s=::Trigger":
            self.values["Trigger"] = value
        return True


def _minimal_payload(trigger="time", interval_point="Interval"):
    group = {
        "name": "DynamicGroup",
        "interval_seconds": 5,
        "interval_point": interval_point,
        "trigger": trigger,
        "description": "dynamic interval",
        "data_points": ["Value"],
    }
    if trigger == "time_and_variable":
        group.update(
            trigger_point="Trigger",
            trigger_interval_seconds=0.01,
        )
    return {
        "points": [
            {"name": "Interval", "path": "ns=6;s=::Interval", "description": "seconds"},
            {"name": "Trigger", "path": "ns=6;s=::Trigger", "description": "trigger"},
            {"name": "Value", "path": "ns=6;s=::Value", "description": "value"},
        ],
        "groups": [group],
        "opcua": {"host": "127.0.0.1", "port": 4840},
        "database": {"type": "sqlite", "name": ":memory:", "data_groups": ["DynamicGroup"]},
    }


def _group(trigger):
    return DataGroup(
        name="DynamicGroup",
        interval_seconds=0.2,
        interval_point="Interval",
        trigger=trigger,
        description="dynamic interval",
        data_points=["Value"],
        trigger_point="Trigger" if trigger == TriggerType.TIME_AND_VARIABLE else None,
        trigger_interval_seconds=0.01 if trigger == TriggerType.TIME_AND_VARIABLE else None,
    )


async def _wait_for(predicate, timeout=1.0):
    deadline = time.monotonic() + timeout
    while not predicate():
        if time.monotonic() >= deadline:
            raise TimeoutError("condition was not met")
        await asyncio.sleep(0.002)


def test_loader_accepts_interval_point_for_supported_modes():
    time_config = ConfigLoader._parse_config(_minimal_payload("time"))
    mixed_config = ConfigLoader._parse_config(_minimal_payload("time_and_variable"))

    assert time_config.groups[0].interval_point == "Interval"
    assert mixed_config.groups[0].interval_point == "Interval"
    assert time_config.groups[0].interval_seconds == 5.0


def test_loader_rejects_missing_or_variable_mode_interval_point():
    with pytest.raises(ValueError, match="采集间隔点位不存在"):
        ConfigLoader._parse_config(_minimal_payload("time", "Missing"))
    with pytest.raises(ValueError, match="仅在 trigger=time"):
        ConfigLoader._parse_config(_minimal_payload("variable"))


@pytest.mark.parametrize("value", [True, 0, -1, float("nan"), float("inf")])
def test_loader_rejects_invalid_static_fallback_interval(value):
    payload = _minimal_payload("time")
    payload["groups"][0]["interval_seconds"] = value
    with pytest.raises(ValueError, match="interval_seconds"):
        ConfigLoader._parse_config(payload)


@pytest.mark.parametrize("value", [True, 0, -1, float("nan"), float("inf"), "2"])
def test_dynamic_interval_rejects_non_positive_or_non_numeric_values(value):
    with pytest.raises(ValueError):
        DataCollector._normalize_collection_interval(value)


@pytest.mark.asyncio
async def test_time_mode_reanchors_when_opcua_interval_changes():
    collector = DataCollector(None)
    collector.dynamic_interval_poll_seconds = 0.005
    client = FakeOpcUaClient(interval=0.04)
    interval_point = DataPoint("Interval", "ns=6;s=::Interval", "seconds")
    value_point = DataPoint("Value", "ns=6;s=::Value", "value")
    events = []
    collector.register_data_callback(lambda row: events.append((time.monotonic(), row)))

    task = asyncio.create_task(
        collector._time_triggered_collection(
            _group(TriggerType.TIME), [value_point], client, interval_point
        )
    )
    try:
        await _wait_for(lambda: len(events) >= 3)
        changed_at = time.monotonic()
        client.values["Interval"] = 0.12
        await _wait_for(lambda: any(ts > changed_at for ts, _ in events))
        first_after_change = next(ts for ts, _ in events if ts > changed_at)
        assert first_after_change - changed_at >= 0.09
        assert collector.metrics["dynamic_interval_changed"] >= 2
    finally:
        task.cancel()
        await task


@pytest.mark.asyncio
async def test_time_and_variable_keeps_external_trigger_independent_of_interval_change():
    collector = DataCollector(None)
    collector.dynamic_interval_poll_seconds = 0.005
    collector.trigger_reset_confirm_delay = 0
    client = FakeOpcUaClient(interval=0.04)
    interval_point = DataPoint("Interval", "ns=6;s=::Interval", "seconds")
    trigger_point = DataPoint("Trigger", "ns=6;s=::Trigger", "trigger")
    value_point = DataPoint("Value", "ns=6;s=::Value", "value")
    events = []
    collector.register_data_callback(lambda row: events.append((time.monotonic(), row)))

    task = asyncio.create_task(
        collector._time_and_variable_collection(
            _group(TriggerType.TIME_AND_VARIABLE),
            [value_point],
            trigger_point,
            client,
            interval_point,
        )
    )
    try:
        await _wait_for(lambda: sum(row[1]["trigger_type"] == "time" for row in events) >= 2)
        changed_at = time.monotonic()
        client.values["Interval"] = 0.12
        client.values["Trigger"] = True
        await _wait_for(
            lambda: any(
                ts >= changed_at and row["trigger_type"] == "variable"
                for ts, row in events
            )
        )
        variable_at = next(
            ts
            for ts, row in events
            if ts >= changed_at and row["trigger_type"] == "variable"
        )
        await _wait_for(lambda: collector.metrics["dynamic_interval_changed"] >= 2)
        detected_at = time.monotonic()
        await _wait_for(
            lambda: any(
                ts > detected_at and row["trigger_type"] == "time"
                for ts, row in events
            )
        )
        next_time_at = next(
            ts
            for ts, row in events
            if ts > detected_at and row["trigger_type"] == "time"
        )
        assert variable_at - changed_at < 0.08
        assert next_time_at - detected_at >= 0.09
        assert client.writes == [(trigger_point.path, False)]
    finally:
        task.cancel()
        await task


@pytest.mark.asyncio
async def test_invalid_dynamic_value_keeps_last_valid_interval():
    collector = DataCollector(None)
    client = FakeOpcUaClient(interval=2)
    interval_point = DataPoint("Interval", "ns=6;s=::Interval", "seconds")
    group = _group(TriggerType.TIME)

    interval, changed = await collector._read_collection_interval(
        group, interval_point, client, 5
    )
    assert (interval, changed) == (2.0, True)

    client.values["Interval"] = math.nan
    interval, changed = await collector._read_collection_interval(
        group, interval_point, client, interval
    )
    assert (interval, changed) == (2.0, False)
    assert collector.metrics["dynamic_interval_invalid"] == 1
