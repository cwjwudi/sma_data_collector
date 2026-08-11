from __future__ import annotations

import json
from pathlib import Path

from app.config_manager import UnifiedConfigStore


def test_profile_migrates_and_masks_database_and_opcua_passwords(tmp_path: Path) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    profile_path = config_dir / "default.json"
    profile_path.write_text(
        json.dumps(
            {
                "version": 1,
                "name": "default",
                "app_settings": {
                    "database": {
                        "type": "mysql",
                        "name": "query",
                        "username": "reader",
                        "password": "db-secret",
                    }
                },
                "opcua": {
                    "endpoint_url": "opc.tcp://127.0.0.1:4840/",
                    "username": "opc",
                    "password": "opc-secret",
                },
                "query_view": UnifiedConfigStore._default_query_view_config(),
                "plugins": {"modules": {}},
            }
        ),
        encoding="utf-8",
    )
    (config_dir / ".active_query_config").write_text("default.json", encoding="utf-8")

    store = UnifiedConfigStore(config_dir)
    assert store.get_app_settings()["database"]["password"] == "db-secret"
    assert store.get_opcua_settings()["password"] == "opc-secret"

    stored_text = profile_path.read_text(encoding="utf-8")
    stored = json.loads(stored_text)
    assert "db-secret" not in stored_text
    assert "opc-secret" not in stored_text
    assert "password" not in stored["app_settings"]["database"]
    assert stored["app_settings"]["database"]["password_enc"]
    assert "password" not in stored["opcua"]
    assert stored["opcua"]["password_enc"]

    public_db = store.get_public_app_settings()["database"]
    public_opcua = store.get_public_opcua_settings()
    assert public_db["password_configured"] is True
    assert public_opcua["password_configured"] is True
    assert "password" not in public_db and "password_enc" not in public_db
    assert "password" not in public_opcua and "password_enc" not in public_opcua


def test_blank_password_preserves_ciphertext_and_clear_removes_it(tmp_path: Path) -> None:
    store = UnifiedConfigStore(tmp_path / "config")
    store.save_app_settings(
        {
            "database": {
                "type": "mysql",
                "name": "query",
                "username": "reader",
                "password": "db-secret",
            },
            "query_limits": {},
        }
    )
    first = store.get_active_config()["app_settings"]["database"]["password_enc"]

    public = store.get_public_app_settings()
    public["database"]["password"] = ""
    store.save_app_settings(public)
    assert store.get_active_config()["app_settings"]["database"]["password_enc"] == first

    public["database"]["clear_password"] = True
    store.save_app_settings(public)
    assert "password_enc" not in store.get_active_config()["app_settings"]["database"]


def test_launcher_managed_connection_overrides_imported_profile(tmp_path: Path, monkeypatch) -> None:
    store = UnifiedConfigStore(tmp_path / "config")
    store.save_app_settings(
        {
            "database": {
                "type": "mysql",
                "host": "imported-db",
                "port": 3306,
                "name": "imported-name",
                "username": "imported-user",
                "password": "imported-password",
            }
        }
    )
    monkeypatch.setenv("SD_SMA_DB_HOST", "central-db")
    monkeypatch.setenv("SD_SMA_DB_PORT", "3307")
    monkeypatch.setenv("SD_SMA_DB_USERNAME", "central-user")
    monkeypatch.setenv("SD_SMA_DB_DATABASE", "central-name")
    monkeypatch.setenv("SD_SMA_DB_PASSWORD", "central-password")

    private = store.get_app_settings()["database"]
    public = store.get_public_app_settings()["database"]
    assert private["password"] == "central-password"
    assert (private["host"], private["port"], private["username"], private["name"]) == (
        "central-db", 3307, "central-user", "central-name"
    )
    assert (public["host"], public["port"], public["username"], public["name"]) == (
        "central-db", 3307, "central-user", "central-name"
    )
