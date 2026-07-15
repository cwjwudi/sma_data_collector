from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import pymysql


SAFE_PREFIX = "codex_dbadmin_stress_"
DEFAULT_SOURCE = "sma_data_test1"
ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "_artifacts"


def safe_database(name: str) -> str:
    if not name.startswith(SAFE_PREFIX) or not name.replace("_", "").isalnum():
        raise ValueError(f"Test database must use prefix {SAFE_PREFIX!r}: {name!r}")
    return name


def quote(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise ValueError(f"Unsafe identifier: {name!r}")
    return f"`{name}`"


def connect(database: str | None = None, *, autocommit: bool = True):
    password = os.environ.get("DB_ADMIN_TEST_PASSWORD")
    if password is None:
        raise RuntimeError("DB_ADMIN_TEST_PASSWORD is required")
    return pymysql.connect(
        host=os.environ.get("DB_ADMIN_TEST_HOST", "192.168.50.22"),
        port=int(os.environ.get("DB_ADMIN_TEST_PORT", "3306")),
        user=os.environ.get("DB_ADMIN_TEST_USER", "root"),
        password=password,
        database=database,
        charset="utf8mb4",
        autocommit=autocommit,
        connect_timeout=10,
        read_timeout=3600,
        write_timeout=3600,
    )


def create_numbers(cur) -> None:
    cur.execute("DROP TABLE IF EXISTS `_stress_numbers`")
    cur.execute("CREATE TABLE `_stress_numbers` (`n` int unsigned NOT NULL PRIMARY KEY) ENGINE=InnoDB")
    digits = "(SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)"
    cur.execute(
        "INSERT INTO `_stress_numbers` (`n`) "
        f"SELECT a.d + 10*b.d + 100*c.d + 1000*d.d + 10000*e.d FROM {digits} a "
        f"CROSS JOIN {digits} b CROSS JOIN {digits} c CROSS JOIN {digits} d CROSS JOIN {digits} e"
    )


def insert_in_batches(cur, sql: str, total_rows: int, batch_size: int, label: str) -> None:
    started = time.monotonic()
    for offset in range(0, total_rows, batch_size):
        count = min(batch_size, total_rows - offset)
        cur.execute(sql, {"offset": offset, "count": count})
        done = offset + count
        elapsed = max(time.monotonic() - started, 0.001)
        print(json.dumps({"table": label, "rows": done, "elapsed_seconds": round(elapsed, 1), "rows_per_second": round(done / elapsed, 1)}), flush=True)


def prepare(args: argparse.Namespace) -> None:
    target = safe_database(args.target)
    source = args.source
    if source.startswith(SAFE_PREFIX):
        raise ValueError("Reference source must not be a generated stress database")
    with connect() as db:
        with db.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS {quote(target)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    with connect(target) as db:
        with db.cursor() as cur:
            tables_to_rebuild = ("Data_Recipe",) if args.preserve_product_alarm else ("Data_Product", "Data_Alarm", "Data_Recipe")
            if args.preserve_product_alarm and (args.product_rows or args.alarm_rows):
                raise ValueError("product/alarm row counts must be zero when --preserve-product-alarm is used")
            for table in tables_to_rebuild:
                cur.execute(f"DROP TABLE IF EXISTS {quote(table)}")
                cur.execute(f"CREATE TABLE {quote(table)} LIKE {quote(source)}.{quote(table)}")
            create_numbers(cur)
            if args.product_rows:
                insert_in_batches(
                    cur,
                    "INSERT INTO `Data_Product` (`DataProductTime`,`DataProductState`,`DataProductCH01`,`DataProductCH02`,`DataProductCH03`,`DataProductCH04`,`DataProductCH05`,`DataProductCH06`,`BatchCode`,`collection_time`) "
                    "SELECT DATE_ADD('2024-01-01', INTERVAL MOD(%(offset)s+n,31536000) SECOND), CONCAT('STATE_',MOD(%(offset)s+n,8)), "
                    "CAST(ROUND(SIN((%(offset)s+n)/1000)*100,4) AS CHAR), CAST(ROUND(COS((%(offset)s+n)/1000)*100,4) AS CHAR), "
                    "CONCAT('CH03-',LPAD(%(offset)s+n,10,'0')), CONCAT('CH04-',LPAD(%(offset)s+n,10,'0')), CONCAT('CH05-',LPAD(%(offset)s+n,10,'0')), CONCAT('CH06-',LPAD(%(offset)s+n,10,'0')), "
                    "CONCAT('B',LPAD(FLOOR((%(offset)s+n)/10000),8,'0')), DATE_ADD('2024-01-01', INTERVAL MOD(%(offset)s+n,31536000) SECOND) "
                    "FROM `_stress_numbers` WHERE n < %(count)s",
                    args.product_rows,
                    args.batch_size,
                    "Data_Product",
                )
            if args.alarm_rows:
                insert_in_batches(
                    cur,
                    "INSERT INTO `Data_Alarm` (`AlarmTime`,`AlarmCode`,`AlarmState`,`AlarmText`,`BatchCode`,`collection_time`) "
                    "SELECT DATE_ADD('2024-01-01', INTERVAL MOD(%(offset)s+n,31536000) SECOND), CONCAT('A',LPAD(MOD(%(offset)s+n,10000),5,'0')), "
                    "IF(MOD(%(offset)s+n,3)=0,'ACTIVE','CLEARED'), CONCAT('Synthetic alarm ',%(offset)s+n,' 压力测试'), "
                    "CONCAT('B',LPAD(FLOOR((%(offset)s+n)/10000),8,'0')), DATE_ADD('2024-01-01', INTERVAL MOD(%(offset)s+n,31536000) SECOND) "
                    "FROM `_stress_numbers` WHERE n < %(count)s",
                    args.alarm_rows,
                    args.batch_size,
                    "Data_Alarm",
                )
            if args.recipe_rows:
                channel_columns = ",".join(f"`DataRecipeCH{i:02d}`" for i in range(26))
                channel_values = ",".join(
                    f"CONCAT('R{i:02d}-',LPAD(%(offset)s+n,10,'0'),'-',REPEAT(CHAR(65+MOD({i},26)),64))"
                    for i in range(26)
                )
                sql = (
                    f"INSERT INTO `Data_Recipe` (`DataRecipeTime`,`DataRecipeState`,{channel_columns},`BatchCode`,`collection_time`) "
                    f"SELECT DATE_ADD('2024-01-01', INTERVAL MOD(%(offset)s+n,31536000) SECOND), CONCAT('RECIPE_',MOD(%(offset)s+n,32)),{channel_values},"
                    "CONCAT('B',LPAD(FLOOR((%(offset)s+n)/10000),8,'0')), DATE_ADD('2024-01-01', INTERVAL MOD(%(offset)s+n,31536000) SECOND) "
                    "FROM `_stress_numbers` WHERE n < %(count)s"
                )
                insert_in_batches(cur, sql, args.recipe_rows, args.batch_size, "Data_Recipe")
            cur.execute("DROP TABLE `_stress_numbers`")
    write_snapshot(target, "prepared")


def snapshot(database: str) -> dict[str, Any]:
    safe_database(database)
    result: dict[str, Any] = {"database": database, "captured_at": datetime.now().isoformat(timespec="seconds"), "tables": {}}
    with connect(database) as db:
        with db.cursor() as cur:
            cur.execute(
                "SELECT table_name, data_length, index_length FROM information_schema.tables "
                "WHERE table_schema=%s ORDER BY table_name",
                (database,),
            )
            sizes = {str(name): (int(data or 0), int(index or 0)) for name, data, index in cur.fetchall()}
            for table in ("Data_Product", "Data_Alarm", "Data_Recipe"):
                digest_columns = {
                    "Data_Product": "`id`,`BatchCode`,`collection_time`,`DataProductState`,`DataProductCH01`,`DataProductCH06`",
                    "Data_Alarm": "`id`,`BatchCode`,`collection_time`,`AlarmCode`,`AlarmState`,`AlarmText`",
                    "Data_Recipe": "`id`,`BatchCode`,`collection_time`,`DataRecipeState`,`DataRecipeCH00`,`DataRecipeCH13`,`DataRecipeCH25`",
                }[table]
                cur.execute(
                    f"SELECT COUNT(*), COALESCE(MIN(`id`),0), COALESCE(MAX(`id`),0), "
                    f"COALESCE(SUM(CRC32(CONCAT_WS('#',{digest_columns}))),0) FROM {quote(table)}"
                )
                count, min_id, max_id, digest = cur.fetchone()
                data_bytes, index_bytes = sizes.get(table, (0, 0))
                result["tables"][table] = {
                    "rows": int(count),
                    "min_id": int(min_id),
                    "max_id": int(max_id),
                    "digest_sum": str(digest),
                    "data_bytes": data_bytes,
                    "index_bytes": index_bytes,
                }
    return result


def write_snapshot(database: str, label: str) -> Path:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    payload = snapshot(database)
    path = ARTIFACTS / f"{database}_{label}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(path)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return path


def compare(args: argparse.Namespace) -> None:
    source = snapshot(safe_database(args.source_db))
    restored = snapshot(safe_database(args.restored_db))
    source_tables = source["tables"]
    restored_tables = restored["tables"]
    mismatches: list[str] = []
    for table, expected in source_tables.items():
        actual = restored_tables.get(table)
        for key in ("rows", "min_id", "max_id", "digest_sum"):
            if actual is None or actual[key] != expected[key]:
                mismatches.append(f"{table}.{key}: expected={expected[key]!r}, actual={None if actual is None else actual[key]!r}")
    payload = {"source": source, "restored": restored, "mismatches": mismatches}
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    output = ARTIFACTS / f"compare_{args.source_db}_to_{args.restored_db}.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output)
    if mismatches:
        raise SystemExit("\n".join(mismatches))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    prepare_parser = sub.add_parser("prepare")
    prepare_parser.add_argument("--source", default=DEFAULT_SOURCE)
    prepare_parser.add_argument("--target", default=f"{SAFE_PREFIX}src")
    prepare_parser.add_argument("--product-rows", type=int, default=10_000_000)
    prepare_parser.add_argument("--alarm-rows", type=int, default=10_000_000)
    prepare_parser.add_argument("--recipe-rows", type=int, default=0)
    prepare_parser.add_argument("--preserve-product-alarm", action="store_true")
    prepare_parser.add_argument("--batch-size", type=int, default=100_000, choices=range(1, 100_001), metavar="1..100000")
    snapshot_parser = sub.add_parser("snapshot")
    snapshot_parser.add_argument("database")
    compare_parser = sub.add_parser("compare")
    compare_parser.add_argument("source_db")
    compare_parser.add_argument("restored_db")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "prepare":
        prepare(args)
    elif args.command == "snapshot":
        write_snapshot(safe_database(args.database), "snapshot")
    elif args.command == "compare":
        compare(args)


if __name__ == "__main__":
    main()
