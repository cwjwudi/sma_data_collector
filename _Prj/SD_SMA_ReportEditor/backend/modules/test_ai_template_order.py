"""AI set_template_display_order：写入镜像排序 + pending/ui_reload。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import ai_asset_ops, ai_config, ai_runtime_ops, ai_tools, template_store
from schemas.report_template import LayoutSnapshot, ReportTemplate


@pytest.fixture()
def order_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    templates = data / "templates"
    templates.mkdir(parents=True)
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

    monkeypatch.setattr(ai_tools, "DATA_DIR", data)
    monkeypatch.setattr(ai_tools, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_runtime_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_runtime_ops, "_CLIENT_PREFS_MIRROR", mirror_path)
    monkeypatch.setattr(ai_asset_ops, "DATA_DIR", data)
    monkeypatch.setattr(template_store, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(template_store, "init_data_dirs", lambda: None)

    ids = []
    for i, name in enumerate(("甲", "乙", "丙"), start=1):
        tid = f"tpl-order-{i}"
        template_store.save_template(
            ReportTemplate(
                id=tid,
                name=name,
                updatedAt="2026-07-13T00:00:00Z",
                schemaVersion=4,
                layoutSnapshot=LayoutSnapshot(),
                coverLayoutSnapshot=LayoutSnapshot(),
                backLayoutSnapshot=LayoutSnapshot(),
            )
        )
        ids.append(tid)
    return data, cfg_path, mirror_path, ids


@pytest.mark.asyncio
async def test_set_order_by_ordered_ids(order_env):
    data, _cfg, mirror_path, ids = order_env
    a, b, c = ids
    result = await ai_tools.execute_tool(
        "set_template_display_order",
        {"ordered_ids": [c, a, b]},
    )
    assert result["ok"] is True
    assert result["order"][:3] == [c, a, b]

    got = await ai_tools.execute_tool("get_template_display_order", {})
    assert got["ok"] is True
    assert got["order"][:3] == [c, a, b]

    mirror = json.loads(mirror_path.read_text(encoding="utf-8"))
    assert mirror.get("pending_apply") is True
    assert mirror.get("template_display_order")[:3] == [c, a, b]
    assert mirror.get("ui_reload", {}).get("assets") is True
    assert mirror.get("ui_reload", {}).get("reason") == "set_template_display_order"


@pytest.mark.asyncio
async def test_set_order_by_move(order_env):
    _data, _cfg, _mirror, ids = order_env
    a, b, c = ids
    # 先设初始顺序 a,b,c
    await ai_tools.execute_tool("set_template_display_order", {"ordered_ids": [a, b, c]})
    # 把 c 移到 a 前面（from c to a，from 在后 → 插到 a 前）
    result = await ai_tools.execute_tool(
        "set_template_display_order",
        {"move": {"from_id": c, "to_id": a}},
    )
    assert result["ok"] is True
    assert result["order"][0] == c
    assert a in result["order"] and b in result["order"]


@pytest.mark.asyncio
async def test_set_order_requires_args(order_env):
    result = await ai_tools.execute_tool("set_template_display_order", {})
    assert result["ok"] is False
    assert "ordered_ids" in result["error"] or "move" in result["error"]


@pytest.mark.asyncio
async def test_set_order_invalid_move(order_env):
    _data, _cfg, _mirror, ids = order_env
    a, b, _c = ids
    await ai_tools.execute_tool("set_template_display_order", {"ordered_ids": [a, b]})
    result = await ai_tools.execute_tool(
        "set_template_display_order",
        {"move": {"from_id": a, "to_id": "missing"}},
    )
    assert result["ok"] is False


@pytest.mark.asyncio
async def test_set_order_blocked_when_write_disabled(order_env):
    _data, cfg_path, mirror_path, ids = order_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    result = await ai_tools.execute_tool(
        "set_template_display_order",
        {"ordered_ids": list(reversed(ids))},
    )
    assert result["ok"] is False
    assert "允许 AI 写入工具" in result["error"]
    assert not mirror_path.is_file()


@pytest.mark.asyncio
async def test_get_order_is_read_when_gate_off(order_env):
    _data, cfg_path, _mirror, ids = order_env
    await ai_tools.execute_tool("set_template_display_order", {"ordered_ids": ids})
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    got = await ai_tools.execute_tool("get_template_display_order", {})
    assert got["ok"] is True
    assert got["order"][:3] == ids


def test_system_prompt_mentions_display_order():
    from api.routers import ai_openai

    assert "set_template_display_order" in ai_openai.SYSTEM_PROMPT
    assert "get_template_display_order" in ai_openai.SYSTEM_PROMPT or "list_templates" in ai_openai.SYSTEM_PROMPT
