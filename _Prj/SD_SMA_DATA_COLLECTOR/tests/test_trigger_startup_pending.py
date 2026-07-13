import asyncio
from datetime import datetime
from unittest.mock import Mock

import pytest

from communication.data_collector import DataCollector
from core.config_models import DataGroup, DataPoint, TriggerType


class StartupScalarClient:
    def __init__(self):
        self.trigger_values = [True, False]
        self.writes = []

    async def read_data_points(self, points):
        if len(points) == 1 and points[0].name == "Trigger":
            value = self.trigger_values.pop(0) if self.trigger_values else False
            return {"Trigger": {"value": value, "path": points[0].path}}
        return {
            point.name: {"value": 42, "path": point.path, "timestamp": datetime.now()}
            for point in points
        }

    async def write_boolean_value(self, path, value):
        self.writes.append((path, value))
        return True


def scalar_fixture(trigger_type=TriggerType.VARIABLE):
    group = DataGroup(
        name="startup_pending",
        interval_seconds=60,
        trigger=trigger_type,
        description="startup pending trigger",
        data_points=["Value"],
        trigger_point="Trigger",
        reset_trigger_after_read=True,
        trigger_interval_seconds=0.005,
    )
    points = [DataPoint(name="Value", path="ns=6;s=::Value", description="")]
    trigger = DataPoint(name="Trigger", path="ns=6;s=::Trigger", description="")
    return group, points, trigger


async def wait_for(predicate, attempts=200):
    for _ in range(attempts):
        if predicate():
            return
        await asyncio.sleep(0.005)
    pytest.fail("condition was not met before timeout")


@pytest.mark.asyncio
async def test_variable_collection_consumes_high_trigger_on_startup():
    collector = DataCollector(Mock())
    collector.trigger_reset_confirm_delay = 0
    received = []
    collector.register_data_callback(received.append)
    group, points, trigger = scalar_fixture()
    client = StartupScalarClient()

    task = asyncio.create_task(
        collector._variable_triggered_collection(group, points, trigger, client)
    )
    await wait_for(lambda: len(received) == 1)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    assert received[0]["trigger_type"] == "variable"
    assert received[0]["data"]["Value"]["value"] == 42
    assert client.writes == [(trigger.path, False)]


@pytest.mark.asyncio
async def test_time_and_variable_consumes_high_trigger_on_startup():
    collector = DataCollector(Mock())
    collector.trigger_reset_confirm_delay = 0
    received = []
    collector.register_data_callback(received.append)
    group, points, trigger = scalar_fixture(TriggerType.TIME_AND_VARIABLE)
    client = StartupScalarClient()

    task = asyncio.create_task(
        collector._time_and_variable_collection(group, points, trigger, client)
    )
    await wait_for(lambda: any(row["trigger_type"] == "variable" for row in received))
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    variable_rows = [row for row in received if row["trigger_type"] == "variable"]
    assert len(variable_rows) == 1
    assert client.writes == [(trigger.path, False)]
