from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.main as main
from app.main import DbConnection


@pytest.fixture(autouse=True)
def isolated_state():
    with main._jobs_lock:
        saved_jobs = dict(main._jobs)
        main._jobs.clear()
    with main._confirmations_lock:
        saved_confirmations = dict(main._confirmations)
        main._confirmations.clear()
    yield
    with main._jobs_lock:
        main._jobs.clear()
        main._jobs.update(saved_jobs)
    with main._confirmations_lock:
        main._confirmations.clear()
        main._confirmations.update(saved_confirmations)


def test_cross_origin_state_change_is_rejected() -> None:
    with TestClient(main.app, client=("127.0.0.1", 50000)) as client:
        response = client.post(
            "/api/confirmations",
            headers={"Origin": "https://attacker.example"},
            json={"action": "restore-backup", "database": "target_db"},
        )
    assert response.status_code == 403


def test_confirmation_is_bound_and_single_use() -> None:
    token = main.issue_confirmation("import-server-csv", "target_db", "target_table")
    main.consume_confirmation(token, "import-server-csv", "target_db", "target_table")
    with pytest.raises(HTTPException):
        main.consume_confirmation(token, "import-server-csv", "target_db", "target_table")


def test_confirmation_rejects_different_target() -> None:
    token = main.issue_confirmation("restore-backup", "target_a")
    with pytest.raises(HTTPException):
        main.consume_confirmation(token, "restore-backup", "target_b")


def test_config_never_returns_password(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(
        main,
        "load_config",
        lambda: {
            "backup_dir": str(tmp_path),
            "default_connection": {"username": "root", "password": "must-not-leak"},
        },
    )
    payload = main.get_config()
    assert payload["default_connection"]["username"] == "root"
    assert "password" not in payload["default_connection"]
    assert "must-not-leak" not in json.dumps(payload)


def test_range_download_supports_resume(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    backup = tmp_path / "large.sql"
    backup.write_bytes(b"0123456789")
    monkeypatch.setattr(main, "backup_dir", lambda: tmp_path)
    with TestClient(main.app, client=("127.0.0.1", 50000)) as client:
        response = client.get("/api/download/large.sql", headers={"Range": "bytes=3-6"})
    assert response.status_code == 206
    assert response.content == b"3456"
    assert response.headers["content-range"] == "bytes 3-6/10"
    assert response.headers["accept-ranges"] == "bytes"


def test_range_download_rejects_out_of_bounds(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    (tmp_path / "large.sql").write_bytes(b"0123456789")
    monkeypatch.setattr(main, "backup_dir", lambda: tmp_path)
    with TestClient(main.app, client=("127.0.0.1", 50000)) as client:
        response = client.get("/api/download/large.sql", headers={"Range": "bytes=99-100"})
    assert response.status_code == 416
    assert response.headers["content-range"] == "bytes */10"


def test_completed_backups_require_valid_manifest(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    backup = tmp_path / "valid.sql"
    backup.write_bytes(b"SELECT 1;\n")
    manifest = {
        "status": "complete",
        "filename": backup.name,
        "size_bytes": backup.stat().st_size,
        "sha256": main._sha256_file(backup),
        "completed_at": "2026-07-15T12:00:00",
    }
    backup.with_suffix(".sql.manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (tmp_path / "incomplete.sql").write_bytes(b"partial")
    monkeypatch.setattr(main, "backup_dir", lambda: tmp_path)
    assert main.list_backups()["backups"] == [
        {
            "filename": "valid.sql",
            "size_bytes": 10,
            "sha256": manifest["sha256"],
            "completed_at": "2026-07-15T12:00:00",
            "scope": "database",
            "database": "",
            "table": "",
        }
    ]


def test_verified_restore_rejects_hash_mismatch_before_cli(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    backup = tmp_path / "bad.sql"
    backup.write_bytes(b"SELECT 1;\n")
    backup.with_suffix(".sql.manifest.json").write_text(
        json.dumps(
            {
                "status": "complete",
                "filename": backup.name,
                "size_bytes": backup.stat().st_size,
                "sha256": "0" * 64,
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "backup_dir", lambda: tmp_path)
    called = False

    def fake_cli(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(main, "run_cli", fake_cli)
    with pytest.raises(RuntimeError, match="SHA-256"):
        main.restore_verified_backup_job("job", DbConnection(), "target_db", backup.name)
    assert not called


def test_backup_is_atomic_and_writes_manifest(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main, "resolve_output_dir", lambda value: tmp_path)
    monkeypatch.setattr(main, "_database_storage_bytes", lambda conn, database: 1024)
    monkeypatch.setattr(main.shutil, "disk_usage", lambda path: SimpleNamespace(free=10**9))
    monkeypatch.setattr(main, "load_config", lambda: {"cli_timeout_seconds": 60})
    monkeypatch.setattr(main, "resolve_mysql_tool", lambda name: f"/fake/{name}")
    monkeypatch.setattr(main, "mysql_dump_client_is_mariadb", lambda tool: True)
    monkeypatch.setattr(main, "persist_last_output_dir", lambda path: None)

    def fake_cli(cmd, *, env, stdin_path=None, stdout_path=None, timeout_seconds=None, cancel_event=None, **kwargs):
        assert stdout_path is not None
        assert stdout_path.name.endswith(".partial")
        assert "--column-statistics=0" not in cmd
        stdout_path.write_bytes(b"CREATE TABLE test(id INT);\n")

    monkeypatch.setattr(main, "run_cli", fake_cli)
    result = main.backup_mysql_job("job", DbConnection(), "target_db")
    output = tmp_path / result["filename"]
    manifest = tmp_path / result["manifest"]
    assert output.read_bytes() == b"CREATE TABLE test(id INT);\n"
    assert manifest.is_file()
    assert json.loads(manifest.read_text(encoding="utf-8"))["sha256"] == result["sha256"]
    assert not list(tmp_path.glob("*.partial"))


def test_failed_backup_removes_partial_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main, "resolve_output_dir", lambda value: tmp_path)
    monkeypatch.setattr(main, "_database_storage_bytes", lambda conn, database: 1024)
    monkeypatch.setattr(main.shutil, "disk_usage", lambda path: SimpleNamespace(free=10**9))
    monkeypatch.setattr(main, "load_config", lambda: {})
    monkeypatch.setattr(main, "resolve_mysql_tool", lambda name: f"/fake/{name}")
    monkeypatch.setattr(main, "mysql_dump_client_is_mariadb", lambda tool: False)
    monkeypatch.setattr(main, "persist_last_output_dir", lambda path: None)

    def failing_cli(cmd, *, env, stdin_path=None, stdout_path=None, timeout_seconds=None, cancel_event=None, **kwargs):
        assert stdout_path is not None
        assert "--column-statistics=0" in cmd
        stdout_path.write_bytes(b"partial")
        raise RuntimeError("dump failed")

    monkeypatch.setattr(main, "run_cli", failing_cli)
    with pytest.raises(RuntimeError, match="dump failed"):
        main.backup_mysql_job("job", DbConnection(), "target_db")
    assert not list(tmp_path.iterdir())


def test_resolve_mysql_tool_missing_has_clear_message(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main, "load_config", lambda: {"mysql_tools": {"mysqldump": str(tmp_path / "missing.exe")}})
    monkeypatch.setattr(main.shutil, "which", lambda name: None)
    monkeypatch.setattr(main, "BASE_DIR", tmp_path)
    with pytest.raises(FileNotFoundError, match="找不到 MySQL/MariaDB 客户端工具") as exc_info:
        main.resolve_mysql_tool("mysqldump")
    assert "WinError" not in str(exc_info.value)


def test_run_cli_wraps_missing_executable(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args, **kwargs):
        raise FileNotFoundError(2, "No such file")

    monkeypatch.setattr(main.subprocess, "Popen", boom)
    with pytest.raises(FileNotFoundError, match="找不到 MySQL/MariaDB 客户端工具") as exc_info:
        main.run_cli(["mysqldump", "--version"], env=os.environ.copy())
    assert "WinError" not in str(exc_info.value)


def test_backup_adds_column_statistics_for_mysql_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main, "resolve_output_dir", lambda value: tmp_path)
    monkeypatch.setattr(main, "_database_storage_bytes", lambda conn, database: 1024)
    monkeypatch.setattr(main.shutil, "disk_usage", lambda path: SimpleNamespace(free=10**9))
    monkeypatch.setattr(main, "load_config", lambda: {"cli_timeout_seconds": 60})
    monkeypatch.setattr(main, "resolve_mysql_tool", lambda name: r"C:\Program Files\MySQL\mysqldump.exe")
    monkeypatch.setattr(main, "mysql_dump_client_is_mariadb", lambda tool: False)
    monkeypatch.setattr(main, "persist_last_output_dir", lambda path: None)
    seen: list[list[str]] = []

    def fake_cli(cmd, *, env, stdin_path=None, stdout_path=None, timeout_seconds=None, cancel_event=None, **kwargs):
        seen.append(list(cmd))
        assert stdout_path is not None
        stdout_path.write_bytes(b"SELECT 1;\n")

    monkeypatch.setattr(main, "run_cli", fake_cli)
    main.backup_mysql_job("job", DbConnection(), "target_db")
    assert "--column-statistics=0" in seen[0]


def test_run_cli_reports_stdout_byte_progress(tmp_path: Path) -> None:
    out = tmp_path / "dump.sql"
    fractions: list[float] = []

    def hook(fraction: float) -> None:
        fractions.append(fraction)

    main.run_cli(
        [sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'0123456789' * 1000)"],
        env=os.environ.copy(),
        stdout_path=out,
        progress_hook=hook,
        progress_total_bytes=5000,
    )
    assert fractions
    assert fractions[-1] == 1.0
    assert any(value >= 0.5 for value in fractions)


def test_run_cli_reports_stdin_byte_progress(tmp_path: Path) -> None:
    source = tmp_path / "in.sql"
    source.write_bytes(b"x" * 4096)
    fractions: list[float] = []

    def hook(fraction: float) -> None:
        fractions.append(fraction)

    main.run_cli(
        [sys.executable, "-c", "import sys; sys.stdin.buffer.read()"],
        env=os.environ.copy(),
        stdin_path=source,
        progress_hook=hook,
        progress_total_bytes=4096,
    )
    assert fractions
    assert fractions[-1] == 1.0
    assert max(fractions) >= 0.99


def test_backup_passes_dump_progress_hooks(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main, "resolve_output_dir", lambda value: tmp_path)
    monkeypatch.setattr(main, "_database_storage_bytes", lambda conn, database: 10_000)
    monkeypatch.setattr(main.shutil, "disk_usage", lambda path: SimpleNamespace(free=10**9))
    monkeypatch.setattr(main, "load_config", lambda: {"cli_timeout_seconds": 60})
    monkeypatch.setattr(main, "resolve_mysql_tool", lambda name: f"/fake/{name}")
    monkeypatch.setattr(main, "mysql_dump_client_is_mariadb", lambda tool: True)
    monkeypatch.setattr(main, "persist_last_output_dir", lambda path: None)
    captured: dict[str, Any] = {}

    def fake_cli(cmd, *, env, stdin_path=None, stdout_path=None, timeout_seconds=None, cancel_event=None, **kwargs):
        captured.update(kwargs)
        assert stdout_path is not None
        stdout_path.write_bytes(b"SELECT 1;\n")

    monkeypatch.setattr(main, "run_cli", fake_cli)
    main.backup_mysql_job("job", DbConnection(), "target_db")
    assert callable(captured.get("progress_hook"))
    assert captured.get("progress_total_bytes") == 10_000


def test_resolve_output_dir_allows_outside_backup_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    backup_root = tmp_path / "backups"
    custom = tmp_path / "custom_exports"
    backup_root.mkdir()
    monkeypatch.setattr(main, "backup_dir", lambda: backup_root)
    monkeypatch.setattr(main, "load_config", lambda: {})
    resolved = main.resolve_output_dir(str(custom))
    assert resolved == custom.resolve()
    assert resolved.is_dir()


def test_list_backups_includes_last_output_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    default_root = tmp_path / "backups"
    custom_root = tmp_path / "elsewhere"
    default_root.mkdir()
    custom_root.mkdir()
    backup = custom_root / "custom.sql"
    backup.write_bytes(b"SELECT 1;\n")
    manifest = {
        "status": "complete",
        "filename": backup.name,
        "size_bytes": backup.stat().st_size,
        "sha256": main._sha256_file(backup),
        "completed_at": "2026-07-16T09:00:00",
    }
    backup.with_suffix(".sql.manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setattr(main, "backup_dir", lambda: default_root)
    monkeypatch.setattr(main, "last_output_dir", lambda: custom_root)
    assert main.list_backups()["backups"] == [
        {
            "filename": "custom.sql",
            "size_bytes": backup.stat().st_size,
            "sha256": manifest["sha256"],
            "completed_at": "2026-07-16T09:00:00",
            "scope": "database",
            "database": "",
            "table": "",
        }
    ]


def test_running_job_limit_returns_429(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "load_config", lambda: {"max_concurrent_jobs": 1})
    main._jobs["running"] = {"status": "running"}
    with pytest.raises(HTTPException) as exc_info:
        main.start_job("another", lambda job_id: None)
    assert exc_info.value.status_code == 429


def test_cancel_running_job_sets_event() -> None:
    event = threading.Event()
    main._jobs["running"] = {"status": "running", "logs": [], "_cancel_event": event}
    assert main.cancel_job("running") == {"ok": True, "job_id": "running"}
    assert event.is_set()


def test_run_cli_honors_cancellation() -> None:
    event = threading.Event()
    event.set()
    with pytest.raises(main.JobCancelled):
        main.run_cli(
            [sys.executable, "-c", "import time; time.sleep(30)"],
            env=os.environ.copy(),
            timeout_seconds=60,
            cancel_event=event,
        )


def test_table_backup_includes_table_in_command_and_manifest(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(main, "resolve_output_dir", lambda value: tmp_path)
    monkeypatch.setattr(main, "_table_storage_bytes", lambda conn, database, table: 2048)
    monkeypatch.setattr(main.shutil, "disk_usage", lambda path: SimpleNamespace(free=10**9))
    monkeypatch.setattr(main, "load_config", lambda: {"cli_timeout_seconds": 60})
    monkeypatch.setattr(main, "resolve_mysql_tool", lambda name: f"/fake/{name}")
    monkeypatch.setattr(main, "mysql_dump_client_is_mariadb", lambda tool: True)
    monkeypatch.setattr(main, "persist_last_output_dir", lambda path: None)
    seen: list[list[str]] = []

    def fake_cli(cmd, *, env, stdin_path=None, stdout_path=None, timeout_seconds=None, cancel_event=None, **kwargs):
        seen.append(list(cmd))
        assert stdout_path is not None
        assert "target_table" in cmd
        assert kwargs.get("progress_total_bytes") == 2048
        stdout_path.write_bytes(b"CREATE TABLE target_table(id INT);\n")

    monkeypatch.setattr(main, "run_cli", fake_cli)
    result = main.backup_mysql_table_job("job", DbConnection(), "target_db", "target_table")
    manifest = json.loads((tmp_path / result["manifest"]).read_text(encoding="utf-8"))
    assert manifest["scope"] == "table"
    assert manifest["table"] == "target_table"
    assert "--add-drop-table" in seen[0]


def test_csv_export_writes_manifest_and_lists(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main, "resolve_output_dir", lambda value: tmp_path)
    monkeypatch.setattr(main, "persist_last_output_dir", lambda path: None)
    monkeypatch.setattr(main, "backup_dir", lambda: tmp_path)
    monkeypatch.setattr(main, "last_output_dir", lambda: None)

    class FakeCursor:
        description = (("id",), ("name",))

        def execute(self, *_args, **_kwargs):
            return None

        def fetchone(self):
            return (2,)

        def fetchmany(self, _size):
            if getattr(self, "_done", False):
                return []
            self._done = True
            return [(1, "a"), (2, "b")]

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(main, "connect_mysql", lambda *args, **kwargs: FakeConn())
    monkeypatch.setattr(main.pymysql, "connect", lambda **kwargs: FakeConn())
    result = main.export_csv_job("job", DbConnection(), "db1", "t1")
    assert (tmp_path / result["manifest"]).is_file()
    exports = main.list_csv_exports()["exports"]
    assert exports[0]["filename"] == result["filename"]
    assert exports[0]["rows"] == 2


def test_register_local_sql_copies_and_lists(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    source_root = tmp_path / "src"
    backup_root = tmp_path / "backups"
    source_root.mkdir()
    backup_root.mkdir()
    source = source_root / "external.sql"
    source.write_bytes(b"SELECT 42;\n")
    monkeypatch.setattr(main, "backup_dir", lambda: backup_root)
    monkeypatch.setattr(main, "last_output_dir", lambda: None)
    registered = main.register_local_export_file(str(source))
    assert registered["kind"] == "sql"
    assert (backup_root / registered["filename"]).is_file()
    assert (backup_root / registered["manifest"]).is_file()
    listed = main.list_backups()["backups"]
    assert listed[0]["filename"] == registered["filename"]
    assert listed[0]["scope"] == "external"


def test_import_server_csv_verifies_hash(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    csv_path = tmp_path / "rows.csv"
    csv_path.write_text("col_a\n1\n", encoding="utf-8-sig")
    sha = main._sha256_file(csv_path)
    manifest = {
        "status": "complete",
        "kind": "csv",
        "filename": csv_path.name,
        "size_bytes": csv_path.stat().st_size,
        "sha256": sha,
        "completed_at": "2026-07-16T10:00:00",
    }
    csv_path.with_suffix(".csv.manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setattr(main, "backup_dir", lambda: tmp_path)
    monkeypatch.setattr(main, "last_output_dir", lambda: None)

    class FakeCursor:
        def execute(self, *_args, **_kwargs):
            return None

        def executemany(self, *_args, **_kwargs):
            return None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def commit(self):
            return None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(main, "connect_mysql", lambda *args, **kwargs: FakeConn())
    result = main.import_verified_csv_job("job", DbConnection(), "db1", "t1", csv_path.name, False)
    assert result["rows"] == 1
    assert result["source"] == csv_path.name
