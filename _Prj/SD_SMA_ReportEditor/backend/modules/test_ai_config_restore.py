"""AI request_config_import_merge / request_config_reset：确认流 + 生效 + ui_reload。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import (
    ai_asset_ops,
    ai_config,
    ai_config_ops,
    ai_pending_actions,
    ai_pending_prompts,
    ai_tools,
    template_store,
)
from schemas.report_template import LayoutSnapshot, ReportTemplate


@pytest.fixture()
def restore_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    templates = data / "templates"
    layouts = data / "layout_presets"
    signatures = data / "signatures"
    audit_dir = data / "audit"
    for d in (templates, layouts, signatures, audit_dir):
        d.mkdir(parents=True)
    cfg_path = data / "config.json"
    cfg_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "db_connections": [
                    {
                        "id": "keep-db",
                        "name": "KeepDB",
                        "engine": "mysql",
                        "host": "127.0.0.1",
                        "port": 3306,
                        "database": "keep",
                        "username": "u",
                        "password": "KEEP-SECRET",
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
    query_file = data / "query_sessions.json"
    query_file.write_text(json.dumps({"favorites": [{"id": "f1"}], "history": []}), encoding="utf-8")

    monkeypatch.setattr(ai_tools, "DATA_DIR", data)
    monkeypatch.setattr(ai_tools, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config, "DATA_DIR", data)
    monkeypatch.setattr(ai_config, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_config_ops, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_config_ops, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(ai_config_ops, "LAYOUT_PRESETS_DIR", layouts)
    monkeypatch.setattr(ai_config_ops, "SIGNATURE_ASSETS_DIR", signatures)
    monkeypatch.setattr(ai_config_ops, "QUERY_SESSION_FILE", query_file)
    monkeypatch.setattr(ai_config_ops, "_CLIENT_PREFS_MIRROR", data / "client_prefs_mirror.json")
    monkeypatch.setattr(ai_asset_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)
    monkeypatch.setattr(ai_pending_prompts, "_IMPORT_DIR", data / "ai_pending_imports")
    monkeypatch.setattr(template_store, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(template_store, "init_data_dirs", lambda: None)

    tpl = ReportTemplate(
        id="tpl-before-reset",
        name="复位前模版",
        updatedAt="2026-07-13T00:00:00Z",
        schemaVersion=4,
        layoutSnapshot=LayoutSnapshot(),
        coverLayoutSnapshot=LayoutSnapshot(),
        backLayoutSnapshot=LayoutSnapshot(),
    )
    template_store.save_template(tpl)
    return data, cfg_path, tpl


@pytest.mark.asyncio
async def test_reset_request_awaits_without_clearing(restore_env):
    _data, cfg_path, tpl = restore_env
    result = await ai_tools.execute_tool("request_config_reset", {})
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_confirm"
    assert result["prompt"]["kind"] == "confirm_reset"
    assert template_store.load_template(tpl.id) is not None
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert any(c.get("id") == "keep-db" for c in cfg.get("db_connections") or [])


@pytest.mark.asyncio
async def test_reset_cancel_keeps_state(restore_env):
    _data, cfg_path, tpl = restore_env
    req = await ai_tools.execute_tool("request_config_reset", {})
    cancelled = await ai_pending_actions.apply_confirm(req["prompt"]["id"], False)
    assert cancelled.get("cancelled") is True
    assert template_store.load_template(tpl.id) is not None
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert any(c.get("id") == "keep-db" for c in cfg.get("db_connections") or [])


@pytest.mark.asyncio
async def test_reset_confirm_clears_and_marks_reload(restore_env):
    data, cfg_path, tpl = restore_env
    req = await ai_tools.execute_tool("request_config_reset", {})
    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["ok"] is True
    assert template_store.load_template(tpl.id) is None
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert cfg.get("db_connections") == [] or not cfg.get("db_connections")
    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("assets") is True
    assert mirror.get("ui_reload", {}).get("datasource") is True
    assert mirror.get("ui_reload", {}).get("reason") == "config_reset"


@pytest.mark.asyncio
async def test_import_merge_request_stores_payload_not_in_public_prompt(restore_env):
    result = await ai_tools.execute_tool(
        "request_config_import_merge",
        {
            "bundle": {
                "schema_version": 1,
                "db_connections": [
                    {
                        "id": "merged-db",
                        "name": "MergedDB",
                        "engine": "mysql",
                        "host": "10.0.0.1",
                        "password": "IMPORT-SECRET",
                    }
                ],
                "opcua_servers": [],
            }
        },
    )
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_confirm"
    assert result["prompt"]["kind"] == "confirm_import_merge"
    dumped = json.dumps(result, ensure_ascii=False)
    assert "IMPORT-SECRET" not in dumped
    pending = ai_pending_prompts.list_pending()
    assert "IMPORT-SECRET" not in json.dumps(pending, ensure_ascii=False)


@pytest.mark.asyncio
async def test_import_merge_cancel_keeps_config(restore_env):
    _data, cfg_path, _tpl = restore_env
    req = await ai_tools.execute_tool(
        "request_config_import_merge",
        {
            "bundle": {
                "schema_version": 1,
                "db_connections": [{"id": "x", "name": "X", "engine": "mysql", "host": "1.1.1.1"}],
                "opcua_servers": [],
            }
        },
    )
    cancelled = await ai_pending_actions.apply_confirm(req["prompt"]["id"], False)
    assert cancelled.get("cancelled") is True
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    ids = {c.get("id") for c in cfg.get("db_connections") or []}
    assert "keep-db" in ids
    assert "x" not in ids


@pytest.mark.asyncio
async def test_import_merge_confirm_applies_and_marks_reload(restore_env):
    data, cfg_path, _tpl = restore_env
    req = await ai_tools.execute_tool(
        "request_config_import_merge",
        {
            "bundle": {
                "schema_version": 1,
                "db_connections": [
                    {
                        "id": "merged-db",
                        "name": "MergedDB",
                        "engine": "mysql",
                        "host": "10.0.0.2",
                        "password": "IMPORT-SECRET",
                    }
                ],
                "opcua_servers": [],
            }
        },
    )
    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["ok"] is True
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    ids = {c.get("id") for c in cfg.get("db_connections") or []}
    assert "keep-db" in ids
    assert "merged-db" in ids
    # 明文口令不应残留在 config（应加密或剥离）
    row = next(c for c in cfg["db_connections"] if c["id"] == "merged-db")
    assert row.get("password") in (None, "")
    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("reason") == "config_import_merge"


@pytest.mark.asyncio
async def test_import_merge_rejects_non_object(restore_env):
    result = await ai_tools.execute_tool("request_config_import_merge", {"bundle": "nope"})
    assert result["ok"] is False


@pytest.mark.asyncio
async def test_restore_tools_blocked_when_write_disabled(restore_env):
    _data, cfg_path, _tpl = restore_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    r1 = await ai_tools.execute_tool("request_config_reset", {})
    r2 = await ai_tools.execute_tool(
        "request_config_import_merge",
        {"bundle": {"schema_version": 1, "db_connections": [], "opcua_servers": []}},
    )
    assert r1["ok"] is False and "写入" in r1["error"]
    assert r2["ok"] is False and "写入" in r2["error"]
    assert ai_pending_prompts.count_pending() == 0


def test_restore_tools_are_confirm_risk():
    from modules import ai_tool_catalog

    assert "request_config_reset" in ai_tool_catalog.CONFIRM_TOOLS
    assert "request_config_import_merge" in ai_tool_catalog.CONFIRM_TOOLS


def test_system_prompt_restore_rules():
    from api.routers import ai_openai

    assert "request_config_reset" in ai_openai.SYSTEM_PROMPT
    assert "request_config_import_merge" in ai_openai.SYSTEM_PROMPT
    assert "awaiting_user_confirm" in ai_openai.SYSTEM_PROMPT
    assert "已复位" in ai_openai.SYSTEM_PROMPT or "已导入" in ai_openai.SYSTEM_PROMPT
