"""monitor() 退出码语义与崩溃自动重启（全部使用假进程对象，不启动子进程）。"""
from __future__ import annotations

from pathlib import Path
from typing import Callable

import sd_sma_launcher as launcher

POLL_SENTINEL = 99.0  # 测试里用可辨识的轮询间隔，便于把退避 sleep 与轮询 sleep 区分开


class FakeStream:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class FakePopen:
    """poll() 依次返回 poll_results，末值之后保持不变。"""

    def __init__(self, poll_results: list[int | None]) -> None:
        self._polls = list(poll_results)
        self.stdout = FakeStream()

    def poll(self) -> int | None:
        if len(self._polls) > 1:
            return self._polls.pop(0)
        return self._polls[0]


class FakePump:
    def __init__(self) -> None:
        self.joined = False

    def join(self, timeout: float | None = None) -> None:
        self.joined = True


class FakeLogWriter:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


def make_service(name: str = "svc", poll_results: list[int | None] | None = None) -> launcher.ServiceProcess:
    return launcher.ServiceProcess(
        name=name,
        title=name,
        url="http://127.0.0.1:1",
        log_path=Path("/tmp/fake-uvicorn.log"),
        process=FakePopen(poll_results or [0]),  # type: ignore[arg-type]
        log_file=FakeLogWriter(),
        log_pump=FakePump(),
    )


def make_clock(step: float = 1.0) -> Callable[[], float]:
    state = {"t": 0.0}

    def clock() -> float:
        state["t"] += step
        return state["t"]

    return clock


def test_monitor_returns_zero_on_clean_exit() -> None:
    proc = make_service(poll_results=[0])
    assert launcher.monitor([proc]) == 0


def test_monitor_returns_crash_code_without_restarter() -> None:
    proc = make_service(poll_results=[7])
    assert launcher.monitor([proc]) == 7


def test_monitor_restarts_crashed_service_in_place_and_closes_old_handles() -> None:
    crashed = make_service(name="collector_web", poll_results=[1])
    replacement = make_service(name="collector_web", poll_results=[0])
    restarted: list[str] = []

    def restart(proc: launcher.ServiceProcess) -> launcher.ServiceProcess:
        restarted.append(proc.name)
        return replacement

    sleeps: list[float] = []
    processes = [crashed]
    code = launcher.monitor(
        processes,
        restart_service=restart,
        policy_factory=lambda: launcher.RestartPolicy(),
        sleep=sleeps.append,
        clock=make_clock(),
        poll_interval_seconds=POLL_SENTINEL,
    )

    assert code == 0
    assert restarted == ["collector_web"]
    assert processes[0] is replacement  # 原地替换，terminate_processes 能看到新进程
    backoff_sleeps = [s for s in sleeps if s != POLL_SENTINEL]
    assert backoff_sleeps == [1.0]
    # 重启前必须先释放旧进程句柄，避免泄漏
    assert crashed.process.stdout.closed  # type: ignore[union-attr]
    assert crashed.log_pump.joined
    assert crashed.log_file.closed


def test_monitor_gives_up_after_repeated_crashes_and_returns_last_code() -> None:
    replacements = [make_service(name="query_web", poll_results=[2]) for _ in range(3)]
    it = iter(replacements)
    restarted: list[str] = []

    def restart(proc: launcher.ServiceProcess) -> launcher.ServiceProcess:
        restarted.append(proc.name)
        return next(it)

    sleeps: list[float] = []
    processes = [make_service(name="query_web", poll_results=[2])]
    code = launcher.monitor(
        processes,
        restart_service=restart,
        policy_factory=lambda: launcher.RestartPolicy(max_restarts=3, window_seconds=60.0),
        sleep=sleeps.append,
        clock=make_clock(),
        poll_interval_seconds=POLL_SENTINEL,
    )

    assert code == 2
    assert restarted == ["query_web"] * 3  # 窗口内连续失败达上限后放弃
    backoff_sleeps = [s for s in sleeps if s != POLL_SENTINEL]
    assert backoff_sleeps == [1.0, 2.0, 4.0]


def test_monitor_does_not_restart_on_clean_exit_even_with_restarter() -> None:
    restarted: list[str] = []

    def restart(proc: launcher.ServiceProcess) -> launcher.ServiceProcess:
        restarted.append(proc.name)
        return proc

    code = launcher.monitor(
        [make_service(poll_results=[0])],
        restart_service=restart,
        policy_factory=lambda: launcher.RestartPolicy(),
        sleep=lambda _s: None,
        clock=make_clock(),
        poll_interval_seconds=POLL_SENTINEL,
    )
    assert code == 0
    assert restarted == []
