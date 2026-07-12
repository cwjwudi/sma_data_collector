"""AI 设置迁入与空串不误清。"""
from __future__ import annotations

import json
from pathlib import Path

from modules import ai_config, secrets as secrets_mod


def _write_cfg(data_dir: Path, ai: dict) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "config.json").write_text(
        json.dumps({"schema_version": 1, "ai_settings": ai, "db_connections": [], "opcua_servers": []}, ensure_ascii=False),
        encoding="utf-8",
    )


def test_empty_api_key_does_not_clear_existing(tmp_path: Path, monkeypatch):
    data = tmp_path / "cur" / "backend-data"
    data.mkdir(parents=True)
    enc = secrets_mod.encrypt_secret(data, "sk-keep-me")
    _write_cfg(data, {"enabled": True, "llm_api_key_enc": enc, "llm_model": "gpt-4o-mini"})
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", data / "config.json")

    ai_config.save_ai_settings({"llm_api_key": ""})
    s = ai_config.load_ai_settings()
    assert ai_config.try_decrypt_llm_api_key(data, s) == "sk-keep-me"


def test_migrate_ai_key_from_legacy(tmp_path: Path, monkeypatch):
    appdata = tmp_path / "AppData"
    legacy = appdata / "sd-sma-report-editor" / "backend-data"
    current = appdata / "sd-sma-report-editor-ai" / "backend-data"
    legacy.mkdir(parents=True)
    current.mkdir(parents=True)

    plain = "sk-legacy-secret"
    enc = secrets_mod.encrypt_secret(legacy, plain)
    _write_cfg(
        legacy,
        {
            "enabled": True,
            "llm_base_url": "https://api.openai.com/v1",
            "llm_model": "gpt-4o",
            "llm_api_key_enc": enc,
        },
    )
    _write_cfg(current, {"enabled": False, "llm_model": "gpt-4o-mini"})

    monkeypatch.setattr(ai_config, "DATA_DIR", current)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", current / "config.json")

    result = ai_config.maybe_migrate_ai_settings_from_legacy(data_dir=current)
    assert result["migrated"] is True
    s = json.loads((current / "config.json").read_text(encoding="utf-8"))
    assert s.get("ai_settings_migrated_from_legacy") is True
    assert ai_config.try_decrypt_llm_api_key(current, s["ai_settings"]) == plain
    assert s["ai_settings"].get("enabled") is True
    assert s["ai_settings"].get("llm_model") == "gpt-4o"

    # 再次调用不重复迁入
    result2 = ai_config.maybe_migrate_ai_settings_from_legacy(data_dir=current)
    assert result2["migrated"] is False
    assert result2["reason"] == "already_done"
