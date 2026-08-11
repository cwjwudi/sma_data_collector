import asyncio
from datetime import datetime

import pytest

from communication.data_collector import DataCollector, _AlignedCadenceState
from core.config_loader import ConfigLoader
from core.config_models import DataGroup, DataPoint, TriggerMode, TriggerType


def _payload(trigger="time", **group_overrides):
    group = {
        "name": "Aligned",
        "interval_seconds": 5,
        "trigger": trigger,
        "description": "aligned cadence",
        "data_points": ["Value"],
    }
    group.update(group_overrides)
    if trigger == "time_and_variable":
        group.update(trigger_point="Trigger", trigger_interval_seconds=1)
    return {
        "points": [
            {"name": "Value", "path": "ns=6;s=Value", "description": "value"},
            {"name": "Trigger", "path": "ns=6;s=Trigger", "description": "trigger"},
        ],
        "groups": [group],
        "communications": [{"name": "PLC", "type": "opcua"}],
        "connections": [
            {"name": "conn", "communication": "PLC", "data_groups": ["Aligned"]}
        ],
        "database": {"type": "sqlite", "name": ":memory:", "data_groups": ["Aligned"]},
    }


def _group(max_backfill_ticks=1000):
    return DataGroup(
        name="Aligned",
        interval_seconds=5,
        trigger=TriggerType.TIME,
        description="aligned cadence",
        data_points=["Value"],
        force_cadence_alignment=True,
        max_backfill_ticks=max_backfill_ticks,
    )


class SnapshotClient:
    def __init__(self, value=42):
        self.value = value
        self.read_count = 0

    async def read_data_points(self, points):
        self.read_count += 1
        return {
            point.name: {
                "value": self.value,
                "path": point.path,
                "timestamp": datetime.now(),
            }
            for point in points
        }

    async def subscribe_data_change(self, point, callback):
        self.subscription_callback = callback
        return "subscription-token"

    async def unsubscribe_data_change(self, token):
        assert token == "subscription-token"


class ReconnectingSnapshotClient(SnapshotClient):
    async def read_data_points(self, points):
        if self.read_count == 0:
            self.read_count += 1
            raise ConnectionError("simulated disconnect")
        return await super().read_data_points(points)


def test_loader_defaults_disabled_and_accepts_supported_modes():
    legacy = ConfigLoader._parse_config(_payload())
    assert legacy.groups[0].force_cadence_alignment is False
    assert legacy.groups[0].max_backfill_ticks == 1000

    aligned = ConfigLoader._parse_config(
        _payload(
            "time_and_variable",
            force_cadence_alignment=True,
            max_backfill_ticks=25,
        )
    )
    assert aligned.groups[0].force_cadence_alignment is True
    assert aligned.groups[0].max_backfill_ticks == 25


@pytest.mark.parametrize("value", [0, 100001, True, "bad"])
def test_loader_rejects_invalid_backfill_limit(value):
    with pytest.raises(ValueError, match="max_backfill_ticks"):
        ConfigLoader._parse_config(_payload(max_backfill_ticks=value))


def test_loader_rejects_alignment_for_variable_trigger():
    with pytest.raises(ValueError, match="仅在 trigger=time"):
        ConfigLoader._parse_config(
            _payload("variable", force_cadence_alignment=True)
        )


def test_natural_boundary_uses_next_local_wall_clock_slot():
    cadence = _AlignedCadenceState(5, datetime(2026, 8, 7, 12, 0, 3, 250000))
    assert cadence.seconds_until_next(datetime(2026, 8, 7, 12, 0, 3, 250000)) == pytest.approx(1.75)

    fractional = _AlignedCadenceState(0.2, datetime(2026, 8, 7, 12, 0, 0, 210000))
    slots, total, truncated = fractional.due_slots(
        datetime(2026, 8, 7, 12, 0, 0, 410000), 1000
    )
    assert total == 1
    assert truncated == 0
    assert slots == [datetime(2026, 8, 7, 12, 0, 0, 400000)]


@pytest.mark.asyncio
async def test_recovery_reads_one_snapshot_and_backfills_recent_slots_only():
    collector = DataCollector(None)
    received = []
    collector.register_data_callback(received.append)
    client = SnapshotClient()
    point = DataPoint("Value", "ns=6;s=Value", "value")
    cadence = _AlignedCadenceState(5, datetime.now())
    now_seconds = cadence._wall_seconds(datetime.now())
    cadence.next_slot_seconds = (int(now_seconds // 5) - 2) * 5
    cadence.recovery_pending = True

    assert await collector._collect_aligned_time_if_due(
        _group(max_backfill_ticks=2),
        [point],
        client,
        cadence,
        context="test",
    )

    assert client.read_count == 1
    assert len(received) == 2
    assert [row["collection_time"] for row in received] == sorted(
        row["collection_time"] for row in received
    )
    assert all(row["is_backfill"] is True for row in received)
    assert all(row["data"]["Value"]["value"] == 42 for row in received)
    assert collector.metrics["cadence_backfill_truncated_ticks"] == 1
    assert collector.metrics["cadence_backfill_rows"] == 2


@pytest.mark.asyncio
async def test_all_invalid_snapshot_keeps_tick_pending():
    collector = DataCollector(None)
    point = DataPoint("Value", "ns=6;s=Value", "value")
    client = SnapshotClient(value=None)
    cadence = _AlignedCadenceState(1, datetime.now())
    cadence.next_slot_seconds = cadence._wall_seconds(datetime.now()) - 1
    original_slot = cadence.next_slot_seconds

    assert not await collector._collect_aligned_time_if_due(
        _group(), [point], client, cadence, context="test"
    )
    assert cadence.recovery_pending is True
    assert cadence.next_slot_seconds == original_slot
    assert collector.metrics["cadence_recovery_failures"] == 1


async def _wait_for_rows(rows, minimum=1):
    async def wait_loop():
        while len(rows) < minimum:
            await asyncio.sleep(0.005)

    await asyncio.wait_for(wait_loop(), timeout=1)


@pytest.mark.asyncio
async def test_aligned_time_loop_starts_on_natural_boundary():
    collector = DataCollector(None)
    rows = []
    collector.register_data_callback(rows.append)
    group = _group()
    group.interval_seconds = 0.02
    point = DataPoint("Value", "ns=6;s=Value", "value")
    task = asyncio.create_task(
        collector._time_triggered_collection(group, [point], SnapshotClient())
    )
    try:
        await _wait_for_rows(rows)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    assert rows[0]["is_backfill"] is False
    epoch_microseconds = int((rows[0]["collection_time"] - datetime(1970, 1, 1)).total_seconds() * 1_000_000)
    assert epoch_microseconds % 20_000 == 0


@pytest.mark.asyncio
async def test_live_disconnect_recovery_backfills_without_skipping_ticks():
    collector = DataCollector(None)
    rows = []
    collector.register_data_callback(rows.append)
    group = _group(max_backfill_ticks=10)
    group.interval_seconds = 0.02
    point = DataPoint("Value", "ns=6;s=Value", "value")
    client = ReconnectingSnapshotClient()
    task = asyncio.create_task(
        collector._time_triggered_collection(group, [point], client)
    )
    try:
        await _wait_for_rows(rows, minimum=2)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    assert client.read_count == 2
    assert all(row["is_backfill"] is True for row in rows)
    deltas = [
        (right["collection_time"] - left["collection_time"]).total_seconds()
        for left, right in zip(rows, rows[1:])
    ]
    assert deltas and all(delta == pytest.approx(0.02) for delta in deltas)


@pytest.mark.asyncio
@pytest.mark.parametrize("trigger_mode", [TriggerMode.POLL, TriggerMode.SUBSCRIPTION])
async def test_aligned_mixed_modes_keep_variable_branch_independent(trigger_mode):
    collector = DataCollector(None)
    rows = []
    collector.register_data_callback(rows.append)
    group = DataGroup(
        name="Mixed",
        interval_seconds=0.02,
        trigger=TriggerType.TIME_AND_VARIABLE,
        description="mixed",
        data_points=["Value"],
        trigger_point="Trigger",
        trigger_mode=trigger_mode,
        trigger_interval_seconds=0.005,
        force_cadence_alignment=True,
    )
    value = DataPoint("Value", "ns=6;s=Value", "value")
    trigger = DataPoint("Trigger", "ns=6;s=Trigger", "trigger")
    client = SnapshotClient(value=False)
    method = (
        collector._time_and_variable_subscription_collection
        if trigger_mode == TriggerMode.SUBSCRIPTION
        else collector._time_and_variable_collection
    )
    task = asyncio.create_task(method(group, [value], trigger, client))
    try:
        await _wait_for_rows(rows)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    assert rows[0]["trigger_type"] == "time"
    assert rows[0]["is_backfill"] is False
