"""AI delete_template / delete_layout_preset：确认流 + 落盘删除 + assets reload。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import (
    ai_asset_ops,
    ai_config,
    ai_pending_actions,
    ai_pending_prompts,
    ai_tools,
    layout_preset_store,
    template_store,
)
from schemas.layout_preset import LayoutPreset
from schemas.report_template import LayoutSnapshot, ReportTemplate


@pytest.fixture()
def delete_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    templates = data / "templates"
    layouts = data / "layout_presets"
    templates.mkdir(parents=True)
    layouts.mkdir(parents=True)
    cfg_path = data / "config.json"
    cfg_path.write_text(
        json.dumps(
            {
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
    monkeypatch.setattr(ai_asset_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(template_store, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(layout_preset_store, "LAYOUT_PRESETS_DIR", layouts)
    monkeypatch.setattr(template_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(layout_preset_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)

    tpl = ReportTemplate(
        id="del-tpl-1",
        name="待删模版",
        updatedAt="2026-07-13T00:00:00Z",
        schemaVersion=4,
        layoutSnapshot=LayoutSnapshot(),
        coverLayoutSnapshot=LayoutSnapshot(),
        backLayoutSnapshot=LayoutSnapshot(),
    )
    template_store.save_template(tpl)
    layout = LayoutPreset(
        id="del-layout-1",
        name="待删版式",
        updatedAt="2026-07-13T00:00:00Z",
    )
    layout_preset_store.save_preset(layout)
    return data, cfg_path, tpl, layout


@pytest.mark.asyncio
async def test_delete_template_request_awaits_confirm_without_deleting(delete_env):
    data, _cfg, tpl, _layout = delete_env
    result = await ai_tools.execute_tool("delete_template", {"template_id": tpl.id})
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_confirm"
    assert result["prompt"]["kind"] == "confirm_delete"
    assert result["prompt"]["target_kind"] == "template"
    assert result["prompt"]["connection_id"] == tpl.id
    assert template_store.load_template(tpl.id) is not None
    # 仅 pending，尚未 mark_ui_reload
    assert not (data / "client_prefs_mirror.json").is_file()


@pytest.mark.asyncio
async def test_delete_template_confirm_removes_and_reloads(delete_env):
    data, _cfg, tpl, _layout = delete_env
    req = await ai_tools.execute_tool("delete_template", {"template_id": tpl.id})
    prompt_id = req["prompt"]["id"]
    applied = await ai_pending_actions.apply_confirm(prompt_id, True)
    assert applied["ok"] is True
    assert applied["deleted"] == tpl.id
    assert template_store.load_template(tpl.id) is None

    listed = await ai_tools.execute_tool("list_templates", {})
    ids = {t["id"] for t in listed.get("templates") or []}
    assert tpl.id not in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("assets") is True
    assert mirror.get("ui_reload", {}).get("reason") == "delete_template"


@pytest.mark.asyncio
async def test_delete_template_cancel_keeps_asset(delete_env):
    _data, _cfg, tpl, _layout = delete_env
    req = await ai_tools.execute_tool("delete_template", {"template_id": tpl.id})
    prompt_id = req["prompt"]["id"]
    cancelled = await ai_pending_actions.apply_confirm(prompt_id, False)
    assert cancelled.get("cancelled") is True
    assert template_store.load_template(tpl.id) is not None


@pytest.mark.asyncio
async def test_delete_layout_confirm_removes_and_reloads(delete_env):
    data, _cfg, _tpl, layout = delete_env
    req = await ai_tools.execute_tool("delete_layout_preset", {"layout_id": layout.id})
    assert req["status"] == "awaiting_user_confirm"
    assert layout_preset_store.load_preset(layout.id) is not None

    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["ok"] is True
    assert applied["deleted"] == layout.id
    assert layout_preset_store.load_preset(layout.id) is None

    listed = await ai_tools.execute_tool("list_layout_presets", {})
    ids = {x["id"] for x in listed.get("layouts") or []}
    assert layout.id not in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("assets") is True
    assert mirror.get("ui_reload", {}).get("reason") == "delete_layout"


@pytest.mark.asyncio
async def test_delete_layout_cancel_keeps_asset(delete_env):
    _data, _cfg, _tpl, layout = delete_env
    req = await ai_tools.execute_tool("delete_layout_preset", {"layout_id": layout.id})
    cancelled = await ai_pending_actions.apply_confirm(req["prompt"]["id"], False)
    assert cancelled.get("cancelled") is True
    assert layout_preset_store.load_preset(layout.id) is not None


@pytest.mark.asyncio
async def test_delete_missing_template(delete_env):
    result = await ai_tools.execute_tool("delete_template", {"template_id": "no-such-tpl"})
    assert result["ok"] is False
    assert "不存在" in result["error"]


@pytest.mark.asyncio
async def test_delete_empty_ids(delete_env):
    r1 = await ai_tools.execute_tool("delete_template", {"template_id": ""})
    r2 = await ai_tools.execute_tool("delete_layout_preset", {"layout_id": "  "})
    assert r1["ok"] is False and "template_id" in r1["error"]
    assert r2["ok"] is False and "layout_id" in r2["error"]


@pytest.mark.asyncio
async def test_delete_invalid_id_does_not_raise(delete_env):
    r1 = await ai_tools.execute_tool("delete_template", {"template_id": "bad id!"})
    r2 = await ai_tools.execute_tool("delete_layout_preset", {"layout_id": "bad id!"})
    assert r1["ok"] is False
    assert r2["ok"] is False


@pytest.mark.asyncio
async def test_delete_blocked_when_write_disabled(delete_env):
    _data, cfg_path, tpl, layout = delete_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    r1 = await ai_tools.execute_tool("delete_template", {"template_id": tpl.id})
    r2 = await ai_tools.execute_tool("delete_layout_preset", {"layout_id": layout.id})
    assert r1["ok"] is False and "写入" in r1["error"]
    assert r2["ok"] is False and "写入" in r2["error"]
    assert template_store.load_template(tpl.id) is not None
    assert layout_preset_store.load_preset(layout.id) is not None


def test_delete_tools_are_confirm_risk():
    from modules import ai_tool_catalog

    assert "delete_template" in ai_tool_catalog.CONFIRM_TOOLS
    assert "delete_layout_preset" in ai_tool_catalog.CONFIRM_TOOLS


def test_system_prompt_mentions_delete_confirm_flow():
    from api.routers import ai_openai

    assert "delete_template" in ai_openai.SYSTEM_PROMPT
    assert "delete_layout_preset" in ai_openai.SYSTEM_PROMPT
    assert "awaiting_user_confirm" in ai_openai.SYSTEM_PROMPT
    assert "已删除" in ai_openai.SYSTEM_PROMPT
