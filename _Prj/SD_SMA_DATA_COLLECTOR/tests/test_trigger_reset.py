import sys
import types
import unittest
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


class FakeOpcUaClient:
    def __init__(self, write_results, readback_values):
        self.write_results = list(write_results)
        self.readback_values = list(readback_values)
        self.writes = []

    async def write_boolean_value(self, point_path, value):
        self.writes.append((point_path, value))
        if self.write_results:
            return self.write_results.pop(0)
        return True

    async def read_data_points(self, data_points):
        point = data_points[0]
        if self.readback_values:
            value = self.readback_values.pop(0)
        else:
            value = False
        return {point.name: {"value": value, "path": point.path}}


class TestTriggerReset(unittest.IsolatedAsyncioTestCase):
    def _collector(self):
        collector = DataCollector(Mock())
        collector.trigger_reset_confirm_attempts = 3
        collector.trigger_reset_confirm_delay = 0
        return collector

    def _group(self):
        return DataGroup(
            name="Data_Product",
            interval_seconds=1,
            trigger=TriggerType.VARIABLE,
            description="生产数据",
            data_points=["DataProductTime"],
            trigger_point="ProductInsertTrigger",
            reset_trigger_after_read=True,
        )

    def _trigger_point(self):
        return DataPoint(
            name="ProductInsertTrigger",
            path="ns=6;s=::AsGlobalPV:gDataSQLOperate.ProductInsert",
            description="生产数据-存储信号",
        )

    async def test_reset_retries_until_readback_is_false(self):
        collector = self._collector()
        client = FakeOpcUaClient(
            write_results=[False, True],
            readback_values=[True, False],
        )

        ok = await collector._reset_boolean_trigger_with_confirm(
            self._group(),
            self._trigger_point(),
            client,
            "上升沿采集后",
        )

        self.assertTrue(ok)
        self.assertEqual(len(client.writes), 2)
        self.assertEqual(
            client.writes[-1],
            ("ns=6;s=::AsGlobalPV:gDataSQLOperate.ProductInsert", False),
        )

    async def test_reset_accepts_zero_as_false_readback(self):
        collector = self._collector()
        client = FakeOpcUaClient(
            write_results=[True],
            readback_values=[0],
        )

        ok = await collector._reset_boolean_trigger_with_confirm(
            self._group(),
            self._trigger_point(),
            client,
            "触发点持续高电平",
        )

        self.assertTrue(ok)
        self.assertEqual(len(client.writes), 1)

    async def test_reset_reports_failure_when_readback_stays_true(self):
        collector = self._collector()
        client = FakeOpcUaClient(
            write_results=[True, True, True],
            readback_values=[True, True, True],
        )

        ok = await collector._reset_boolean_trigger_with_confirm(
            self._group(),
            self._trigger_point(),
            client,
            "触发点持续高电平",
        )

        self.assertFalse(ok)
        self.assertEqual(len(client.writes), 3)
