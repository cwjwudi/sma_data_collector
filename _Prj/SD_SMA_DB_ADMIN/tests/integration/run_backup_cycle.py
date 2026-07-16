from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import app.main as db_admin  # noqa: E402
import large_db_harness as harness  # noqa: E402


def locate_tool(tools_root: Path, names: tuple[str, ...]) -> Path:
    for name in names:
        matches = list(tools_root.rglob(name))
        if matches:
            return matches[0].resolve()
    raise FileNotFoundError(f"Could not locate any of {names!r} under {tools_root}")


def reset_restore_database(name: str) -> None:
    harness.safe_database(name)
    with harness.connect() as db:
        with db.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS {harness.quote(name)}")
            cur.execute(
                f"CREATE DATABASE {harness.quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="codex_dbadmin_stress_src")
    parser.add_argument("--restored", required=True)
    parser.add_argument("--round", required=True)
    parser.add_argument("--tools-root", type=Path, default=ROOT / "_tools")
    args = parser.parse_args()
    source = harness.safe_database(args.source)
    restored = harness.safe_database(args.restored)
    dump_tool = locate_tool(args.tools_root, ("mariadb-dump.exe", "mysqldump.exe"))
    mysql_tool = locate_tool(args.tools_root, ("mariadb.exe", "mysql.exe"))
    backup_root = (ROOT / "_artifacts" / "backups").resolve()
    backup_root.mkdir(parents=True, exist_ok=True)
    config = {
        "backup_dir": str(backup_root),
        "backup_free_space_factor": 1.5,
        "cli_timeout_seconds": 86400,
        "mysql_tools": {"mysqldump": str(dump_tool), "mysql": str(mysql_tool)},
    }
    db_admin.load_config = lambda: config
    connection = db_admin.DbConnection(
        host=os.environ.get("DB_ADMIN_TEST_HOST", "192.168.50.22"),
        port=int(os.environ.get("DB_ADMIN_TEST_PORT", "3306")),
        username=os.environ.get("DB_ADMIN_TEST_USER", "root"),
        password=os.environ["DB_ADMIN_TEST_PASSWORD"],
    )
    print(json.dumps({"phase": "source_snapshot", "database": source}), flush=True)
    source_snapshot = harness.snapshot(source)
    started = datetime.now().isoformat(timespec="seconds")
    print(json.dumps({"phase": "backup", "database": source}), flush=True)
    backup_started = time.monotonic()
    backup_result = db_admin.backup_mysql_job(f"stress-{args.round}-backup", connection, source)
    backup_seconds = time.monotonic() - backup_started
    print(
        json.dumps(
            {
                "phase": "backup_complete",
                "filename": backup_result["filename"],
                "size_bytes": backup_result["size_bytes"],
                "elapsed_seconds": round(backup_seconds, 3),
            }
        ),
        flush=True,
    )
    print(json.dumps({"phase": "reset_restore_database", "database": restored}), flush=True)
    reset_restore_database(restored)
    print(json.dumps({"phase": "verify_and_restore", "database": restored}), flush=True)
    restore_started = time.monotonic()
    restore_result = db_admin.restore_verified_backup_job(
        f"stress-{args.round}-restore", connection, restored, backup_result["filename"]
    )
    restore_seconds = time.monotonic() - restore_started
    print(json.dumps({"phase": "restore_complete", "elapsed_seconds": round(restore_seconds, 3)}), flush=True)
    print(json.dumps({"phase": "restored_snapshot", "database": restored}), flush=True)
    restored_snapshot = harness.snapshot(restored)
    mismatches: list[str] = []
    for table, expected in source_snapshot["tables"].items():
        actual = restored_snapshot["tables"].get(table)
        for key in ("rows", "min_id", "max_id", "digest_sum"):
            if actual is None or actual[key] != expected[key]:
                mismatches.append(
                    f"{table}.{key}: expected={expected[key]!r}, actual={None if actual is None else actual[key]!r}"
                )
    size_bytes = int(backup_result["size_bytes"])
    report = {
        "round": args.round,
        "started_at": started,
        "completed_at": datetime.now().isoformat(timespec="seconds"),
        "source": source,
        "restored": restored,
        "client_tools": {"dump": str(dump_tool), "mysql": str(mysql_tool)},
        "backup": {
            **backup_result,
            "elapsed_seconds": round(backup_seconds, 3),
            "throughput_mib_per_second": round(size_bytes / 1024 / 1024 / max(backup_seconds, 0.001), 3),
        },
        "restore": {
            **restore_result,
            "elapsed_seconds": round(restore_seconds, 3),
            "throughput_mib_per_second": round(size_bytes / 1024 / 1024 / max(restore_seconds, 0.001), 3),
        },
        "source_snapshot": source_snapshot,
        "restored_snapshot": restored_snapshot,
        "mismatches": mismatches,
    }
    output = ROOT / "_artifacts" / f"backup_cycle_{args.round}.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if mismatches:
        raise SystemExit("Restore verification failed:\n" + "\n".join(mismatches))


if __name__ == "__main__":
    main()
