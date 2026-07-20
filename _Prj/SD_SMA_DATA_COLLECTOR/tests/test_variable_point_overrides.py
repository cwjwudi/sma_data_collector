import asyncio
from datetime import datetime

import pytest

from communication.data_collector import DataCollector
from core.config_loader import ConfigLoader
from core.config_models import DataGroup, DataPoint, TriggerType
from web_config.config_manager import CollectorConfigManager


def minimal_payload(*, trigger="time_and_variable", overrides=None):
    return {
        "communications": [
            {"name": "PLC", "type": "opcua", "host": "127.0.0.1", "port": 4840}
        ],
        "connections": [
            {"name": "connection", "communication": "PLC", "data_groups": ["Mixed"]}
        ],
        "points": [
            {
                "name": "ProductCode",
                "path": "ns=6;s=::Live.ProductCode",
                "description": "live",
                "datatype": "string",
            },
            {
                "name": "SnapshotProductCode",
                "path": "ns=6;s=::Snapshot.ProductCode",
                "description": "snapshot",
                "datatype": "string",
            },
            {
                "name": "NumericSnapshot",
                "path": "ns=6;s=::Snapshot.Numeric",
                "description": "wrong type",
                "datatype": "int",
            },
            {
                "name": "Trigger",
                "path": "ns=6;s=::Trigger",
                "description": "trigger",
            },
        ],
        "groups": [
            {
                "name": "Mixed",
                "interval_seconds": 0.03,
                "trigger_interval_seconds": 0.005,
                "trigger": trigger,
                "description": "mixed",
                "data_points": ["ProductCode"],
                "variable_point_overrides": (
                    {"ProductCode": "SnapshotProductCode"}
                    if overrides is None
                    else overrides
                ),
                "trigger_point": "Trigger",
                "reset_trigger_after_read": True,
            }
        ],
        "database": {"type": "sqlite", "name": ":memory:", "data_groups": ["Mixed"]},
    }


def test_config_loads_variable_point_overrides():
    config = ConfigLoader._parse_config(minimal_payload())

    assert config.groups[0].variable_point_overrides == {
        "ProductCode": "SnapshotProductCode"
    }


def test_web_config_accepts_variable_point_overrides(tmp_path):
    manager = CollectorConfigManager(tmp_path)

    assert manager.validate_template(minimal_payload()) == {"ok": True}


def test_config_without_overrides_remains_backward_compatible():
    payload = minimal_payload()
    payload["groups"][0].pop("variable_point_overrides")

    config = ConfigLoader._parse_config(payload)

    assert config.groups[0].variable_point_overrides == {}


@pytest.mark.parametrize(
    ("payload_update", "message"),
    [
        ({"trigger": "variable"}, "time_and_variable"),
        ({"overrides": {"MissingLogical": "SnapshotProductCode"}}, "data_points"),
        ({"overrides": {"ProductCode": "MissingSource"}}, "MissingSource"),
        ({"overrides": {"ProductCode": "NumericSnapshot"}}, "类型"),
        ({"overrides": ["SnapshotProductCode"]}, "对象"),
        ({"overrides": []}, "对象"),
    ],
)
def test_config_rejects_invalid_variable_point_overrides(payload_update, message):
    payload = minimal_payload(
        trigger=payload_update.get("trigger", "time_and_variable"),
        overrides=payload_update.get("overrides"),
    )
    with pytest.raises(ValueError, match=message):
        ConfigLoader._parse_config(payload)


class SnapshotClient:
    def __init__(self):
        self.trigger_value = True
        self.read_paths = []
        self.writes = []

    async def read_data_points(self, points):
        self.read_paths.append([point.path for point in points])
        result = {}
        for point in points:
            if point.name == "Trigger":
                value = self.trigger_value
            elif point.path == "ns=6;s=::Live.ProductCode":
                value = "AAA"
            elif point.path == "ns=6;s=::Snapshot.ProductCode":
                value = "BBB"
            else:
                raise AssertionError(f"unexpected read: {point.name} {point.path}")
            result[point.name] = {
                "value": value,
                "path": point.path,
                "timestamp": datetime.now(),
            }
        return result

    async def write_boolean_value(self, path, value):
        self.writes.append((path, value))
        self.trigger_value = value
        return True


class SnapshotCommunicationManager:
    def __init__(self, client):
        self.client = client

    def get_client_for_group(self, group_name):
        assert group_name == "Mixed"
        return self.client


@pytest.mark.asyncio
async def test_time_reads_live_source_and_variable_reads_snapshot_source():
    client = SnapshotClient()
    collector = DataCollector(SnapshotCommunicationManager(client))
    collector.trigger_reset_confirm_delay = 0
    received = []
    collector.register_data_callback(received.append)

    group = DataGroup(
        name="Mixed",
        interval_seconds=0.03,
        trigger=TriggerType.TIME_AND_VARIABLE,
        description="mixed",
        data_points=["ProductCode"],
        variable_point_overrides={"ProductCode": "SnapshotProductCode"},
        trigger_point="Trigger",
        trigger_interval_seconds=0.005,
        reset_trigger_after_read=True,
    )
    points = {
        "ProductCode": DataPoint(
            name="ProductCode",
            path="ns=6;s=::Live.ProductCode",
            description="live",
            datatype="string",
        ),
        "SnapshotProductCode": DataPoint(
            name="SnapshotProductCode",
            path="ns=6;s=::Snapshot.ProductCode",
            description="snapshot",
            datatype="string",
        ),
        "Trigger": DataPoint(
            name="Trigger", path="ns=6;s=::Trigger", description="trigger"
        ),
    }

    await collector.start_collection([group], points)
    try:
        for _ in range(200):
            trigger_types = {row["trigger_type"] for row in received}
            if trigger_types == {"time", "variable"}:
                break
            await asyncio.sleep(0.005)
        else:
            pytest.fail("time and variable records were not both collected")
    finally:
        await collector.stop_collection()

    time_rows = [row for row in received if row["trigger_type"] == "time"]
    variable_rows = [row for row in received if row["trigger_type"] == "variable"]
    assert time_rows[0]["data"]["ProductCode"]["value"] == "AAA"
    assert variable_rows[0]["data"]["ProductCode"]["value"] == "BBB"
    assert list(variable_rows[0]["data"]) == ["ProductCode"]
    assert [
        "ns=6;s=::Snapshot.ProductCode"
    ] in client.read_paths
    assert client.writes == [("ns=6;s=::Trigger", False)]
