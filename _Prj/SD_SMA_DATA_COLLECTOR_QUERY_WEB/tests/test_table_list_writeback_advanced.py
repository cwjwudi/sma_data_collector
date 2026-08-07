"""Unit tests for advanced table list writeback and OPC UA monitor."""

from __future__ import annotations

import asyncio
import threading
from datetime import datetime
from unittest.mock import AsyncMock, patch

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


async def _noop_page(_plugin_key: str, _page: int):
    return None


async def _noop_snapshot_query(_plugin_key: str):
    return None


async def _noop_trigger(_plugin_key: str, _batch_no: str) -> bool:
    return False


def test_advanced_config_rejects_partial_batch_trigger_pair():
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


def test_advanced_config_allows_pagination_nodes_without_batch_writeback_fields():
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "mode": "advanced",
            "batch_column": "",
            "buffer_node": "",
            "advanced": {
                "prev_page_node": "ns=2;s=Prev",
                "next_page_node": "ns=2;s=Next",
                "batch_no_node": "",
                "trigger_node": "",
            },
        },
        bind_group="ProductHistory",
    )

    assert cfg is not None
    assert cfg.is_advanced_mode
    assert cfg.has_batch_writeback is False
    assert cfg.batch_column == ""
    assert cfg.buffer_node == ""
    assert cfg.advanced is not None
    assert cfg.advanced.has_pagination is True
    assert cfg.advanced.has_batch_writeback_trigger is False


def test_advanced_config_accepts_snapshot_query_node():
    cfg = TableListWritebackConfig.from_binding(
        {
            "enabled": True,
            "mode": "advanced",
            "advanced": {
                "query_node": "ns=2;s=Query",
                "prev_page_node": "ns=2;s=Prev",
                "next_page_node": "ns=2;s=Next",
            },
        },
        bind_group="ProductHistory",
    )

    assert cfg is not None
    assert cfg.advanced is not None
    assert cfg.advanced.query_node == "ns=2;s=Query"
    assert cfg.advanced.has_snapshot_query is True


def test_advanced_config_requires_batch_fields_only_when_trigger_pair_is_enabled():
    raw = {
        "enabled": True,
        "mode": "advanced",
        "advanced": {
            "prev_page_node": "ns=2;s=Prev",
            "batch_no_node": "ns=2;s=Batch",
            "trigger_node": "ns=2;s=Trig",
        },
    }
    assert TableListWritebackConfig.from_binding(raw, bind_group="BatchHeader") is None

    raw["batch_column"] = "strBatchCode"
    raw["buffer_node"] = "ns=2;s=Buffer"
    cfg = TableListWritebackConfig.from_binding(raw, bind_group="BatchHeader")
    assert cfg is not None
    assert cfg.has_batch_writeback is True


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

    advanced_hi = AdvancedOpcuaTriggerConfig.from_raw(
        {
            "batch_no_node": "ns=2;s=Batch",
            "trigger_node": "ns=2;s=Trig",
            "poll_interval_ms": 99999,
        }
    )
    assert advanced_hi is not None
    assert advanced_hi.poll_interval_ms == 5000


def test_monitor_resolves_poll_interval_from_global_opcua():
    monitor = PluginOpcuaMonitor(
        iter_bindings=lambda: [],
        get_opcua=lambda: {
            "endpoint_url": "opc.tcp://127.0.0.1:4840/",
            "poll_interval_ms": 100,
            "heartbeat_node": "ns=2;s=Heart",
        },
        on_snapshot_query=_noop_snapshot_query,
        on_page_change=_noop_page,
        on_trigger=_noop_trigger,
        poll_interval_ms=200,
    )
    assert monitor._resolve_poll_interval_ms() == 100


def test_monitor_runtime_config_rebuilds_only_when_revision_changes():
    from app import main as main_module

    active = {"plugins": {"modules": {}}}
    revisions = iter([("default.json", 1), ("default.json", 1), ("default.json", 2)])
    main_module._monitor_config_revision = None
    main_module._monitor_config_snapshot = None
    with (
        patch.object(
            main_module.config_store,
            "get_active_config_with_revision",
            side_effect=lambda: (active, next(revisions)),
        ),
        patch("app.main._iter_advanced_plugin_bindings", return_value=[]) as compile_bindings,
        patch("app.main._get_opcua_connection", return_value={"poll_interval_ms": 500}),
    ):
        first = main_module._get_monitor_runtime_config()
        second = main_module._get_monitor_runtime_config()
        third = main_module._get_monitor_runtime_config()

    assert first is second
    assert third is not second
    assert compile_bindings.call_count == 2
    main_module._monitor_config_revision = None
    main_module._monitor_config_snapshot = None


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


def test_monitor_batch_reads_duplicate_nodes_once_per_poll():
    async def _run() -> None:
        bindings = [
            {
                "plugin_key": key,
                "_table_list_config": object(),
                "_table_list_advanced": {
                    "query_node": "ns=2;s=Shared",
                    "prev_page_node": "",
                    "next_page_node": "",
                    "batch_no_node": "",
                    "trigger_node": "",
                },
            }
            for key in ("general_1", "general_2")
        ]
        monitor = PluginOpcuaMonitor(
            get_runtime_config=lambda: {
                "bindings": bindings,
                "opcua": {"endpoint_url": "opc.tcp://127.0.0.1:4840/"},
            },
            on_snapshot_query=_noop_snapshot_query,
            on_page_change=_noop_page,
            on_trigger=_noop_trigger,
        )
        with patch(
            "app.plugin_opcua_monitor.opcua_client.read_scalars",
            new=AsyncMock(return_value=[False]),
        ) as read_many:
            assert await monitor._poll_once() is True
            read_many.assert_awaited_once_with(
                "opc.tcp://127.0.0.1:4840/",
                ["ns=2;s=Shared"],
                username="",
                password="",
            )

    asyncio.run(_run())


def test_monitor_requires_observed_false_before_rearming_trigger():
    async def _run() -> int:
        binding = {
            "plugin_key": "general_1",
            "_table_list_config": object(),
            "_table_list_advanced": {
                "query_node": "ns=2;s=Query",
                "prev_page_node": "",
                "next_page_node": "",
                "batch_no_node": "",
                "trigger_node": "",
            },
        }
        on_snapshot = AsyncMock(
            return_value=PluginRuntimeSnapshot(plugin_key="general_1", total_pages=1)
        )
        monitor = PluginOpcuaMonitor(
            get_runtime_config=lambda: {
                "bindings": [binding],
                "opcua": {"endpoint_url": "opc.tcp://127.0.0.1:4840/"},
            },
            on_snapshot_query=on_snapshot,
            on_page_change=_noop_page,
            on_trigger=_noop_trigger,
        )
        samples = [[False], [True], [True], [False], [True]]
        with (
            patch(
                "app.plugin_opcua_monitor.opcua_client.read_scalars",
                new=AsyncMock(side_effect=samples),
            ),
            patch(
                "app.plugin_opcua_monitor.opcua_client.write_scalar",
                new=AsyncMock(return_value=True),
            ),
        ):
            for _ in samples:
                assert await monitor._poll_once() is True
        return on_snapshot.await_count

    assert asyncio.run(_run()) == 2


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


def test_advanced_plugin_query_ignores_time_range():
    from datetime import datetime
    from unittest.mock import patch

    from app.main import _execute_plugin_query

    binding = {
        "plugin_key": "general_1",
        "view_name": "table",
        "bind_group": "BatchHeader",
        "bind_table": None,
        "page_size": 10,
        "table_list_writeback": {
            "enabled": True,
            "mode": "advanced",
            "advanced": {
                "prev_page_node": "ns=2;s=Prev",
                "next_page_node": "ns=2;s=Next",
            },
        },
    }
    captured: dict = {}

    def _fake_query(req):
        captured["start_time"] = req.start_time
        captured["end_time"] = req.end_time
        return 0, ["strBatchCode"], [], []

    with (
        patch("app.main.db.get_group_schema_report", return_value={"tables": ["BatchHeader"], "baseline_table": "BatchHeader", "consistent": True}),
        patch("app.main.cfg.get_group_baseline", return_value="BatchHeader"),
        patch("app.main.cfg.resolve_query_view", return_value={
            "columns": ["strBatchCode"],
            "time_field": "dtBtachStartTime",
            "max_page_size": 500,
            "sort_by": "dtBtachStartTime",
            "sort_dir": "desc",
        }),
        patch("app.main.db.query_history", side_effect=_fake_query),
        patch("app.main._plugin_opcua_monitor", None),
    ):
        _execute_plugin_query(
            binding,
            page=1,
            start_time=datetime(2026, 1, 1),
            end_time=datetime(2026, 1, 2),
        )

    assert captured["start_time"] is None
    assert captured["end_time"] is None


def test_page_delta_at_boundary_refreshes_current_page():
    async def _run() -> int:
        snapshots: list[int] = []

        async def on_page_change(_plugin_key: str, page: int) -> PluginRuntimeSnapshot:
            snapshots.append(page)
            return PluginRuntimeSnapshot(plugin_key="general_1", page=page, total_pages=3, revision=0)

        monitor = PluginOpcuaMonitor(
            iter_bindings=lambda: [],
            get_opcua=lambda: {"endpoint_url": ""},
            on_snapshot_query=_noop_snapshot_query,
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


def test_snapshot_pages_remain_frozen_until_next_query():
    from app import main as main_module
    from app.models import HistoryQueryResponse

    binding = {
        "plugin_key": "general_1",
        "view_name": "table",
        "bind_group": "Data_Batch",
        "bind_table": "Data_Batch",
        "page_size": 10,
        "table_list_writeback": {
            "enabled": True,
            "mode": "advanced",
            "advanced": {"query_node": "ns=2;s=Query"},
        },
    }
    database_rows = [{"BatchCode": f"B{i:02d}"} for i in range(25, 0, -1)]
    query_count = 0

    def fake_execute(_binding, **_kwargs):
        nonlocal query_count
        query_count += 1
        rows = [dict(row) for row in database_rows]
        response = HistoryQueryResponse(
            total=len(rows),
            page=1,
            page_size=len(rows),
            columns=["BatchCode"],
            rows=rows,
            display_columns=[{"name": "BatchCode", "label_en": "BatchCode", "label_zh": "BatchCode"}],
        )
        runtime = PluginRuntimeSnapshot(
            plugin_key="general_1",
            table="Data_Batch",
            total_records=len(rows),
            columns=["BatchCode"],
            rows=rows,
            display_columns=response.display_columns,
        )
        return response, runtime

    async def run_scenario():
        main_module._clear_plugin_snapshots()
        with (
            patch("app.main._execute_plugin_query", side_effect=fake_execute),
            patch("app.main._run_plugin_writeback", new=AsyncMock()),
            patch("app.main._plugin_opcua_monitor", None),
        ):
            first, _runtime = await main_module._activate_plugin_snapshot(binding)
            database_rows.insert(0, {"BatchCode": "NEW"})
            second_page = await main_module._read_plugin_snapshot_page(binding, 2)
            refreshed, _runtime = await main_module._activate_plugin_snapshot(binding)
        main_module._clear_plugin_snapshots()
        return first, second_page, refreshed

    first, second_page, refreshed = asyncio.run(run_scenario())
    assert [row["BatchCode"] for row in first.rows] == [f"B{i:02d}" for i in range(25, 15, -1)]
    assert second_page is not None
    assert [row["BatchCode"] for row in second_page[0].rows] == [f"B{i:02d}" for i in range(15, 5, -1)]
    assert refreshed.page == 1
    assert refreshed.rows[0]["BatchCode"] == "NEW"
    assert query_count == 2


def test_concurrent_snapshot_requests_share_one_worker_query():
    from app import main as main_module
    from app.models import HistoryQueryResponse

    binding = {
        "plugin_key": "general_1",
        "view_name": "table",
        "bind_group": "Data_Batch",
        "bind_table": "Data_Batch",
        "page_size": 10,
    }
    query_started = threading.Event()
    release_query = threading.Event()
    query_calls = 0
    worker_thread_ids: list[int] = []

    def fake_execute(_binding, **_kwargs):
        nonlocal query_calls
        query_calls += 1
        worker_thread_ids.append(threading.get_ident())
        query_started.set()
        assert release_query.wait(timeout=2)
        rows = [{"BatchCode": "B01"}]
        response = HistoryQueryResponse(
            total=1,
            page=1,
            page_size=1,
            columns=["BatchCode"],
            rows=rows,
            display_columns=[{"name": "BatchCode"}],
        )
        runtime = PluginRuntimeSnapshot(
            plugin_key="general_1",
            table="Data_Batch",
            total_records=1,
            columns=["BatchCode"],
            rows=rows,
            display_columns=response.display_columns,
        )
        return response, runtime

    async def _run():
        main_module._clear_plugin_snapshots()
        main_module._plugin_snapshot_tasks.clear()
        event_loop_thread = threading.get_ident()
        with (
            patch("app.main._execute_plugin_query", side_effect=fake_execute),
            patch("app.main._run_plugin_writeback", new=AsyncMock()),
            patch("app.main._plugin_opcua_monitor", None),
        ):
            first_task = asyncio.create_task(main_module._activate_plugin_snapshot(binding))
            assert await asyncio.to_thread(query_started.wait, 1)
            second_task = asyncio.create_task(main_module._activate_plugin_snapshot(binding))
            await asyncio.sleep(0)
            release_query.set()
            first, second = await asyncio.gather(first_task, second_task)
        main_module._clear_plugin_snapshots()
        return event_loop_thread, first, second

    event_loop_thread, first, second = asyncio.run(_run())
    assert query_calls == 1
    assert len(worker_thread_ids) == 1
    assert worker_thread_ids[0] != event_loop_thread
    assert first[0].rows == second[0].rows == [{"BatchCode": "B01"}]
