from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta

import pytest

import app.main as main


@pytest.fixture(autouse=True)
def isolated_jobs():
    with main._jobs_lock:
        saved = dict(main._jobs)
        main._jobs.clear()
    yield
    with main._jobs_lock:
        main._jobs.clear()
        main._jobs.update(saved)


def _wait_job_done(job_id: str, timeout: float = 5.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with main._jobs_lock:
            job = main._jobs.get(job_id)
            if job and job.get("status") != "running":
                return
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish in time")


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
