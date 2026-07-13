"""AI copy_template / copy_layout_preset：落盘 + mark_ui_reload(assets)。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import ai_asset_ops, ai_config, ai_tools, layout_preset_store, template_store
from schemas.layout_preset import LayoutPreset
from schemas.report_template import LayoutSnapshot, ReportTemplate


@pytest.fixture()
def asset_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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

    monkeypatch.setattr(ai_tools, "DATA_DIR", data)
    monkeypatch.setattr(ai_tools, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_asset_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(template_store, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(layout_preset_store, "LAYOUT_PRESETS_DIR", layouts)
    monkeypatch.setattr(template_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(layout_preset_store, "init_data_dirs", lambda: None)

    src_tpl = ReportTemplate(
        id="src-tpl-1",
        name="源模版",
        updatedAt="2026-07-13T00:00:00Z",
        schemaVersion=4,
        layoutSnapshot=LayoutSnapshot(),
        coverLayoutSnapshot=LayoutSnapshot(),
        backLayoutSnapshot=LayoutSnapshot(),
    )
    template_store.save_template(src_tpl)

    src_layout = LayoutPreset(
        id="src-layout-1",
        name="源版式",
        updatedAt="2026-07-13T00:00:00Z",
    )
    layout_preset_store.save_preset(src_layout)

    return data, cfg_path, src_tpl, src_layout


@pytest.mark.asyncio
async def test_copy_template_persists_and_marks_assets_reload(asset_env):
    data, _cfg, src, _layout = asset_env
    result = await ai_tools.execute_tool(
        "copy_template",
        {"source_id": src.id, "new_name": "模版副本"},
    )
    assert result["ok"] is True
    new_id = result["template_id"]
    assert new_id != src.id
    assert result["name"] == "模版副本"

    loaded = template_store.load_template(new_id)
    assert loaded is not None
    assert loaded.name == "模版副本"
    assert template_store.load_template(src.id) is not None

    ids = {s.id for s in template_store.list_summaries()}
    assert src.id in ids and new_id in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("pending_apply") is True
    assert mirror.get("ui_reload", {}).get("assets") is True
    assert mirror.get("ui_reload", {}).get("reason") == "copy_template"


@pytest.mark.asyncio
async def test_copy_layout_preset_persists_and_marks_assets_reload(asset_env):
    data, _cfg, _tpl, src = asset_env
    result = await ai_tools.execute_tool(
        "copy_layout_preset",
        {"source_id": src.id, "new_name": "版式副本"},
    )
    assert result["ok"] is True
    new_id = result["layout_id"]
    assert new_id != src.id
    assert result["name"] == "版式副本"

    loaded = layout_preset_store.load_preset(new_id)
    assert loaded is not None
    assert loaded.name == "版式副本"
    assert layout_preset_store.load_preset(src.id) is not None

    ids = {s.id for s in layout_preset_store.list_summaries()}
    assert src.id in ids and new_id in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("assets") is True
    assert mirror.get("ui_reload", {}).get("reason") == "copy_layout_preset"


@pytest.mark.asyncio
async def test_copy_template_default_name_when_empty(asset_env):
    _data, _cfg, src, _layout = asset_env
    result = await ai_tools.execute_tool("copy_template", {"source_id": src.id, "new_name": ""})
    assert result["ok"] is True
    assert "副本" in result["name"]


@pytest.mark.asyncio
async def test_copy_template_missing_source(asset_env):
    result = await ai_tools.execute_tool(
        "copy_template",
        {"source_id": "missing-id", "new_name": "x"},
    )
    assert result["ok"] is False
    assert "不存在" in result["error"]


@pytest.mark.asyncio
async def test_copy_layout_missing_source(asset_env):
    result = await ai_tools.execute_tool(
        "copy_layout_preset",
        {"source_id": "missing-layout", "new_name": "x"},
    )
    assert result["ok"] is False
    assert "不存在" in result["error"]


@pytest.mark.asyncio
async def test_copy_blocked_when_write_disabled(asset_env):
    data, cfg_path, src, layout = asset_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    r1 = await ai_tools.execute_tool("copy_template", {"source_id": src.id, "new_name": "n"})
    r2 = await ai_tools.execute_tool("copy_layout_preset", {"source_id": layout.id, "new_name": "n"})
    assert r1["ok"] is False and "写入工具" in r1["error"]
    assert r2["ok"] is False and "写入工具" in r2["error"]
    assert len([p for p in (data / "templates").glob("*.json") if not p.name.endswith(".meta.json")]) == 1
    assert len(list((data / "layout_presets").glob("*.json"))) == 1


def test_system_prompt_mentions_copy_tools():
    from api.routers import ai_openai

    assert "copy_template" in ai_openai.SYSTEM_PROMPT
    assert "copy_layout_preset" in ai_openai.SYSTEM_PROMPT
    assert "模版/版式" in ai_openai.SYSTEM_PROMPT
