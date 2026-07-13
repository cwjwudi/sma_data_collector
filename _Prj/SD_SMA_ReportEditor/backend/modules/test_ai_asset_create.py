"""AI create_blank_* / create_binding_smoke_template：落盘 + reload；无连接时冒烟明确失败。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import ai_asset_ops, ai_config, ai_demo_template_ops, ai_tools, layout_preset_store, template_store


@pytest.fixture()
def create_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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

    monkeypatch.setattr(ai_tools, "DATA_DIR", data)
    monkeypatch.setattr(ai_tools, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_asset_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_demo_template_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_demo_template_ops, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(template_store, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(layout_preset_store, "LAYOUT_PRESETS_DIR", layouts)
    monkeypatch.setattr(template_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(layout_preset_store, "init_data_dirs", lambda: None)
    return data, cfg_path


@pytest.mark.asyncio
async def test_create_blank_template_persists_and_reloads(create_env):
    data, _cfg = create_env
    result = await ai_tools.execute_tool("create_blank_template", {"name": "空白甲"})
    assert result["ok"] is True
    tid = result["template_id"]
    assert result["name"] == "空白甲"
    loaded = template_store.load_template(tid)
    assert loaded is not None
    assert loaded.name == "空白甲"

    listed = await ai_tools.execute_tool("list_templates", {})
    ids = {t["id"] for t in listed.get("templates") or []}
    assert tid in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("assets") is True
    assert mirror.get("ui_reload", {}).get("reason") == "create_blank_template"


@pytest.mark.asyncio
async def test_create_blank_template_default_name(create_env):
    result = await ai_tools.execute_tool("create_blank_template", {"name": ""})
    assert result["ok"] is True
    assert result["name"] == "新建模版"


@pytest.mark.asyncio
async def test_create_blank_layout_persists_and_reloads(create_env):
    data, _cfg = create_env
    result = await ai_tools.execute_tool("create_blank_layout", {"name": "空白版式"})
    assert result["ok"] is True
    lid = result["layout_id"]
    assert result["name"] == "空白版式"
    loaded = layout_preset_store.load_preset(lid)
    assert loaded is not None

    listed = await ai_tools.execute_tool("list_layout_presets", {})
    ids = {x["id"] for x in listed.get("layouts") or []}
    assert lid in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("reason") == "create_blank_layout"


@pytest.mark.asyncio
async def test_create_blank_layout_default_name(create_env):
    result = await ai_tools.execute_tool("create_blank_layout", {})
    assert result["ok"] is True
    assert result["name"] == "新建版式"


@pytest.mark.asyncio
async def test_create_blank_blocked_when_write_disabled(create_env):
    data, cfg_path = create_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    r1 = await ai_tools.execute_tool("create_blank_template", {"name": "x"})
    r2 = await ai_tools.execute_tool("create_blank_layout", {"name": "y"})
    assert r1["ok"] is False and "允许 AI 写入工具" in r1["error"]
    assert r2["ok"] is False and "允许 AI 写入工具" in r2["error"]
    assert len([p for p in (data / "templates").glob("*.json") if not p.name.endswith(".meta.json")]) == 0
    assert len(list((data / "layout_presets").glob("*.json"))) == 0


@pytest.mark.asyncio
async def test_smoke_template_fails_without_connections(create_env):
    """演示库工具已下线；冒烟需已有连接，无连接须明确失败且不落盘。"""
    data, _cfg = create_env
    result = await ai_tools.execute_tool("create_binding_smoke_template", {"name": "冒烟"})
    assert result["ok"] is False
    assert "数据库连接" in result["error"] or "连接" in result["error"]
    assert len([p for p in (data / "templates").glob("*.json") if not p.name.endswith(".meta.json")]) == 0
    assert not (data / "client_prefs_mirror.json").is_file()


@pytest.mark.asyncio
async def test_smoke_template_fails_without_opc_when_db_present(create_env):
    _data, cfg_path = create_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["db_connections"] = [
        {
            "id": "db1",
            "name": "OnlyDB",
            "engine": "mysql",
            "host": "127.0.0.1",
            "database": "demo",
            "username": "u",
        }
    ]
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    result = await ai_tools.execute_tool("create_binding_smoke_template", {})
    assert result["ok"] is False
    assert "OPC" in result["error"]


def test_create_tools_are_write_risk():
    from modules import ai_tool_catalog

    assert "create_blank_template" in ai_tool_catalog.WRITE_TOOLS
    assert "create_blank_layout" in ai_tool_catalog.WRITE_TOOLS
    assert "create_binding_smoke_template" in ai_tool_catalog.WRITE_TOOLS
    assert "ensure_user_demo_database" not in ai_tool_catalog.TOOL_META


def test_system_prompt_mentions_create_blank():
    from api.routers import ai_openai

    assert "create_blank" in ai_openai.SYSTEM_PROMPT or "create_blank_template" in ai_openai.SYSTEM_PROMPT
    assert "create_binding_smoke_template" in ai_openai.SYSTEM_PROMPT
