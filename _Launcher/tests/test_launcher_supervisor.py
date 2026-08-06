from __future__ import annotations

import time
from types import SimpleNamespace

from launcher_supervisor import ServiceSupervisor


class FakeServiceProcess:
    def __init__(self, pid: int) -> None:
        self.process = SimpleNamespace(pid=pid, poll=lambda: None)


def test_manual_stop_persists_and_does_not_restart(tmp_path) -> None:
    starts = []
    stops = []

    def start(config):
        process = FakeServiceProcess(9000 + len(starts))
        starts.append(process)
        return process

    supervisor = ServiceSupervisor(
        [{"name": "query_web", "title": "Query", "port": 8092}],
        tmp_path / "state.json",
        start_process=start,
        stop_process=stops.append,
        health_check=lambda _config: True,
        poll_interval_seconds=0.01,
    )
    supervisor.start()
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline and supervisor.status()["services"][0]["state"] != "running":
        time.sleep(0.01)
    supervisor.command("query_web", "stop")
    time.sleep(0.05)
    status = supervisor.status()["services"][0]
    supervisor.shutdown()
    assert status["state"] == "stopped"
    assert status["desired_running"] is False
    assert len(starts) == 1
    assert len(stops) == 1

    restored = ServiceSupervisor(
        [{"name": "query_web", "port": 8092}],
        tmp_path / "state.json",
        start_process=start,
        stop_process=stops.append,
        health_check=lambda _config: True,
    )
    assert restored.status()["services"][0]["desired_running"] is False


def test_listen_host_change_preserves_manual_stop(tmp_path) -> None:
    supervisor = ServiceSupervisor(
        [{"name": "query_web", "host": "0.0.0.0", "port": 8092, "open_url": "http://127.0.0.1:8092/query"}],
        tmp_path / "state.json",
        start_process=lambda _config: FakeServiceProcess(9010),
        stop_process=lambda _process: None,
        health_check=lambda _config: True,
    )
    supervisor.command("query_web", "stop")
    supervisor.set_listen_host("127.0.0.1")
    status = supervisor.status()["services"][0]
    assert status["host"] == "127.0.0.1"
    assert status["desired_running"] is False
    assert status["url_path"] == "/query"
