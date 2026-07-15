"""记录 Data_Product 在指定索引状态下的查询计划和重复耗时。"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import statistics
import time
from datetime import datetime
from pathlib import Path

import pymysql


SCRIPT_DIR = Path(__file__).resolve().parent


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=("baseline", "optimized"))
    parser.add_argument("--host", default=os.getenv("SMA_DB_HOST", "192.168.50.22"))
    parser.add_argument("--port", type=int, default=int(os.getenv("SMA_DB_PORT", "3306")))
    parser.add_argument("--user", default=os.getenv("SMA_DB_USER", "root"))
    parser.add_argument("--password", default=os.getenv("SMA_DB_PASSWORD"))
    parser.add_argument("--database", default="sma_data_stress_test")
    parser.add_argument("--repeats", type=int, default=3)
    return parser.parse_args()


def status(cursor) -> dict[str, int]:
    cursor.execute(
        "SHOW SESSION STATUS WHERE Variable_name IN "
        "('Handler_read_first','Handler_read_key','Handler_read_next',"
        "'Handler_read_rnd','Handler_read_rnd_next','Created_tmp_disk_tables','Created_tmp_tables')"
    )
    return {name: int(value) for name, value in cursor.fetchall()}


def main() -> None:
    args = arguments()
    password = args.password or getpass.getpass("MariaDB password: ")
    connection = pymysql.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=password,
        database=args.database,
        charset="utf8mb4",
        autocommit=True,
        connect_timeout=10,
        read_timeout=600,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT VERSION(), @@query_cache_type, @@innodb_buffer_pool_size")
            server = cursor.fetchone()
            cursor.execute("SHOW INDEX FROM Data_Product")
            indexes = cursor.fetchall()
            batch_code = "SMA_1168050000"
            cursor.execute(
                "SELECT MIN(collection_time), MAX(collection_time), COUNT(*) "
                "FROM Data_Product WHERE BatchCode=%s",
                (batch_code,),
            )
            batch_start, batch_end, batch_rows = cursor.fetchone()
            day_start, day_end = "2023-11-01 00:00:00", "2023-11-02 00:00:00"
            cases = {
                "batch_only": (
                    "SELECT SQL_NO_CACHE COUNT(*) FROM Data_Product WHERE BatchCode=%s",
                    (batch_code,),
                ),
                "collection_time_day": (
                    "SELECT SQL_NO_CACHE COUNT(*) FROM Data_Product "
                    "WHERE collection_time >= %s AND collection_time < %s",
                    (day_start, day_end),
                ),
                "batch_and_collection_time": (
                    "SELECT SQL_NO_CACHE COUNT(*) FROM Data_Product "
                    "WHERE BatchCode=%s AND collection_time >= %s AND collection_time <= %s",
                    (batch_code, batch_start, batch_end),
                ),
                "batch_or_collection_time": (
                    "SELECT SQL_NO_CACHE COUNT(*) FROM Data_Product "
                    "WHERE BatchCode=%s OR (collection_time >= %s AND collection_time < %s)",
                    (batch_code, day_start, day_end),
                ),
                "batch_order_limit": (
                    "SELECT SQL_NO_CACHE id, collection_time FROM Data_Product "
                    "WHERE BatchCode=%s ORDER BY collection_time DESC LIMIT 100",
                    (batch_code,),
                ),
            }
            results: dict[str, object] = {}
            for name, (sql, params) in cases.items():
                cursor.execute("EXPLAIN FORMAT=JSON " + sql, params)
                plan = json.loads(cursor.fetchone()[0])
                before = status(cursor)
                durations: list[float] = []
                result_summaries: list[object] = []
                for _ in range(args.repeats):
                    started = time.perf_counter()
                    cursor.execute(sql, params)
                    rows = cursor.fetchall()
                    durations.append((time.perf_counter() - started) * 1000)
                    result_summaries.append(rows[0][0] if len(rows) == 1 and len(rows[0]) == 1 else len(rows))
                after = status(cursor)
                results[name] = {
                    "sql": sql,
                    "parameters": [str(value) for value in params],
                    "explain": plan,
                    "durations_ms": [round(value, 3) for value in durations],
                    "median_ms": round(statistics.median(durations), 3),
                    "result_summaries": result_summaries,
                    "session_status_delta": {
                        key: after.get(key, 0) - before.get(key, 0) for key in sorted(set(before) | set(after))
                    },
                }
            report = {
                "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "phase": args.phase,
                "server": server,
                "indexes": indexes,
                "repeats": args.repeats,
                "sample_batch": {
                    "BatchCode": batch_code,
                    "min_collection_time": batch_start,
                    "max_collection_time": batch_end,
                    "rows": batch_rows,
                },
                "results": results,
            }
            output = SCRIPT_DIR / f"benchmark-{args.phase}.json"
            output.write_text(json.dumps(report, ensure_ascii=False, default=str, indent=2), encoding="utf-8")
            print(json.dumps({name: value["median_ms"] for name, value in results.items()}, ensure_ascii=False))
            print(output)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
