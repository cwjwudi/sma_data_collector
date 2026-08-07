from __future__ import annotations

import time
from types import SimpleNamespace

from launcher_supervisor import ServiceSupervisor


class FakeServiceProcess:
    def __init__(self, pid: int) -> None:
        self.process = SimpleNamespace(pid=pid, poll=lambda: None)


class FakeMetricProcess:
    def __init__(self, pid, cpu, rss_mb, children=None):
        self.pid = pid
        self.cpu = cpu
        self.rss_mb = rss_mb
        self._children = children or []

    def cpu_percent(self, interval=None):
        return self.cpu

    def memory_info(self):
        return SimpleNamespace(rss=self.rss_mb * 1024 * 1024)

    def children(self, recursive=True):
        return self._children

    def is_running(self):
        return True


class FakePsutil:
    def __init__(self, root):
        self.root = root
        self.process_calls = 0

    def cpu_count(self, logical=True):
        return 4

    def Process(self, pid):
        assert pid == self.root.pid
        self.process_calls += 1
        return self.root


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


def test_status_uses_cached_process_tree_metrics(tmp_path) -> None:
    child = FakeMetricProcess(9021, 20.0, 50)
    root = FakeMetricProcess(9020, 40.0, 100, [child])
    fake_psutil = FakePsutil(root)
    supervisor = ServiceSupervisor(
        [{"name": "query_web", "port": 8092}],
        tmp_path / "state.json",
        start_process=lambda _config: FakeServiceProcess(9020),
        stop_process=lambda _process: None,
        health_check=lambda _config: True,
        poll_interval_seconds=0.01,
        psutil_module=fake_psutil,
    )
    supervisor.start()
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline and supervisor.status()["services"][0]["state"] != "running":
        time.sleep(0.01)
    first = supervisor.status()["services"][0]
    second = supervisor.status()["services"][0]
    supervisor.shutdown()

    assert first["cpu_percent"] == 15.0
    assert first["cpu_core_percent"] == 60.0
    assert first["memory_mb"] == 150.0
    assert first["child_count"] == 1
    assert second["memory_mb"] == 150.0
    assert fake_psutil.process_calls == 1
