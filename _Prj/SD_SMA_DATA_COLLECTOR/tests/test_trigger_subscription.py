import asyncio

import pytest

from communication.data_collector import DataCollector
from core.config_loader import ConfigLoader
from core.config_models import (
    DataGroup,
    DataPoint,
    TriggerMode,
    TriggerType,
)


class FakeSubscriptionClient:
    def __init__(self, trigger_point: DataPoint, data_values: dict):
        self.trigger_point = trigger_point
        self.trigger_value = False
        self.data_values = data_values
        self.callback = None
        self.unsubscribed = []
        self.read_count = 0

    async def subscribe_data_change(self, point, callback, **_kwargs):
        assert point == self.trigger_point
        self.callback = callback
        return "subscription-token"

    async def unsubscribe_data_change(self, token):
        self.unsubscribed.append(token)

    async def read_data_points(self, points):
        self.read_count += 1
        result = {}
        for point in points:
            value = (
                self.trigger_value
                if point.name == self.trigger_point.name
                else self.data_values[point.name]
            )
            result[point.name] = {"value": value, "path": point.path}
        return result

    async def write_boolean_value(self, path, value):
        assert path == self.trigger_point.path
        self.trigger_value = bool(value)
        return True

    async def emit(self, value):
        self.trigger_value = value
        result = self.callback(value)
        if asyncio.iscoroutine(result):
            await result


def group_payload(trigger_mode="subscription"):
    return {
        "communications": [{"name": "plc", "type": "opcua"}],
        "connections": [
            {
                "name": "c",
                "communication": "plc",
                "data_groups": ["g"],
            }
        ],
        "points": [
            {"name": "trigger", "path": "ns=2;s=trigger", "description": ""},
            {"name": "value", "path": "ns=2;s=value", "description": ""},
        ],
        "groups": [
            {
                "name": "g",
                "interval_seconds": 1,
                "trigger": "variable",
                "trigger_mode": trigger_mode,
                "trigger_interval_seconds": None,
                "description": "",
                "data_points": ["value"],
                "trigger_point": "trigger",
            }
        ],
        "database": {
            "type": "sqlite",
            "name": ":memory:",
            "data_groups": ["g"],
        },
    }


def test_config_loader_accepts_subscription_without_poll_interval():
    config = ConfigLoader._parse_config(group_payload())
    assert config.groups[0].trigger_mode == TriggerMode.SUBSCRIPTION
    assert config.groups[0].trigger_interval_seconds is None


def test_config_loader_accepts_legacy_subscription_dropdown_value():
    payload = group_payload(trigger_mode="poll")
    payload["groups"][0]["trigger_interval_seconds"] = "subscription"
    config = ConfigLoader._parse_config(payload)
    assert config.groups[0].trigger_mode == TriggerMode.SUBSCRIPTION


@pytest.mark.asyncio
async def test_subscription_edge_collects_and_resets_without_polling():
    trigger = DataPoint("trigger", "ns=2;s=trigger", "")
    value = DataPoint("value", "ns=2;s=value", "")
    group = DataGroup(
        name="g",
        interval_seconds=1,
        trigger=TriggerType.VARIABLE,
        trigger_mode=TriggerMode.SUBSCRIPTION,
        trigger_interval_seconds=None,
        description="",
        data_points=["value"],
        trigger_point="trigger",
    )
    client = FakeSubscriptionClient(trigger, {"value": 42})
    collector = DataCollector(None)
    collected = []
    collector.register_data_callback(collected.append)

    task = asyncio.create_task(
        collector._variable_triggered_collection(group, [value], trigger, client)
    )
    try:
        for _ in range(50):
            if client.callback:
                break
            await asyncio.sleep(0.001)
        await client.emit(True)
        for _ in range(100):
            if collected:
                break
            await asyncio.sleep(0.001)

        assert len(collected) == 1
        assert collected[0]["data"]["value"]["value"] == 42
        assert client.trigger_value is False
        # 数据读取 + 复位确认；没有每秒触发点轮询。
        assert client.read_count == 2
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    assert client.unsubscribed == ["subscription-token"]
    assert collector.metrics["subscription_events_received"] == 1
