"""Unit tests for advanced table list writeback and OPC UA monitor."""

from __future__ import annotations

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock

from app.plugin_opcua_monitor import PluginOpcuaMonitor, PluginRuntimeSnapshot, RisingEdgeDetector
from app.table_list_writeback import (
    AdvancedOpcuaTriggerConfig,
    TableListWritebackConfig,
    resolve_table_names_for_batch_no,
)


def _lookup(_master_table: str, _batch_column: str, batch_value):
    if batch_value == "B001":
        return datetime(2026, 3, 15, 8, 0, 0)
    return None


def test_advanced_config_requires_trigger_and_batch_nodes():
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "mode": "advanced",
            "batch_column": "strBatchCode",
            "buffer_node": "ns=2;s=Demo",
            "advanced": {
                "prev_page_node": "ns=2;s=Prev",
                "next_page_node": "ns=2;s=Next",
                "batch_no_node": "",
                "trigger_node": "ns=2;s=Trig",
            },
        },
        bind_group="BatchHeader",
    )
    assert cfg is None

    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "mode": "advanced",
            "batch_column": "strBatchCode",
            "buffer_node": "ns=2;s=Demo",
            "advanced": {
                "batch_no_node": "ns=2;s=Batch",
                "trigger_node": "ns=2;s=Trig",
            },
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    assert cfg.is_advanced_mode
    assert cfg.advanced is not None
    assert cfg.advanced.batch_no_node == "ns=2;s=Batch"


def test_advanced_opcua_trigger_config_poll_interval_clamped():
    advanced = AdvancedOpcuaTriggerConfig.from_raw(
        {
            "batch_no_node": "ns=2;s=Batch",
            "trigger_node": "ns=2;s=Trig",
            "poll_interval_ms": 10,
        }
    )
    assert advanced is not None
    assert advanced.poll_interval_ms == 50


def test_resolve_table_names_for_batch_no():
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "batch_column": "strBatchCode",
            "buffer_node": "ns=2;s=Demo",
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    tables = resolve_table_names_for_batch_no(
        "B001",
        cfg,
        list_tables=lambda: [
            "BatchHeader",
            "BatchDetail_y2026_span1",
            "BatchDetail_2Year_y2025_span2",
        ],
        lookup_start_time=_lookup,
    )
    assert tables[0] == "BatchHeader"
    assert tables[1] == "BatchDetail_y2026_span1"
    assert tables[2] == "BatchDetail_2Year_y2025_span2"


def test_rising_edge_detector_ignores_first_sample():
    detector = RisingEdgeDetector()
    assert detector.check("k", True) is False
    assert detector.check("k", True) is False
    assert detector.check("k", False) is False
    assert detector.check("k", True) is True


def test_advanced_config_inferred_from_advanced_block_when_mode_cursor():
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "mode": "cursor",
            "batch_column": "strBatchCode",
            "buffer_node": "ns=2;s=Demo",
            "advanced": {
                "batch_no_node": "ns=2;s=Batch",
                "trigger_node": "ns=2;s=Trig",
            },
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    assert cfg.is_advanced_mode
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "mode": "advanced",
            "batch_column": "strBatchCode",
            "buffer_node": "ns=2;s=Demo",
            "advanced": {
                "batch_no_node": "ns=2;s=Batch",
                "trigger_node": "ns=2;s=Trig",
            },
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    from app.table_list_writeback import should_write_table_list

    assert should_write_table_list(cfg, "opc.tcp://127.0.0.1:4840", 1) is False


def test_resolve_table_names_for_batch_no_uses_master_lookup_only():
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

    def _lookup(master_table: str, batch_column: str, batch_value):
        assert master_table == "BatchHeader"
        assert batch_column == "strBatchCode"
        assert batch_value == "B001"
        return datetime(2026, 3, 15, 8, 0, 0)

    tables = resolve_table_names_for_batch_no(
        "B001",
        cfg,
        list_tables=lambda: ["BatchHeader", "BatchDetail_y2026_span1"],
        lookup_start_time=_lookup,
    )
    assert tables[0] == "BatchHeader"
    assert tables[1] == "BatchDetail_y2026_span1"


def test_advanced_lookup_ignores_cursor_start_time_column():
    from app.main import _resolve_lookup_start_time_column

    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "mode": "advanced",
            "batch_column": "strBatchCode",
            "start_time_column": "ts",
            "lookup_start_time_column": "dtBtachStartTime",
            "buffer_node": "ns=2;s=Demo",
            "advanced": {
                "batch_no_node": "ns=2;s=Batch",
                "trigger_node": "ns=2;s=Trig",
            },
        },
        bind_group="BatchHeader",
    )
    assert cfg is not None
    raw = {
        "start_time_column": "Status",
        "lookup_start_time_column": "dtBtachStartTime",
    }
    column = _resolve_lookup_start_time_column(
        {"bind_group": "BatchHeader", "view_name": "table"},
        cfg,
        raw,
    )
    assert column == "dtBtachStartTime"
    assert column not in ("ts", "Status")


def test_page_delta_at_boundary_refreshes_current_page():
    async def _run() -> int:
        snapshots: list[int] = []

        async def on_page_change(_plugin_key: str, page: int) -> PluginRuntimeSnapshot:
            snapshots.append(page)
            return PluginRuntimeSnapshot(plugin_key="general_1", page=page, total_pages=3, revision=0)

        monitor = PluginOpcuaMonitor(
            iter_bindings=lambda: [],
            get_opcua=lambda: {"endpoint_url": ""},
            on_page_change=on_page_change,
            on_trigger=AsyncMock(return_value=True),
        )
        monitor._runtime["general_1"] = PluginRuntimeSnapshot(
            plugin_key="general_1",
            page=1,
            total_pages=3,
            revision=1,
        )
        await monitor._handle_page_delta("general_1", -1)
        await monitor._handle_page_delta("general_1", 1)
        monitor._runtime["general_1"] = PluginRuntimeSnapshot(
            plugin_key="general_1",
            page=3,
            total_pages=3,
            revision=3,
        )
        await monitor._handle_page_delta("general_1", 1)
        return snapshots

    pages = asyncio.run(_run())
    assert pages == [1, 2, 3]
