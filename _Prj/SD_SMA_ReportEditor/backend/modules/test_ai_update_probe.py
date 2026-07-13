"""AI update_connection_probe_settings：落库 + 通知前端刷新。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import ai_asset_ops, ai_config, ai_tools, datasource_lock


@pytest.fixture()
def probe_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    data.mkdir(parents=True)
    cfg_path = data / "config.json"
    cfg_path.write_text(
        json.dumps(
            {
                "app_preferences": {
                    "connection_probe_enabled": False,
                    "connection_probe_interval_sec": 30,
                    "datasource_locked": False,
                },
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
    monkeypatch.setattr(datasource_lock, "DATA_DIR", data)
    monkeypatch.setattr(datasource_lock, "CONFIG_FILE", cfg_path)
    return data, cfg_path


@pytest.mark.asyncio
async def test_update_probe_enables_and_marks_ui_reload(probe_env):
    data, cfg_path = probe_env
    result = await ai_tools.execute_tool("update_connection_probe_settings", {"enabled": True})
    assert result["ok"] is True
    assert result["applied"]["connection_probe_enabled"] is True
    assert "开启" in (result.get("message") or "")

    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert cfg["app_preferences"]["connection_probe_enabled"] is True

    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror.get("pending_apply") is True
    assert mirror.get("ui_reload", {}).get("connection_probe") is True


@pytest.mark.asyncio
async def test_update_probe_disable_and_interval(probe_env):
    _data, cfg_path = probe_env
    # 先开
    await ai_tools.execute_tool("update_connection_probe_settings", {"enabled": True})
    result = await ai_tools.execute_tool(
        "update_connection_probe_settings",
        {"enabled": False, "interval_sec": 60},
    )
    assert result["ok"] is True
    assert result["applied"]["connection_probe_enabled"] is False
    assert result["applied"]["connection_probe_interval_sec"] == 60

    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    prefs = cfg["app_preferences"]
    assert prefs["connection_probe_enabled"] is False
    assert prefs["connection_probe_interval_sec"] == 60


@pytest.mark.asyncio
async def test_update_probe_requires_args(probe_env):
    result = await ai_tools.execute_tool("update_connection_probe_settings", {})
    assert result["ok"] is False
    assert "enabled" in result["error"]


@pytest.mark.asyncio
async def test_update_probe_blocked_when_write_disabled(probe_env):
    _data, cfg_path = probe_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    result = await ai_tools.execute_tool("update_connection_probe_settings", {"enabled": True})
    assert result["ok"] is False
    assert "写入工具" in result["error"]


@pytest.mark.asyncio
async def test_update_probe_works_when_datasource_locked(probe_env):
    """探活是应用偏好，数据源锁定不得挡住开关。"""
    _data, cfg_path = probe_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["app_preferences"]["datasource_locked"] = True
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    result = await ai_tools.execute_tool("update_connection_probe_settings", {"enabled": True})
    assert result["ok"] is True
    assert result["applied"]["connection_probe_enabled"] is True
    assert result.get("datasource_locked") is not True


@pytest.mark.asyncio
async def test_update_probe_string_false_disables(probe_env):
    """模型偶发传字符串 \"false\" 时不得被 bool() 当成 True。"""
    _data, cfg_path = probe_env
    await ai_tools.execute_tool("update_connection_probe_settings", {"enabled": True})
    result = await ai_tools.execute_tool("update_connection_probe_settings", {"enabled": "false"})
    assert result["ok"] is True
    assert result["applied"]["connection_probe_enabled"] is False
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    assert cfg["app_preferences"]["connection_probe_enabled"] is False


@pytest.mark.asyncio
async def test_update_probe_repeated_toggle(probe_env):
    _data, cfg_path = probe_env
    for want in (True, False, True, False):
        result = await ai_tools.execute_tool("update_connection_probe_settings", {"enabled": want})
        assert result["ok"] is True
        assert result["applied"]["connection_probe_enabled"] is want
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        assert cfg["app_preferences"]["connection_probe_enabled"] is want


@pytest.mark.asyncio
async def test_mirror_stale_ack_preserves_newer_pending(probe_env, monkeypatch):
    """旧 pending_token 的 ack 不得清掉更新的 pending（反复 AI 开关场景）。"""
    from unittest.mock import MagicMock

    from api.routers import ai_openai

    data, _cfg_path = probe_env
    monkeypatch.setattr(ai_openai, "_require_loopback", lambda _req: None)
    # mirror 路由函数内 from core.settings import DATA_DIR
    import core.settings as core_settings

    monkeypatch.setattr(core_settings, "DATA_DIR", data)

    t1 = ai_asset_ops.mark_ui_reload(connection_probe=True, reason="first")
    t2 = ai_asset_ops.mark_ui_reload(connection_probe=True, reason="second")
    assert t1 != t2

    req = MagicMock()
    res = ai_openai.mirror_client_prefs(
        req,
        {
            "pending_apply": False,
            "ui_reload": {},
            "ack_pending_token": t1,
            "report_generator": {"x": 1},
        },
    )
    assert res.get("preserved_pending") is True
    mirror = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror["pending_apply"] is True
    assert mirror["pending_token"] == t2
    assert mirror["ui_reload"]["reason"] == "second"

    res2 = ai_openai.mirror_client_prefs(
        req,
        {"pending_apply": False, "ui_reload": {}, "ack_pending_token": t2},
    )
    assert res2.get("cleared_pending") is True
    mirror2 = json.loads((data / "client_prefs_mirror.json").read_text(encoding="utf-8"))
    assert mirror2["pending_apply"] is False


def test_system_prompt_requires_probe_tool():
    from api.routers import ai_openai

    assert "update_connection_probe_settings" in ai_openai.SYSTEM_PROMPT
    assert "enabled=true" in ai_openai.SYSTEM_PROMPT
