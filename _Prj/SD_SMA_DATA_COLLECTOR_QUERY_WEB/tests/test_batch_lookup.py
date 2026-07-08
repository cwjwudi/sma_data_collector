"""Tests for batch start-time column resolution."""

from __future__ import annotations

from app.table_list_writeback import pick_start_time_column


def test_pick_start_time_column_prefers_btach_typo_alias():
    available = {"strBatchCode", "dtBtachStartTime"}
    assert pick_start_time_column(available, "dtBatchStartTime") == "dtBtachStartTime"


def test_pick_start_time_column_uses_explicit_when_present():
    available = {"strBatchCode", "dtBatchStartTime"}
    assert pick_start_time_column(available, "dtBatchStartTime") == "dtBatchStartTime"
