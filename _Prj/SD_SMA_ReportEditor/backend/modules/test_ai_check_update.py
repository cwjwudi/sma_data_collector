"""能力矩阵 N：检查更新仅排队确认；不自动安装；禁空口「已安装」。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import (
    ai_claim_guard,
    ai_config,
    ai_config_ops,
    ai_pending_actions,
    ai_pending_prompts,
    ai_tools,
)


@pytest.fixture()
def update_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    data.mkdir(parents=True)
    cfg_path = data / "config.json"
    cfg_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "db_connections": [],
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
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)
    return data, cfg_path


@pytest.mark.asyncio
async def test_request_check_app_update_awaits_confirm(update_env):
    out = await ai_tools.execute_tool("request_check_app_update", {})
    assert out["ok"] is True
    assert out["status"] == "awaiting_user_confirm"
    prompt = out["prompt"]
    assert prompt["kind"] == "check_update"
    assert prompt["target_kind"] == "app"
    assert prompt["payload"]["auto_install"] is False
    assert "不会自动安装" in prompt["message"]
    assert ai_pending_prompts.count_pending() == 1


@pytest.mark.asyncio
async def test_check_update_confirm_returns_client_action(update_env):
    req = await ai_tools.execute_tool("request_check_app_update", {})
    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["ok"] is True
    assert applied["client_action"] == "check_update"
    assert applied["payload"].get("auto_install") is False


@pytest.mark.asyncio
async def test_check_update_cancel(update_env):
    req = await ai_tools.execute_tool("request_check_app_update", {})
    cancelled = await ai_pending_actions.apply_confirm(req["prompt"]["id"], False)
    assert cancelled.get("cancelled") is True
    assert "client_action" not in cancelled
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_check_update_write_gate(update_env):
    _data, cfg_path = update_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    out = await ai_tools.execute_tool("request_check_app_update", {})
    assert out["ok"] is False
    assert "允许 AI 写入工具" in out["error"]
    assert ai_pending_prompts.count_pending() == 0


def test_update_install_claim_always_rewritten():
    assert ai_claim_guard.detect_update_install_claim("已帮你安装新版本") is True
    assert ai_claim_guard.detect_update_install_claim("请确认后检查更新") is False
    text = ai_claim_guard.rewrite_update_install_claim("已安装")
    assert "不会自动安装" in text
    assert "已安装" not in text or "不会" in text
