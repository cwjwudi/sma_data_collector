from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.database import HistoryQueryResult
from app.main import app


def test_by_view_batch_query_uses_configured_batch_field_without_time():
    captured = {}

    def fake_query(request):
        captured["request"] = request
        return HistoryQueryResult(
            total=None,
            columns=["id", "BatchCode", "collection_time"],
            rows=[
                {
                    "id": 100,
                    "BatchCode": "B001",
                    "collection_time": "2026-01-01 00:00:00",
                }
            ],
            missing_columns=[],
            has_more=True,
            next_cursor={"sort_value": "2026-01-01 00:00:00", "id": 100},
        )

    view = {
        "columns": ["id", "BatchCode", "collection_time"],
        "column_labels": {},
        "time_field": "collection_time",
        "batch_field": "BatchCode",
        "max_page_size": 500,
        "page_size": 50,
        "sort_by": "collection_time",
        "sort_dir": "desc",
        "default_filters": [],
    }
    with (
        patch("app.main.cfg.resolve_query_view", return_value=view),
        patch(
            "app.main.db.list_columns",
            return_value=["id", "BatchCode", "collection_time"],
        ),
        patch("app.main.db.query_history", side_effect=fake_query),
    ):
        response = TestClient(app, client=("127.0.0.1", 50000)).post(
            "/api/history/by-view",
            json={
                "view_name": "table",
                "table": "Data_Product",
                "query_mode": "batch",
                "batch_code": "B001",
            },
        )

    assert response.status_code == 200
    body = response.json()
    request = captured["request"]
    assert request.start_time is None
    assert request.end_time is None
    assert request.batch_field == "BatchCode"
    assert request.batch_code == "B001"
    assert request.pagination_mode == "cursor"
    assert request.include_total is False
    assert body["total"] is None
    assert body["has_more"] is True
    assert body["next_cursor"] == {"sort_value": "2026-01-01 00:00:00", "id": 100}


def test_by_view_rejects_mixed_batch_and_time_conditions():
    view = {
        "columns": ["id", "BatchCode", "collection_time"],
        "column_labels": {},
        "time_field": "collection_time",
        "batch_field": "BatchCode",
        "max_page_size": 500,
        "page_size": 50,
        "sort_by": "collection_time",
        "sort_dir": "desc",
        "default_filters": [],
    }
    with (
        patch("app.main.cfg.resolve_query_view", return_value=view),
        patch("app.main.db.list_columns", return_value=["id", "BatchCode", "collection_time"]),
    ):
        response = TestClient(app, client=("127.0.0.1", 50000)).post(
            "/api/history/by-view",
            json={
                "view_name": "table",
                "table": "Data_Product",
                "query_mode": "batch",
                "batch_code": "B001",
                "start_time": "2026-01-01T00:00:00",
            },
        )

    assert response.status_code == 400
    assert "不能填写时间条件" in response.json()["detail"]


def test_by_view_time_query_requires_complete_range():
    view = {
        "columns": ["id", "BatchCode", "collection_time"],
        "column_labels": {},
        "time_field": "collection_time",
        "batch_field": "BatchCode",
        "max_page_size": 500,
        "page_size": 50,
        "sort_by": "collection_time",
        "sort_dir": "desc",
        "default_filters": [],
    }
    with (
        patch("app.main.cfg.resolve_query_view", return_value=view),
        patch("app.main.db.list_columns", return_value=["id", "BatchCode", "collection_time"]),
    ):
        response = TestClient(app, client=("127.0.0.1", 50000)).post(
            "/api/history/by-view",
            json={
                "view_name": "table",
                "table": "Data_Product",
                "query_mode": "time",
                "start_time": "2026-01-01T00:00:00",
            },
        )

    assert response.status_code == 400
    assert "必须填写开始时间和结束时间" in response.json()["detail"]


def test_by_view_batch_query_requires_configured_field():
    view = {
        "columns": ["id", "BatchCode", "collection_time"],
        "column_labels": {},
        "time_field": "collection_time",
        "batch_field": "",
        "max_page_size": 500,
        "page_size": 50,
        "sort_by": "collection_time",
        "sort_dir": "desc",
        "default_filters": [],
    }
    with (
        patch("app.main.cfg.resolve_query_view", return_value=view),
        patch("app.main.db.list_columns", return_value=["id", "BatchCode", "collection_time"]),
    ):
        response = TestClient(app, client=("127.0.0.1", 50000)).post(
            "/api/history/by-view",
            json={
                "view_name": "table",
                "table": "Data_Product",
                "query_mode": "batch",
                "batch_code": "B001",
            },
        )

    assert response.status_code == 400
    assert "未配置有效的批次号绑定字段" in response.json()["detail"]


def test_batch_codes_endpoint_returns_small_dictionary():
    source = {"table": "ProductionOrder", "field": "OrderNo"}
    with (
        patch("app.main.cfg.resolve_batch_source", return_value=source),
        patch("app.main.db.list_columns", return_value=["OrderNo"]),
        patch("app.main.db.list_batch_codes", return_value=["O001", "O002"]) as list_codes,
    ):
        response = TestClient(app, client=("127.0.0.1", 50000)).get(
            "/api/meta/batch-codes?view_name=table&group=ProductHistory"
        )

    assert response.status_code == 200
    assert response.json() == {"items": ["O001", "O002"], "source": source}
    list_codes.assert_called_once_with("ProductionOrder", "OrderNo", limit=1000)


def test_batch_codes_endpoint_rejects_missing_source_configuration():
    with patch("app.main.cfg.resolve_batch_source", return_value={"table": "", "field": ""}):
        response = TestClient(app, client=("127.0.0.1", 50000)).get(
            "/api/meta/batch-codes?view_name=table&group=ProductHistory"
        )

    assert response.status_code == 400
    assert "未配置批次号来源表和字段" in response.json()["detail"]


def test_batch_source_config_endpoint_validates_and_saves_source():
    source = {"view_name": "table", "table": "ProductionOrder", "field": "OrderNo"}
    with (
        patch("app.main.db.list_columns", return_value=["id", "OrderNo"]),
        patch("app.main.cfg.update_query_batch_source") as update_source,
        patch("app.main.cfg.get_query_batch_source", return_value=source),
    ):
        response = TestClient(app, client=("127.0.0.1", 50000)).post(
            "/api/config/query-batch-source",
            json=source,
        )

    assert response.status_code == 200
    assert response.json() == {"status": "saved", **source}
    update_source.assert_called_once_with("table", "ProductionOrder", "OrderNo")


def test_plugin_batch_query_uses_binding_view_and_cursor_pagination():
    captured = {}
    binding = {
        "plugin_key": "general_1",
        "view_name": "table",
        "bind_group": "ProductHistory",
        "bind_table": None,
        "page_size": 50,
        "opcua_writeback": None,
        "table_list_writeback": None,
    }
    view = {
        "columns": ["id", "BatchCode", "collection_time"],
        "column_labels": {},
        "time_field": "collection_time",
        "batch_field": "BatchCode",
        "max_page_size": 500,
        "page_size": 50,
        "sort_by": "collection_time",
        "sort_dir": "desc",
    }

    def fake_query(request):
        captured["request"] = request
        return HistoryQueryResult(
            total=None,
            columns=view["columns"],
            rows=[{"id": 10, "BatchCode": "B001", "collection_time": "2026-01-01 00:00:00"}],
            missing_columns=[],
            has_more=True,
            next_cursor={"sort_value": "2026-01-01 00:00:00", "id": 10},
        )

    with (
        patch("app.main._resolve_plugin_binding", return_value=binding),
        patch(
            "app.main.db.get_group_schema_report",
            return_value={
                "tables": ["Data_Product"],
                "baseline_table": "Data_Product",
                "consistent": True,
            },
        ),
        patch("app.main.cfg.resolve_query_view", return_value=view),
        patch("app.main.db.list_columns", return_value=view["columns"]),
        patch("app.main.db.query_history", side_effect=fake_query),
    ):
        response = TestClient(app, client=("127.0.0.1", 50000)).post(
            "/api/plugins/query/general_1",
            json={
                "table": "Data_Product",
                "query_mode": "batch",
                "batch_code": "B001",
                "pagination_mode": "cursor",
                "include_total": False,
                "cursor": -1,
            },
        )

    assert response.status_code == 200
    request = captured["request"]
    assert request.batch_field == "BatchCode"
    assert request.batch_code == "B001"
    assert request.start_time is None
    assert request.end_time is None
    assert request.pagination_mode == "cursor"
    assert request.include_total is False
    assert response.json()["has_more"] is True
    assert response.json()["next_cursor"]["id"] == 10


def test_plugin_batch_query_rejects_time_condition():
    binding = {
        "plugin_key": "general_1",
        "view_name": "table",
        "bind_group": "ProductHistory",
        "bind_table": "Data_Product",
        "page_size": 50,
        "opcua_writeback": None,
        "table_list_writeback": None,
    }
    with (
        patch("app.main._resolve_plugin_binding", return_value=binding),
        patch(
            "app.main.db.get_group_schema_report",
            return_value={"tables": ["Data_Product"], "baseline_table": "Data_Product", "consistent": True},
        ),
        patch("app.main.cfg.resolve_query_view", return_value={}),
        patch("app.main.db.list_columns", return_value=["id", "BatchCode", "collection_time"]),
    ):
        response = TestClient(app, client=("127.0.0.1", 50000)).post(
            "/api/plugins/query/general_1",
            json={
                "query_mode": "batch",
                "batch_code": "B001",
                "start_time": "2026-01-01T00:00:00",
            },
        )

    assert response.status_code == 400
    assert "不能填写时间条件" in response.json()["detail"]
