"""Unit tests for year-partitioned table name logic."""

from __future__ import annotations

from datetime import datetime

from app.table_partition import (
    build_table_name_array,
    parse_partitioned_table_name,
    partition_bucket_contains,
    resolve_matching_partitioned_tables,
)


def test_parse_partitioned_table_name():
    parsed = parse_partitioned_table_name("BatchDetail_y2025_span2")
    assert parsed is not None
    assert parsed.group_name == "BatchDetail"
    assert parsed.bucket_year == 2025
    assert parsed.interval_years == 2


def test_partition_bucket_contains_span2():
    assert partition_bucket_contains(datetime(2025, 6, 1), 2025, 2) is True
    assert partition_bucket_contains(datetime(2026, 3, 1), 2025, 2) is True
    assert partition_bucket_contains(datetime(2027, 3, 1), 2025, 2) is False


def test_resolve_matching_partitioned_tables_sorted_and_stable():
    tables = [
        "BatchHeader",
        "BatchDetail_y2027_span1",
        "BatchDetail_y2026_span1",
        "BatchDetail_2Year_y2025_span2",
        "sensor_group_1_20260310",
    ]
    matched = resolve_matching_partitioned_tables(tables, datetime(2026, 3, 15))
    assert matched == ["BatchDetail_y2026_span1", "BatchDetail_2Year_y2025_span2"]


def test_build_table_name_array_fixed_master_slot():
    values = build_table_name_array(
        "BatchHeader",
        ["BatchDetail_y2026_span1", "BatchDetail_2Year_y2025_span2"],
        max_tables=5,
        string_max_len=80,
    )
    assert values[0] == "BatchHeader"
    assert values[1] == "BatchDetail_y2026_span1"
    assert values[2] == "BatchDetail_2Year_y2025_span2"
    assert values[3] == ""
    assert len(values) == 5
