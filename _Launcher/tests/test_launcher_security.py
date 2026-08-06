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


def test_pin_modes_support_skip_disable_and_reenable(tmp_path) -> None:
    store = LauncherSecurityStore(tmp_path / "security.json")
    assert store.pin_mode == "undecided"
    assert store.pin_enabled is False

    store.disable_pin()
    assert store.pin_mode == "disabled"
    assert store.pin_configured is False

    token = store.setup_pin("654321")
    assert store.pin_mode == "enabled"
    assert store.verify_session(token) is True

    store.disable_pin()
    assert store.pin_mode == "disabled"
    assert store.verify_session(token) is False
    saved = json.loads((tmp_path / "security.json").read_text(encoding="utf-8"))
    assert "pin_hash" not in saved
    assert "pin_salt" not in saved


def test_legacy_pin_file_is_treated_as_enabled(tmp_path) -> None:
    store = LauncherSecurityStore(tmp_path / "security.json")
    store.setup_pin("123456")
    data = json.loads((tmp_path / "security.json").read_text(encoding="utf-8"))
    data.pop("pin_mode", None)
    (tmp_path / "security.json").write_text(json.dumps(data), encoding="utf-8")

    restored = LauncherSecurityStore(tmp_path / "security.json")
    assert restored.pin_mode == "enabled"
