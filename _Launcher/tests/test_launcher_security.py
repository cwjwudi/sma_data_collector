from __future__ import annotations

import json

import pytest

from launcher_security import LauncherSecurityStore


def test_pin_session_and_credential_never_expose_secret(tmp_path) -> None:
    store = LauncherSecurityStore(tmp_path / "security.json", session_seconds=60)
    token = store.setup_pin("123456")
    assert store.verify_session(token) is True
    with pytest.raises(ValueError):
        store.setup_pin("654321")

    public = store.upsert_credential(
        {
            "name": "生产数据库",
            "host": "10.0.0.8",
            "port": 3306,
            "username": "operator",
            "password": "do-not-leak",
        }
    )
    dumped_public = json.dumps(public, ensure_ascii=False)
    dumped_file = (tmp_path / "security.json").read_text(encoding="utf-8")
    assert "do-not-leak" not in dumped_public
    assert "do-not-leak" not in dumped_file
    assert public["password_configured"] is True

    store.assign("collector_web", public["id"])
    resolved = store.credential_for_service("collector_web")
    assert resolved and resolved["password"] == "do-not-leak"


def test_wrong_pin_is_rejected(tmp_path) -> None:
    store = LauncherSecurityStore(tmp_path / "security.json")
    store.setup_pin("123456")
    with pytest.raises(PermissionError):
        store.unlock("000000")
