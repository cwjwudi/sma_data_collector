"""Print row counts and latest collection timestamps for collector groups."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pymysql

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.secret_store import resolve_password  # noqa: E402


def json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.astimezone().isoformat() if value.tzinfo else value.isoformat()
    return str(value)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument(
        "--append",
        type=Path,
        help="Append the snapshot as one UTF-8 JSON line to this evidence file.",
    )
    args = parser.parse_args()

    config_path = args.config.resolve()
    raw = json.loads(config_path.read_text(encoding="utf-8"))
    database = raw["database"]
    connection = pymysql.connect(
        host=database["host"],
        port=int(database["port"]),
        user=database["username"],
        password=resolve_password(
            config_path.parent,
            database,
            "SD_SMA_DB_PASSWORD",
        ),
        database=database["name"],
    )
    result: dict[str, Any] = {
        "captured_at": datetime.now().astimezone(),
        "database": database["name"],
        "groups": {},
    }
    try:
        with connection.cursor() as cursor:
            for table in database["data_groups"]:
                cursor.execute(
                    f"SELECT COUNT(*), MAX(collection_time) FROM `{table}`"
                )
                count, latest = cursor.fetchone()
                result["groups"][table] = {
                    "count": int(count),
                    "max_collection_time": latest,
                }
    finally:
        connection.close()

    payload = json.dumps(result, ensure_ascii=False, default=json_default)
    if args.append is not None:
        evidence_path = args.append.resolve()
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        with evidence_path.open("a", encoding="utf-8", newline="\n") as evidence_file:
            evidence_file.write(f"{payload}\n")
    print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
