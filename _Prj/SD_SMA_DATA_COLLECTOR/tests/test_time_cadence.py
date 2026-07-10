import sys
import types
import unittest
from datetime import datetime

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


class TestFixedCadenceTiming(unittest.TestCase):
    def test_anchor_uses_whole_second_planned_collection_time(self):
        now_wall = datetime(2026, 7, 8, 15, 6, 18, 600000)
        anchor_mono, anchor_wall = DataCollector._create_fixed_cadence_anchor(
            now_wall,
            1000.6,
        )

        self.assertEqual(anchor_mono, 1000.0)
        self.assertEqual(anchor_wall, datetime(2026, 7, 8, 15, 6, 18))
        self.assertEqual(
            DataCollector._fixed_cadence_collection_time(anchor_wall, 0, 6),
            datetime(2026, 7, 8, 15, 6, 18),
        )
        self.assertEqual(
            DataCollector._fixed_cadence_collection_time(anchor_wall, 1, 6),
            datetime(2026, 7, 8, 15, 6, 24),
        )

    def test_slightly_late_next_tick_is_not_drifted_or_skipped(self):
        next_tick, skipped = DataCollector._advance_fixed_cadence_tick(
            anchor_monotonic=1000.0,
            current_tick_index=0,
            interval=6,
            now_monotonic=1006.5,
        )

        self.assertEqual(next_tick, 1)
        self.assertEqual(skipped, 0)

    def test_full_missed_intervals_are_skipped_without_rebasing(self):
        next_tick, skipped = DataCollector._advance_fixed_cadence_tick(
            anchor_monotonic=1000.0,
            current_tick_index=0,
            interval=6,
            now_monotonic=1013.2,
        )

        self.assertEqual(next_tick, 2)
        self.assertEqual(skipped, 1)
