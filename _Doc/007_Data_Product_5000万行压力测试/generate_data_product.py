"""在独立测试库中可恢复地生成 Data_Product 压力测试数据。"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import pymysql


IDENTIFIER = re.compile(r"^[A-Za-z0-9_]+$")
DIGITS = " UNION ALL ".join(f"SELECT {value} AS n" for value in range(10))
SCRIPT_DIR = Path(__file__).resolve().parent


def identifier(value: str) -> str:
    if not IDENTIFIER.fullmatch(value):
        raise ValueError(f"非法数据库或表标识符：{value!r}")
    return f"`{value}`"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.getenv("SMA_DB_HOST", "192.168.50.22"))
    parser.add_argument("--port", type=int, default=int(os.getenv("SMA_DB_PORT", "3306")))
    parser.add_argument("--user", default=os.getenv("SMA_DB_USER", "root"))
    parser.add_argument("--source-database", default="sma_data_test1")
    parser.add_argument("--target-database", default="sma_data_stress_test")
    parser.add_argument("--table", default="Data_Product")
    parser.add_argument("--rows", type=int, default=50_000_000)
    parser.add_argument("--batch-size", type=int, default=100_000)
    parser.add_argument("--password", default=os.getenv("SMA_DB_PASSWORD"))
    parser.add_argument("--log", type=Path, default=SCRIPT_DIR / "generation-progress.jsonl")
    args = parser.parse_args()
    if args.rows < 1 or not 1 <= args.batch_size <= 100_000:
        parser.error("rows 必须为正数，batch-size 必须在 1..100000")
    return args


def log_event(path: Path, event: str, **values: object) -> None:
    record = {"time": datetime.now().astimezone().isoformat(timespec="seconds"), "event": event, **values}
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
    print(json.dumps(record, ensure_ascii=False, default=str), flush=True)


def source_index_signature(cursor, database: str, table: str) -> list[tuple]:
    cursor.execute(
        """
        SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
        """,
        (database, table),
    )
    return list(cursor.fetchall())


def ensure_target(cursor, source_db: str, target_db: str, table: str) -> None:
    source_q, target_q, table_q = map(identifier, (source_db, target_db, table))
    cursor.execute(
        "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s",
        (source_db, table),
    )
    if cursor.fetchone()[0] != 1:
        raise RuntimeError(f"源表 {source_db}.{table} 不存在或名称不唯一")

    cursor.execute(
        "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=%s", (target_db,)
    )
    target_database_exists = cursor.fetchone()[0] == 1
    if not target_database_exists:
        cursor.execute(
            f"CREATE DATABASE {target_q} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )

    cursor.execute(
        "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s",
        (target_db, table),
    )
    target_table_exists = cursor.fetchone()[0] == 1
    if not target_table_exists:
        cursor.execute(f"CREATE TABLE {target_q}.{table_q} LIKE {source_q}.{table_q}")

    source_indexes = source_index_signature(cursor, source_db, table)
    target_indexes = source_index_signature(cursor, target_db, table)
    if target_indexes != source_indexes:
        raise RuntimeError(
            "目标表索引与源表原始索引不一致；为防止覆盖已有对象，脚本拒绝继续。"
        )


def insert_sql(target_db: str, table: str) -> str:
    target = f"{identifier(target_db)}.{identifier(table)}"
    digit = f"({DIGITS})"
    sequence = (
        "d0.n + d1.n*10 + d2.n*100 + d3.n*1000 + d4.n*10000"
    )
    global_number = f"(%s + {sequence})"
    collection_seconds = f"(FLOOR({global_number}/500)*1800 + MOD({global_number},500)*5)"
    return f"""
        INSERT INTO {target}
        (id, DataProductTime, DataProductState,
         DataProductCH01, DataProductCH02, DataProductCH03,
         DataProductCH04, DataProductCH05, DataProductCH06,
         BatchCode, collection_time, created_at)
        SELECT
          {global_number} + 1,
          TIMESTAMPADD(SECOND, MOD({global_number} * 5, 31536000), '2007-01-01 00:00:00'),
          '2',
          CONCAT('0.', LPAD(MOD({global_number}*17 + 4860000014305115, 10000000000000000), 16, '0')),
          CONCAT(53 + MOD({global_number}*29, 11), '.', LPAD(MOD({global_number}*31 + 868999481201170, 1000000000000000), 15, '0')),
          CONCAT(3 + MOD({global_number}*37, 2), '.', LPAD(MOD({global_number}*41 + 500999927520752, 1000000000000000), 15, '0')),
          CONCAT(8 + MOD({global_number}*43, 3), '.', LPAD(MOD({global_number}*47 + 965000152587890, 1000000000000000), 15, '0')),
          CONCAT(8 + MOD({global_number}*53, 5), '.', LPAD(MOD({global_number}*59 + 469999313354492, 1000000000000000), 15, '0')),
          CONCAT('0.', LPAD(MOD({global_number}*61 + 8809999823570251, 10000000000000000), 16, '0')),
          CONCAT('SMA_', 1168000000 + FLOOR({global_number}/500)),
          TIMESTAMPADD(SECOND, {collection_seconds}, '2021-01-01 00:00:00'),
          TIMESTAMPADD(SECOND, {collection_seconds} + MOD({global_number}, 20), '2021-01-01 00:00:00')
        FROM {digit} d0
        CROSS JOIN {digit} d1
        CROSS JOIN {digit} d2
        CROSS JOIN {digit} d3
        CROSS JOIN {digit} d4
        WHERE {sequence} < %s
    """


def main() -> int:
    args = parse_args()
    password = args.password or getpass.getpass("MariaDB password: ")
    source_db, target_db, table = args.source_database, args.target_database, args.table
    for value in (source_db, target_db, table):
        identifier(value)

    connection = pymysql.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=password,
        charset="utf8mb4",
        autocommit=False,
        connect_timeout=10,
        read_timeout=1800,
        write_timeout=1800,
    )
    started = time.monotonic()
    try:
        with connection.cursor() as cursor:
            ensure_target(cursor, source_db, target_db, table)
            connection.commit()
            cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {identifier(target_db)}.{identifier(table)}")
            completed = int(cursor.fetchone()[0])
            if completed > args.rows:
                raise RuntimeError(f"目标表已有 {completed} 个连续 id，超过请求目标 {args.rows}")
            sql = insert_sql(target_db, table)
            log_event(args.log, "start", target_rows=args.rows, resume_from=completed, batch_size=args.batch_size)
            while completed < args.rows:
                rows = min(args.batch_size, args.rows - completed)
                batch_started = time.monotonic()
                # SQL 中 global_number 共出现 18 次，每次使用同一个批次偏移量。
                cursor.execute(sql, (completed,) * 18 + (rows,))
                affected = cursor.rowcount
                if affected != rows:
                    connection.rollback()
                    raise RuntimeError(f"本批预期 {rows} 行，实际 {affected} 行")
                connection.commit()
                completed += rows
                batch_seconds = time.monotonic() - batch_started
                log_event(
                    args.log,
                    "batch_committed",
                    completed=completed,
                    inserted=rows,
                    seconds=round(batch_seconds, 3),
                    rows_per_second=round(rows / batch_seconds, 1),
                    elapsed_seconds=round(time.monotonic() - started, 3),
                )
            cursor.execute(f"SELECT COUNT(*), MIN(id), MAX(id) FROM {identifier(target_db)}.{identifier(table)}")
            count, minimum, maximum = cursor.fetchone()
            cursor.execute(
                "SELECT DATA_LENGTH, INDEX_LENGTH, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s",
                (target_db, table),
            )
            data_length, index_length, estimated_rows = cursor.fetchone()
            log_event(
                args.log,
                "complete",
                exact_count=count,
                min_id=minimum,
                max_id=maximum,
                data_length=data_length,
                index_length=index_length,
                estimated_rows=estimated_rows,
                elapsed_seconds=round(time.monotonic() - started, 3),
            )
    except Exception as exc:
        connection.rollback()
        log_event(args.log, "failed", error=f"{type(exc).__name__}: {exc}")
        raise
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
