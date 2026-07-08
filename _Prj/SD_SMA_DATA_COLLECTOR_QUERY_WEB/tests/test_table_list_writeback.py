"""Unit tests for batch table list writeback logic."""

from __future__ import annotations

from datetime import datetime

from app.table_list_writeback import (
    TableListWritebackConfig,
    resolve_batch_start_time,
    resolve_table_names_for_row,
)


def _lookup(_master_table: str, _batch_column: str, batch_value):
    if batch_value == "B001":
        return datetime(2026, 3, 15, 8, 0, 0)
    return None


def test_table_list_writeback_config_requires_enabled_and_fields():
    assert TableListWritebackConfig.from_binding(None) is None
    assert TableListWritebackConfig.from_binding({"enabled": True}) is None
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "batch_column": "strBatchCode",
            "buffer_node": "ns=2;s=Demo",
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    assert cfg.batch_master_table == "BatchHeader"


def test_resolve_batch_start_time_prefers_row_column():
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "batch_column": "strBatchCode",
            "start_time_column": "dtBatchStartTime",
            "buffer_node": "ns=2;s=Demo",
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    start = resolve_batch_start_time(
        {"strBatchCode": "B001", "dtBatchStartTime": "2025-12-01 10:00:00"},
        cfg,
        lookup_start_time=_lookup,
    )
    assert start == datetime(2025, 12, 1, 10, 0, 0)


def test_resolve_batch_start_time_lookup_when_column_missing():
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "batch_column": "strBatchCode",
            "buffer_node": "ns=2;s=Demo",
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    start = resolve_batch_start_time(
        {"strBatchCode": "B001"},
        cfg,
        lookup_start_time=_lookup,
    )
    assert start == datetime(2026, 3, 15, 8, 0, 0)


def test_resolve_table_names_for_row_builds_stable_array():
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "batch_column": "strBatchCode",
            "start_time_column": "dtBatchStartTime",
            "buffer_node": "ns=2;s=Demo",
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    tables = resolve_table_names_for_row(
        {"strBatchCode": "B001", "dtBatchStartTime": "2026-03-15 08:00:00"},
        cfg,
        list_tables=lambda: [
            "BatchHeader",
            "BatchDetail_y2026_span1",
            "BatchDetail_2Year_y2025_span2",
            "BatchDetail_y2025_span1",
            "sensor_group_1_20260310",
        ],
        lookup_start_time=_lookup,
    )
    assert tables[0] == "BatchHeader"
    assert tables[1] == "BatchDetail_y2026_span1"
    assert tables[2] == "BatchDetail_2Year_y2025_span2"
    assert tables[3] == ""
