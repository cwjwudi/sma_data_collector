from __future__ import annotations

import io
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

import app.main as main
from app.main import DbConnection


@pytest.fixture(autouse=True)
def isolated_jobs():
    with main._jobs_lock:
        saved = dict(main._jobs)
        main._jobs.clear()
    yield
    with main._jobs_lock:
        main._jobs.clear()
        main._jobs.update(saved)


def _make_upload(data: bytes, filename: str) -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=filename)


def _wait_job_done(job_id: str, timeout: float = 5.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with main._jobs_lock:
            job = main._jobs.get(job_id)
            if job and job.get("status") != "running":
                return
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish in time")


def test_restore_job_success_removes_upload_temp_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    sql_path = Path(main._save_upload(_make_upload(b"SELECT 1;", "dump.sql"), ".sql"))
    assert sql_path.is_file()
    monkeypatch.setattr(main, "run_cli", lambda *args, **kwargs: None)
    main.restore_mysql_job("job-restore-ok", DbConnection(), "testdb", str(sql_path))
    assert not sql_path.exists()
    assert not sql_path.parent.exists()


def test_restore_job_failure_removes_upload_temp_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    sql_path = Path(main._save_upload(_make_upload(b"SELECT 1;", "dump.sql"), ".sql"))

    def boom(*args, **kwargs):
        raise RuntimeError("mysql exited with error")

    monkeypatch.setattr(main, "run_cli", boom)
    with pytest.raises(RuntimeError):
        main.restore_mysql_job("job-restore-fail", DbConnection(), "testdb", str(sql_path))
    assert not sql_path.exists()
    assert not sql_path.parent.exists()


def test_import_csv_job_failure_removes_upload_temp_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    csv_path = Path(main._save_upload(_make_upload(b"col_a\n1\n", "rows.csv"), ".csv"))

    def boom(*args, **kwargs):
        raise RuntimeError("cannot connect")

    monkeypatch.setattr(main, "connect_mysql", boom)
    with pytest.raises(RuntimeError):
        main.import_csv_job("job-import-fail", DbConnection(), "testdb", "table_a", str(csv_path), False)
    assert not csv_path.exists()
    assert not csv_path.parent.exists()


def test_save_upload_over_limit_removes_temp_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    created: list[str] = []
    real_mkdtemp = main.tempfile.mkdtemp

    def spy_mkdtemp(*args, **kwargs):
        path = real_mkdtemp(*args, **kwargs)
        created.append(path)
        return path

    monkeypatch.setattr(main.tempfile, "mkdtemp", spy_mkdtemp)
    monkeypatch.setattr(main, "load_config", lambda: {"max_upload_mb": 1})
    with pytest.raises(HTTPException):
        main._save_upload(_make_upload(b"x" * (2 * 1024 * 1024), "big.sql"), ".sql")
    assert created
    assert not Path(created[0]).exists()


def _seed_job(job_id: str, status: str, created_at: str) -> None:
    with main._jobs_lock:
        main._jobs[job_id] = {
            "id": job_id,
            "title": job_id,
            "status": status,
            "progress": 100 if status != "running" else 0,
            "phase": status,
            "created_at": created_at,
            "updated_at": created_at,
            "logs": [],
            "result": None,
            "_started_monotonic": time.monotonic(),
        }


def test_start_job_evicts_oldest_finished_jobs_beyond_limit() -> None:
    _seed_job("running-old", "running", "2019-01-01T00:00:00")
    base = datetime(2020, 1, 1)
    total = main.MAX_FINISHED_JOBS + 5
    for i in range(total):
        _seed_job(f"finished-{i:04d}", "done", (base + timedelta(minutes=i)).isoformat(timespec="seconds"))

    release = threading.Event()

    def blocking(job_id: str) -> dict[str, bool]:
        release.wait(5)
        return {"ok": True}

    job = main.start_job("hold", blocking)
    try:
        with main._jobs_lock:
            for i in range(5):
                assert f"finished-{i:04d}" not in main._jobs, "最旧的已完成任务应被淘汰"
            assert "finished-0005" in main._jobs, "限额内的已完成任务应保留"
            assert "running-old" in main._jobs, "运行中的任务不得被淘汰"
            finished_count = sum(1 for j in main._jobs.values() if j.get("status") != "running")
            assert finished_count == main.MAX_FINISHED_JOBS
    finally:
        release.set()
    _wait_job_done(job["id"])
