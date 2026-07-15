from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import event, text

from app.database import QueryDatabase
from app.models import HistoryCursor, HistoryQueryRequest


def _database(tmp_path) -> QueryDatabase:
    database = QueryDatabase({"type": "sqlite", "name": str(tmp_path / "cursor.db")})
    base = datetime(2026, 1, 1)
    with database.engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE Data_Product ("
                "id INTEGER PRIMARY KEY, BatchCode TEXT, collection_time DATETIME, value TEXT)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX idx_batch_time ON Data_Product (BatchCode, collection_time);"
            )
        )
        connection.execute(text("CREATE INDEX idx_time ON Data_Product (collection_time);"))
        connection.execute(text("CREATE TABLE Data_Batch (id INTEGER PRIMARY KEY, BatchCode TEXT NOT NULL)"))
        connection.execute(text("INSERT INTO Data_Batch (BatchCode) VALUES ('B002'), ('B001'), ('B001')"))
        connection.execute(text("CREATE TABLE ProductionOrder (OrderNo TEXT NOT NULL)"))
        connection.execute(text("INSERT INTO ProductionOrder (OrderNo) VALUES ('O002'), ('O001'), ('O001')"))
        rows = []
        for index in range(120):
            rows.append(
                {
                    "id": index + 1,
                    "batch": "B001" if index < 60 else "B002",
                    "collection_time": base + timedelta(seconds=index * 5),
                    "value": f"v{index + 1}",
                }
            )
        connection.execute(
            text(
                "INSERT INTO Data_Product (id, BatchCode, collection_time, value) "
                "VALUES (:id, :batch, :collection_time, :value)"
            ),
            rows,
        )
    return database


def _request(**overrides) -> HistoryQueryRequest:
    values = {
        "table": "Data_Product",
        "columns": ["id", "BatchCode", "collection_time", "value"],
        "time_field": "collection_time",
        "sort_by": "collection_time",
        "sort_dir": "desc",
        "page_size": 50,
        "pagination_mode": "cursor",
        "include_total": False,
    }
    values.update(overrides)
    return HistoryQueryRequest(**values)


def test_cursor_pagination_returns_50_then_remaining_without_duplicates(tmp_path):
    database = _database(tmp_path)
    first = database.query_history(
        _request(batch_field="BatchCode", batch_code="B001")
    )

    assert first.total is None
    assert len(first.rows) == 50
    assert first.has_more is True
    assert first.next_cursor is not None

    second = database.query_history(
        _request(
            batch_field="BatchCode",
            batch_code="B001",
            cursor=HistoryCursor(**first.next_cursor),
        )
    )

    first_ids = {row["id"] for row in first.rows}
    second_ids = {row["id"] for row in second.rows}
    assert len(second.rows) == 10
    assert second.has_more is False
    assert first_ids.isdisjoint(second_ids)
    assert first_ids | second_ids == set(range(1, 61))


def test_list_batch_codes_returns_distinct_sorted_values(tmp_path):
    database = _database(tmp_path)

    assert database.list_batch_codes("ProductionOrder", "OrderNo") == ["O001", "O002"]


def test_list_batch_codes_rejects_unsafe_identifiers(tmp_path):
    database = _database(tmp_path)

    with pytest.raises(ValueError, match="Invalid identifier"):
        database.list_batch_codes("ProductionOrder; DROP TABLE Data_Product", "OrderNo")


def test_cursor_without_time_or_batch_returns_latest_rows(tmp_path):
    database = _database(tmp_path)
    statements: list[str] = []
    event.listen(
        database.engine,
        "before_cursor_execute",
        lambda _conn, _cursor, statement, _parameters, _context, _executemany: statements.append(statement),
    )
    result = database.query_history(_request())

    assert len(result.rows) == 50
    assert result.rows[0]["id"] == 120
    assert result.rows[-1]["id"] == 71
    assert result.has_more is True
    assert not any("COUNT(" in statement.upper() for statement in statements)


def test_batch_and_time_and_or_are_grouped_correctly(tmp_path):
    database = _database(tmp_path)
    base = datetime(2026, 1, 1)
    start = base + timedelta(seconds=90 * 5)
    end = base + timedelta(seconds=99 * 5)

    and_result = database.query_history(
        _request(
            batch_field="BatchCode",
            batch_code="B001",
            combine_mode="and",
            start_time=start,
            end_time=end,
            include_total=True,
        )
    )
    or_result = database.query_history(
        _request(
            batch_field="BatchCode",
            batch_code="B001",
            combine_mode="or",
            start_time=start,
            end_time=end,
            include_total=True,
        )
    )

    assert and_result.total == 0
    assert or_result.total == 70
    assert len(or_result.rows) == 50
    assert or_result.has_more is True
