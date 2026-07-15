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
    with patch("app.main.db.list_batch_codes", return_value=["B001", "B002"]) as list_codes:
        response = TestClient(app, client=("127.0.0.1", 50000)).get("/api/meta/batch-codes")

    assert response.status_code == 200
    assert response.json() == {"items": ["B001", "B002"]}
    list_codes.assert_called_once_with(limit=1000)
