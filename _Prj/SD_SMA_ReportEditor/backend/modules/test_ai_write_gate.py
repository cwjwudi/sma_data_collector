"""能力矩阵 F：写入总闸关闭时，全部 write/confirm 工具拒绝且状态不变。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import ai_tools  # 须先于 ai_tool_catalog，避免循环导入
from modules import ai_config, ai_pending_prompts, ai_tool_catalog


@pytest.fixture()
def gate_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    data.mkdir(parents=True)
    (data / "templates").mkdir()
    (data / "layout_presets").mkdir()
    cfg_path = data / "config.json"
    cfg = {
        "schema_version": 1,
        "db_connections": [{"id": "db1", "name": "Keep", "engine": "mysql", "host": "127.0.0.1"}],
        "opcua_servers": [],
        "app_preferences": {"connection_probe_enabled": False},
        "ai_settings": {"write_tools_enabled": False, "enabled": True},
    }
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    prompts_file = data / "ai_pending_prompts.json"
    prompts_file.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(ai_tools, "DATA_DIR", data)
    monkeypatch.setattr(ai_tools, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)
    return data, cfg_path, json.dumps(cfg, sort_keys=True, ensure_ascii=False)


_GATED = sorted(ai_tool_catalog.WRITE_TOOLS | ai_tool_catalog.CONFIRM_TOOLS)


@pytest.mark.asyncio
@pytest.mark.parametrize("tool_name", _GATED)
async def test_every_write_confirm_blocked_when_gate_off(gate_env, tool_name: str):
    _data, cfg_path, cfg_before = gate_env
    result = await ai_tools.execute_tool(tool_name, {})
    assert result["ok"] is False, tool_name
    assert result["error"] == ai_tools.WRITE_TOOLS_DISABLED_ERROR, tool_name
    assert "允许 AI 写入工具" in result["error"]
    # 不得创建 pending / 改配置
    assert ai_pending_prompts.count_pending() == 0
    cfg_after = cfg_path.read_text(encoding="utf-8")
    assert json.dumps(json.loads(cfg_after), sort_keys=True, ensure_ascii=False) == cfg_before


@pytest.mark.asyncio
async def test_read_tools_still_work_when_gate_off(gate_env):
    ver = await ai_tools.execute_tool("get_app_version_and_endpoints", {})
    assert isinstance(ver, dict)
    assert ver.get("error") != ai_tools.WRITE_TOOLS_DISABLED_ERROR
    assert "version" in ver or ver.get("ok") is True

    listed = await ai_tools.execute_tool("list_templates", {})
    assert listed.get("error") != ai_tools.WRITE_TOOLS_DISABLED_ERROR
    assert listed.get("ok") is True or "templates" in listed

    summary = await ai_tools.execute_tool("export_config_share_summary", {})
    assert summary.get("error") != ai_tools.WRITE_TOOLS_DISABLED_ERROR
    assert summary.get("ok") is True
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_gate_on_allows_write_probe(gate_env):
    """对照：打开总闸后 write 工具可越过门禁（探活本身可能因缺参失败，但不得再报总闸文案）。"""
    _data, cfg_path, _before = gate_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = True
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    result = await ai_tools.execute_tool("update_connection_probe_settings", {"enabled": True})
    assert result.get("error") != ai_tools.WRITE_TOOLS_DISABLED_ERROR
    assert result.get("ok") is True


def test_write_and_confirm_sets_non_empty():
    assert len(ai_tool_catalog.WRITE_TOOLS) >= 10
    assert len(ai_tool_catalog.CONFIRM_TOOLS) >= 5
    # 目录与执行门禁集合一致
    assert ai_tools._WRITE_TOOLS == ai_tool_catalog.WRITE_TOOLS
    assert ai_tools._CONFIRM_TOOLS == ai_tool_catalog.CONFIRM_TOOLS


def test_system_prompt_mentions_write_gate():
    from api.routers import ai_openai

    assert "允许 AI 写入工具" in ai_openai.SYSTEM_PROMPT
    assert "写入总闸" in ai_openai.SYSTEM_PROMPT or "总闸" in ai_openai.SYSTEM_PROMPT
