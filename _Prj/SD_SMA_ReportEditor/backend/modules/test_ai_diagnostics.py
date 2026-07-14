"""能力矩阵 M：诊断工具返回可核对事实；空口事实断言可被 claim guard 拦住。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.settings import APP_VERSION
from modules import (
    ai_claim_guard,
    ai_config,
    ai_pending_prompts,
    ai_tools,
    ai_work_chain,
    audit_log,
    layout_preset_store,
    template_store,
)
from schemas.report_template import LayoutSnapshot, ReportTemplate


@pytest.fixture()
def diag_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "backend-data"
    templates = data / "templates"
    layouts = data / "layout_presets"
    templates.mkdir(parents=True)
    layouts.mkdir(parents=True)
    (data / "audit").mkdir()
    cfg_path = data / "config.json"
    cfg_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "db_connections": [
                    {
                        "id": "db1",
                        "name": "ProdDB",
                        "engine": "sqlite",
                        "host": "",
                        "database": str(data / "demo.db"),
                    }
                ],
                "opcua_servers": [{"id": "opc1", "name": "Plc", "endpoint": "opc.tcp://127.0.0.1:4840"}],
                "app_preferences": {},
                "ai_settings": {"write_tools_enabled": False, "enabled": True},
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
    monkeypatch.setattr(ai_work_chain, "DATA_DIR", data)
    monkeypatch.setattr(ai_work_chain, "CONFIG_FILE", cfg_path)
    monkeypatch.setattr(template_store, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(template_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(layout_preset_store, "LAYOUT_PRESETS_DIR", layouts)
    monkeypatch.setattr(layout_preset_store, "init_data_dirs", lambda: None)
    monkeypatch.setattr(ai_pending_prompts, "_FILE", prompts_file)
    monkeypatch.setattr(ai_pending_prompts, "DATA_DIR", data)

    tpl = ReportTemplate(
        id="tpl-m1",
        name="诊断模版",
        updatedAt="2026-07-13T00:00:00Z",
        schemaVersion=4,
        layoutSnapshot=LayoutSnapshot(),
        coverLayoutSnapshot=LayoutSnapshot(),
        backLayoutSnapshot=LayoutSnapshot(),
    )
    template_store.save_template(tpl)
    return data, cfg_path, tpl


@pytest.mark.asyncio
async def test_runtime_snapshot_counts_match_config(diag_env):
    data, _cfg, _tpl = diag_env
    out = await ai_tools.execute_tool("get_dev_runtime_snapshot", {})
    assert out["ok"] is True
    assert out["version"] == APP_VERSION
    assert out["counts"]["db_connections"] == 1
    assert out["counts"]["opc_servers"] == 1
    assert out["counts"]["templates"] == 1
    assert out["health"]["data_dir"] == str(data)


@pytest.mark.asyncio
async def test_diagnose_work_chain_has_stages(diag_env):
    out = await ai_tools.execute_tool("diagnose_work_chain", {})
    assert out["ok"] is True
    names = [s["name"] for s in out["stages"]]
    assert names == ["Runtime", "Datasource", "Assets", "Bindings", "ExportAudit", "AiGateway"]
    assert "overall_ok" in out
    ds = next(s for s in out["stages"] if s["name"] == "Datasource")
    assert ds["detail"]["db_count"] == 1
    assert ds["detail"]["opc_count"] == 1


@pytest.mark.asyncio
async def test_query_audit_log_returns_appended(diag_env):
    data, _cfg, _tpl = diag_env
    audit_log.append_audit(
        data,
        action="export.pdf",
        result="fail",
        summary="测试失败审计",
    )
    out = await ai_tools.execute_tool("query_audit_log", {"result": "fail", "limit": 10})
    assert out["ok"] is True
    assert out["total"] >= 1
    assert any("测试失败审计" in str(e.get("summary") or "") for e in out["entries"])


@pytest.mark.asyncio
async def test_inspect_bindings_missing_and_broken(diag_env):
    data, _cfg, tpl = diag_env
    missing = await ai_tools.execute_tool("inspect_template_bindings", {})
    assert missing["ok"] is False

    bad_id = await ai_tools.execute_tool("inspect_template_bindings", {"template_id": "../evil"})
    assert bad_id["ok"] is False

    # 写入含不存在 connectionId 的模版 JSON
    path = template_store.template_path(tpl.id)
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["layoutSnapshot"] = {
        "elements": [{"type": "table", "connectionId": "no-such-db", "id": "el1"}],
    }
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")

    out = await ai_tools.execute_tool("inspect_template_bindings", {"template_id": tpl.id})
    assert out["ok"] is True
    assert out["issue_count"] >= 1
    assert any(i.get("kind") == "missing_db" for i in out["issues"])
    assert out["resolved_connections"][0]["exists"] is False


@pytest.mark.asyncio
async def test_explain_export_diagnostics_parses_marker(diag_env):
    empty = await ai_tools.execute_tool("explain_export_diagnostics", {})
    assert empty["ok"] is False

    payload = {"issueCount": 1, "issues": [{"key": "sql", "kind": "query", "message": "超时"}]}
    text = f"导出失败\n---EXPORT_DIAGNOSTICS---\n{json.dumps(payload, ensure_ascii=False)}"
    out = await ai_tools.execute_tool("explain_export_diagnostics", {"text": text})
    assert out["ok"] is True
    assert "超时" in out["human_summary"]
    assert out["diagnostics"]["issueCount"] == 1


@pytest.mark.asyncio
async def test_app_version_tool(diag_env):
    out = await ai_tools.execute_tool("get_app_version_and_endpoints", {})
    assert out["ok"] is True
    assert out["version"] == APP_VERSION


@pytest.mark.asyncio
async def test_diagnostic_reads_work_when_write_gate_off(diag_env):
    """诊断为 read：总闸关仍可用。"""
    snap = await ai_tools.execute_tool("get_dev_runtime_snapshot", {})
    diag = await ai_tools.execute_tool("diagnose_work_chain", {})
    assert snap["ok"] is True
    assert diag["ok"] is True


def test_diagnostic_claim_guard_requires_tool():
    assert ai_claim_guard.detect_diagnostic_fact_claim("审计显示没有失败记录") is True
    assert ai_claim_guard.detect_diagnostic_fact_claim("链路全部正常") is True
    assert ai_claim_guard.detect_diagnostic_fact_claim("当前有 3 个数据库连接") is True
    assert ai_claim_guard.detect_diagnostic_fact_claim("我帮你查一下审计") is False

    assert ai_claim_guard.needs_diagnostic_claim_retry("审计显示没有失败", []) is True
    ok_trace = [{"name": "query_audit_log", "ok": True, "message": "ok"}]
    assert ai_claim_guard.needs_diagnostic_claim_retry("审计显示没有失败", ok_trace) is False

    rewritten = ai_claim_guard.rewrite_diagnostic_claim_failure("链路全部正常", [])
    assert "编造" in rewritten or "诊断工具" in rewritten
