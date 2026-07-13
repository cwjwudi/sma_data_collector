"""RestartPolicy 纯决策逻辑单测（不启动任何子进程）。"""
from __future__ import annotations

from sd_sma_launcher import RestartDecision, RestartPolicy


def test_clean_exit_is_not_restarted() -> None:
    policy = RestartPolicy()
    decision = policy.decide(exit_code=0, now=100.0)
    assert decision.action == "give_up"
    assert decision.delay_seconds == 0.0


def test_first_crash_restarts_with_base_delay() -> None:
    policy = RestartPolicy(base_delay_seconds=1.0, backoff_factor=2.0)
    decision = policy.decide(exit_code=1, now=100.0)
    assert decision == RestartDecision(action="restart", delay_seconds=1.0)


def test_consecutive_crashes_back_off_exponentially() -> None:
    policy = RestartPolicy(
        max_restarts=5,
        window_seconds=60.0,
        base_delay_seconds=1.0,
        backoff_factor=2.0,
    )
    delays = [policy.decide(exit_code=1, now=float(t)).delay_seconds for t in (0, 1, 2)]
    assert delays == [1.0, 2.0, 4.0]


def test_delay_is_capped_at_max_delay() -> None:
    policy = RestartPolicy(
        max_restarts=10,
        window_seconds=1000.0,
        base_delay_seconds=1.0,
        backoff_factor=2.0,
        max_delay_seconds=5.0,
    )
    last = RestartDecision(action="restart")
    for t in range(6):
        last = policy.decide(exit_code=1, now=float(t))
    assert last.action == "restart"
    assert last.delay_seconds == 5.0


def test_gives_up_after_max_restarts_within_window() -> None:
    policy = RestartPolicy(max_restarts=3, window_seconds=60.0)
    decisions = [policy.decide(exit_code=1, now=float(t)) for t in (0, 1, 2, 3)]
    assert [d.action for d in decisions] == ["restart", "restart", "restart", "give_up"]


def test_window_expiry_resets_backoff() -> None:
    policy = RestartPolicy(max_restarts=3, window_seconds=60.0, base_delay_seconds=1.0)
    for t in (0.0, 1.0, 2.0):
        assert policy.decide(exit_code=1, now=t).action == "restart"
    late = policy.decide(exit_code=1, now=500.0)
    assert late.action == "restart"
    assert late.delay_seconds == 1.0


def test_zero_max_restarts_disables_restart() -> None:
    policy = RestartPolicy(max_restarts=0)
    assert policy.decide(exit_code=1, now=0.0).action == "give_up"


def test_from_env_uses_defaults_without_overrides() -> None:
    policy = RestartPolicy.from_env(env={})
    assert policy.max_restarts == 3
    assert policy.window_seconds == 60.0
    assert policy.base_delay_seconds == 1.0
    assert policy.backoff_factor == 2.0
    assert policy.max_delay_seconds == 30.0


def test_from_env_overrides_all_values() -> None:
    env = {
        "SD_SMA_RESTART_MAX_RESTARTS": "5",
        "SD_SMA_RESTART_WINDOW_SECONDS": "120",
        "SD_SMA_RESTART_BASE_DELAY_SECONDS": "0.5",
        "SD_SMA_RESTART_BACKOFF_FACTOR": "3",
        "SD_SMA_RESTART_MAX_DELAY_SECONDS": "10",
    }
    policy = RestartPolicy.from_env(env=env)
    assert policy.max_restarts == 5
    assert policy.window_seconds == 120.0
    assert policy.base_delay_seconds == 0.5
    assert policy.backoff_factor == 3.0
    assert policy.max_delay_seconds == 10.0


def test_from_env_ignores_invalid_values() -> None:
    policy = RestartPolicy.from_env(env={"SD_SMA_RESTART_MAX_RESTARTS": "not-a-number"})
    assert policy.max_restarts == 3
