"""运行时偏好相关 AI 工具：排序、打开编辑器、结批反馈、心跳、并行健康度、触发检查、历史摘要。"""
from __future__ import annotations

import json
import uuid
from typing import Any

from core.settings import DATA_DIR
from modules import ai_pending_prompts, audit_log, template_store
from modules import layout_preset_store

_CLIENT_PREFS_MIRROR = DATA_DIR / "client_prefs_mirror.json"

PLC_HEARTBEAT_DOC = (
    "PLC 心跳：报表软件周期向 OPC UA 变量写入「软件在线」信号，供 PLC 看门狗判断本机是否存活。\n"
    "配置位置：生成报表页 → PLC 心跳。\n"
    "字段：enabled / serverId / nodeId / intervalMs（默认 200ms，最小 100）/ mode。\n"
    "mode=constant_one：周期写 1（PLC 侧可清零后观察是否再被置 1）；\n"
    "mode=toggle：Bool 翻转；mode=counter：1–32000 循环累加（兼容 INT）。\n"
    "心跳由主界面常驻定时器驱动，与结批并行无关；断连或写失败时状态会变为 error。"
)


def _load_mirror() -> dict[str, Any]:
    if not _CLIENT_PREFS_MIRROR.is_file():
        return {}
    try:
        data = json.loads(_CLIENT_PREFS_MIRROR.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_mirror(data: dict[str, Any]) -> None:
    _CLIENT_PREFS_MIRROR.parent.mkdir(parents=True, exist_ok=True)
    _CLIENT_PREFS_MIRROR.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_template_display_order() -> dict[str, Any]:
    mirror = _load_mirror()
    order = mirror.get("template_display_order")
    if not isinstance(order, list):
        order = []
    ids = [str(x) for x in order if str(x).strip()]
    summaries = {s.id: s.name for s in template_store.list_summaries()}
    rows = []
    for i, tid in enumerate(ids, 1):
        rows.append({"seq": i, "id": tid, "name": summaries.get(tid) or "(未找到)"})
    missing = [tid for tid in summaries if tid not in set(ids)]
    return {
        "ok": True,
        "order": ids,
        "ordered": rows,
        "unordered_count": len(missing),
        "unordered_ids": missing[:50],
        "mirror_exists": bool(mirror),
    }


def set_template_display_order(ordered_ids: list[str] | None, move: dict[str, Any] | None = None) -> dict[str, Any]:
    """写入模版展示顺序到镜像，前端轮询 pending_apply 后落到 localStorage。"""
    from modules import ai_asset_ops

    summaries = [s.id for s in template_store.list_summaries()]
    known = set(summaries)
    mirror = _load_mirror()
    current = mirror.get("template_display_order")
    if not isinstance(current, list):
        current = list(summaries)
    else:
        current = [str(x) for x in current if str(x) in known]
        for tid in summaries:
            if tid not in current:
                current.append(tid)

    if isinstance(ordered_ids, list) and ordered_ids:
        next_ids = [str(x).strip() for x in ordered_ids if str(x).strip() in known]
        for tid in current:
            if tid not in next_ids:
                next_ids.append(tid)
        current = next_ids
    elif isinstance(move, dict) and move:
        from_id = str(move.get("from_id") or "").strip()
        to_id = str(move.get("to_id") or "").strip()
        if from_id not in current or to_id not in current or from_id == to_id:
            return {"ok": False, "error": "from_id/to_id 无效或不在当前列表"}
        from_i = current.index(from_id)
        to_i = current.index(to_id)
        current = [x for x in current if x != from_id]
        base = current.index(to_id)
        insert_at = base + 1 if from_i < to_i else base
        current.insert(insert_at, from_id)
    else:
        return {"ok": False, "error": "须提供 ordered_ids 或 move={from_id,to_id}"}

    mirror["template_display_order"] = current
    mirror["pending_apply"] = True
    _save_mirror(mirror)
    ai_asset_ops.mark_ui_reload(assets=True, reason="set_template_display_order")
    return {"ok": True, "order": current, "note": "前端将应用至模版管理页排序"}


def request_open_template(template_id: str) -> dict[str, Any]:
    tid = (template_id or "").strip()
    if not tid:
        return {"ok": False, "error": "缺少 template_id"}
    try:
        tpl = template_store.load_template(tid)
    except ValueError:
        return {"ok": False, "error": "模版不存在"}
    if not tpl:
        return {"ok": False, "error": "模版不存在"}
    prompt = ai_pending_prompts.create_prompt(
        kind="open_editor",
        target_kind="template",
        connection_id=tid,
        connection_name=tpl.name,
        title="打开模版编辑器",
        message=f"AI 助手请求打开模版「{tpl.name}」。确认后将跳转到编辑页。",
        payload={"editor": "template", "id": tid, "name": tpl.name},
    )
    return {"ok": True, "status": "awaiting_user_confirm", "prompt": prompt}


def request_open_layout(layout_id: str) -> dict[str, Any]:
    lid = (layout_id or "").strip()
    if not lid:
        return {"ok": False, "error": "缺少 layout_id"}
    try:
        preset = layout_preset_store.load_preset(lid)
    except ValueError:
        return {"ok": False, "error": "版式不存在"}
    if not preset:
        return {"ok": False, "error": "版式不存在"}
    name = str(getattr(preset, "name", None) or lid)
    prompt = ai_pending_prompts.create_prompt(
        kind="open_editor",
        target_kind="layout",
        connection_id=lid,
        connection_name=name,
        title="打开版式编辑器",
        message=f"AI 助手请求打开版式「{name}」。确认后将跳转到编辑页。",
        payload={"editor": "layout", "id": lid, "name": name},
    )
    return {"ok": True, "status": "awaiting_user_confirm", "prompt": prompt}


def get_export_result_feedback(template_id: str | None = None) -> dict[str, Any]:
    mirror = _load_mirror()
    rg = mirror.get("report_generator") if isinstance(mirror.get("report_generator"), dict) else {}
    default_fb = rg.get("exportResultOpc") if isinstance(rg.get("exportResultOpc"), dict) else {}
    by_tpl = rg.get("exportResultOpcByTemplateId") if isinstance(rg.get("exportResultOpcByTemplateId"), dict) else {}
    tid = (template_id or "").strip()
    resolved = dict(default_fb)
    if tid and isinstance(by_tpl.get(tid), dict):
        resolved = {**resolved, **by_tpl[tid]}
    return {
        "ok": True,
        "template_id": tid or None,
        "default": _mask_feedback(default_fb),
        "resolved": _mask_feedback(resolved),
        "by_template_ids": list(by_tpl.keys())[:50],
        "mirror_exists": bool(mirror),
    }


def _mask_feedback(fb: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "enabled",
        "serverId",
        "statusNodeId",
        "statusNodeLabel",
        "statusKind",
        "messageNodeId",
        "messageNodeLabel",
        "filePathNodeId",
        "filePathNodeLabel",
        "messageMaxLen",
    )
    return {k: fb.get(k) for k in keys}


def set_export_result_feedback(patch: dict[str, Any], template_id: str | None = None) -> dict[str, Any]:
    """写入结批结果 OPC 写回配置到镜像；须 pending_token 供前端 ack。"""
    if not isinstance(patch, dict):
        return {"ok": False, "error": "patch 须为对象"}
    mirror = _load_mirror()
    rg = dict(mirror.get("report_generator") or {})
    tid = (template_id or "").strip()
    allowed = {
        "enabled",
        "serverId",
        "statusNodeId",
        "statusNodeLabel",
        "statusKind",
        "messageNodeId",
        "messageNodeLabel",
        "filePathNodeId",
        "filePathNodeLabel",
        "messageMaxLen",
    }
    clean = {k: patch[k] for k in allowed if k in patch}
    if not clean:
        return {"ok": False, "error": "patch 无有效字段"}
    if "statusKind" in clean and clean["statusKind"] not in ("bool", "int"):
        return {"ok": False, "error": "statusKind 须为 bool 或 int"}
    if tid:
        by_tpl = dict(rg.get("exportResultOpcByTemplateId") or {})
        cur = dict(by_tpl.get(tid) or {})
        cur.update(clean)
        by_tpl[tid] = cur
        rg["exportResultOpcByTemplateId"] = by_tpl
    else:
        cur = dict(rg.get("exportResultOpc") or {})
        cur.update(clean)
        rg["exportResultOpc"] = cur
    mirror["report_generator"] = rg
    mirror["pending_apply"] = True
    mirror["pending_token"] = str(uuid.uuid4())
    _save_mirror(mirror)
    return {
        "ok": True,
        "template_id": tid or None,
        "feedback": _mask_feedback(cur),
        "note": "前端将应用至生成报表偏好（结批结果反馈）",
    }


def explain_plc_heartbeat() -> dict[str, Any]:
    mirror = _load_mirror()
    rg = mirror.get("report_generator") if isinstance(mirror.get("report_generator"), dict) else {}
    hb = rg.get("plcHeartbeat") if isinstance(rg.get("plcHeartbeat"), dict) else {}
    return {
        "ok": True,
        "documentation": PLC_HEARTBEAT_DOC,
        "current": {
            "enabled": bool(hb.get("enabled")),
            "serverId": hb.get("serverId") or "",
            "nodeId": hb.get("nodeId") or "",
            "nodeLabel": hb.get("nodeLabel") or "",
            "intervalMs": hb.get("intervalMs"),
            "mode": hb.get("mode") or "constant_one",
        },
        "mirror_exists": bool(mirror),
    }


def check_auto_trigger_bindings() -> dict[str, Any]:
    mirror = _load_mirror()
    rg = mirror.get("report_generator") if isinstance(mirror.get("report_generator"), dict) else {}
    auto = rg.get("auto") if isinstance(rg.get("auto"), dict) else {}
    raw = auto.get("bindings")
    bindings = raw if isinstance(raw, list) else []
    tpl_ids = {s.id for s in template_store.list_summaries()}
    issues: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    active = 0
    for b in bindings:
        if not isinstance(b, dict):
            continue
        bid = str(b.get("id") or "")
        enabled = b.get("enabled") is not False
        tid = str(b.get("templateId") or "").strip()
        sid = str(b.get("serverId") or "").strip()
        nid = str(b.get("nodeId") or "").strip()
        mode = str(b.get("mode") or "rising")
        compare = str(b.get("compareValue") or "")
        complete = bool(tid and sid and nid and (mode != "equals" or compare.strip()))
        row_issues: list[str] = []
        if enabled and not complete:
            row_issues.append("已启用但配置不完整（需模版/OPC 连接/节点）")
        if tid and tid not in tpl_ids:
            row_issues.append(f"模版不存在: {tid}")
        if mode == "equals" and enabled and not compare.strip():
            row_issues.append("equals 模式缺少 compareValue")
        if enabled and complete:
            active += 1
        rows.append(
            {
                "id": bid,
                "enabled": enabled,
                "complete": complete,
                "active": enabled and complete and not row_issues,
                "templateId": tid,
                "serverId": sid,
                "nodeId": nid,
                "mode": mode,
                "issues": row_issues,
            }
        )
        for msg in row_issues:
            issues.append({"binding_id": bid, "message": msg})
    return {
        "ok": True,
        "binding_count": len(rows),
        "active_count": active,
        "issue_count": len(issues),
        "issues": issues,
        "bindings": rows,
        "max_parallel": auto.get("maxParallelExports"),
        "mirror_exists": bool(mirror),
    }


def analyze_export_parallel_health(limit: int = 40) -> dict[str, Any]:
    lim = max(5, min(int(limit or 40), 100))
    data = audit_log.list_audit(DATA_DIR, limit=lim, offset=0, action=None, result=None)
    entries = [e for e in (data.get("entries") or []) if str(e.get("action") or "").startswith("export.")]
    durations: list[float] = []
    phase_sums: dict[str, list[float]] = {}
    fail = 0
    ok_n = 0
    for e in entries:
        if e.get("result") == "ok":
            ok_n += 1
        else:
            fail += 1
        detail = e.get("detail") if isinstance(e.get("detail"), dict) else {}
        dm = detail.get("durationMs")
        try:
            if dm is not None:
                durations.append(float(dm))
        except (TypeError, ValueError):
            pass
        timings = detail.get("timings") if isinstance(detail.get("timings"), dict) else {}
        for k, v in timings.items():
            if k == "warmStart":
                continue
            try:
                phase_sums.setdefault(k, []).append(float(v))
            except (TypeError, ValueError):
                pass

    mirror = _load_mirror()
    rg = mirror.get("report_generator") if isinstance(mirror.get("report_generator"), dict) else {}
    auto = rg.get("auto") if isinstance(rg.get("auto"), dict) else {}
    max_parallel = auto.get("maxParallelExports")
    try:
        max_parallel_i = int(max_parallel) if max_parallel is not None else 1
    except (TypeError, ValueError):
        max_parallel_i = 1
    max_parallel_i = max(1, min(max_parallel_i, 16))

    avg_ms = sum(durations) / len(durations) if durations else None
    p95 = sorted(durations)[int(len(durations) * 0.95) - 1] if len(durations) >= 5 else (max(durations) if durations else None)
    advice: list[str] = []
    health = "unknown"
    if not durations:
        health = "insufficient_data"
        advice.append("近期审计缺少带 durationMs 的导出记录，请先完成几次结批/模拟结批。")
    else:
        if avg_ms is not None and avg_ms > 120000:
            health = "stressed"
            advice.append(f"平均端到端耗时约 {avg_ms/1000:.1f}s，工控机或数据源可能偏慢。")
            if max_parallel_i > 2:
                advice.append(f"建议将并行上限从 {max_parallel_i} 降到 2，观察是否更稳。")
        elif avg_ms is not None and avg_ms > 45000:
            health = "moderate"
            advice.append(f"平均耗时约 {avg_ms/1000:.1f}s，可保持并行={max_parallel_i}，高峰时注意 OPC/SQL 争用。")
        else:
            health = "healthy"
            advice.append(f"平均耗时约 {(avg_ms or 0)/1000:.1f}s，当前并行={max_parallel_i} 看起来可接受。")
            if max_parallel_i < 4 and avg_ms is not None and avg_ms < 20000:
                advice.append("若现场多路触发频繁，可尝试把并行上限提到 4（硬顶 16）。")
        if fail and ok_n + fail:
            rate = fail / (ok_n + fail)
            if rate > 0.2:
                health = "stressed"
                advice.append(f"近期失败率约 {rate*100:.0f}%，优先检查触发变量与数据源连通。")

    phase_avg = {k: round(sum(vs) / len(vs), 1) for k, vs in phase_sums.items() if vs}
    return {
        "ok": True,
        "health": health,
        "sample_exports": len(entries),
        "ok_count": ok_n,
        "fail_count": fail,
        "duration_ms": {
            "count": len(durations),
            "avg": round(avg_ms, 1) if avg_ms is not None else None,
            "p95": round(p95, 1) if p95 is not None else None,
            "max": round(max(durations), 1) if durations else None,
        },
        "phase_avg_ms": phase_avg,
        "current_max_parallel": max_parallel_i,
        "advice": advice,
    }


def summarize_report_history() -> dict[str, Any]:
    mirror = _load_mirror()
    hist = mirror.get("export_history_summary") if isinstance(mirror.get("export_history_summary"), dict) else {}
    if not hist:
        return {
            "ok": True,
            "mirror_exists": bool(mirror),
            "available": False,
            "hint": "前端尚未上报历史摘要。请保持报表软件打开，稍后重试（轮询会扫描导出目录）。",
        }
    return {"ok": True, "available": True, "summary": hist, "mirror_exists": True}


def set_max_parallel_exports(value: int) -> dict[str, Any]:
    """写入自动结批并行上限（1–16）到镜像；须 pending_token 供前端 ack。"""
    if value is None or (isinstance(value, str) and not str(value).strip()):
        return {"ok": False, "error": "max_parallel 须为整数"}
    try:
        n = int(value)
    except (TypeError, ValueError):
        return {"ok": False, "error": "max_parallel 须为整数"}
    n = max(1, min(n, 16))
    mirror = _load_mirror()
    rg = dict(mirror.get("report_generator") or {})
    auto = dict(rg.get("auto") or {})
    auto["maxParallelExports"] = n
    rg["auto"] = auto
    mirror["report_generator"] = rg
    mirror["pending_apply"] = True
    mirror["pending_token"] = str(uuid.uuid4())
    _save_mirror(mirror)
    return {"ok": True, "max_parallel": n, "note": "前端将应用并行上限"}
