"""模版 / 版式静态健康扫描（仪表盘用，只读、不探活）。"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from core.settings import CONFIG_FILE, DATA_DIR
from modules import config_store, layout_preset_store, template_store
from modules.ai_template_bindings import extract_template_bindings, validate_bindings_against_config
from modules.binding_config_scan import scan_binding_config
from schemas.report_template import TEMPLATE_SCHEMA_VERSION, parse_report_template

logger = logging.getLogger(__name__)

Severity = str  # "error" | "warn" | "info"


def _issue(
    *,
    severity: Severity,
    kind: str,
    message: str,
    asset_kind: str,
    asset_id: str,
    asset_name: str,
    hint: str = "",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "severity": severity,
        "kind": kind,
        "message": message,
        "assetKind": asset_kind,
        "assetId": asset_id,
        "assetName": asset_name,
        "hint": hint,
    }
    if meta:
        out["meta"] = meta
    return out


def _arr_len(raw: dict[str, Any], key: str) -> int:
    v = raw.get(key)
    return len(v) if isinstance(v, list) else 0


def _sheet_has_content(raw: dict[str, Any], slot: str) -> bool:
    """与前端 templateHasCoverSheet / templateHasBackSheet 近似。"""
    if slot == "cover":
        preset = str(raw.get("coverLayoutPresetId") or "").strip()
        if preset:
            return True
        return (
            _arr_len(raw, "coverElements")
            + _arr_len(raw, "coverHeaderElements")
            + _arr_len(raw, "coverFooterElements")
            + _arr_len(raw, "coverBodyZoneElements")
            > 0
            or bool(str(raw.get("coverHeaderText") or "").strip())
            or bool(str(raw.get("coverFooterText") or "").strip())
        )
    preset = str(raw.get("backLayoutPresetId") or "").strip()
    if preset:
        return True
    return (
        _arr_len(raw, "backElements")
        + _arr_len(raw, "backHeaderElements")
        + _arr_len(raw, "backFooterElements")
        + _arr_len(raw, "backBodyZoneElements")
        > 0
        or bool(str(raw.get("backHeaderText") or "").strip())
        or bool(str(raw.get("backFooterText") or "").strip())
    )


def _count_sql_fill_split_tables(raw: dict[str, Any]) -> int:
    """统计启用且 splitReportsOnMaxRows 的 SQL 填充表数量。"""
    n = 0

    def walk(obj: Any) -> None:
        nonlocal n
        if isinstance(obj, dict):
            if obj.get("type") == "table":
                fill = obj.get("tableSqlFill")
                if isinstance(fill, dict) and fill.get("enabled") is True:
                    if fill.get("splitReportsOnMaxRows") is True:
                        n += 1
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(raw)
    return n


def _has_legacy_elements_only(raw: dict[str, Any]) -> bool:
    """仅有旧版 elements、缺少有效 bodyPages 时提示（打开保存会迁移）。"""
    elements = raw.get("elements")
    body_pages = raw.get("bodyPages")
    has_elements = isinstance(elements, list) and len(elements) > 0
    has_pages = False
    if isinstance(body_pages, list):
        for page in body_pages:
            if isinstance(page, list) and len(page) > 0:
                has_pages = True
                break
    return has_elements and not has_pages


def _check_orphan_presets(
    raw: dict[str, Any],
    *,
    asset_id: str,
    asset_name: str,
    layout_by_id: dict[str, Any],
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    checks = (
        ("body", "layoutPresetId", "normal", "正文"),
        ("cover", "coverLayoutPresetId", "cover", "封面"),
        ("back", "backLayoutPresetId", "back", "封尾"),
    )
    for _slot, key, expected_role, label in checks:
        pid = str(raw.get(key) or "").strip()
        if not pid:
            continue
        hit = layout_by_id.get(pid)
        if not hit:
            issues.append(
                _issue(
                    severity="error",
                    kind="orphan_layout_preset",
                    message=f"{label}版式缺失（id={pid[:8]}…）" if len(pid) > 8 else f"{label}版式缺失（id={pid}）",
                    asset_kind="template",
                    asset_id=asset_id,
                    asset_name=asset_name,
                    hint="请在模版管理中重新选择版式，或从版式库恢复该版式。",
                    meta={"slot": _slot, "presetId": pid},
                )
            )
            continue
        role = getattr(hit, "pageRole", None) or (hit.get("pageRole") if isinstance(hit, dict) else None)
        if role and role != expected_role:
            issues.append(
                _issue(
                    severity="error",
                    kind="layout_preset_role_mismatch",
                    message=f"{label}绑定的版式用途不匹配（期望 {expected_role}，实际 {role}）",
                    asset_kind="template",
                    asset_id=asset_id,
                    asset_name=asset_name,
                    hint="请改绑到正确用途的版式。",
                    meta={"slot": _slot, "presetId": pid, "expectedRole": expected_role, "actualRole": role},
                )
            )
    return issues


def _scan_one_template(
    summary: Any,
    *,
    layout_by_id: dict[str, Any],
    db_by_id: dict[str, dict[str, Any]],
    opc_by_id: dict[str, dict[str, Any]],
    opc_server_count: int,
) -> list[dict[str, Any]]:
    tid = summary.id
    name = summary.name or tid
    path = template_store.template_path(tid)
    if not path.is_file():
        return [
            _issue(
                severity="error",
                kind="template_file_missing",
                message="模版文件缺失",
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
                hint="摘要列表有该项但磁盘文件不存在，可删除摘要或从备份恢复。",
            )
        ]

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [
            _issue(
                severity="error",
                kind="template_corrupt",
                message=f"模版 JSON 无法解析：{e}",
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
                hint="文件可能损坏，请从备份导入或删除后重建。",
            )
        ]
    if not isinstance(raw, dict):
        return [
            _issue(
                severity="error",
                kind="template_corrupt",
                message="模版根对象不是 JSON 对象",
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
            )
        ]

    issues: list[dict[str, Any]] = []

    try:
        parse_report_template(raw)
    except Exception as e:
        issues.append(
            _issue(
                severity="error",
                kind="template_schema_invalid",
                message=f"模版 schema 校验失败：{e}",
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
                hint="可能含未知字段或控件结构损坏；打开编辑器保存前请先备份。",
            )
        )

    sv = raw.get("schemaVersion")
    try:
        sv_n = int(sv) if sv is not None else 1
    except (TypeError, ValueError):
        sv_n = 1
    if sv_n < TEMPLATE_SCHEMA_VERSION:
        issues.append(
            _issue(
                severity="info",
                kind="schema_outdated",
                message=f"schemaVersion={sv_n}，当前为 {TEMPLATE_SCHEMA_VERSION}（打开并保存后会自动升级）",
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
                hint="一般不影响使用；建议打开模版保存一次以迁移。",
                meta={"schemaVersion": sv_n, "current": TEMPLATE_SCHEMA_VERSION},
            )
        )

    if _has_legacy_elements_only(raw):
        issues.append(
            _issue(
                severity="warn",
                kind="legacy_elements_shape",
                message="仍为旧版「单页 elements」结构，缺少 bodyPages",
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
                hint="打开模版并保存即可迁移为多页 bodyPages。",
            )
        )

    issues.extend(_check_orphan_presets(raw, asset_id=tid, asset_name=name, layout_by_id=layout_by_id))

    for slot, label in (("cover", "封面"), ("back", "封尾")):
        preset_key = "coverLayoutPresetId" if slot == "cover" else "backLayoutPresetId"
        if _sheet_has_content(raw, slot) and not str(raw.get(preset_key) or "").strip():
            # 有残留区段但无版式 ID：可能是断开版式后的残留
            canvas_key = "coverElements" if slot == "cover" else "backElements"
            if _arr_len(raw, canvas_key) == 0:
                issues.append(
                    _issue(
                        severity="warn",
                        kind="stale_optional_sheet",
                        message=f"{label}无版式绑定但仍有页眉/页脚残留（缩略图可能仍显示）",
                        asset_kind="template",
                        asset_id=tid,
                        asset_name=name,
                        hint="在模版管理中将封面/封尾设为「不使用」，或重新选择版式。",
                        meta={"slot": slot},
                    )
                )

    bindings = extract_template_bindings(raw)
    for bi in validate_bindings_against_config(bindings, db_by_id=db_by_id, opc_by_id=opc_by_id):
        kind = str(bi.get("kind") or "binding")
        severity: Severity = "error" if kind == "missing_db" else "warn"
        issues.append(
            _issue(
                severity=severity,
                kind=kind,
                message=str(bi.get("message") or kind),
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
                hint="请在数据源配置中恢复连接，或在模版属性中重选数据源。",
                meta={k: v for k, v in bi.items() if k not in ("kind", "message")},
            )
        )

    opc_nodes = bindings.get("opc_node_ids") or []
    if opc_nodes and opc_server_count <= 0:
        issues.append(
            _issue(
                severity="warn",
                kind="opc_server_missing",
                message=f"模版含 {len(opc_nodes)} 处 OPC 节点绑定，但未配置任何 OPC UA 服务器",
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
                hint="请在数据源配置中添加 OPC UA 服务器。",
            )
        )

    split_n = _count_sql_fill_split_tables(raw)
    if split_n > 1:
        issues.append(
            _issue(
                severity="error",
                kind="multi_split_sql_fill",
                message=f"启用「按行数分报表」的 SQL 填充表有 {split_n} 个，导出规则仅允许 1 个",
                asset_kind="template",
                asset_id=tid,
                asset_name=name,
                hint="请只保留一张表开启分报表，或关闭多余表的该选项。",
                meta={"count": split_n},
            )
        )

    issues.extend(
        scan_binding_config(raw, asset_kind="template", asset_id=tid, asset_name=name)
    )

    return issues


def _scan_one_layout(
    summary: Any,
    *,
    db_by_id: dict[str, dict[str, Any]],
    opc_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    lid = summary.id
    name = summary.name or lid
    path = layout_preset_store.preset_path(lid)
    if not path.is_file():
        return [
            _issue(
                severity="error",
                kind="layout_file_missing",
                message="版式文件缺失",
                asset_kind="layout",
                asset_id=lid,
                asset_name=name,
            )
        ]
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [
            _issue(
                severity="error",
                kind="layout_corrupt",
                message=f"版式 JSON 无法解析：{e}",
                asset_kind="layout",
                asset_id=lid,
                asset_name=name,
                hint="文件可能损坏，请从备份恢复或删除后重建。",
            )
        ]
    if not isinstance(raw, dict):
        return [
            _issue(
                severity="error",
                kind="layout_corrupt",
                message="版式根对象不是 JSON 对象",
                asset_kind="layout",
                asset_id=lid,
                asset_name=name,
            )
        ]

    issues: list[dict[str, Any]] = []
    loaded = layout_preset_store.load_preset(lid)
    if loaded is None:
        issues.append(
            _issue(
                severity="error",
                kind="layout_schema_invalid",
                message="版式 schema 校验失败（可能含未知控件字段）",
                asset_kind="layout",
                asset_id=lid,
                asset_name=name,
                hint="打开版式编辑器检查控件；无法打开则从备份恢复。",
            )
        )

    bindings = extract_template_bindings(raw)
    for bi in validate_bindings_against_config(bindings, db_by_id=db_by_id, opc_by_id=opc_by_id):
        kind = str(bi.get("kind") or "binding")
        if kind != "missing_db":
            continue
        issues.append(
            _issue(
                severity="error",
                kind=kind,
                message=str(bi.get("message") or kind),
                asset_kind="layout",
                asset_id=lid,
                asset_name=name,
                hint="版式中的表格/参数绑定了已删除的数据库连接。",
                meta={k: v for k, v in bi.items() if k not in ("kind", "message")},
            )
        )
    issues.extend(scan_binding_config(raw, asset_kind="layout", asset_id=lid, asset_name=name))
    return issues


def run_asset_health_scan() -> dict[str, Any]:
    """扫描全部模版与版式，返回汇总与问题列表。"""
    cfg = config_store.load_config(CONFIG_FILE, DATA_DIR)
    db_by_id = {
        c.get("id"): config_store.mask_connection_for_response(c)
        for c in (cfg.get("db_connections") or [])
        if c.get("id")
    }
    opc_servers = list(cfg.get("opcua_servers") or [])
    opc_by_id = {s.get("id"): config_store.mask_opcua_for_response(s) for s in opc_servers if s.get("id")}

    layout_summaries = layout_preset_store.list_summaries()
    layout_by_id = {s.id: s for s in layout_summaries}
    template_summaries = template_store.list_summaries()

    issues: list[dict[str, Any]] = []
    for s in template_summaries:
        try:
            issues.extend(
                _scan_one_template(
                    s,
                    layout_by_id=layout_by_id,
                    db_by_id=db_by_id,
                    opc_by_id=opc_by_id,
                    opc_server_count=len(opc_servers),
                )
            )
        except Exception:
            logger.exception("扫描模版失败: %s", getattr(s, "id", "?"))
            issues.append(
                _issue(
                    severity="error",
                    kind="scan_exception",
                    message="扫描模版时发生异常",
                    asset_kind="template",
                    asset_id=getattr(s, "id", ""),
                    asset_name=getattr(s, "name", ""),
                )
            )

    for s in layout_summaries:
        try:
            issues.extend(_scan_one_layout(s, db_by_id=db_by_id, opc_by_id=opc_by_id))
        except Exception:
            logger.exception("扫描版式失败: %s", getattr(s, "id", "?"))
            issues.append(
                _issue(
                    severity="error",
                    kind="scan_exception",
                    message="扫描版式时发生异常",
                    asset_kind="layout",
                    asset_id=getattr(s, "id", ""),
                    asset_name=getattr(s, "name", ""),
                )
            )

    # 严重度排序：error > warn > info
    rank = {"error": 0, "warn": 1, "info": 2}
    issues.sort(key=lambda x: (rank.get(str(x.get("severity")), 9), str(x.get("assetName") or "")))

    error_n = sum(1 for i in issues if i.get("severity") == "error")
    warn_n = sum(1 for i in issues if i.get("severity") == "warn")
    info_n = sum(1 for i in issues if i.get("severity") == "info")
    tpl_hit = {i["assetId"] for i in issues if i.get("assetKind") == "template"}
    lay_hit = {i["assetId"] for i in issues if i.get("assetKind") == "layout"}

    return {
        "ok": error_n == 0,
        "scannedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "templateCount": len(template_summaries),
        "layoutCount": len(layout_summaries),
        "templatesWithIssues": len(tpl_hit),
        "layoutsWithIssues": len(lay_hit),
        "errorCount": error_n,
        "warnCount": warn_n,
        "infoCount": info_n,
        "issueCount": len(issues),
        "issues": issues,
    }
