from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

TOKEN_ENV = "SD_SMA_WEB_TOKEN"
TOKEN_HEADER = "X-SD-SMA-Token"
LOOPBACK_V4 = ("127.0.0.1", 50000)
LOOPBACK_V6 = ("::1", 50000)
REMOTE = ("203.0.113.10", 50123)


def _get(source: tuple[str, int], path: str, headers: dict[str, str] | None = None):
    with TestClient(app, client=source) as client:
        return client.get(path, headers=headers)


def test_loopback_ipv4_allowed_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(TOKEN_ENV, raising=False)
    assert _get(LOOPBACK_V4, "/").status_code == 200


def test_loopback_ipv6_allowed_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(TOKEN_ENV, raising=False)
    assert _get(LOOPBACK_V6, "/").status_code == 200


def test_non_loopback_without_token_forbidden(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(TOKEN_ENV, "expected-token")
    assert _get(REMOTE, "/").status_code == 403


def test_non_loopback_with_valid_token_allowed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(TOKEN_ENV, "expected-token")
    resp = _get(REMOTE, "/", headers={TOKEN_HEADER: "expected-token"})
    assert resp.status_code == 200


def test_non_loopback_with_wrong_token_forbidden(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(TOKEN_ENV, "expected-token")
    resp = _get(REMOTE, "/", headers={TOKEN_HEADER: "wrong-token"})
    assert resp.status_code == 403


def test_non_loopback_forbidden_when_token_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(TOKEN_ENV, raising=False)
    resp = _get(REMOTE, "/", headers={TOKEN_HEADER: "anything"})
    assert resp.status_code == 403


def test_health_exempt_for_non_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(TOKEN_ENV, raising=False)
    assert _get(REMOTE, "/api/health").status_code == 200


def test_static_not_exempt_for_non_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(TOKEN_ENV, raising=False)
    assert _get(REMOTE, "/static/styles.css").status_code == 403
