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
    def __init__(self, trigger_reads, data_reads, write_results=None):
        self.trigger_reads = list(trigger_reads)
        self.data_reads = list(data_reads)
        self.write_results = list(write_results or [])
        self.array_writes = []
        self.current_trigger_values = list(self.trigger_reads[0]) if self.trigger_reads else []

    async def read_data_points(self, data_points):
        names = [p.name for p in data_points]
        if names == ["AlarmInsertTrigger"]:
            if self.trigger_reads:
                values = self.trigger_reads.pop(0)
                self.current_trigger_values = list(values)
            else:
                values = list(self.current_trigger_values)
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
        result = self.write_results.pop(0) if self.write_results else True
        if result:
            self.current_trigger_values = list(values)
        return result


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

    async def test_rapid_reassert_after_confirmed_reset_is_a_new_edge(self):
        collector = self._collector()
        collector.trigger_reset_confirm_delay = 0
        received = []
        collector.register_data_callback(received.append)
        group, points, trigger = self._parallel_fixture()
        client = FakeParallelOpcUaClient(
            trigger_reads=[
                [False, False],
                [True, False],
                [False, False],  # reset readback
                [True, False],   # PLC reasserts before a separate false poll
                [False, False],  # second reset readback
            ],
            data_reads=[
                {"AlarmCode": [101, 0], "BatchCode": "B1"},
                {"AlarmCode": [102, 0], "BatchCode": "B1"},
            ],
        )
        task = asyncio.create_task(
            collector._parallel_variable_triggered_collection(group, points, trigger, client)
        )
        await self._wait_for(lambda: len(received) == 2)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        self.assertEqual([row["data"]["AlarmCode"]["value"] for row in received], [101, 102])
        self.assertEqual(len(client.array_writes), 2)

    async def test_parallel_collection_consumes_high_indices_on_startup(self):
        collector = self._collector()
        collector.trigger_reset_confirm_delay = 0
        received = []
        collector.register_data_callback(received.append)
        group, points, trigger = self._parallel_fixture()
        client = FakeParallelOpcUaClient(
            trigger_reads=[
                [True, False],
                [False, False],
            ],
            data_reads=[{"AlarmCode": [501, 0], "BatchCode": "B-START"}],
        )

        task = asyncio.create_task(
            collector._parallel_variable_triggered_collection(group, points, trigger, client)
        )
        await self._wait_for(lambda: len(received) == 1)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

        self.assertEqual(received[0]["trigger_index"], 0)
        self.assertEqual(received[0]["data"]["AlarmCode"]["value"], 501)
        self.assertEqual(len(client.array_writes), 1)

    async def test_reassert_during_reset_readback_is_not_cleared_twice(self):
        collector = self._collector()
        collector.trigger_reset_confirm_delay = 0
        received = []
        collector.register_data_callback(received.append)
        group, points, trigger = self._parallel_fixture()
        client = FakeParallelOpcUaClient(
            trigger_reads=[
                [False, False],
                [True, False],
                [True, False],   # already reasserted when reset confirmation reads
                [True, False],   # next poll must consume it as a new edge
                [False, False],
            ],
            data_reads=[
                {"AlarmCode": [301, 0], "BatchCode": "B1"},
                {"AlarmCode": [302, 0], "BatchCode": "B1"},
            ],
        )
        task = asyncio.create_task(
            collector._parallel_variable_triggered_collection(group, points, trigger, client)
        )
        await self._wait_for(lambda: len(received) == 2)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        self.assertEqual([row["data"]["AlarmCode"]["value"] for row in received], [301, 302])
        self.assertEqual(len(client.array_writes), 2)
        self.assertEqual(collector.metrics["parallel_trigger_reasserted_during_confirm"], 1)

    async def test_missing_data_is_not_acknowledged_and_retries_while_high(self):
        collector = self._collector()
        collector.trigger_reset_confirm_delay = 0
        received = []
        collector.register_data_callback(received.append)
        group, points, trigger = self._parallel_fixture()
        client = FakeParallelOpcUaClient(
            trigger_reads=[
                [False, False],
                [True, False],
                [True, False],
                [False, False],
            ],
            data_reads=[
                {"AlarmCode": None, "BatchCode": "B1"},
                {"AlarmCode": [201, 0], "BatchCode": "B1"},
            ],
        )
        task = asyncio.create_task(
            collector._parallel_variable_triggered_collection(group, points, trigger, client)
        )
        await self._wait_for(lambda: len(received) == 1)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        self.assertEqual(received[0]["data"]["AlarmCode"]["value"], 201)
        self.assertEqual(len(client.array_writes), 1)
        self.assertGreaterEqual(collector.metrics["parallel_rows_rejected"], 1)

    async def test_short_array_rejects_only_out_of_range_index(self):
        collector = self._collector()
        group, points, trigger = self._parallel_fixture()
        data = {
            "AlarmCode": {"value": [10], "path": points[0].path},
            "BatchCode": {"value": "B1", "path": points[1].path},
        }
        rows, rejected = collector._build_parallel_rows(
            group, points, data, [0, 1], trigger
        )
        self.assertEqual([row["trigger_index"] for row in rows], [0])
        self.assertIn(1, rejected)
        self.assertIn("AlarmCode:index_out_of_range(1)", rejected[1])

    def _parallel_fixture(self):
        group = DataGroup(
            name="Data_Alarm",
            interval_seconds=0.005,
            trigger=TriggerType.VARIABLE,
            description="alarm",
            data_points=["AlarmCode", "BatchCode"],
            trigger_point="AlarmInsertTrigger",
            reset_trigger_after_read=True,
            is_parallel=True,
            trigger_interval_seconds=0.005,
        )
        points = [
            DataPoint(name="AlarmCode", path="ns=6;s=::AlarmCode", description=""),
            DataPoint(name="BatchCode", path="ns=6;s=::BatchCode", description=""),
        ]
        trigger = DataPoint(
            name="AlarmInsertTrigger", path="ns=6;s=::AlarmInsertTrigger", description=""
        )
        return group, points, trigger

    async def _wait_for(self, predicate, attempts=200):
        for _ in range(attempts):
            if predicate():
                return
            await asyncio.sleep(0.005)
        self.fail("condition was not met before timeout")


if __name__ == "__main__":
    unittest.main()
