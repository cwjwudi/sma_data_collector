"""对最终测试表进行精确、可留档的验收。"""

from __future__ import annotations

import getpass
import json
import os
import time
from datetime import datetime
from pathlib import Path

import pymysql


def main() -> None:
    password = os.getenv("SMA_DB_PASSWORD") or getpass.getpass("MariaDB password: ")
    connection = pymysql.connect(
        host=os.getenv("SMA_DB_HOST", "192.168.50.22"),
        port=int(os.getenv("SMA_DB_PORT", "3306")),
        user=os.getenv("SMA_DB_USER", "root"),
        password=password,
        database="sma_data_stress_test",
        charset="utf8mb4",
        autocommit=True,
        connect_timeout=10,
        read_timeout=1200,
    )
    try:
        with connection.cursor() as cursor:
            started = time.monotonic()
            cursor.execute("SELECT COUNT(*), MIN(id), MAX(id) FROM Data_Product")
            row_identity = cursor.fetchone()
            exact_count_seconds = time.monotonic() - started
            cursor.execute(
                "SELECT COUNT(DISTINCT BatchCode), MIN(collection_time), MAX(collection_time), "
                "SUM(BatchCode IS NULL), SUM(collection_time IS NULL) FROM Data_Product"
            )
            distribution = cursor.fetchone()
            cursor.execute("CHECK TABLE Data_Product QUICK")
            check_table = cursor.fetchall()
            cursor.execute("SHOW CREATE TABLE Data_Product")
            create_table = cursor.fetchone()[1]
            cursor.execute("SHOW INDEX FROM Data_Product")
            indexes = cursor.fetchall()
            cursor.execute(
                "SELECT DATA_LENGTH, INDEX_LENGTH, DATA_FREE, TABLE_ROWS FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA='sma_data_stress_test' AND TABLE_NAME='Data_Product'"
            )
            sizes = cursor.fetchone()
            cursor.execute(
                "SELECT FILE_SIZE, ALLOCATED_SIZE FROM information_schema.INNODB_SYS_TABLESPACES "
                "WHERE NAME='sma_data_stress_test/Data_Product'"
            )
            tablespace = cursor.fetchone()
            report = {
                "validated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "row_identity": row_identity,
                "exact_count_seconds": round(exact_count_seconds, 3),
                "distribution": distribution,
                "check_table": check_table,
                "create_table": create_table,
                "indexes": indexes,
                "table_sizes": sizes,
                "tablespace": tablespace,
            }
            output = Path(__file__).resolve().parent / "final-validation.json"
            output.write_text(json.dumps(report, ensure_ascii=False, default=str, indent=2), encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False, default=str))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
