from __future__ import annotations

import csv
import os
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from resource_monitor import ResourceMonitor, ResourceMonitorSettings

MB = 1024 * 1024


class FakeProcess:
    def __init__(
        self,
        pid: int,
        *,
        cpu_percent: float,
        rss_mb: int,
        children: list["FakeProcess"] | None = None,
    ) -> None:
        self.pid = pid
        self._cpu_percent = cpu_percent
        self._rss = rss_mb * MB
        self._children = children or []

    def cpu_percent(self, interval: None = None) -> float:
        return self._cpu_percent

    def children(self, recursive: bool = True) -> list["FakeProcess"]:
        return list(self._children)

    def is_running(self) -> bool:
        return True

    def memory_info(self) -> SimpleNamespace:
        return SimpleNamespace(rss=self._rss, vms=self._rss * 2)

    def num_threads(self) -> int:
        return 3

    def num_handles(self) -> int:
        return 7

    def io_counters(self) -> SimpleNamespace:
        return SimpleNamespace(read_bytes=2 * MB, write_bytes=3 * MB)

    def create_time(self) -> float:
        return 1_700_000_000.0


class FakePsutil:
    def __init__(self, processes: list[FakeProcess]) -> None:
        self.processes = {process.pid: process for process in processes}

    def cpu_count(self, logical: bool = True) -> int:
        return 4

    def cpu_percent(self, interval: None = None) -> float:
        return 25.0

    def virtual_memory(self) -> SimpleNamespace:
        return SimpleNamespace(total=1_000 * MB, used=400 * MB, available=600 * MB, percent=40.0)

    def disk_io_counters(self) -> SimpleNamespace:
        return SimpleNamespace(read_bytes=100 * MB, write_bytes=200 * MB)

    def Process(self, pid: int) -> FakeProcess:  # noqa: N802 - follows psutil API
        return self.processes[pid]


class FakeService:
    def __init__(self, name: str, pid: int) -> None:
        self.name = name
        self.process = SimpleNamespace(pid=pid)


def make_monitor(tmp_path: Path, settings: ResourceMonitorSettings | None = None) -> ResourceMonitor:
    child = FakeProcess(201, cpu_percent=20.0, rss_mb=50)
    service = FakeProcess(200, cpu_percent=40.0, rss_mb=100, children=[child])
    launcher = FakeProcess(os.getpid(), cpu_percent=8.0, rss_mb=25)
    return ResourceMonitor(
        settings or ResourceMonitorSettings(),
        tmp_path,
        psutil_module=FakePsutil([launcher, service, child]),
        wall_clock=lambda: datetime(2026, 7, 21, 8, 0, tzinfo=timezone.utc),
        emit=lambda _message: None,
    )


def test_collects_system_launcher_and_recursive_service_metrics(tmp_path: Path) -> None:
    monitor = make_monitor(tmp_path)

    rows = monitor.collect([FakeService("collector_web", 200)])

    assert [row["scope"] for row in rows] == ["system", "launcher", "service"]
    service = rows[2]
    assert service["name"] == "collector_web"
    assert service["cpu_core_percent"] == 60.0
    assert service["cpu_percent"] == 15.0
    assert service["memory_mb"] == 150.0
    assert service["child_count"] == 1
    assert service["threads"] == 6
    assert service["handles"] == 14


def test_writes_csv_with_header_and_tracks_restart_count(tmp_path: Path) -> None:
    monitor = make_monitor(tmp_path)
    monitor.note_restart("collector_web")

    monitor.maybe_sample([FakeService("collector_web", 200)])

    with monitor.metrics_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 3
    assert rows[2]["restart_count"] == "1"
    assert rows[2]["status"] == "running"


def test_alert_requires_sustained_threshold_and_records_recovery(tmp_path: Path) -> None:
    clock = {"now": 0.0}
    messages: list[str] = []
    settings = ResourceMonitorSettings(
        sample_interval_seconds=1,
        console_interval_seconds=60,
        alert_cpu_percent=10,
        alert_memory_mb=0,
        alert_sustain_seconds=5,
    )
    monitor = make_monitor(tmp_path, settings)
    monitor._monotonic = lambda: clock["now"]
    monitor._emit = messages.append
    service = FakeService("collector_web", 200)

    monitor.maybe_sample([service])
    assert not monitor.alerts_path.exists()

    clock["now"] = 5.0
    monitor.maybe_sample([service])
    assert "ALERT collector_web cpu_percent=15.00%" in monitor.alerts_path.read_text(encoding="utf-8")
    assert any("ALERT collector_web" in message for message in messages)

    monitor._psutil.processes[200]._cpu_percent = 0.0
    monitor._psutil.processes[201]._cpu_percent = 0.0
    clock["now"] = 6.0
    monitor.maybe_sample([service])
    assert "RECOVERED collector_web cpu_percent=0.00%" in monitor.alerts_path.read_text(encoding="utf-8")


def test_settings_fall_back_for_invalid_intervals() -> None:
    settings = ResourceMonitorSettings.from_mapping(
        {
            "sample_interval_seconds": 0,
            "console_interval_seconds": "invalid",
            "max_log_mb": -1,
            "backup_count": 0,
            "alerts": {"cpu_percent": 0, "memory_mb": -2, "sustain_seconds": 0},
        }
    )

    assert settings.sample_interval_seconds == 5.0
    assert settings.console_interval_seconds == 60.0
    assert settings.max_log_bytes == 50 * MB
    assert settings.backup_count == 5
    assert settings.alert_cpu_percent == 0
    assert settings.alert_memory_mb == 1024.0
    assert settings.alert_sustain_seconds == 0


def test_metrics_log_rotates_and_new_file_keeps_csv_header(tmp_path: Path) -> None:
    settings = ResourceMonitorSettings(
        sample_interval_seconds=1,
        max_log_bytes=200,
        backup_count=2,
        alert_cpu_percent=0,
        alert_memory_mb=0,
    )
    monitor = make_monitor(tmp_path, settings)

    monitor.maybe_sample([FakeService("collector_web", 200)])
    monitor._last_sample_at = None
    monitor.maybe_sample([FakeService("collector_web", 200)])

    rotated = tmp_path / "resource_metrics.csv.1"
    assert rotated.exists()
    assert monitor.metrics_path.read_text(encoding="utf-8").startswith("timestamp,scope,name,pid")
    assert rotated.read_text(encoding="utf-8").startswith("timestamp,scope,name,pid")
