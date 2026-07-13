"""AI set_export_dir / request_pick_export_dir：路径写入镜像或 pending 选目录。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import ai_config, ai_config_ops, ai_pending_actions, ai_pending_prompts, ai_tools


@pytest.fixture()
def export_dir_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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
    mirror_path = data / "client_prefs_mirror.json"
    prompts_file = data / "ai_pending_prompts.json"
    prompts_file.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(ai_tools, "DATA_DIR", data)
    monkeypatch.setattr(ai_tools, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_config_ops, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config_ops, "_CLIENT_PREFS_MIRROR", mirror_path)
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)
    return data, cfg_path, mirror_path


@pytest.mark.asyncio
async def test_set_export_dir_writes_mirror(export_dir_env):
    _data, _cfg, mirror_path = export_dir_env
    path = "/tmp/report-export-out"
    result = await ai_tools.execute_tool("set_export_dir", {"path": path})
    assert result["ok"] is True
    assert result["path"] == path

    mirror = json.loads(mirror_path.read_text(encoding="utf-8"))
    assert mirror.get("pending_apply") is True
    assert mirror.get("pending_token")
    assert mirror["report_generator"]["autoExportDir"] == path
    assert mirror["report_generator"]["autoExportDirSource"] == "default"
    assert mirror["report_export"]["watchDir"] == path

    got = await ai_tools.execute_tool("get_export_dir_prefs", {})
    assert got["ok"] is True
    assert got["auto_export_dir"] == path
    assert got["watch_dir"] == path


@pytest.mark.asyncio
async def test_set_export_dir_rejects_empty(export_dir_env):
    result = await ai_tools.execute_tool("set_export_dir", {"path": "  "})
    assert result["ok"] is False
    assert "路径" in result["error"]


@pytest.mark.asyncio
async def test_pick_export_dir_awaits_user_action(export_dir_env):
    result = await ai_tools.execute_tool("request_pick_export_dir", {})
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_action"
    prompt = result["prompt"]
    assert prompt["kind"] == "pick_export_dir"
    assert prompt["payload"]["action"] == "set_export_dir"
    assert ai_pending_prompts.count_pending() == 1


@pytest.mark.asyncio
async def test_pick_export_dir_cancel(export_dir_env):
    req = await ai_tools.execute_tool("request_pick_export_dir", {})
    cancelled = await ai_pending_actions.apply_confirm(req["prompt"]["id"], False)
    assert cancelled.get("cancelled") is True
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_pick_export_dir_confirm_returns_client_action(export_dir_env):
    """确认后由前端调 Electron 选目录；后端只返回 client_action。"""
    req = await ai_tools.execute_tool("request_pick_export_dir", {})
    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["ok"] is True
    assert applied["client_action"] == "pick_export_dir"
    assert applied["payload"]["action"] == "set_export_dir"


@pytest.mark.asyncio
async def test_export_dir_blocked_when_write_disabled(export_dir_env):
    _data, cfg_path, mirror_path = export_dir_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    r1 = await ai_tools.execute_tool("set_export_dir", {"path": "/tmp/x"})
    r2 = await ai_tools.execute_tool("request_pick_export_dir", {})
    assert r1["ok"] is False and "允许 AI 写入工具" in r1["error"]
    assert r2["ok"] is False and "允许 AI 写入工具" in r2["error"]
    assert not mirror_path.is_file()
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_get_export_dir_prefs_read_when_gate_off(export_dir_env):
    _data, cfg_path, _mirror = export_dir_env
    await ai_tools.execute_tool("set_export_dir", {"path": "/tmp/keep"})
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    got = await ai_tools.execute_tool("get_export_dir_prefs", {})
    assert got["ok"] is True
    assert got["auto_export_dir"] == "/tmp/keep"


def test_system_prompt_export_dir_rules():
    from api.routers import ai_openai

    assert "set_export_dir" in ai_openai.SYSTEM_PROMPT
    assert "request_pick_export_dir" in ai_openai.SYSTEM_PROMPT
    assert "awaiting_user_action" in ai_openai.SYSTEM_PROMPT
