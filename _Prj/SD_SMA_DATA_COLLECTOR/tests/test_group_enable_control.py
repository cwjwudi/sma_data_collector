import asyncio
import json

import pytest

from communication.data_collector import DataCollector
from core.config_loader import ConfigLoader
from core.config_models import DataGroup, DataPoint, TriggerType


class EnableClient:
    def __init__(self, value=False):
        self.value = value

    async def read_data_points(self, points):
        point = points[0]
        return {point.name: {"value": self.value, "path": point.path}}


async def wait_until(predicate, timeout=0.5):
    deadline = asyncio.get_running_loop().time() + timeout
    while not predicate():
        if asyncio.get_running_loop().time() >= deadline:
            raise AssertionError("condition was not reached before timeout")
        await asyncio.sleep(0.005)


def minimal_config(enable_point_marker="missing"):
    group = {
        "name": "Data_Test",
        "interval_seconds": 1,
        "trigger": "time",
        "description": "test",
        "data_points": ["Value"],
    }
    if enable_point_marker != "missing":
        group["enable_point"] = enable_point_marker
    return {
        "points": [
            {"name": "Value", "path": "ns=6;s=::Value", "description": "value"},
            {"name": "Enable", "path": "ns=6;s=::Enable", "description": "enable"},
        ],
        "groups": [group],
        "database": {"type": "sqlite", "name": "test.db", "data_groups": ["Data_Test"]},
    }


def test_enable_point_is_optional_and_defaults_to_always_enabled(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps(minimal_config()), encoding="utf-8")

    config = ConfigLoader.load_from_file(str(path))

    assert config.groups[0].enable_point is None


def test_enable_point_must_reference_an_existing_point(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps(minimal_config("Unknown")), encoding="utf-8")

    with pytest.raises(ValueError, match="外部启用点位不存在"):
        ConfigLoader.load_from_file(str(path))


@pytest.mark.parametrize("invalid_value", [False, 0, [], {}])
def test_enable_point_rejects_non_string_values(tmp_path, invalid_value):
    path = tmp_path / "config.json"
    path.write_text(json.dumps(minimal_config(invalid_value)), encoding="utf-8")

    with pytest.raises(ValueError, match="enable_point"):
        ConfigLoader.load_from_file(str(path))


@pytest.mark.asyncio
async def test_external_point_stops_and_restarts_group_collection(monkeypatch):
    collector = DataCollector(None)
    collector.group_enable_poll_seconds = 0.005
    client = EnableClient(False)
    group = DataGroup(
        name="Data_Test",
        interval_seconds=1,
        trigger=TriggerType.TIME,
        description="test",
        data_points=["Value"],
        enable_point="Enable",
    )
    value_point = DataPoint("Value", "ns=6;s=::Value", "value")
    enable_point = DataPoint("Enable", "ns=6;s=::Enable", "enable")
    starts = 0
    stops = 0

    async def fake_group_collection(*_args):
        nonlocal starts, stops
        starts += 1
        try:
            await asyncio.Event().wait()
        finally:
            stops += 1

    monkeypatch.setattr(collector, "_run_group_collection", fake_group_collection)
    task = asyncio.create_task(
        collector._enable_controlled_collection(
            group,
            enable_point,
            [value_point],
            client,
            None,
            None,
            [value_point],
        )
    )
    try:
        await asyncio.sleep(0.02)
        assert starts == 0

        client.value = 1
        await wait_until(lambda: starts == 1)
        assert starts == 1
        assert stops == 0

        client.value = 0
        await wait_until(lambda: stops == 1)
        assert stops == 1

        client.value = True
        await wait_until(lambda: starts == 2)
        assert starts == 2
        assert collector.metrics["group_enable_transitions_to_enabled"] == 2
        assert collector.metrics["group_enable_transitions_to_disabled"] >= 2
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    assert stops == 2


@pytest.mark.parametrize("value", [2, -1, 0.5, "1", "true", None])
def test_group_enable_rejects_values_other_than_boolean_or_zero_one(value):
    assert DataCollector._normalize_group_enable_value(value) is None


@pytest.mark.parametrize("value, expected", [(False, False), (True, True), (0, False), (1, True), (0.0, False), (1.0, True)])
def test_group_enable_accepts_boolean_and_zero_one(value, expected):
    assert DataCollector._normalize_group_enable_value(value) is expected
