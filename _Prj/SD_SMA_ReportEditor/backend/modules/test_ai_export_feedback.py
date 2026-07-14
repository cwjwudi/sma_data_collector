"""能力矩阵 L：结批写回 / 并行上限 — 写入镜像后可读回一致。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from modules import ai_config, ai_runtime_ops, ai_tools


@pytest.fixture()
def feedback_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    data.mkdir(parents=True)
    (data / "templates").mkdir()
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
    return data, cfg_path, mirror_path


@pytest.mark.asyncio
async def test_set_export_result_feedback_default_roundtrip(feedback_env):
    _data, _cfg, mirror_path = feedback_env
    out = await ai_tools.execute_tool(
        "set_export_result_feedback",
        {
            "enabled": True,
            "serverId": "opc-1",
            "statusNodeId": "ns=1;s=Status",
            "statusKind": "int",
            "messageNodeId": "ns=1;s=Msg",
        },
    )
    assert out["ok"] is True
    assert out["feedback"]["enabled"] is True
    assert out["feedback"]["serverId"] == "opc-1"
    assert out["feedback"]["statusKind"] == "int"

    mirror = json.loads(mirror_path.read_text(encoding="utf-8"))
    assert mirror["pending_apply"] is True
    assert mirror.get("pending_token")
    assert mirror["report_generator"]["exportResultOpc"]["serverId"] == "opc-1"

    got = await ai_tools.execute_tool("get_export_result_feedback", {})
    assert got["ok"] is True
    assert got["default"]["serverId"] == "opc-1"
    assert got["resolved"]["statusNodeId"] == "ns=1;s=Status"
    assert got["resolved"]["messageNodeId"] == "ns=1;s=Msg"


@pytest.mark.asyncio
async def test_set_export_result_feedback_by_template(feedback_env):
    out = await ai_tools.execute_tool(
        "set_export_result_feedback",
        {
            "template_id": "tpl-l1",
            "enabled": True,
            "serverId": "opc-tpl",
            "statusNodeId": "ns=1;s=TplStatus",
        },
    )
    assert out["ok"] is True
    assert out["template_id"] == "tpl-l1"

    got = await ai_tools.execute_tool("get_export_result_feedback", {"template_id": "tpl-l1"})
    assert got["ok"] is True
    assert got["resolved"]["serverId"] == "opc-tpl"
    assert "tpl-l1" in got["by_template_ids"]


@pytest.mark.asyncio
async def test_set_export_result_feedback_rejects_empty_or_bad_kind(feedback_env):
    empty = await ai_tools.execute_tool("set_export_result_feedback", {})
    assert empty["ok"] is False
    assert "有效字段" in str(empty.get("error") or "")

    bad = await ai_tools.execute_tool("set_export_result_feedback", {"statusKind": "string"})
    assert bad["ok"] is False
    assert "statusKind" in str(bad.get("error") or "")


@pytest.mark.asyncio
async def test_set_max_parallel_exports_roundtrip(feedback_env):
    _data, _cfg, mirror_path = feedback_env
    out = await ai_tools.execute_tool("set_max_parallel_exports", {"max_parallel": 3})
    assert out["ok"] is True
    assert out["max_parallel"] == 3

    mirror = json.loads(mirror_path.read_text(encoding="utf-8"))
    assert mirror["pending_apply"] is True
    assert mirror.get("pending_token")
    assert mirror["report_generator"]["auto"]["maxParallelExports"] == 3

    check = await ai_tools.execute_tool("check_auto_trigger_bindings", {})
    assert check["ok"] is True
    assert check["max_parallel"] == 3


@pytest.mark.asyncio
async def test_set_max_parallel_exports_clamps_and_rejects(feedback_env):
    hi = await ai_tools.execute_tool("set_max_parallel_exports", {"max_parallel": 99})
    assert hi["ok"] is True
    assert hi["max_parallel"] == 16

    lo = await ai_tools.execute_tool("set_max_parallel_exports", {"max_parallel": 0})
    assert lo["ok"] is True
    assert lo["max_parallel"] == 1

    bad = await ai_tools.execute_tool("set_max_parallel_exports", {"max_parallel": "x"})
    assert bad["ok"] is False

    missing = await ai_tools.execute_tool("set_max_parallel_exports", {})
    assert missing["ok"] is False


@pytest.mark.asyncio
async def test_feedback_and_parallel_write_gate(feedback_env):
    _data, cfg_path, mirror_path = feedback_env
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["ai_settings"]["write_tools_enabled"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")

    r1 = await ai_tools.execute_tool("set_export_result_feedback", {"enabled": True})
    r2 = await ai_tools.execute_tool("set_max_parallel_exports", {"max_parallel": 2})
    assert r1["ok"] is False and "允许 AI 写入工具" in r1["error"]
    assert r2["ok"] is False and "允许 AI 写入工具" in r2["error"]
    assert not mirror_path.is_file()

    # 读工具仍可用
    got = await ai_tools.execute_tool("get_export_result_feedback", {})
    assert got["ok"] is True
