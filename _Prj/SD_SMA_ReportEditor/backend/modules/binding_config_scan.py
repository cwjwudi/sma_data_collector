"""模版/版式绑定语法与配置完整性静态检查（不探活 OPC/数据库）。"""

from __future__ import annotations

import re
from typing import Any, Callable

from modules.db_readonly_service import validate_readonly_sql

IssueBuilder = Callable[..., dict[str, Any]]

_OPC_NODE_RE = re.compile(r"^ns=\d+;(i|s|g|b)=.+$", re.IGNORECASE)
_PARAM_PLACEHOLDER_RE = re.compile(r"\{\{p(\d+)\}\}", re.IGNORECASE)
_SQL_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
_VERTICAL_PENDING = "__field__"

_CONTROL_TYPE_ZH: dict[str, str] = {
    "parameter": "数据参数",
    "text": "文本",
    "box": "色块",
    "image": "图片",
    "table": "表格",
    "chart": "图表",
    "signature": "签名",
    "pageNumber": "页码",
    "date": "日期",
}


def looks_like_opc_node_id(node_id: str) -> bool:
    s = (node_id or "").strip()
    if not s:
        return False
    return bool(_OPC_NODE_RE.match(s))


def _short_text(s: str, max_len: int = 20) -> str:
    t = re.sub(r"\s+", " ", (s or "").strip())
    if not t:
        return ""
    return t if len(t) <= max_len else t[: max_len - 1] + "…"


def _control_type_zh(type_name: str) -> str:
    t = (type_name or "").strip()
    return _CONTROL_TYPE_ZH.get(t, t or "控件")


def describe_element_location(path: str) -> str:
    """把 JSON 路径转成用户可读位置，如「正文第2页」「页眉」「封面」。"""
    p = path or ""
    m = re.search(r"bodyPages\[(\d+)\]", p)
    if m:
        return f"正文第{int(m.group(1)) + 1}页"
    if "coverBodyZoneElements" in p:
        return "封面"
    if "coverHeaderElements" in p:
        return "封面页眉"
    if "coverFooterElements" in p:
        return "封面页脚"
    if "backBodyZoneElements" in p:
        return "末页"
    if "backHeaderElements" in p:
        return "末页页眉"
    if "backFooterElements" in p:
        return "末页页脚"
    if re.search(r"(^|\.)headerElements(\[|$)", p):
        return "页眉"
    if re.search(r"(^|\.)footerElements(\[|$)", p):
        return "页脚"
    if re.search(r"(^|\.)elements(\[|$)", p):
        return "正文"
    if p.startswith("zones.") or ".zones." in p:
        return "版式区"
    return "模版"


def describe_control_label(el: dict[str, Any], path: str) -> str:
    """生成「正文第1页 · 数据参数「批次号」」这类控件标签。"""
    loc = describe_element_location(path)
    et = str(el.get("type") or "")
    type_zh = _control_type_zh(et)
    name = _short_text(str(el.get("text") or ""))
    if name:
        return f"{loc} · {type_zh}「{name}」"
    eid = str(el.get("id") or "").strip()
    if eid:
        short_id = eid if len(eid) <= 10 else eid[:8] + "…"
        return f"{loc} · {type_zh}（{short_id}）"
    return f"{loc} · {type_zh}"


def describe_table_cell_label(el: dict[str, Any], path: str, row: int, col: int) -> str:
    base = describe_control_label(el, path)
    return f"{base} · 单元格[第{row + 1}行,第{col + 1}列]"


def _param_indices(text: str) -> list[int]:
    return [int(m.group(1)) for m in _PARAM_PLACEHOLDER_RE.finditer(text or "")]


def _is_valid_sql_ident(name: str) -> bool:
    return bool(_SQL_IDENT_RE.match((name or "").strip()))


def _issue(
    make: IssueBuilder,
    *,
    severity: str,
    kind: str,
    message: str,
    hint: str = "",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return make(severity=severity, kind=kind, message=message, hint=hint, meta=meta)


def _check_opc_node(
    make: IssueBuilder,
    *,
    kind_empty: str,
    kind_bad: str,
    label: str,
    path: str,
    binding_kind: str | None,
    node_id: str,
) -> list[dict[str, Any]]:
    if (binding_kind or "").strip() != "opcua":
        return []
    nid = (node_id or "").strip()
    if not nid:
        return [
            _issue(
                make,
                severity="error",
                kind=kind_empty,
                message=f"{label}：已选 OPC UA 但未填写节点 ID",
                hint="请选择 OPC 节点，或将绑定方式改回「无绑定」。",
                meta={"path": path},
            )
        ]
    if not looks_like_opc_node_id(nid):
        return [
            _issue(
                make,
                severity="warn",
                kind=kind_bad,
                message=f"{label}：节点 ID 格式可疑「{nid[:64]}」",
                hint="常见格式如 ns=6;s=::Program:Var 或 ns=2;i=1234。",
                meta={"path": path, "nodeId": nid},
            )
        ]
    return []


def _check_params(
    make: IssueBuilder,
    *,
    label: str,
    path: str,
    sql_or_json: str,
    params: Any,
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    idxs = _param_indices(sql_or_json)
    if not idxs and not (isinstance(params, list) and params):
        return issues
    param_list = params if isinstance(params, list) else []
    if idxs:
        max_i = max(idxs)
        if max_i >= len(param_list):
            issues.append(
                _issue(
                    make,
                    severity="error",
                    kind="sql_param_placeholder_oob",
                    message=f"{label}：SQL 使用了 {{{{p{max_i}}}}}，但参数槽仅 {len(param_list)} 个",
                    hint="请补齐参数绑定，或修正 SQL 中的 {{pN}} 下标。",
                    meta={"path": path, "maxParamIndex": max_i, "paramCount": len(param_list)},
                )
            )
    for i, p in enumerate(param_list):
        if not isinstance(p, dict):
            continue
        src = str(p.get("source") or "").strip()
        if src != "opcua":
            continue
        nid = str(p.get("opcuaNodeId") or "").strip()
        lit = str(p.get("literalFallback") or "").strip()
        if not nid and not lit:
            issues.append(
                _issue(
                    make,
                    severity="warn",
                    kind="sql_param_opcua_unconfigured",
                    message=f"{label}：参数 p{i} 选了 OPC UA，但未绑节点且无手写兜底",
                    hint="请绑定 OPC 节点，或填写字面量兜底值。",
                    meta={"path": path, "paramIndex": i},
                )
            )
        elif nid and not looks_like_opc_node_id(nid):
            issues.append(
                _issue(
                    make,
                    severity="warn",
                    kind="opc_node_id_malformed",
                    message=f"{label}：参数 p{i} 的 OPC 节点格式可疑",
                    hint="请检查节点 ID 写法。",
                    meta={"path": path, "paramIndex": i, "nodeId": nid},
                )
            )
    return issues


def _check_readonly_sql(make: IssueBuilder, *, label: str, path: str, sql: str) -> list[dict[str, Any]]:
    raw = (sql or "").strip()
    if not raw:
        return []
    probe = _PARAM_PLACEHOLDER_RE.sub("'0'", raw)
    probe = probe.replace("{{table}}", "dummy_table").replace("{{TABLE}}", "dummy_table")
    try:
        validate_readonly_sql(probe)
    except ValueError as e:
        return [
            _issue(
                make,
                severity="warn",
                kind="sql_readonly_syntax_invalid",
                message=f"{label}：SQL 只读校验未通过（{e}）",
                hint="仅允许单条 SELECT/SHOW/DESCRIBE/EXPLAIN/WITH；禁止写操作关键字。",
                meta={"path": path},
            )
        ]
    return []


def _visual_select_fields(vs: dict[str, Any], layout_mode: str) -> list[str]:
    cols = vs.get("columns") if isinstance(vs.get("columns"), list) else []
    out: list[str] = []
    if layout_mode == "vertical":
        for c in cols:
            s = str(c or "").strip()
            if not s or s == _VERTICAL_PENDING:
                continue
            out.append(s)
        return out
    # horizontal: skip blank/sequence via companion roles if present — roles live on fill
    return [str(c or "").strip() for c in cols if str(c or "").strip()]


def _check_table_sql_fill(
    make: IssueBuilder,
    *,
    path: str,
    fill: dict[str, Any],
    label: str = "表格 · 数据库填充",
) -> list[dict[str, Any]]:
    if fill.get("enabled") is not True:
        return []
    issues: list[dict[str, Any]] = []
    mode = str(fill.get("fillMode") or "visual").strip() or "visual"
    query = str(fill.get("querySql") or "").strip()
    vs = fill.get("visualSource") if isinstance(fill.get("visualSource"), dict) else {}
    layout_mode = str(fill.get("layoutMode") or "horizontal")

    if mode == "mongo":
        mq = fill.get("mongoQuery") if isinstance(fill.get("mongoQuery"), dict) else {}
        cid = str(mq.get("connectionId") or "").strip()
        db = str(mq.get("database") or "").strip()
        coll = str(mq.get("collection") or "").strip()
        coll_opc = str(mq.get("collectionOpcNodeId") or "").strip()
        if not cid or (not db and not coll and not coll_opc):
            issues.append(
                _issue(
                    make,
                    severity="error",
                    kind="mongo_binding_incomplete",
                    message=f"{label}：Mongo 模式缺少连接或集合配置",
                    hint="请填写 connectionId、database，以及 collection 或集合 OPC 节点。",
                    meta={"path": path},
                )
            )
        if coll_opc and not looks_like_opc_node_id(coll_opc):
            issues.append(
                _issue(
                    make,
                    severity="warn",
                    kind="opc_node_id_malformed",
                    message=f"{label}：Mongo 集合 OPC 节点格式可疑",
                    meta={"path": path, "nodeId": coll_opc},
                )
            )
        blob = " ".join(
            str(mq.get(k) or "")
            for k in ("filterJson", "projectionJson", "sortJson", "pipelineJson", "collection")
        )
        issues.extend(_check_params(make, label=label, path=path, sql_or_json=blob, params=fill.get("params")))
        return issues

    if mode in ("visual", "manual_sql") and not query:
        issues.append(
            _issue(
                make,
                severity="error",
                kind="sql_fill_enabled_no_query",
                message=f"{label}：已启用但 querySql 为空",
                hint="请在可视化模式选好连接/表/列并编译，或手写 SQL。",
                meta={"path": path, "fillMode": mode},
            )
        )

    if mode == "visual":
        cid = str(vs.get("connectionId") or "").strip()
        table = str(vs.get("table") or "").strip()
        engine = str(vs.get("engine") or "").strip().lower()
        table_source = str(vs.get("tableSource") or "manual").strip() or "manual"
        table_opc = str(vs.get("tableOpcNodeId") or "").strip()

        if not cid:
            issues.append(
                _issue(
                    make,
                    severity="error",
                    kind="sql_fill_visual_no_connection",
                    message=f"{label}：可视化模式未选择数据源连接",
                    hint="请在属性面板选择数据库连接。",
                    meta={"path": path},
                )
            )
        if engine == "mongodb":
            issues.append(
                _issue(
                    make,
                    severity="error",
                    kind="sql_fill_visual_compile_failed",
                    message=f"{label}：可视化 SQL 不支持 Mongo 引擎",
                    hint="请改用 Mongo 填充模式，或换 SQL 引擎连接。",
                    meta={"path": path},
                )
            )
        if table_source == "opcua":
            if not table:
                issues.append(
                    _issue(
                        make,
                        severity="error",
                        kind="sql_fill_visual_no_structure_table",
                        message=f"{label}：表名来源为 OPC，但未选结构参考表",
                        hint="请选择一张库中现存表，用于设计时选列；OPC 失败时也会用它兜底。",
                        meta={"path": path},
                    )
                )
            if not table_opc:
                issues.append(
                    _issue(
                        make,
                        severity="error",
                        kind="sql_fill_table_opc_missing_node",
                        message=f"{label}：表名来源为 OPC，但未绑定表名节点",
                        hint="请选择存放动态表名的 OPC UA 变量。",
                        meta={"path": path},
                    )
                )
            elif not looks_like_opc_node_id(table_opc):
                issues.append(
                    _issue(
                        make,
                        severity="warn",
                        kind="opc_node_id_malformed",
                        message=f"{label}：表名 OPC 节点格式可疑",
                        meta={"path": path, "nodeId": table_opc},
                    )
                )
            if table_opc and query and "{{table}}" not in query and "{{TABLE}}" not in query:
                issues.append(
                    _issue(
                        make,
                        severity="error",
                        kind="sql_fill_table_placeholder_mismatch",
                        message=f"{label}：已绑表名 OPC，但 querySql 不含 {{{{table}}}} 占位符",
                        hint="请重新「编译」可视化 SQL，或手写加入 {{table}}。",
                        meta={"path": path},
                    )
                )
            if (not table_opc) and query and ("{{table}}" in query or "{{TABLE}}" in query):
                issues.append(
                    _issue(
                        make,
                        severity="error",
                        kind="sql_fill_table_placeholder_mismatch",
                        message=f"{label}：querySql 含 {{{{table}}}}，但未配置表名 OPC 节点",
                        hint="请将表名来源设为 OPC UA 并绑定节点，或改回固定表名。",
                        meta={"path": path},
                    )
                )
        elif not table and cid:
            issues.append(
                _issue(
                    make,
                    severity="error",
                    kind="sql_fill_visual_compile_failed",
                    message=f"{label}：可视化模式未选择数据表",
                    hint="请选择表名后再编译 SQL。",
                    meta={"path": path},
                )
            )

        fields = _visual_select_fields(vs, layout_mode)
        if cid and table and engine and engine != "mongodb" and not fields:
            issues.append(
                _issue(
                    make,
                    severity="error",
                    kind="sql_fill_visual_compile_failed",
                    message=f"{label}：无可选输出列（可能仍有「待选字段」）",
                    hint="请在画布或属性中为每列选定真实字段。",
                    meta={"path": path},
                )
            )
        for f in fields:
            if not _is_valid_sql_ident(f):
                issues.append(
                    _issue(
                        make,
                        severity="error",
                        kind="sql_fill_visual_compile_failed",
                        message=f"{label}：列名非法「{f}」（仅允许字母数字下划线）",
                        meta={"path": path, "column": f},
                    )
                )
                break
        if table and not _is_valid_sql_ident(table) and table_source != "opcua":
            issues.append(
                _issue(
                    make,
                    severity="error",
                    kind="sql_fill_visual_compile_failed",
                    message=f"{label}：表名非法「{table}」",
                    meta={"path": path, "table": table},
                )
            )
        if layout_mode == "vertical":
            cols = vs.get("columns") if isinstance(vs.get("columns"), list) else []
            if any(str(c or "").strip() == _VERTICAL_PENDING for c in cols):
                issues.append(
                    _issue(
                        make,
                        severity="warn",
                        kind="sql_fill_vertical_pending_field",
                        message=f"{label}：纵表仍有「待选字段」槽位",
                        hint="请把占位行改成真实库字段，否则导出可能无数据列。",
                        meta={"path": path},
                    )
                )

    if query:
        issues.extend(_check_params(make, label=label, path=path, sql_or_json=query, params=fill.get("params")))
        issues.extend(_check_readonly_sql(make, label=label, path=path, sql=query))

    # 列头 / 左列标签 OPC
    for arr_key, item_label in (
        ("resultColumnNameBindings", "列头名称"),
        ("verticalFieldLabelBindings", "纵表左列标签"),
    ):
        arr = fill.get(arr_key)
        if not isinstance(arr, list):
            continue
        for i, b in enumerate(arr):
            if not isinstance(b, dict):
                continue
            issues.extend(
                _check_opc_node(
                    make,
                    kind_empty="label_opc_binding_empty",
                    kind_bad="opc_node_id_malformed",
                    label=f"{label}·{item_label}[{i}]",
                    path=f"{path}.{arr_key}[{i}]",
                    binding_kind=str(b.get("bindingKind") or ""),
                    node_id=str(b.get("opcuaNodeId") or ""),
                )
            )
    sep = fill.get("continueRecordSepLabelBinding")
    if isinstance(sep, dict):
        issues.extend(
            _check_opc_node(
                make,
                kind_empty="label_opc_binding_empty",
                kind_bad="opc_node_id_malformed",
                label=f"{label}·续表分隔",
                path=f"{path}.continueRecordSepLabelBinding",
                binding_kind=str(sep.get("bindingKind") or ""),
                node_id=str(sep.get("opcuaNodeId") or ""),
            )
        )

    # visualFilters 内 bindings
    vfs = fill.get("visualFilters")
    if isinstance(vfs, list):
        for fi, vf in enumerate(vfs):
            if not isinstance(vf, dict):
                continue
            binds = vf.get("bindings")
            if not isinstance(binds, list):
                continue
            for bi, b in enumerate(binds):
                if not isinstance(b, dict):
                    continue
                if str(b.get("source") or "") != "opcua":
                    continue
                nid = str(b.get("opcuaNodeId") or "").strip()
                lit = str(b.get("literalFallback") or "").strip()
                if not nid and not lit:
                    issues.append(
                        _issue(
                            make,
                            severity="warn",
                            kind="sql_param_opcua_unconfigured",
                            message=f"{label}：筛选条件[{fi}] 绑定槽 {bi} 未配置 OPC/兜底",
                            meta={"path": f"{path}.visualFilters[{fi}].bindings[{bi}]"},
                        )
                    )
                elif nid and not looks_like_opc_node_id(nid):
                    issues.append(
                        _issue(
                            make,
                            severity="warn",
                            kind="opc_node_id_malformed",
                            message=f"{label}：筛选条件[{fi}] OPC 节点格式可疑",
                            meta={"path": f"{path}.visualFilters[{fi}]", "nodeId": nid},
                        )
                    )
    return issues


def _check_element(make: IssueBuilder, *, path: str, el: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(el, dict):
        return []
    issues: list[dict[str, Any]] = []
    et = str(el.get("type") or "")
    bk = str(el.get("bindingKind") or "none")
    label = describe_control_label(el, path)
    loc_meta = {
        "path": path,
        "location": describe_element_location(path),
        "elementType": et,
        "elementId": str(el.get("id") or ""),
    }

    if et in ("parameter", "text", "box", "chart") or bk in ("opcua", "sql", "mongo"):
        if bk == "opcua":
            opc_issues = _check_opc_node(
                make,
                kind_empty="opc_binding_empty_node",
                kind_bad="opc_node_id_malformed",
                label=label,
                path=path,
                binding_kind=bk,
                node_id=str(el.get("opcuaNodeId") or ""),
            )
            for it in opc_issues:
                meta = dict(it.get("meta") or {})
                meta.update(loc_meta)
                it["meta"] = meta
            issues.extend(opc_issues)
        elif bk == "sql":
            sql = str(el.get("sqlText") or "").strip()
            visual = el.get("scalarSqlVisual") if isinstance(el.get("scalarSqlVisual"), dict) else None
            mode = el.get("scalarSqlFillMode")
            # 可视化标量：无 sqlText 时若 visual 也不完整则报空
            if not sql and mode == "visual" and visual:
                if not str(visual.get("connectionId") or "").strip() or not str(visual.get("table") or "").strip():
                    issues.append(
                        _issue(
                            make,
                            severity="error",
                            kind="sql_binding_empty",
                            message=f"{label}：SQL 绑定未配置完整（连接/表）",
                            hint="请用点选生成 SQL，或改为手写 SQL。",
                            meta=dict(loc_meta),
                        )
                    )
            elif not sql:
                issues.append(
                    _issue(
                        make,
                        severity="error",
                        kind="sql_binding_empty",
                        message=f"{label}：已选 SQL 绑定但 SQL 为空",
                        hint="请填写 SQL，或改回「无绑定」。",
                        meta=dict(loc_meta),
                    )
                )
            if sql:
                issues.extend(_check_params(make, label=label, path=path, sql_or_json=sql, params=el.get("sqlParams")))
                issues.extend(_check_readonly_sql(make, label=label, path=path, sql=sql))
        elif bk == "mongo":
            mq = el.get("mongoQuery") if isinstance(el.get("mongoQuery"), dict) else {}
            if not str(mq.get("connectionId") or "").strip():
                issues.append(
                    _issue(
                        make,
                        severity="error",
                        kind="mongo_binding_incomplete",
                        message=f"{label}：Mongo 绑定缺少连接",
                        meta=dict(loc_meta),
                    )
                )

    if et == "table":
        # 单元格绑定
        cells = el.get("tableCells")
        if isinstance(cells, list):
            for ri, row in enumerate(cells):
                if not isinstance(row, list):
                    continue
                for ci, cell in enumerate(row):
                    if not isinstance(cell, dict):
                        continue
                    cbk = str(cell.get("bindingKind") or "none")
                    clabel = describe_table_cell_label(el, path, ri, ci)
                    cpath = f"{path}.tableCells[{ri}][{ci}]"
                    cell_meta = {
                        **loc_meta,
                        "path": cpath,
                        "row": ri,
                        "col": ci,
                    }
                    if cbk == "opcua":
                        cell_issues = _check_opc_node(
                            make,
                            kind_empty="opc_binding_empty_node",
                            kind_bad="opc_node_id_malformed",
                            label=clabel,
                            path=cpath,
                            binding_kind=cbk,
                            node_id=str(cell.get("opcuaNodeId") or ""),
                        )
                        for it in cell_issues:
                            meta = dict(it.get("meta") or {})
                            meta.update(cell_meta)
                            it["meta"] = meta
                        issues.extend(cell_issues)
                    elif cbk == "sql":
                        csql = str(cell.get("sqlText") or "").strip()
                        if not csql:
                            issues.append(
                                _issue(
                                    make,
                                    severity="error",
                                    kind="sql_binding_empty",
                                    message=f"{clabel}：已选 SQL 但 SQL 为空",
                                    meta=cell_meta,
                                )
                            )
                        else:
                            issues.extend(
                                _check_params(
                                    make, label=clabel, path=cpath, sql_or_json=csql, params=cell.get("sqlParams")
                                )
                            )
                            issues.extend(_check_readonly_sql(make, label=clabel, path=cpath, sql=csql))
        fill = el.get("tableSqlFill")
        if isinstance(fill, dict):
            fill_label = f"{label} · 数据库填充"
            issues.extend(_check_table_sql_fill(make, path=f"{path}.tableSqlFill", fill=fill, label=fill_label))

    return issues


def _walk_elements(obj: Any, path: str, out: list[tuple[str, dict[str, Any]]]) -> None:
    if isinstance(obj, dict):
        # 控件：有 type + id 的对象
        if isinstance(obj.get("type"), str) and isinstance(obj.get("id"), str):
            out.append((path, obj))
        for k, v in obj.items():
            _walk_elements(v, f"{path}.{k}" if path else k, out)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _walk_elements(v, f"{path}[{i}]", out)


def scan_binding_config(
    raw: dict[str, Any],
    *,
    asset_kind: str,
    asset_id: str,
    asset_name: str,
) -> list[dict[str, Any]]:
    """对单份模版或版式 JSON 做绑定语法/配置检查。"""

    def make(
        *,
        severity: str,
        kind: str,
        message: str,
        hint: str = "",
        meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        item: dict[str, Any] = {
            "severity": severity,
            "kind": kind,
            "message": message,
            "assetKind": asset_kind,
            "assetId": asset_id,
            "assetName": asset_name,
            "hint": hint,
        }
        if meta:
            item["meta"] = meta
        return item

    elements: list[tuple[str, dict[str, Any]]] = []
    _walk_elements(raw, "", elements)
    issues: list[dict[str, Any]] = []
    seen: set[str] = set()
    for path, el in elements:
        eid = str(el.get("id") or "")
        # 同一控件可能在 elements 与 bodyPages 重复出现，按 id 去重
        key = eid or path
        if key in seen:
            continue
        seen.add(key)
        issues.extend(_check_element(make, path=path or eid, el=el))
    return issues
