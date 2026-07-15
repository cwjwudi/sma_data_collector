from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.database import HistoryQueryResult
from app.main import app


def test_by_view_cursor_query_keeps_time_unbounded_and_resolves_batch_field():
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
        "batch_field": "",
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
