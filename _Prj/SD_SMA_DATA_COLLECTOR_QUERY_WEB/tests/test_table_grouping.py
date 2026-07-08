"""Unit tests for logical group / table classification."""

from __future__ import annotations

from app.table_partition import (
    default_baseline_table,
    list_group_names_from_tables,
    list_tables_for_group,
    sort_tables_for_group,
    table_belongs_to_group,
    table_group_info,
)


SAMPLE_TABLES = [
    "BatchHeader",
    "BatchDetail_y2025_span1",
    "BatchDetail_y2026_span1",
    "BatchDetail_2Year_y2025_span2",
    "alarm_group_1_20260407",
    "sensor_group_1_20260310",
]


def test_table_group_info_fixed_master():
    info = table_group_info("BatchHeader")
    assert info is not None
    assert info.kind == "fixed"
    assert info.group_name == "BatchHeader"


def test_table_group_info_partitioned():
    info = table_group_info("BatchDetail_y2025_span1")
    assert info is not None
    assert info.kind == "partitioned"
    assert info.group_name == "BatchDetail"


def test_list_group_names_includes_fixed_and_partitioned():
    groups = list_group_names_from_tables(SAMPLE_TABLES)
    assert "BatchHeader" in groups
    assert "BatchDetail" in groups
    assert "BatchDetail_2Year" in groups
    assert "alarm_group_1" in groups


def test_list_tables_for_group_fixed_master():
    tables = list_tables_for_group(SAMPLE_TABLES, "BatchHeader")
    assert tables == ["BatchHeader"]


def test_list_tables_for_group_partitioned_sorted():
    tables = list_tables_for_group(SAMPLE_TABLES, "BatchDetail")
    assert tables == ["BatchDetail_y2025_span1", "BatchDetail_y2026_span1"]


def test_default_baseline_prefers_fixed_table():
    tables = list_tables_for_group(SAMPLE_TABLES, "BatchHeader")
    assert default_baseline_table("BatchHeader", tables) == "BatchHeader"


def test_default_baseline_latest_partitioned_when_no_fixed():
    tables = list_tables_for_group(SAMPLE_TABLES, "BatchDetail")
    assert default_baseline_table("BatchDetail", tables) == "BatchDetail_y2026_span1"


def test_table_belongs_to_group():
    assert table_belongs_to_group("BatchHeader", "BatchHeader") is True
    assert table_belongs_to_group("BatchDetail_y2025_span1", "BatchDetail") is True
    assert table_belongs_to_group("BatchHeader", "BatchDetail") is False
