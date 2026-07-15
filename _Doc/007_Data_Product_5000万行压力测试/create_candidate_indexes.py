"""只在测试表上增加已审定的两个候选索引，并记录耗时。"""

from __future__ import annotations

import getpass
import json
import os
import time
from datetime import datetime
from pathlib import Path

import pymysql


SCRIPT_DIR = Path(__file__).resolve().parent
DATABASE = "sma_data_stress_test"
TABLE = "Data_Product"
CANDIDATES = {
    "idx_Data_Product_collection_time": ("collection_time",),
    "idx_Data_Product_BatchCode_collection_time": ("BatchCode", "collection_time"),
}


def main() -> None:
    password = os.getenv("SMA_DB_PASSWORD") or getpass.getpass("MariaDB password: ")
    connection = pymysql.connect(
        host=os.getenv("SMA_DB_HOST", "192.168.50.22"),
        port=int(os.getenv("SMA_DB_PORT", "3306")),
        user=os.getenv("SMA_DB_USER", "root"),
        password=password,
        database=DATABASE,
        charset="utf8mb4",
        autocommit=True,
        connect_timeout=10,
        read_timeout=7200,
        write_timeout=7200,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS "
                "WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s ORDER BY INDEX_NAME, SEQ_IN_INDEX",
                (DATABASE, TABLE),
            )
            rows = cursor.fetchall()
            actual: dict[str, list[str]] = {}
            for name, _, column in rows:
                actual.setdefault(name, []).append(column)
            if actual.get("PRIMARY") != ["id"] or actual.get("idx_Data_Product_BatchCode") != ["BatchCode"]:
                raise RuntimeError("源表原始索引签名不符合预期，拒绝执行 ALTER TABLE")
            missing = [name for name, columns in CANDIDATES.items() if actual.get(name) != list(columns)]
            if not missing:
                print("候选索引均已存在，无需操作。")
                return
            if len(missing) != len(CANDIDATES):
                raise RuntimeError("候选索引处于部分存在状态，请人工核对后再继续")
            started = time.monotonic()
            cursor.execute(
                "ALTER TABLE Data_Product "
                "ADD INDEX idx_Data_Product_collection_time (collection_time), "
                "ADD INDEX idx_Data_Product_BatchCode_collection_time (BatchCode, collection_time), "
                "ALGORITHM=INPLACE, LOCK=NONE"
            )
            elapsed = time.monotonic() - started
            cursor.execute("SHOW INDEX FROM Data_Product")
            indexes = cursor.fetchall()
            cursor.execute(
                "SELECT DATA_LENGTH, INDEX_LENGTH, TABLE_ROWS FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s",
                (DATABASE, TABLE),
            )
            sizes = cursor.fetchone()
            result = {
                "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "elapsed_seconds": round(elapsed, 3),
                "indexes": indexes,
                "table_sizes": sizes,
            }
            (SCRIPT_DIR / "candidate-index-build.json").write_text(
                json.dumps(result, ensure_ascii=False, default=str, indent=2), encoding="utf-8"
            )
            print(json.dumps({"elapsed_seconds": round(elapsed, 3), "table_sizes": sizes}, default=str))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
