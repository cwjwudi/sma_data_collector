"""AI request_config_backup_export：pending 另存 .rebak；密文/口令不进工具结果。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import (
    ai_config,
    ai_config_ops,
    ai_pending_prompts,
    ai_tool_trace,
    ai_tools,
    bundle_crypto,
)


@pytest.fixture()
def backup_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    data.mkdir(parents=True)
    (data / "templates").mkdir()
    (data / "layout_presets").mkdir()
    (data / "signature_assets").mkdir()
    cfg_path = data / "config.json"
    cfg_path.write_text(
        json.dumps(
            {
                "db_connections": [
                    {
                        "id": "db1",
                        "name": "DemoDB",
                        "host": "127.0.0.1",
                        "port": 3306,
                        "database": "demo",
                        "username": "u",
                        "password": "SUPER-SECRET-DB-PASS",
                    }
                ],
                "opcua_servers": [],
                "app_preferences": {},
                "ai_settings": {"write_tools_enabled": True, "enabled": True},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    prompts_file = data / "ai_pending_prompts.json"
    prompts_file.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(ai_tools, "DATA_DIR", data)
    monkeypatch.setattr(ai_tools, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_config_ops, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config_ops, "_CLIENT_PREFS_MIRROR", data / "client_prefs_mirror.json")
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)
    return data, cfg_path


def _assert_no_secret_leak(payload: object) -> None:
    raw = json.dumps(payload, ensure_ascii=False)
    assert "SUPER-SECRET-DB-PASS" not in raw
    assert "ciphertext" not in raw.lower()
    assert bundle_crypto.MAGIC.decode("ascii") not in raw


@pytest.mark.asyncio
async def test_backup_export_requests_pending_without_blob(backup_env):
    result = await ai_tools.execute_tool("request_config_backup_export", {})
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_action"
    prompt = result["prompt"]
    assert prompt["kind"] == "pick_export_dir"
    assert prompt["payload"]["action"] == "backup_export"
    assert "rebak" in (prompt.get("message") or "").lower() or "备份" in (prompt.get("message") or "")
    _assert_no_secret_leak(result)

    # 公开 pending 列表同样不得带密文
    pending = ai_pending_prompts.list_pending()
    assert len(pending) == 1
    _assert_no_secret_leak(pending)


@pytest.mark.asyncio
async def test_backup_export_blocked_when_write_disabled(backup_env):
    _data, cfg_path = backup_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    result = await ai_tools.execute_tool("request_config_backup_export", {})
    assert result["ok"] is False
    assert "写入" in result["error"]
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_share_summary_has_counts_not_passwords(backup_env):
    result = await ai_tools.execute_tool("export_config_share_summary", {})
    assert result["ok"] is True
    summary = result["summary"]
    assert summary["db_connections"] >= 1
    assert not isinstance(summary.get("db_connections"), list)
    dumped = json.dumps(result, ensure_ascii=False).lower()
    assert "password" not in dumped
    _assert_no_secret_leak(result)


def test_tool_trace_strips_backup_secret_args():
    step = ai_tool_trace.build_tool_trace_step(
        round_index=1,
        name="request_config_backup_export",
        args={"rebak_password": "leak-me", "action": "backup_export"},
        result={"ok": True, "status": "awaiting_user_action"},
    )
    assert "rebak_password" not in step["args_summary"]
    assert step["args_summary"].get("action") == "backup_export"
    _assert_no_secret_leak(step)


def test_encrypt_bundle_produces_rebak_magic(backup_env):
    """UI 另存路径依赖的加密字节须为 .rebak 魔术头（与 AI 工具解耦但同属 D 验收）。"""
    _data, _cfg = backup_env
    # 直接调用 ops 同目录的 bundle 构建会走 DATA_DIR；此处验证 crypto 契约
    blob = bundle_crypto.encrypt_bundle_obj({"bundle_version": 3, "db_connections": []})
    assert bundle_crypto.is_encrypted_bundle(blob)
    assert not blob.decode("latin-1").startswith("{")


def test_backup_tool_is_confirm_risk():
    from modules import ai_tool_catalog

    assert "request_config_backup_export" in ai_tool_catalog.CONFIRM_TOOLS


def test_system_prompt_backup_rules():
    from api.routers import ai_openai

    assert "request_config_backup_export" in ai_openai.SYSTEM_PROMPT
    assert "awaiting_user_action" in ai_openai.SYSTEM_PROMPT
    assert ".rebak" in ai_openai.SYSTEM_PROMPT
    assert "口令" in ai_openai.SYSTEM_PROMPT or "密文" in ai_openai.SYSTEM_PROMPT
