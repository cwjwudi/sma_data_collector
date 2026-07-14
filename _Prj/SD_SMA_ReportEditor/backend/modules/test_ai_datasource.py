"""能力矩阵 A：配置数据源（upsert / 凭证 / 删除 / 锁 / 总闸）。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import (
    ai_asset_ops,
    ai_config,
    ai_datasource_ops,
    ai_pending_actions,
    ai_pending_prompts,
    ai_tools,
    datasource_lock,
    opcua_service,
)


def _assert_no_secret_leak(obj: object) -> None:
    blob = json.dumps(obj, ensure_ascii=False, default=str)
    for bad in ("secret-pass", "plain-password", '"password":'):
        assert bad not in blob, f"secret leak: {bad}"


@pytest.fixture()
def ds_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    data.mkdir(parents=True)
    (data / "templates").mkdir()
    (data / "layout_presets").mkdir()
    cfg_path = data / "config.json"
    cfg_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "db_connections": [
                    {
                        "id": "keep-db",
                        "name": "保留库",
                        "engine": "mysql",
                        "host": "127.0.0.1",
                        "port": 3306,
                        "database": "app",
                        "username": "root",
                        "password_enc": None,
                    },
                    {
                        "id": "demo-db",
                        "name": "演示库",
                        "engine": "sqlite",
                        "sqlite_path": "demo.db",
                        "is_demo": True,
                    },
                ],
                "opcua_servers": [
                    {
                        "id": "keep-opc",
                        "name": "保留OPC",
                        "endpoint_url": "opc.tcp://127.0.0.1:4840",
                    }
                ],
                "app_preferences": {"datasource_locked": False},
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
    monkeypatch.setattr(ai_datasource_ops, "DATA_DIR", data)
    monkeypatch.setattr(ai_datasource_ops, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(datasource_lock, "DATA_DIR", data)
    monkeypatch.setattr(datasource_lock, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)

    async def _drop(_sid: str) -> None:
        return None

    monkeypatch.setattr(opcua_service, "drop_saved_server_pool", _drop)
    return data, cfg_path


@pytest.mark.asyncio
async def test_a1_upsert_mysql_awaits_credentials_and_reloads(ds_env):
    data, _cfg = ds_env
    result = await ai_tools.execute_tool(
        "upsert_db_connection",
        {
            "name": "新MySQL",
            "engine": "mysql",
            "host": "10.0.0.2",
            "port": 3306,
            "database": "prod",
            "username": "app",
        },
    )
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_credentials"
    assert result["prompt"]["kind"] == "credential"
    saved_id = result["saved_id"]
    _assert_no_secret_leak(result)

    listed = await ai_tools.execute_tool("list_db_connections", {})
    ids = {c["id"] for c in listed.get("connections") or []}
    assert saved_id in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("pending_apply") is True
    assert mirror.get("ui_reload", {}).get("datasource") is True
    assert mirror.get("ui_reload", {}).get("reason") == "upsert_db_connection"


@pytest.mark.asyncio
async def test_a2_upsert_sqlite_saved_without_credential(ds_env):
    data, _cfg = ds_env
    result = await ai_tools.execute_tool(
        "upsert_db_connection",
        {"name": "本地SQLite", "engine": "sqlite", "sqlite_path": "/tmp/a.db"},
    )
    assert result["ok"] is True
    assert result["status"] == "saved"
    assert "prompt" not in result or result.get("prompt") is None

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("reason") == "upsert_db_connection"


@pytest.mark.asyncio
async def test_a3_upsert_opc_server_persists_and_reloads(ds_env):
    data, _cfg = ds_env
    result = await ai_tools.execute_tool(
        "upsert_opc_server",
        {
            "name": "新OPC",
            "endpoint_url": "opc.tcp://10.0.0.3:4840",
        },
    )
    assert result["ok"] is True
    assert result["status"] == "saved"
    saved_id = result["saved_id"]

    listed = await ai_tools.execute_tool("list_opc_servers", {})
    ids = {s["id"] for s in listed.get("servers") or []}
    assert saved_id in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("datasource") is True
    assert mirror.get("ui_reload", {}).get("reason") == "upsert_opc_server"


@pytest.mark.asyncio
async def test_a4_request_connection_credentials_pending(ds_env):
    result = await ai_tools.execute_tool(
        "request_connection_credentials",
        {"kind": "db", "connection_id": "keep-db"},
    )
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_credentials"
    assert result["prompt"]["kind"] == "credential"
    _assert_no_secret_leak(result)


@pytest.mark.asyncio
async def test_a5_apply_credential_encrypts_and_reloads(ds_env):
    data, cfg_path = ds_env
    req = await ai_tools.execute_tool(
        "request_connection_credentials",
        {"kind": "db", "connection_id": "keep-db"},
    )
    prompt_id = req["prompt"]["id"]
    applied = ai_datasource_ops.apply_credential(prompt_id, "secret-pass")
    assert applied["ok"] is True
    _assert_no_secret_leak(applied)

    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    row = next(c for c in cfg["db_connections"] if c["id"] == "keep-db")
    assert row.get("password_enc")
    assert "secret-pass" not in json.dumps(cfg, ensure_ascii=False)

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("datasource") is True
    assert mirror.get("ui_reload", {}).get("reason") == "apply_credential"


@pytest.mark.asyncio
async def test_a6_delete_db_request_awaits_without_deleting(ds_env):
    data, _cfg = ds_env
    result = await ai_tools.execute_tool("delete_db_connection", {"connection_id": "keep-db"})
    assert result["ok"] is True
    assert result["status"] == "awaiting_user_confirm"
    assert result["prompt"]["kind"] == "confirm_delete"
    listed = await ai_tools.execute_tool("list_db_connections", {})
    ids = {c["id"] for c in listed.get("connections") or []}
    assert "keep-db" in ids
    assert not (data / "client_prefs_mirror.json").is_file()


@pytest.mark.asyncio
async def test_a7_delete_db_confirm_removes_and_reloads(ds_env):
    data, _cfg = ds_env
    req = await ai_tools.execute_tool("delete_db_connection", {"connection_id": "keep-db"})
    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["ok"] is True
    assert applied["deleted"] == "keep-db"

    listed = await ai_tools.execute_tool("list_db_connections", {})
    ids = {c["id"] for c in listed.get("connections") or []}
    assert "keep-db" not in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("datasource") is True
    assert mirror.get("ui_reload", {}).get("reason") == "delete_db_connection"


@pytest.mark.asyncio
async def test_a8_delete_db_cancel_keeps_connection(ds_env):
    req = await ai_tools.execute_tool("delete_db_connection", {"connection_id": "keep-db"})
    cancelled = await ai_pending_actions.apply_confirm(req["prompt"]["id"], False)
    assert cancelled.get("cancelled") is True
    listed = await ai_tools.execute_tool("list_db_connections", {})
    ids = {c["id"] for c in listed.get("connections") or []}
    assert "keep-db" in ids


@pytest.mark.asyncio
async def test_a9_delete_opc_confirm_removes_and_reloads(ds_env):
    data, _cfg = ds_env
    req = await ai_tools.execute_tool("delete_opc_server", {"connection_id": "keep-opc"})
    applied = await ai_pending_actions.apply_confirm(req["prompt"]["id"], True)
    assert applied["ok"] is True
    assert applied["deleted"] == "keep-opc"

    listed = await ai_tools.execute_tool("list_opc_servers", {})
    ids = {s["id"] for s in listed.get("servers") or []}
    assert "keep-opc" not in ids

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("ui_reload", {}).get("reason") == "delete_opc_server"


@pytest.mark.asyncio
async def test_a10_gate_off_blocks_datasource_writes(ds_env):
    _data, cfg_path = ds_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    before = json.dumps(cfg, sort_keys=True, ensure_ascii=False)
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    for name, args in (
        ("upsert_db_connection", {"name": "x", "engine": "sqlite", "sqlite_path": "x.db"}),
        ("upsert_opc_server", {"name": "y", "endpoint_url": "opc.tcp://1:4840"}),
        ("request_connection_credentials", {"kind": "db", "connection_id": "keep-db"}),
        ("delete_db_connection", {"connection_id": "keep-db"}),
        ("delete_opc_server", {"connection_id": "keep-opc"}),
    ):
        result = await ai_tools.execute_tool(name, args)
        assert result["ok"] is False
        assert result["error"] == ai_tools.WRITE_TOOLS_DISABLED_ERROR

    after = json.dumps(json.loads(cfg_path.read_text(encoding="utf-8")), sort_keys=True, ensure_ascii=False)
    assert after == before
    assert ai_pending_prompts.count_pending() == 0


@pytest.mark.asyncio
async def test_a11_locked_upsert_awaits_unlock_without_saving(ds_env):
    _data, cfg_path = ds_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["app_preferences"]["datasource_locked"] = True
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    result = await ai_tools.execute_tool(
        "upsert_db_connection",
        {"name": "被挡", "engine": "sqlite", "sqlite_path": "/tmp/blocked.db"},
    )
    assert result["ok"] is False
    assert result["status"] == "awaiting_user_unlock"
    assert result.get("datasource_locked") is True

    listed = await ai_tools.execute_tool("list_db_connections", {})
    names = {c["name"] for c in listed.get("connections") or []}
    assert "被挡" not in names


@pytest.mark.asyncio
async def test_a12_unlock_confirm_clears_lock(ds_env):
    _data, cfg_path = ds_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["app_preferences"]["datasource_locked"] = True
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    blocked = await ai_tools.execute_tool(
        "upsert_db_connection",
        {"name": "解锁后", "engine": "sqlite", "sqlite_path": "/tmp/u.db"},
    )
    prompt_id = blocked["pending_prompt_id"]
    unlocked = await ai_pending_actions.apply_confirm(prompt_id, True)
    assert unlocked["ok"] is True
    assert unlocked.get("datasource_locked") is False

    cfg2 = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert cfg2["app_preferences"]["datasource_locked"] is False


@pytest.mark.asyncio
async def test_a13_demo_connection_cannot_delete_via_ai(ds_env):
    result = await ai_tools.execute_tool("delete_db_connection", {"connection_id": "demo-db"})
    assert result["ok"] is False
    assert "演示" in (result.get("error") or "")


def test_a14_system_prompt_mentions_datasource_flow():
    from api.routers import ai_openai

    assert "upsert_db_connection" in ai_openai.SYSTEM_PROMPT
    assert "upsert_opc_server" in ai_openai.SYSTEM_PROMPT
    assert "request_connection_credentials" in ai_openai.SYSTEM_PROMPT
    assert "delete_db_connection" in ai_openai.SYSTEM_PROMPT
    assert "awaiting_user_credentials" in ai_openai.SYSTEM_PROMPT
    assert "awaiting_user_unlock" in ai_openai.SYSTEM_PROMPT
    assert "datasource_locked" in ai_openai.SYSTEM_PROMPT
