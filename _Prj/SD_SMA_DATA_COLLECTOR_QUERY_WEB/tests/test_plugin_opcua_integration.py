"""Integration tests for plugin OPC UA writeback."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import opcua_client
from app.main import app
from tests.conftest import opcua_mock_meta

SAMPLE_ROWS = [
    {"ts": "2026-01-01T00:00:00", "code": 101, "msg": "alarm A"},
    {"ts": "2026-01-02T00:00:00", "code": 102, "msg": "alarm B"},
    {"ts": "2026-01-03T00:00:00", "code": 103, "msg": "alarm C"},
]


def _read_nodes(endpoint: str, node_ids: list[str]) -> list[Any]:
    async def _run() -> list[Any]:
        opcua_client.reset_pool_for_tests()
        out: list[Any] = []
        for node_id in node_ids:
            out.append(await opcua_client.read_scalar(endpoint, node_id, username="", password=""))
        return out

    return asyncio.run(_run())


def _mock_query_history(*_args: Any, **_kwargs: Any) -> tuple[int, list[str], list[dict[str, Any]], list[str]]:
    columns = ["ts", "code", "msg"]
    return len(SAMPLE_ROWS), columns, list(SAMPLE_ROWS), []


def _mock_schema_report(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    return {
        "tables": ["alarm_group_1_20260101"],
        "baseline_table": "alarm_group_1_20260101",
        "consistent": True,
    }


@pytest.fixture
def client(test_profile_dir, monkeypatch):
    import app.main as main_module

    monkeypatch.setenv("SD_SMA_DISABLE_OPCUA_MONITOR", "1")
    main_module.CONFIG_DIR = test_profile_dir
    main_module.config_store = main_module.UnifiedConfigStore(
        test_profile_dir,
        legacy_app_settings_path=test_profile_dir / "app_settings.json",
        legacy_query_view_config_path=test_profile_dir / "query_view_config.json",
        legacy_plugin_config_path=test_profile_dir / "plugins_config.json",
    )
    main_module.settings = main_module._load_app_settings()
    main_module.db = main_module.QueryDatabase(main_module.settings.get("database", {}))
    main_module.cfg = main_module.ConfigManager(main_module.config_store)
    opcua_client.reset_pool_for_tests()
    with TestClient(app) as test_client:
        yield test_client
    opcua_client.reset_pool_for_tests()


@pytest.mark.integration
@patch("app.main.db.get_group_schema_report", side_effect=_mock_schema_report)
@patch("app.main.db.query_history", side_effect=_mock_query_history)
def test_query_writes_arrays_and_cursor(_mock_q, _mock_s, client: TestClient, opcua_mock_meta: dict):
    resp = client.post(
        "/api/plugins/query/alarm_2",
        json={"page": 1, "page_size": 10, "cursor": -1},
    )
    assert resp.status_code == 200
    assert len(resp.json()["rows"]) == 3

    cursor, codes, msgs = _read_nodes(
        opcua_mock_meta["endpoint_url"],
        [
            opcua_mock_meta["cursor"],
            opcua_mock_meta["arCode"],
            opcua_mock_meta["arMsg"],
        ],
    )
    assert int(cursor) == -1
    assert list(codes[:3]) == [101, 102, 103]
    assert codes[3] == 0
    assert list(msgs[:3]) == ["alarm A", "alarm B", "alarm C"]
    assert msgs[3] == ""


@pytest.mark.integration
def test_cursor_only_write(client: TestClient, opcua_mock_meta: dict):
    resp = client.post("/api/plugins/cursor/alarm_2", json={"cursor": 2})
    assert resp.status_code == 200
    cursor = _read_nodes(opcua_mock_meta["endpoint_url"], [opcua_mock_meta["cursor"]])[0]
    assert int(cursor) == 2


@pytest.mark.integration
@patch("app.main.db.get_group_schema_report", side_effect=_mock_schema_report)
@patch("app.main.db.query_history", side_effect=_mock_query_history)
def test_query_without_writeback_config(_mock_q, _mock_s, client: TestClient):
    resp = client.post("/api/plugins/query/alarm_1", json={"page": 1, "cursor": -1})
    assert resp.status_code == 200


@pytest.mark.integration
@patch("app.main.db.get_group_schema_report", side_effect=_mock_schema_report)
@patch("app.main.db.query_history", side_effect=_mock_query_history)
def test_write_failure_is_silent(_mock_q, _mock_s, client: TestClient, test_profile_dir):
    import app.main as main_module

    bad_profile = main_module.config_store.get_active_config()
    bad_profile["opcua"]["endpoint_url"] = "opc.tcp://127.0.0.1:59999/invalid/"
    main_module.config_store.save_active_config(bad_profile)

    resp = client.post("/api/plugins/query/alarm_2", json={"page": 1, "cursor": -1})
    assert resp.status_code == 200
    assert len(resp.json()["rows"]) == 3


@pytest.mark.integration
@patch("app.main.db.list_tables")
@patch("app.main.db.get_group_schema_report", side_effect=_mock_schema_report)
@patch("app.main.db.query_history", side_effect=_mock_query_history)
def test_advanced_trigger_writeback(_mock_q, _mock_s, mock_list_tables, client: TestClient, opcua_mock_meta: dict):
    import app.main as main_module
    from datetime import datetime

    mock_list_tables.return_value = [
        "BatchHeader",
        "BatchDetail_y2026_span1",
        "BatchDetail_2Year_y2025_span2",
    ]

    profile = main_module.config_store.get_active_config()
    profile["plugins"]["modules"]["alarm"]["pages"]["4"]["table_list_writeback"] = {
        "enabled": True,
        "mode": "advanced",
        "batch_column": "code",
        "buffer_node": opcua_mock_meta["strListName"],
        "advanced": {
            "batch_no_node": opcua_mock_meta.get("strBatchNo", "ns=2;s=Demo.BatchNo"),
            "trigger_node": opcua_mock_meta.get("bTrigger", "ns=2;s=Demo.Trigger"),
        },
    }
    main_module.config_store.save_active_config(profile)

    with patch(
        "app.main.db.lookup_batch_start_time",
        return_value=datetime(2026, 3, 15, 8, 0, 0),
    ):
        async def _run() -> bool:
            binding = main_module._resolve_plugin_binding("alarm_4")
            return await main_module._run_advanced_trigger_writeback(binding, "B001")

        ok = asyncio.run(_run())
        assert ok is True

    table_names = _read_nodes(opcua_mock_meta["endpoint_url"], [opcua_mock_meta["strListName"]])[0]
    assert table_names[0] == "BatchHeader"
    assert table_names[1] == "BatchDetail_y2026_span1"


@pytest.mark.integration
@patch("app.main.db.list_tables")
@patch("app.main.db.get_group_schema_report", side_effect=_mock_schema_report)
@patch("app.main.db.query_history", side_effect=_mock_query_history)
def test_table_list_writeback_on_cursor(_mock_q, _mock_s, mock_list_tables, client: TestClient, opcua_mock_meta: dict):
    import app.main as main_module

    profile = main_module.config_store.get_active_config()
    profile["plugins"]["modules"]["alarm"]["pages"]["4"]["table_list_writeback"] = {
        "enabled": True,
        "mode": "cursor",
        "batch_column": "code",
        "start_time_column": "ts",
        "buffer_node": opcua_mock_meta["strListName"],
    }
    main_module.config_store.save_active_config(profile)

    mock_list_tables.return_value = [
        "BatchHeader",
        "BatchDetail_y2026_span1",
        "BatchDetail_2Year_y2025_span2",
        "sensor_group_1_20260310",
    ]

    resp = client.post(
        "/api/plugins/query/alarm_4",
        json={"page": 1, "page_size": 10, "cursor": -1},
    )
    assert resp.status_code == 200

    empty_names = _read_nodes(opcua_mock_meta["endpoint_url"], [opcua_mock_meta["strListName"]])[0]
    assert empty_names[0] == ""
    assert empty_names[1] == ""

    resp = client.post("/api/plugins/cursor/alarm_4", json={"cursor": 1})
    assert resp.status_code == 200

    table_names = _read_nodes(opcua_mock_meta["endpoint_url"], [opcua_mock_meta["strListName"]])[0]
    assert table_names[0] == "BatchHeader"
    assert table_names[1] == "BatchDetail_y2026_span1"
    assert table_names[2] == "BatchDetail_2Year_y2025_span2"
    assert table_names[3] == ""


@pytest.mark.integration
def test_opcua_check_endpoint(client: TestClient, opcua_mock_meta: dict):
    resp = client.post(
        "/api/config/opcua",
        json={
            "endpoint_url": opcua_mock_meta["endpoint_url"],
            "username": "",
            "password": "",
            "test_only": True,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("ok") is True
    assert data.get("status") == "ok"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_read_scalar_requires_running_server(opcua_mock_meta: dict):
    val = await opcua_client.read_scalar(opcua_mock_meta["endpoint_url"], opcua_mock_meta["cursor"])
    assert val is not None
