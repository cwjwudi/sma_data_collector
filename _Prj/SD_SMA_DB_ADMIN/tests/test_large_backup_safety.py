from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

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
            json={"action": "restore-sql", "database": "target_db"},
        )
    assert response.status_code == 403


def test_confirmation_is_bound_and_single_use() -> None:
    token = main.issue_confirmation("import-csv", "target_db", "target_table")
    main.consume_confirmation(token, "import-csv", "target_db", "target_table")
    with pytest.raises(HTTPException):
        main.consume_confirmation(token, "import-csv", "target_db", "target_table")


def test_confirmation_rejects_different_target() -> None:
    token = main.issue_confirmation("restore-sql", "target_a")
    with pytest.raises(HTTPException):
        main.consume_confirmation(token, "restore-sql", "target_b")


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


def test_backup_is_atomic_and_writes_manifest(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main, "resolve_output_dir", lambda value: tmp_path)
    monkeypatch.setattr(main, "_database_storage_bytes", lambda conn, database: 1024)
    monkeypatch.setattr(main.shutil, "disk_usage", lambda path: SimpleNamespace(free=10**9))
    monkeypatch.setattr(main, "load_config", lambda: {"cli_timeout_seconds": 60})

    def fake_cli(cmd, *, env, stdin_path=None, stdout_path=None, timeout_seconds=None):
        assert stdout_path is not None
        assert stdout_path.name.endswith(".partial")
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

    def failing_cli(cmd, *, env, stdin_path=None, stdout_path=None, timeout_seconds=None):
        assert stdout_path is not None
        stdout_path.write_bytes(b"partial")
        raise RuntimeError("dump failed")

    monkeypatch.setattr(main, "run_cli", failing_cli)
    with pytest.raises(RuntimeError, match="dump failed"):
        main.backup_mysql_job("job", DbConnection(), "target_db")
    assert not list(tmp_path.iterdir())


def test_running_job_limit_returns_429(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "load_config", lambda: {"max_concurrent_jobs": 1})
    main._jobs["running"] = {"status": "running"}
    with pytest.raises(HTTPException) as exc_info:
        main.start_job("another", lambda job_id: None)
    assert exc_info.value.status_code == 429
