from __future__ import annotations

import json
from pathlib import Path

from web_config.config_manager import CollectorConfigManager


def _payload(password: str = "") -> dict:
    return {
        "communications": [],
        "connections": [],
        "points": [
            {
                "name": "temperature",
                "path": "ns=2;s=Temperature",
                "description": "temperature",
            }
        ],
        "groups": [
            {
                "name": "group_1",
                "description": "group",
                "trigger": "time",
                "interval_seconds": 1,
                "data_points": ["temperature"],
            }
        ],
        "database": {
            "type": "mysql",
            "name": "collector",
            "host": "127.0.0.1",
            "port": 3306,
            "username": "collector",
            "password": password,
            "data_groups": ["group_1"],
        },
    }


def test_web_config_encrypts_masks_and_preserves_password(tmp_path: Path) -> None:
    manager = CollectorConfigManager(tmp_path)
    target = manager.write_collector_config(_payload("collector-secret"), "secure.json")

    stored = json.loads(target.read_text(encoding="utf-8"))
    assert "password" not in stored["database"]
    assert stored["database"]["password_enc"]
    assert "collector-secret" not in target.read_text(encoding="utf-8")

    public = manager.load_config_file("secure.json")["payload"]
    assert public["database"]["password"] == ""
    assert public["database"]["password_configured"] is True
    assert "password_enc" not in public["database"]

    original_token = stored["database"]["password_enc"]
    manager.write_collector_config(public, "secure.json")
    stored_again = json.loads(target.read_text(encoding="utf-8"))
    assert stored_again["database"]["password_enc"] == original_token


def test_web_config_can_explicitly_clear_password(tmp_path: Path) -> None:
    manager = CollectorConfigManager(tmp_path)
    target = manager.write_collector_config(_payload("collector-secret"), "secure.json")
    public = manager.load_config_file("secure.json")["payload"]
    public["database"]["clear_password"] = True

    manager.write_collector_config(public, "secure.json")

    stored = json.loads(target.read_text(encoding="utf-8"))
    assert "password" not in stored["database"]
    assert "password_enc" not in stored["database"]


def test_collector_page_state_redacts_password() -> None:
    script = (
        Path(__file__).resolve().parents[1] / "web_config" / "static" / "config.js"
    ).read_text(encoding="utf-8")

    assert 'persistedConfig.database.password = ""' in script
    assert 'delete persistedConfig.database.password_enc' in script
    assert 'createInput("", (v) =>' in script
    assert '"password"' in script
