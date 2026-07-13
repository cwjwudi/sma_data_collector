"""能力矩阵 K：预检事实 + 模拟结批确认流（非口头导出）。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import (
    ai_config,
    ai_config_ops,
    ai_pending_actions,
    ai_pending_prompts,
    ai_tools,
    ai_work_chain,
    template_store,
)
from schemas.report_template import LayoutSnapshot, ReportTemplate


@pytest.fixture()
def export_ops_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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
    prompts_file = data / "ai_pending_prompts.json"
    prompts_file.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(ai_tools, "DATA_DIR", data)
    monkeypatch.setattr(ai_tools, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_config_ops, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_work_chain, "DATA_DIR", data)
    monkeypatch.setattr(ai_work_chain, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(template_store, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(template_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)

    tpl = ReportTemplate(
        id="tpl-k1",
        name="预检模版",
        updatedAt="2026-07-13T00:00:00Z",
        schemaVersion=4,
        layoutSnapshot=LayoutSnapshot(),
        coverLayoutSnapshot=LayoutSnapshot(),
        backLayoutSnapshot=LayoutSnapshot(),
    )
    template_store.save_template(tpl)
    return data, cfg_path, tpl


def _save_tpl(tid: str, name: str) -> ReportTemplate:
    tpl = ReportTemplate(
        id=tid,
        name=name,
        updatedAt="2026-07-13T00:00:00Z",
        schemaVersion=4,
        layoutSnapshot=LayoutSnapshot(),
        coverLayoutSnapshot=LayoutSnapshot(),
        backLayoutSnapshot=LayoutSnapshot(),
    )
    template_store.save_template(tpl)
    return tpl


@pytest.mark.asyncio
async def test_preflight_requires_template_id(export_ops_env) -> None:
    out = await ai_tools.execute_tool("preflight_export", {})
    assert out["ok"] is False
    assert "template_id" in str(out.get("error") or "")


@pytest.mark.asyncio
async def test_preflight_missing_template(export_ops_env) -> None:
    out = await ai_tools.execute_tool("preflight_export", {"template_id": "no-such"})
    assert out["ok"] is False
    assert "不存在" in str(out.get("error") or "")


@pytest.mark.asyncio
async def test_preflight_ready_empty_bindings(export_ops_env) -> None:
    _data, _cfg, tpl = export_ops_env
    out = await ai_tools.execute_tool("preflight_export", {"template_id": tpl.id})
    assert out["ok"] is True
    assert out["ready"] is True
    assert out["issue_count"] == 0
    assert out["issues"] == []
    assert out["template_name"] == "预检模版"
    assert "resolved_connections" in out


@pytest.mark.asyncio
async def test_preflight_works_when_write_gate_off(export_ops_env) -> None:
    """预检为 read，总闸关仍可用。"""
    _data, cfg_path, tpl = export_ops_env
    raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    raw["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    out = await ai_tools.execute_tool("preflight_export", {"template_id": tpl.id})
    assert out["ok"] is True
    assert out["ready"] is True


@pytest.mark.asyncio
async def test_request_manual_export_requires_id(export_ops_env) -> None:
    out = await ai_tools.execute_tool("request_manual_export", {})
    assert out["ok"] is False
    assert "template_id" in str(out.get("error") or "")


@pytest.mark.asyncio
async def test_request_manual_export_missing(export_ops_env) -> None:
    out = await ai_tools.execute_tool("request_manual_export", {"template_id": "no-such"})
    assert out["ok"] is False
    assert "不存在" in str(out.get("error") or "")


@pytest.mark.asyncio
async def test_request_manual_export_invalid_id(export_ops_env) -> None:
    out = await ai_tools.execute_tool("request_manual_export", {"template_id": "../evil"})
    assert out["ok"] is False


@pytest.mark.asyncio
async def test_request_manual_export_pending_then_confirm(export_ops_env) -> None:
    tpl = _save_tpl("tpl-k2", "模拟结批模版")
    out = await ai_tools.execute_tool("request_manual_export", {"template_id": tpl.id})
    assert out["ok"] is True
    assert out["status"] == "awaiting_user_confirm"
    prompt = out["prompt"]
    assert prompt["kind"] == "confirm_manual_export"
    assert prompt["payload"]["template_id"] == "tpl-k2"
    assert prompt["payload"]["template_name"] == "模拟结批模版"

    confirmed = await ai_pending_actions.apply_confirm(prompt["id"], True)
    assert confirmed["ok"] is True
    assert confirmed["client_action"] == "confirm_manual_export"
    assert confirmed["payload"]["template_id"] == "tpl-k2"


@pytest.mark.asyncio
async def test_request_manual_export_cancel(export_ops_env) -> None:
    tpl = _save_tpl("tpl-k3", "取消结批")
    out = await ai_tools.execute_tool("request_manual_export", {"template_id": tpl.id})
    cancelled = await ai_pending_actions.apply_confirm(out["prompt"]["id"], False)
    assert cancelled.get("cancelled") is True
    assert "client_action" not in cancelled
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_request_manual_export_write_gate(export_ops_env) -> None:
    _data, cfg_path, tpl = export_ops_env
    raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    raw["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    out = await ai_tools.execute_tool("request_manual_export", {"template_id": tpl.id})
    assert out["ok"] is False
    assert "写入" in str(out.get("error") or "") or "总闸" in str(out.get("error") or "") or "允许" in str(
        out.get("error") or ""
    )
