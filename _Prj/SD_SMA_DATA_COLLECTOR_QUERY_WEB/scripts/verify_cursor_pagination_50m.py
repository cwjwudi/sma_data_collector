from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from sqlalchemy import text

from app.database import QueryDatabase
from app.models import HistoryCursor, HistoryQueryRequest


OUTPUT = PROJECT_DIR / "docs" / "CURSOR_PAGINATION_50M_RESULT.json"


def request(**overrides) -> HistoryQueryRequest:
    values = {
        "table": "Data_Product",
        "columns": ["id", "BatchCode", "collection_time", "DataProductState"],
        "time_field": "collection_time",
        "sort_by": "collection_time",
        "sort_dir": "desc",
        "page_size": 50,
        "pagination_mode": "cursor",
        "include_total": False,
    }
    values.update(overrides)
    return HistoryQueryRequest(**values)


def timed_query(database: QueryDatabase, req: HistoryQueryRequest):
    started = time.perf_counter()
    result = database.query_history(req)
    elapsed_ms = (time.perf_counter() - started) * 1000
    return result, round(elapsed_ms, 3)


def explain(database: QueryDatabase, sql: str, params: dict) -> dict:
    with database.engine.connect() as connection:
        raw = connection.execute(text("EXPLAIN FORMAT=JSON " + sql), params).scalar_one()
    return json.loads(raw)


def main() -> None:
    database = QueryDatabase(
        {
            "type": "mysql",
            "host": os.getenv("SMA_DB_HOST", "192.168.50.22"),
            "port": int(os.getenv("SMA_DB_PORT", "3306")),
            "username": os.getenv("SMA_DB_USER", "root"),
            "name": os.getenv("SMA_DB_NAME", "sma_data_stress_test"),
        }
    )

    latest_first, latest_first_ms = timed_query(database, request())
    latest_second, latest_second_ms = timed_query(
        database,
        request(cursor=HistoryCursor(**latest_first.next_cursor)),
    )
    latest_first_ids = {row["id"] for row in latest_first.rows}
    latest_second_ids = {row["id"] for row in latest_second.rows}
    assert len(latest_first.rows) == len(latest_second.rows) == 50
    assert latest_first_ids.isdisjoint(latest_second_ids)

    batch_code = "SMA_1168050000"
    with database.engine.connect() as connection:
        batch_start, batch_end = connection.execute(
            text(
                "SELECT MIN(collection_time), MAX(collection_time) "
                "FROM Data_Product WHERE BatchCode=:batch"
            ),
            {"batch": batch_code},
        ).one()
    batch_first, batch_first_ms = timed_query(
        database,
        request(batch_field="BatchCode", batch_code=batch_code),
    )
    batch_second, batch_second_ms = timed_query(
        database,
        request(
            batch_field="BatchCode",
            batch_code=batch_code,
            cursor=HistoryCursor(**batch_first.next_cursor),
        ),
    )
    assert {row["id"] for row in batch_first.rows}.isdisjoint(
        {row["id"] for row in batch_second.rows}
    )

    day_start = datetime(2023, 11, 1)
    day_end = datetime(2023, 11, 2)
    time_only, time_only_ms = timed_query(
        database,
        request(start_time=day_start, end_time=day_end),
    )
    batch_and_time, batch_and_time_ms = timed_query(
        database,
        request(
            batch_field="BatchCode",
            batch_code=batch_code,
            start_time=batch_start,
            end_time=batch_end,
            combine_mode="and",
        ),
    )
    batch_or_time, batch_or_time_ms = timed_query(
        database,
        request(
            batch_field="BatchCode",
            batch_code=batch_code,
            start_time=day_start,
            end_time=day_end,
            combine_mode="or",
        ),
    )

    plans = {
        "latest": explain(
            database,
            "SELECT id, collection_time FROM Data_Product "
            "ORDER BY collection_time DESC, id DESC LIMIT 51",
            {},
        ),
        "batch": explain(
            database,
            "SELECT id, collection_time FROM Data_Product WHERE BatchCode=:batch "
            "ORDER BY collection_time DESC, id DESC LIMIT 51",
            {"batch": batch_code},
        ),
        "time": explain(
            database,
            "SELECT id, collection_time FROM Data_Product "
            "WHERE collection_time>=:start AND collection_time<=:end "
            "ORDER BY collection_time DESC, id DESC LIMIT 51",
            {"start": day_start, "end": day_end},
        ),
        "batch_and_time": explain(
            database,
            "SELECT id, collection_time FROM Data_Product "
            "WHERE BatchCode=:batch AND collection_time>=:start AND collection_time<=:end "
            "ORDER BY collection_time DESC, id DESC LIMIT 51",
            {"batch": batch_code, "start": batch_start, "end": batch_end},
        ),
        "batch_or_time": explain(
            database,
            "SELECT id, collection_time FROM Data_Product "
            "WHERE BatchCode=:batch OR (collection_time>=:start AND collection_time<=:end) "
            "ORDER BY collection_time DESC, id DESC LIMIT 51",
            {"batch": batch_code, "start": day_start, "end": day_end},
        ),
    }
    report = {
        "verified_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "database": database.db_config.get("name"),
        "page_size": 50,
        "checks": {
            "latest_first": {"ms": latest_first_ms, "rows": len(latest_first.rows)},
            "latest_second": {"ms": latest_second_ms, "rows": len(latest_second.rows)},
            "latest_pages_disjoint": latest_first_ids.isdisjoint(latest_second_ids),
            "batch_first": {"ms": batch_first_ms, "rows": len(batch_first.rows)},
            "batch_second": {"ms": batch_second_ms, "rows": len(batch_second.rows)},
            "time_only": {"ms": time_only_ms, "rows": len(time_only.rows)},
            "batch_and_time": {"ms": batch_and_time_ms, "rows": len(batch_and_time.rows)},
            "batch_or_time": {"ms": batch_or_time_ms, "rows": len(batch_or_time.rows)},
        },
        "plans": plans,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, default=str, indent=2), encoding="utf-8")
    print(json.dumps(report["checks"], ensure_ascii=False, indent=2))
    print(OUTPUT)


if __name__ == "__main__":
    main()
