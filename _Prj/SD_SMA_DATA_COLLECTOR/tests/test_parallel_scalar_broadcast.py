import asyncio
import sys
import types
import unittest
from datetime import datetime
from unittest.mock import Mock

try:
    import opcua  # noqa: F401
except ModuleNotFoundError:
    fake_opcua = types.ModuleType("opcua")
    fake_opcua.Client = object
    fake_opcua.ua = types.SimpleNamespace(
        AttributeIds=types.SimpleNamespace(
            AccessLevel="AccessLevel",
            UserAccessLevel="UserAccessLevel",
            Value="Value",
        ),
        DataValue=lambda value: value,
        Variant=lambda value, variant_type: (value, variant_type),
        VariantType=types.SimpleNamespace(Boolean="Boolean", UInt16="UInt16"),
    )
    sys.modules["opcua"] = fake_opcua

from communication.data_collector import DataCollector
from core.config_models import DataGroup, DataPoint, TriggerType


class FakeParallelOpcUaClient:
    def __init__(self, trigger_reads, data_reads):
        self.trigger_reads = list(trigger_reads)
        self.data_reads = list(data_reads)
        self.array_writes = []

    async def read_data_points(self, data_points):
        names = [p.name for p in data_points]
        if names == ["AlarmInsertTrigger"]:
            values = self.trigger_reads.pop(0)
            return {
                "AlarmInsertTrigger": {
                    "value": values,
                    "timestamp": datetime.now(),
                    "path": "ns=6;s=::trigger",
                }
            }

        payload = self.data_reads.pop(0)
        out = {}
        for point in data_points:
            out[point.name] = {
                "value": payload[point.name],
                "timestamp": datetime.now(),
                "path": point.path,
            }
        return out

    async def write_array_value(self, point_path, values):
        self.array_writes.append((point_path, list(values)))
        return True


class TestParallelScalarBroadcast(unittest.IsolatedAsyncioTestCase):
    def _collector(self):
        return DataCollector(Mock())

    def test_extract_array_by_triggered_indices(self):
        collector = self._collector()
        result = collector._extract_parallel_point_values(
            "Data_Alarm",
            "AlarmCode",
            {"value": ["A", "B", "C", "D"], "timestamp": None, "path": "p"},
            [1, 3],
        )
        self.assertEqual(result["value"], ["B", "D"])

    def test_extract_scalar_broadcasts_to_each_index(self):
        collector = self._collector()
        result = collector._extract_parallel_point_values(
            "Data_Alarm",
            "BatchCode",
            {"value": "BATCH-001", "timestamp": None, "path": "p"},
            [0, 2, 4],
        )
        self.assertEqual(result["value"], ["BATCH-001", "BATCH-001", "BATCH-001"])

    def test_extract_none_skips_point(self):
        collector = self._collector()
        result = collector._extract_parallel_point_values(
            "Data_Alarm",
            "BatchCode",
            {"value": None, "timestamp": None, "path": "p"},
            [0, 1],
        )
        self.assertIsNone(result)

    def test_iter_rows_keeps_broadcast_batchcode(self):
        collector = self._collector()
        collection_data = {
            "group_name": "Data_Alarm",
            "collection_time": datetime(2026, 7, 9, 14, 0, 0),
            "trigger_type": "variable",
            "trigger_point": "AlarmInsertTrigger",
            "is_parallel": True,
            "triggered_indices": [0, 2],
            "data": {
                "AlarmCode": {"value": [101, 202], "path": "a"},
                "BatchCode": {"value": ["BATCH-001", "BATCH-001"], "path": "b"},
            },
        }
        rows = list(collector._iter_scalar_collection_rows(collection_data))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["data"]["BatchCode"]["value"], "BATCH-001")
        self.assertEqual(rows[1]["data"]["BatchCode"]["value"], "BATCH-001")
        self.assertEqual(rows[0]["data"]["AlarmCode"]["value"], 101)
        self.assertEqual(rows[1]["data"]["AlarmCode"]["value"], 202)

    async def test_parallel_collection_broadcasts_scalar_batchcode(self):
        collector = self._collector()
        received = []
        collector.register_data_callback(received.append)

        group = DataGroup(
            name="Data_Alarm",
            interval_seconds=0.01,
            trigger=TriggerType.VARIABLE,
            description="alarm",
            data_points=["AlarmCode", "BatchCode"],
            trigger_point="AlarmInsertTrigger",
            reset_trigger_after_read=True,
            is_parallel=True,
            trigger_interval_seconds=0.01,
        )
        points = [
            DataPoint(name="AlarmCode", path="ns=6;s=::AlarmCode", description=""),
            DataPoint(name="BatchCode", path="ns=6;s=::BatchCode", description=""),
        ]
        trigger = DataPoint(
            name="AlarmInsertTrigger",
            path="ns=6;s=::AlarmInsertTrigger",
            description="",
        )
        client = FakeParallelOpcUaClient(
            trigger_reads=[
                [False, False, False],
                [True, False, True],
            ],
            data_reads=[
                {
                    "AlarmCode": [10, 20, 30],
                    "BatchCode": "BATCH-XYZ",
                }
            ],
        )

        task = asyncio.create_task(
            collector._parallel_variable_triggered_collection(group, points, trigger, client)
        )
        for _ in range(50):
            if len(received) >= 2:
                break
            await asyncio.sleep(0.01)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        self.assertEqual(len(received), 2)
        self.assertEqual(received[0]["data"]["BatchCode"]["value"], "BATCH-XYZ")
        self.assertEqual(received[1]["data"]["BatchCode"]["value"], "BATCH-XYZ")
        self.assertEqual(received[0]["data"]["AlarmCode"]["value"], 10)
        self.assertEqual(received[1]["data"]["AlarmCode"]["value"], 30)
        self.assertEqual(received[0]["trigger_index"], 0)
        self.assertEqual(received[1]["trigger_index"], 2)


if __name__ == "__main__":
    unittest.main()
