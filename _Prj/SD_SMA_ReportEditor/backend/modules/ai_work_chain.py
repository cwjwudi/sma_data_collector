"""工作链路诊断：供 Cursor / AI 开发排障一次拿到分阶段快照。"""
from __future__ import annotations

import json
from typing import Any

from core.settings import APP_VERSION, CONFIG_FILE, DATA_DIR
from modules import ai_config, ai_pending_prompts, ai_template_bindings, ai_tools, config_store, layout_preset_store, template_store

EXPORT_DIAG_MARKER = "---EXPORT_DIAGNOSTICS---"


def _cfg() -> dict[str, Any]:
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _runtime_health() -> dict[str, Any]:
    data_ok = DATA_DIR.exists() and CONFIG_FILE.exists()
    return {
        "name": "Runtime",
        "ok": data_ok,
        "summary": "healthy" if data_ok else "degraded",
        "issues": [] if data_ok else ["数据目录或 config.json 缺失"],
        "detail": {
            "version": APP_VERSION,
            "data_dir": str(DATA_DIR),
            "config_exists": CONFIG_FILE.exists(),
        },
    }


async def _datasource_stage(*, live_probe: bool) -> dict[str, Any]:
    cfg = _cfg()
    dbs_raw = cfg.get("db_connections") or []
    opcs_raw = cfg.get("opcua_servers") or []
    issues: list[str] = []
    probes: list[dict[str, Any]] = []
    if live_probe:
        for c in dbs_raw:
            cid = c.get("id")
            if cid:
                r = await ai_tools.execute_tool("probe_connection", {"kind": "db", "connection_id": cid})
                probes.append(r)
                if not r.get("ok"):
                    issues.append(f"DB「{c.get('name') or cid}」探活失败: {r.get('message')}")
        for s in opcs_raw:
            sid = s.get("id")
            if sid:
                r = await ai_tools.execute_tool("probe_connection", {"kind": "opcua", "connection_id": sid})
                probes.append(r)
                if not r.get("ok"):
                    issues.append(f"OPC「{s.get('name') or sid}」探活失败: {r.get('message')}")
    else:
        for c in dbs_raw:
            if c.get("is_demo"):
                continue
            eng = (c.get("engine") or "").lower()
            if eng in ("mysql", "mariadb", "postgres", "mongodb") and not str(c.get("database") or "").strip():
                issues.append(f"DB「{c.get('name') or c.get('id')}」未设置默认 database")
            if eng != "sqlite" and not c.get("password_enc"):
                issues.append(f"DB「{c.get('name') or c.get('id')}」未配置密码")
    ok = len(issues) == 0
    return {
        "name": "Datasource",
        "ok": ok,
        "summary": f"{len(dbs_raw)} DB, {len(opcs_raw)} OPC" + ("；探活有失败" if live_probe and issues else ""),
        "issues": issues,
        "detail": {"db_count": len(dbs_raw), "opc_count": len(opcs_raw), "live_probe": live_probe, "probes": probes[:20]},
    }


def _assets_stage() -> dict[str, Any]:
    issues: list[str] = []
    try:
        templates = template_store.list_summaries()
        tpl_count = len(templates)
    except Exception as e:
        tpl_count = 0
        issues.append(f"模版列表加载失败: {e}")
    try:
        layouts = layout_preset_store.list_summaries()
        layout_count = len(layouts)
        cover = sum(1 for x in layouts if x.pageRole == "cover")
        back = sum(1 for x in layouts if x.pageRole == "back")
        normal = layout_count - cover - back
    except Exception as e:
        layout_count = cover = back = normal = 0
        issues.append(f"版式列表加载失败: {e}")
    if tpl_count == 0:
        issues.append("模版库为空")
    ok = len(issues) == 0 or (tpl_count > 0 and layout_count > 0 and not any("失败" in i for i in issues))
    return {
        "name": "Assets",
        "ok": ok,
        "summary": f"{tpl_count} 模版, {layout_count} 版式（正文 {normal}/封面 {cover}/末页 {back}）",
        "issues": issues,
        "detail": {"template_count": tpl_count, "layout_count": layout_count, "cover": cover, "back": back, "normal": normal},
    }


def _bindings_stage(template_id: str | None) -> dict[str, Any]:
    issues: list[str] = []
    cfg = _cfg()
    db_by_id = {c.get("id"): config_store.mask_connection_for_response(c) for c in cfg.get("db_connections") or [] if c.get("id")}
    opc_by_id = {s.get("id"): config_store.mask_opcua_for_response(s) for s in cfg.get("opcua_servers") or [] if s.get("id")}
    checked: list[dict[str, Any]] = []
    summaries = template_store.list_summaries()
    targets = [s for s in summaries if not template_id or s.id == template_id]
    if template_id and not targets:
        return {
            "name": "Bindings",
            "ok": False,
            "summary": f"模版 {template_id} 不存在",
            "issues": [f"模版 {template_id} 不存在"],
            "detail": {},
        }
    sample = targets[:5] if not template_id else targets
    for s in sample:
        raw_path = template_store.template_path(s.id)
        if not raw_path.is_file():
            issues.append(f"模版「{s.name}」文件缺失")
            continue
        try:
            import json as _json

            raw = _json.loads(raw_path.read_text(encoding="utf-8"))
        except Exception as e:
            issues.append(f"模版「{s.name}」解析失败: {e}")
            continue
        bindings = ai_template_bindings.extract_template_bindings(raw)
        binding_issues = ai_template_bindings.validate_bindings_against_config(
            bindings, db_by_id=db_by_id, opc_by_id=opc_by_id
        )
        for bi in binding_issues:
            issues.append(f"模版「{s.name}」: {bi.get('message')} ({bi.get('connection_id', '')})")
        checked.append({"template_id": s.id, "name": s.name, "bindings": bindings, "issues": binding_issues})
    ok = len(issues) == 0
    label = template_id or f"抽样 {len(checked)} 个模版"
    return {
        "name": "Bindings",
        "ok": ok,
        "summary": f"已检查 {label}",
        "issues": issues,
        "detail": {"checked": checked},
    }


def _export_audit_stage() -> dict[str, Any]:
    from modules import audit_log

    issues: list[str] = []
    fails: list[dict[str, Any]] = []
    data = audit_log.list_audit(DATA_DIR, limit=30, offset=0, action=None, result="fail")
    for e in data.get("entries") or []:
        action = str(e.get("action") or "")
        if not action.startswith("export"):
            continue
        fails.append(
            {
                "action": action,
                "summary": e.get("summary"),
                "at": e.get("at"),
                "detail_preview": str(e.get("detail") or "")[:500],
            }
        )
        summary = str(e.get("summary") or "")
        if EXPORT_DIAG_MARKER in summary or (isinstance(e.get("detail"), dict) and e.get("detail")):
            issues.append(f"最近导出失败: {summary[:200]}")
    ok = len(fails) == 0
    return {
        "name": "ExportAudit",
        "ok": ok,
        "summary": f"最近 export 失败 {len(fails)} 条" if fails else "无最近 export 失败",
        "issues": issues[:10],
        "detail": {"recent_failures": fails[:5]},
    }


def _ai_gateway_stage() -> dict[str, Any]:
    port = ai_config.resolve_backend_port()
    pub = ai_config.public_ai_settings(port=port)
    issues: list[str] = []
    if not pub.get("enabled"):
        issues.append("AI 助手未启用")
    if not pub.get("ready"):
        issues.append("AI 未就绪（缺 LLM Key 或未启用）")
    pending = ai_pending_prompts.count_pending()
    if pending:
        issues.append(f"有 {pending} 个待用户在 UI 完成的待办（密码/删除确认）")
    ok = pub.get("ready") is True and pending == 0
    return {
        "name": "AiGateway",
        "ok": ok,
        "summary": f"ready={pub.get('ready')}, write_tools={pub.get('write_tools_enabled')}, pending={pending}",
        "issues": issues,
        "detail": {
            "enabled": pub.get("enabled"),
            "ready": pub.get("ready"),
            "llm_base_url": pub.get("llm_base_url"),
            "write_tools_enabled": pub.get("write_tools_enabled"),
            "pending_prompts": pending,
            "agent_chat_url_loopback": pub.get("agent_chat_url_loopback"),
        },
    }


def _hints(stages: list[dict[str, Any]]) -> list[str]:
    hints: list[str] = []
    by_name = {s["name"]: s for s in stages}
    if not by_name.get("Runtime", {}).get("ok"):
        hints.append("先确认后端 /health 与 data_dir 正常后再测业务链路。")
    ds = by_name.get("Datasource", {})
    if not ds.get("ok"):
        hints.append("修复数据源连接（密码、默认库、网络）后再测模版绑定与导出。")
        if ds.get("issues"):
            hints.append("可对失败连接调用 probe_connection 或开启 live_probe 获取详细错误。")
    if not by_name.get("Bindings", {}).get("ok"):
        hints.append("用 inspect_template_bindings 深查具体模版的 connectionId 是否仍有效。")
    if not by_name.get("ExportAudit", {}).get("ok"):
        hints.append("对失败审计文本调用 explain_export_diagnostics 解析 EXPORT_DIAGNOSTICS。")
    if not by_name.get("AiGateway", {}).get("ok"):
        hints.append("在设置页完成 AI 配置；若有 pending 弹框请在报表软件 UI 内处理。")
    if all(s.get("ok") for s in stages):
        hints.append("链路各阶段正常，可继续开发或执行导出/结批测试。")
    return hints


async def diagnose_work_chain(*, live_probe: bool = False, template_id: str | None = None) -> dict[str, Any]:
    stages = [
        _runtime_health(),
        await _datasource_stage(live_probe=live_probe),
        _assets_stage(),
        _bindings_stage(template_id),
        _export_audit_stage(),
        _ai_gateway_stage(),
    ]
    overall_ok = all(s.get("ok") for s in stages)
    return {
        "ok": True,
        "overall_ok": overall_ok,
        "stages": stages,
        "hints_for_developer": _hints(stages),
    }


async def get_dev_runtime_snapshot() -> dict[str, Any]:
    port = ai_config.resolve_backend_port()
    pub = ai_config.public_ai_settings(port=port)
    cfg = _cfg()
    tpl_count = len(template_store.list_summaries())
    layout_count = len(layout_preset_store.list_summaries())
    db_count = len(cfg.get("db_connections") or [])
    opc_count = len(cfg.get("opcua_servers") or [])
    from modules import audit_log

    fails = []
    data = audit_log.list_audit(DATA_DIR, limit=50, offset=0, result="fail")
    for e in data.get("entries") or []:
        fails.append({"action": e.get("action"), "summary": e.get("summary"), "at": e.get("at")})
        if len(fails) >= 5:
            break
    health = _runtime_health()
    return {
        "ok": True,
        "app": "SD_SMA_ReportEditor",
        "version": APP_VERSION,
        "health": health.get("detail"),
        "endpoints": {
            "health": "/health",
            "agent_chat_loopback": pub.get("agent_chat_url_loopback"),
            "agent_chat_lan": pub.get("agent_chat_url_lan"),
        },
        "ai": {
            "enabled": pub.get("enabled"),
            "ready": pub.get("ready"),
            "write_tools_enabled": pub.get("write_tools_enabled"),
            "pending_prompts": ai_pending_prompts.count_pending(),
        },
        "counts": {
            "db_connections": db_count,
            "opc_servers": opc_count,
            "templates": tpl_count,
            "layout_presets": layout_count,
        },
        "recent_failures": fails,
    }


def inspect_template_bindings(template_id: str) -> dict[str, Any]:
    tid = (template_id or "").strip()
    if not tid:
        return {"ok": False, "error": "缺少 template_id"}
    raw_path = template_store.template_path(tid)
    if not raw_path.is_file():
        return {"ok": False, "error": "模版不存在"}
    try:
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
    except Exception as e:
        return {"ok": False, "error": f"模版解析失败: {e}"}
    cfg = _cfg()
    db_by_id = {c.get("id"): config_store.mask_connection_for_response(c) for c in cfg.get("db_connections") or [] if c.get("id")}
    opc_by_id = {s.get("id"): config_store.mask_opcua_for_response(s) for s in cfg.get("opcua_servers") or [] if s.get("id")}
    bindings = ai_template_bindings.extract_template_bindings(raw)
    issues = ai_template_bindings.validate_bindings_against_config(bindings, db_by_id=db_by_id, opc_by_id=opc_by_id)
    resolved: list[dict[str, Any]] = []
    for cid in bindings.get("db_connection_ids") or []:
        conn = db_by_id.get(cid)
        resolved.append(
            {
                "connection_id": cid,
                "exists": conn is not None,
                "name": conn.get("name") if conn else None,
                "engine": conn.get("engine") if conn else None,
                "has_password": conn.get("has_password") if conn else False,
                "database": conn.get("database") if conn else None,
            }
        )
    return {
        "ok": True,
        "template_id": tid,
        "template_name": raw.get("name") or tid,
        "bindings": bindings,
        "resolved_connections": resolved,
        "issues": issues,
        "issue_count": len(issues),
    }
