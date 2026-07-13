"""AI request_open_template / request_open_layout：确认后 client_action 打开编辑器。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import (
    ai_config,
    ai_pending_actions,
    ai_pending_prompts,
    ai_runtime_ops,
    ai_tools,
    layout_preset_store,
    template_store,
)
from schemas.layout_preset import LayoutPreset
from schemas.report_template import LayoutSnapshot, ReportTemplate


@pytest.fixture()
def open_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    templates = data / "templates"
    layouts = data / "layout_presets"
    templates.mkdir(parents=True)
    layouts.mkdir(parents=True)
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
    monkeypatch.setattr(ai_runtime_ops, "DATA_DIR", data)
    monkeypatch.setattr(template_store, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(layout_preset_store, "LAYOUT_PRESETS_DIR", layouts)
    monkeypatch.setattr(template_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(layout_preset_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)

    tpl = ReportTemplate(
        id="open-tpl-1",
        name="待打开模版",
        updatedAt="2026-07-13T00:00:00Z",
        schemaVersion=4,
        layoutSnapshot=LayoutSnapshot(),
        coverLayoutSnapshot=LayoutSnapshot(),
        backLayoutSnapshot=LayoutSnapshot(),
    )
    template_store.save_template(tpl)
    layout = LayoutPreset(
        id="open-layout-1",
        name="待打开版式",
        updatedAt="2026-07-13T00:00:00Z",
    )
    layout_preset_store.save_preset(layout)
    return data, cfg_path, tpl, layout


@pytest.mark.asyncio
async def test_open_template_awaits_confirm(open_env):
    _data, _cfg, tpl, _layout = open_env
    result = await ai_tools.execute_tool("request_open_template", {"template_id": tpl.id})
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_confirm"
    prompt = result["prompt"]
    assert prompt["kind"] == "open_editor"
    assert prompt["target_kind"] == "template"
    assert prompt["payload"]["editor"] == "template"
    assert prompt["payload"]["id"] == tpl.id


@pytest.mark.asyncio
async def test_open_template_confirm_returns_client_action(open_env):
    _data, _cfg, tpl, _layout = open_env
    req = await ai_tools.execute_tool("request_open_template", {"template_id": tpl.id})
    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["ok"] is True
    assert applied["client_action"] == "open_editor"
    assert applied["payload"]["editor"] == "template"
    assert applied["payload"]["id"] == tpl.id
    # 资产仍在（打开不是删除）
    assert template_store.load_template(tpl.id) is not None


@pytest.mark.asyncio
async def test_open_template_cancel_keeps_pending_cleared(open_env):
    _data, _cfg, tpl, _layout = open_env
    req = await ai_tools.execute_tool("request_open_template", {"template_id": tpl.id})
    cancelled = await ai_pending_actions.apply_confirm(req["prompt"]["id"], False)
    assert cancelled.get("cancelled") is True
    assert "client_action" not in cancelled
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_open_layout_confirm_returns_client_action(open_env):
    _data, _cfg, _tpl, layout = open_env
    req = await ai_tools.execute_tool("request_open_layout", {"layout_id": layout.id})
    assert req["status"] == "awaiting_user_confirm"
    assert req["prompt"]["payload"]["editor"] == "layout"
    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["client_action"] == "open_editor"
    assert applied["payload"]["editor"] == "layout"
    assert applied["payload"]["id"] == layout.id


@pytest.mark.asyncio
async def test_open_missing_and_empty_ids(open_env):
    r1 = await ai_tools.execute_tool("request_open_template", {"template_id": ""})
    r2 = await ai_tools.execute_tool("request_open_template", {"template_id": "no-such"})
    r3 = await ai_tools.execute_tool("request_open_layout", {"layout_id": "bad id!"})
    r4 = await ai_tools.execute_tool("request_open_layout", {"layout_id": ""})
    assert r1["ok"] is False and "template_id" in r1["error"]
    assert r2["ok"] is False and "不存在" in r2["error"]
    assert r3["ok"] is False
    assert r4["ok"] is False and "layout_id" in r4["error"]
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_open_blocked_when_write_disabled(open_env):
    _data, cfg_path, tpl, layout = open_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    r1 = await ai_tools.execute_tool("request_open_template", {"template_id": tpl.id})
    r2 = await ai_tools.execute_tool("request_open_layout", {"layout_id": layout.id})
    assert r1["ok"] is False and "允许 AI 写入工具" in r1["error"]
    assert r2["ok"] is False and "允许 AI 写入工具" in r2["error"]
    assert ai_pending_prompts.count_pending() == 0


def test_open_tools_are_confirm_risk():
    from modules import ai_tool_catalog

    assert "request_open_template" in ai_tool_catalog.CONFIRM_TOOLS
    assert "request_open_layout" in ai_tool_catalog.CONFIRM_TOOLS


def test_system_prompt_open_editor_rules():
    from api.routers import ai_openai

    assert "request_open_template" in ai_openai.SYSTEM_PROMPT
    assert "request_open_layout" in ai_openai.SYSTEM_PROMPT
    assert "已打开" in ai_openai.SYSTEM_PROMPT
