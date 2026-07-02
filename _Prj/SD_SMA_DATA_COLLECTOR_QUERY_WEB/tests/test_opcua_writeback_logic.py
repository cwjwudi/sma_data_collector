"""Unit tests for OPC UA writeback logic (no live server)."""

from __future__ import annotations

from app.opcua_writeback import (
    MAX_ARRAY_LEN,
    OpcUaWritebackConfig,
    build_array_values,
    coerce_cell,
    should_writeback,
)


def test_build_array_values_three_rows():
    rows = [{"code": 1}, {"code": 2}, {"code": 3}]
    values = build_array_values(rows, "code")
    assert len(values) == MAX_ARRAY_LEN
    assert values[:3] == [1, 2, 3]
    assert values[3:] == [0] * (MAX_ARRAY_LEN - 3)


def test_build_array_values_truncates_over_50():
    rows = [{"code": i} for i in range(60)]
    values = build_array_values(rows, "code")
    assert len(values) == 50
    assert values[0] == 0
    assert values[49] == 49


def test_build_array_values_string_padding():
    rows = [{"msg": "a"}, {"msg": "b"}]
    values = build_array_values(rows, "msg")
    assert values[:2] == ["a", "b"]
    assert values[2] == ""


def test_coerce_cell_none_numeric():
    assert coerce_cell(None, numeric_default=0, string_default="") == 0


def test_coerce_cell_none_string_column():
    assert coerce_cell(None, string_default="x", numeric_default=0) == 0


def test_coerce_cell_invalid_string_becomes_string():
    assert coerce_cell("hello") == "hello"


def test_format_cell_for_opcua_datetime():
    from datetime import datetime

    from app.opcua_writeback import build_array_values, format_cell_for_opcua

    dt = datetime(2026, 7, 2, 15, 30, 0)
    assert format_cell_for_opcua(dt) == "2026-07-02 15:30:00"
    rows = [{"collection_time": dt}]
    values = build_array_values(rows, "collection_time")
    assert values[0] == "2026-07-02 15:30:00"
    assert values[1] == ""


def test_opcua_writeback_config_missing():
    assert OpcUaWritebackConfig.from_binding(None) is None
    assert OpcUaWritebackConfig.from_binding({}) is None
    assert OpcUaWritebackConfig.from_binding({"columns": {}}) is None


def test_opcua_writeback_config_parses():
    cfg = OpcUaWritebackConfig.from_binding(
        {
            "cursor": "ns=2;s=QueryDemo.cursor",
            "columns": {"code": "ns=2;s=QueryDemo.arCode"},
        }
    )
    assert cfg is not None
    assert cfg.cursor_node.endswith("cursor")
    assert "code" in cfg.column_nodes


def test_should_writeback_requires_endpoint_and_columns():
    cfg = OpcUaWritebackConfig.from_binding({"columns": {"code": "n1"}})
    assert should_writeback(cfg, "opc.tcp://127.0.0.1:4841/") is True
    assert should_writeback(cfg, "") is False
    assert should_writeback(None, "opc.tcp://127.0.0.1:4841/") is False
