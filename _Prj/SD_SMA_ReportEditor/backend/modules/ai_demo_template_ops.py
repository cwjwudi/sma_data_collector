"""创建绑定冒烟测试用：用户库表 + 含 OPC/SQL 绑定的报表模版。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pymysql

from core.settings import CONFIG_FILE, DATA_DIR
from modules import ai_asset_ops, config_store, opcua_service, template_store
from schemas.report_template import parse_report_template

DEMO_DB = "report_user_lib"
DEMO_BATCH_NO = "B20260710"
SMOKE_TEMPLATE_NAME = "绑定冒烟测试（OPC+SQL）"

# ARSim（本机现有 OPC）常用 Program 变量
DEFAULT_OPC_NODES = {
    "bool": "ns=6;s=::Program:SegTempStatus.ActProtectActive",
    "float": "ns=6;s=::Program:SegTempActValue",
    "uint16": "ns=6;s=::Program:SegTempCalcValidCnt",
    "int32": "ns=6;s=::Program:SegTempStatus.SegTempSetScanInterval",
    "float_avg": "ns=6;s=::Program:SegTempStatus.ActAvgTemp",
    # String：筛选绑定时用；literalFallback 保证预览仍能命中演示批次
    "string": "ns=6;s=::Program:StepAction.Text.Main",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _cfg() -> dict[str, Any]:
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _pick_db_connection(connection_id: str | None = None) -> dict[str, Any] | None:
    conns = list(_cfg().get("db_connections") or [])
    if connection_id:
        for c in conns:
            if c.get("id") == connection_id:
                return c
        return None
    prefs = _cfg().get("app_preferences") or {}
    for key in ("last_connection_id", "default_connection_id"):
        cid = prefs.get(key)
        if cid:
            for c in conns:
                if c.get("id") == cid:
                    return c
    for c in conns:
        eng = (c.get("engine") or "").lower()
        if eng in ("mysql", "mariadb") and not c.get("is_demo"):
            return c
    return conns[0] if conns else None


def _pick_opc_server(server_id: str | None = None) -> dict[str, Any] | None:
    servers = list(_cfg().get("opcua_servers") or [])
    if server_id:
        for s in servers:
            if s.get("id") == server_id:
                return s
        return None
    prefs = _cfg().get("app_preferences") or {}
    for key in ("last_opcua_server_id", "default_opcua_server_id"):
        sid = prefs.get(key)
        if sid:
            for s in servers:
                if s.get("id") == sid:
                    return s
    return servers[0] if servers else None


def _mysql_connect(conn: dict[str, Any], database: str | None = None):
    pwd = config_store.decrypt_db_password(DATA_DIR, conn) if conn.get("password_enc") else ""
    return pymysql.connect(
        host=conn.get("host") or "127.0.0.1",
        port=int(conn.get("port") or 3306),
        user=conn.get("username") or "",
        password=pwd,
        database=database,
        charset="utf8mb4",
        autocommit=True,
        connect_timeout=10,
    )


def ensure_user_demo_database(connection_id: str | None = None) -> dict[str, Any]:
    """在指定 MySQL/MariaDB 连接上创建用户库 report_user_lib 与演示表。"""
    conn = _pick_db_connection(connection_id)
    if not conn:
        return {"ok": False, "error": "未找到可用的数据库连接"}
    eng = (conn.get("engine") or "").lower()
    if eng not in ("mysql", "mariadb"):
        return {"ok": False, "error": f"当前仅支持 MySQL/MariaDB 创建用户库，实际引擎={eng}"}
    try:
        with _mysql_connect(conn) as db:
            with db.cursor() as cur:
                cur.execute(
                    f"CREATE DATABASE IF NOT EXISTS `{DEMO_DB}` "
                    "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
        with _mysql_connect(conn, DEMO_DB) as db:
            with db.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS demo_batches (
                      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                      batch_no VARCHAR(64) NOT NULL,
                      batch_name VARCHAR(128) NOT NULL,
                      status VARCHAR(32) NOT NULL DEFAULT 'running',
                      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      UNIQUE KEY uk_batch_no (batch_no)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS demo_metrics (
                      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                      batch_no VARCHAR(64) NOT NULL,
                      metric_name VARCHAR(64) NOT NULL,
                      metric_value DOUBLE NOT NULL,
                      unit VARCHAR(16) NOT NULL DEFAULT '',
                      recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      KEY idx_batch (batch_no)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                )
                cur.execute("DELETE FROM demo_metrics WHERE batch_no=%s", (DEMO_BATCH_NO,))
                cur.execute("DELETE FROM demo_batches WHERE batch_no=%s", (DEMO_BATCH_NO,))
                cur.execute(
                    "INSERT INTO demo_batches (batch_no, batch_name, status) VALUES (%s,%s,%s)",
                    (DEMO_BATCH_NO, "冒烟测试批次", "running"),
                )
                rows = [
                    (DEMO_BATCH_NO, "temp", 23.5, "C"),
                    (DEMO_BATCH_NO, "pressure", 1.02, "bar"),
                    (DEMO_BATCH_NO, "speed", 1200, "rpm"),
                    (DEMO_BATCH_NO, "count", 42, "pcs"),
                ]
                cur.executemany(
                    "INSERT INTO demo_metrics (batch_no, metric_name, metric_value, unit) "
                    "VALUES (%s,%s,%s,%s)",
                    rows,
                )
        ai_asset_ops.mark_ui_reload(datasource=True, reason="ensure_user_demo_database")
        return {
            "ok": True,
            "connection_id": conn.get("id"),
            "database": DEMO_DB,
            "tables": ["demo_batches", "demo_metrics"],
            "batch_no": DEMO_BATCH_NO,
            "message": f"已确保用户库 `{DEMO_DB}` 与演示数据（批次 {DEMO_BATCH_NO}）",
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def _resolve_opc_nodes(server: dict[str, Any], *, live_search: bool = False) -> dict[str, str]:
    """默认使用 ARSim Program 节点；可选 live_search 从现有 OPC 搜索补齐。"""
    nodes = dict(DEFAULT_OPC_NODES)
    if not live_search:
        return nodes
    sid = str(server.get("id") or "")
    endpoint = str(server.get("endpoint_url") or "")
    user = server.get("username")
    pwd = config_store.decrypt_opcua_password(DATA_DIR, server) if server.get("password_enc") else None
    try:
        for key, query, dtype in (
            ("bool", "ActProtectActive", "Boolean"),
            ("float", "SegTempActValue", "Float"),
            ("uint16", "SegTempCalcValidCnt", "UInt16"),
            ("int32", "SegTempSetScanInterval", "Int32"),
            ("float_avg", "ActAvgTemp", "Float"),
            ("string", "StepAction.Text.Main", "String"),
        ):
            res = await opcua_service.search_variables_for_saved_server(
                server_id=sid,
                endpoint_url=endpoint,
                username=user,
                password=pwd,
                query=query,
                max_scan=800,
                max_results=3,
                max_depth=8,
                data_type_filter=dtype,
            )
            hits = res.get("hits") or []
            if hits and hits[0].get("node_id"):
                nodes[key] = str(hits[0]["node_id"])
    except Exception:
        pass
    return nodes


def _nid() -> str:
    return str(uuid.uuid4())


def _cell(
    *,
    text: str = "",
    binding_kind: str = "none",
    opcua: str = "",
    sql: str = "",
    sql_params: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "text": text,
        "bindingKind": binding_kind,
        "opcuaNodeId": opcua,
        "sqlText": sql,
        "sqlParams": sql_params or [],
        "bgColor": "transparent",
    }


def _opc_binding(node_id: str, fallback: str = "") -> dict[str, Any]:
    return {
        "source": "opcua",
        "opcuaNodeId": node_id,
        "aboveCellColumnIndex": 0,
        "literalFallback": fallback,
    }


def _lit_binding(value: str) -> dict[str, Any]:
    return {
        "source": "literal",
        "opcuaNodeId": "",
        "aboveCellColumnIndex": 0,
        "literalFallback": value,
    }


def _param_el(
    *,
    x: float,
    y: float,
    w: float,
    label: str,
    binding_kind: str,
    opcua: str = "",
    sql: str = "",
    sql_params: list[dict[str, Any]] | None = None,
    connection_id: str = "",
    database: str = "",
    table: str = "",
    engine: str = "",
    value_column: str = "",
    where_column: str = "",
) -> dict[str, Any]:
    el: dict[str, Any] = {
        "id": _nid(),
        "type": "parameter",
        "x": x,
        "y": y,
        "w": w,
        "h": 32,
        "text": label,
        "color": "#18181b",
        "bgColor": "#ffffff",
        "fontSize": 13,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": True,
        "alignX": "start",
        "alignY": "center",
        "bindingKind": binding_kind,
        "opcuaNodeId": opcua,
        "sqlText": sql,
        "sqlParams": sql_params or [],
        "nullDisplayMode": "blank",
    }
    if binding_kind == "sql" and connection_id and table and value_column:
        el["scalarSqlFillMode"] = "visual"
        el["scalarSqlVisual"] = {
            "connectionId": connection_id,
            "database": database,
            "table": table,
            "engine": engine or "mysql",
            "valueColumn": value_column,
            "whereColumn": where_column,
            "whereParamSlot": 0,
        }
    return el


def _zone_text(
    *,
    x: float,
    y: float,
    w: float,
    h: float,
    text: str,
    font_size: float = 12,
    binding_kind: str = "none",
    opcua: str = "",
) -> dict[str, Any]:
    return {
        "id": _nid(),
        "type": "parameter" if binding_kind != "none" else "text",
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "text": text,
        "color": "#334155",
        "bgColor": "transparent",
        "fontSize": font_size,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": False,
        "alignX": "start",
        "alignY": "center",
        "bindingKind": binding_kind,
        "opcuaNodeId": opcua,
        "sqlText": "",
        "sqlParams": [],
        "nullDisplayMode": "blank",
    }


def _zone_page_number(*, x: float, y: float) -> dict[str, Any]:
    return {
        "id": _nid(),
        "type": "pageNumber",
        "x": x,
        "y": y,
        "w": 80,
        "h": 18,
        "text": "",
        "color": "#64748b",
        "bgColor": "transparent",
        "fontSize": 11,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": False,
        "alignX": "end",
        "alignY": "center",
        "pageNumberMode": "slashTotal",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
    }


def _zone_date(*, x: float, y: float) -> dict[str, Any]:
    return {
        "id": _nid(),
        "type": "date",
        "x": x,
        "y": y,
        "w": 120,
        "h": 18,
        "text": "",
        "color": "#64748b",
        "bgColor": "transparent",
        "fontSize": 11,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": False,
        "alignX": "start",
        "alignY": "center",
        "dateFormat": "yyyy-MM-dd HH:mm",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
    }


def _visual_batch_filter(nodes: dict[str, str]) -> dict[str, Any]:
    """可视化等值筛选：batch_no，取值来自 OPC String（无值时用演示批次号兜底）。"""
    return {
        "id": _nid(),
        "column": "batch_no",
        "kind": "equality",
        "defaults": [DEMO_BATCH_NO],
        "bindings": [_opc_binding(nodes["string"], DEMO_BATCH_NO)],
    }


def _visual_horizontal_fill(cid: str, eng: str, nodes: dict[str, str]) -> dict[str, Any]:
    cols = ["metric_name", "metric_value", "unit", "recorded_at"]
    filt = _visual_batch_filter(nodes)
    # 与前端 compileVisualTableSql 对齐
    query_sql = (
        "SELECT `metric_name`, `metric_value`, `unit`, `recorded_at` "
        "FROM `demo_metrics` WHERE `batch_no` = {{p0}}"
    )
    return {
        "enabled": True,
        "fillMode": "visual",
        "querySql": query_sql,
        "params": [_opc_binding(nodes["string"], DEMO_BATCH_NO)],
        "resultColumnNames": list(cols),
        "repeatHeaderOnPageBreak": True,
        "splitReportsOnMaxRows": False,
        "allowWidgetsBelowSqlFillTable": True,
        "maxRows": 2000,
        "visualSource": {
            "connectionId": cid,
            "database": DEMO_DB,
            "table": "demo_metrics",
            "engine": eng,
            "columns": list(cols),
            "tableSource": "manual",
            "tableOpcNodeId": "",
        },
        "visualFilters": [filt],
        "mongoQuery": None,
        "layoutMode": "horizontal",
        "columnRoles": ["field", "field", "field", "field"],
        "sequencePageMode": "continuous",
        "verticalMultiRecordMode": "continue",
        "verticalFieldLabels": [],
    }


def _visual_vertical_fill(cid: str, eng: str, nodes: dict[str, str]) -> dict[str, Any]:
    """纵表：左名称右值；筛选 batch_no 走 OPC。"""
    field_cols = ["metric_name", "metric_value", "unit"]
    labels = ["指标名", "数值", "单位"]
    filt = _visual_batch_filter(nodes)
    query_sql = (
        "SELECT `metric_name`, `metric_value`, `unit` "
        "FROM `demo_metrics` WHERE `batch_no` = {{p0}}"
    )
    return {
        "enabled": True,
        "fillMode": "visual",
        "querySql": query_sql,
        "params": [_opc_binding(nodes["string"], DEMO_BATCH_NO)],
        "resultColumnNames": ["名称", "值"],
        "repeatHeaderOnPageBreak": True,
        "splitReportsOnMaxRows": False,
        "allowWidgetsBelowSqlFillTable": True,
        "maxRows": 2000,
        "visualSource": {
            "connectionId": cid,
            "database": DEMO_DB,
            "table": "demo_metrics",
            "engine": eng,
            "columns": list(field_cols),
            "tableSource": "manual",
            "tableOpcNodeId": "",
        },
        "visualFilters": [filt],
        "mongoQuery": None,
        "layoutMode": "vertical",
        "columnRoles": ["field", "field"],
        "sequencePageMode": "continuous",
        "verticalMultiRecordMode": "continue",
        "verticalFieldLabels": list(labels),
    }


def _find_existing_smoke_id(name: str) -> str | None:
    for s in template_store.list_summaries():
        if s.name == name:
            return s.id
    return None


async def create_binding_smoke_template(
    *,
    name: str | None = None,
    connection_id: str | None = None,
    opc_server_id: str | None = None,
    ensure_schema: bool = True,
) -> dict[str, Any]:
    """
    创建/覆盖绑定冒烟模版：
    - 页眉页脚（含 OPC 参数、日期、页码）
    - 参数（OPC 多类型 + SQL）
    - 混合单元格绑定表
    - 可视化 SQL 横表填充（OPC 筛选 batch_no）
    - 可视化 SQL 纵表填充（OPC 筛选 batch_no）
    """
    conn = _pick_db_connection(connection_id)
    if not conn:
        return {"ok": False, "error": "未找到可用的数据库连接，请先在数据源配置中保存连接"}
    opc = _pick_opc_server(opc_server_id)
    if not opc:
        return {"ok": False, "error": "未找到可用的 OPC UA 连接"}

    schema_info: dict[str, Any] | None = None
    if ensure_schema:
        schema_info = ensure_user_demo_database(str(conn.get("id") or ""))
        if not schema_info.get("ok"):
            return schema_info

    cid = str(conn.get("id") or "")
    eng = (conn.get("engine") or "mysql").lower()
    nodes = await _resolve_opc_nodes(opc, live_search=False)
    tpl_name = (name or "").strip() or SMOKE_TEMPLATE_NAME
    existing_id = _find_existing_smoke_id(tpl_name)

    lit_batch = _lit_binding(DEMO_BATCH_NO)
    opc_str_batch = _opc_binding(nodes["string"], DEMO_BATCH_NO)

    title = {
        "id": _nid(),
        "type": "text",
        "x": 40,
        "y": 24,
        "w": 520,
        "h": 32,
        "text": "绑定冒烟测试（OPC UA + SQL）",
        "color": "#0f172a",
        "bgColor": "transparent",
        "fontSize": 18,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": False,
        "alignX": "start",
        "alignY": "center",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
    }

    params = [
        _param_el(x=40, y=68, w=240, label="OPC·温度(Float)", binding_kind="opcua", opcua=nodes["float"]),
        _param_el(x=300, y=68, w=240, label="OPC·保护(Boolean)", binding_kind="opcua", opcua=nodes["bool"]),
        _param_el(x=40, y=108, w=240, label="OPC·有效段(UInt16)", binding_kind="opcua", opcua=nodes["uint16"]),
        _param_el(x=300, y=108, w=240, label="OPC·扫描间隔(Int32)", binding_kind="opcua", opcua=nodes["int32"]),
        _param_el(
            x=40,
            y=148,
            w=500,
            label="SQL·批次名",
            binding_kind="sql",
            sql=f"SELECT batch_name FROM `{DEMO_DB}`.`demo_batches` WHERE batch_no = {{{{p0}}}} LIMIT 1",
            sql_params=[opc_str_batch],
            connection_id=cid,
            database=DEMO_DB,
            table="demo_batches",
            engine=eng,
            value_column="batch_name",
            where_column="batch_no",
        ),
    ]

    mixed_table = {
        "id": _nid(),
        "type": "table",
        "x": 40,
        "y": 196,
        "w": 520,
        "h": 140,
        "text": "",
        "color": "#18181b",
        "bgColor": "#ffffff",
        "fontSize": 12,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": True,
        "alignX": "start",
        "alignY": "center",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
        "tableRows": 4,
        "tableCols": 3,
        "tableRowHeightPx": 28,
        "tableColWidthsPx": [120, 200, 200],
        "tableColBgColors": [],
        "tableCells": [
            [
                _cell(text="项目"),
                _cell(text="OPC UA"),
                _cell(text="SQL"),
            ],
            [
                _cell(text="温度"),
                _cell(binding_kind="opcua", opcua=nodes["float"]),
                _cell(
                    binding_kind="sql",
                    sql=(
                        f"SELECT metric_value FROM `{DEMO_DB}`.`demo_metrics` "
                        "WHERE metric_name='temp' AND batch_no={{p0}} LIMIT 1"
                    ),
                    sql_params=[opc_str_batch],
                ),
            ],
            [
                _cell(text="保护激活"),
                _cell(binding_kind="opcua", opcua=nodes["bool"]),
                _cell(
                    binding_kind="sql",
                    sql=(
                        f"SELECT status FROM `{DEMO_DB}`.`demo_batches` "
                        "WHERE batch_no={{p0}} LIMIT 1"
                    ),
                    sql_params=[opc_str_batch],
                ),
            ],
            [
                _cell(text="平均温度"),
                _cell(binding_kind="opcua", opcua=nodes["float_avg"]),
                _cell(
                    binding_kind="sql",
                    sql=(
                        f"SELECT metric_value FROM `{DEMO_DB}`.`demo_metrics` "
                        "WHERE metric_name='pressure' AND batch_no={{p0}} LIMIT 1"
                    ),
                    sql_params=[lit_batch],
                ),
            ],
        ],
        "tableSqlFill": {
            "enabled": False,
            "fillMode": "visual",
            "querySql": "",
            "params": [],
            "resultColumnNames": [],
            "repeatHeaderOnPageBreak": True,
            "splitReportsOnMaxRows": False,
            "allowWidgetsBelowSqlFillTable": False,
            "maxRows": 2000,
            "visualSource": None,
            "visualFilters": [],
            "mongoQuery": None,
            "layoutMode": "horizontal",
            "columnRoles": [],
            "sequencePageMode": "continuous",
            "verticalMultiRecordMode": "continue",
            "verticalFieldLabels": [],
        },
    }

    h_fill = _visual_horizontal_fill(cid, eng, nodes)
    horizontal_fill_table = {
        "id": _nid(),
        "type": "table",
        "x": 40,
        "y": 352,
        "w": 520,
        "h": 168,
        "text": "",
        "color": "#18181b",
        "bgColor": "#ffffff",
        "fontSize": 12,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": True,
        "alignX": "start",
        "alignY": "center",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
        "tableRows": 5,
        "tableCols": 4,
        "tableRowHeightPx": 28,
        "tableColWidthsPx": [130, 120, 80, 190],
        "tableColBgColors": [],
        "tableCells": [
            [_cell(text="metric_name"), _cell(text="metric_value"), _cell(text="unit"), _cell(text="recorded_at")],
            [_cell(), _cell(), _cell(), _cell()],
            [_cell(), _cell(), _cell(), _cell()],
            [_cell(), _cell(), _cell(), _cell()],
            [_cell(), _cell(), _cell(), _cell()],
        ],
        "tableSqlFill": h_fill,
    }

    v_fill = _visual_vertical_fill(cid, eng, nodes)
    # 纵表：表头 + 3 字段槽
    vertical_fill_table = {
        "id": _nid(),
        "type": "table",
        "x": 40,
        "y": 540,
        "w": 320,
        "h": 140,
        "text": "",
        "color": "#18181b",
        "bgColor": "#ffffff",
        "fontSize": 12,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": True,
        "alignX": "start",
        "alignY": "center",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
        "tableRows": 4,
        "tableCols": 2,
        "tableRowHeightPx": 28,
        "tableColWidthsPx": [120, 180],
        "tableColBgColors": [],
        "tableCells": [
            [_cell(text="名称"), _cell(text="值")],
            [_cell(text="指标名"), _cell()],
            [_cell(text="数值"), _cell()],
            [_cell(text="单位"), _cell()],
        ],
        "tableSqlFill": v_fill,
    }

    note = {
        "id": _nid(),
        "type": "text",
        "x": 40,
        "y": 700,
        "w": 520,
        "h": 40,
        "text": (
            f"DB={conn.get('name')}/{DEMO_DB}；OPC={opc.get('name')}；"
            f"横表/纵表均为可视化 SQL，筛选 batch_no←OPC（兜底 {DEMO_BATCH_NO}）"
        ),
        "color": "#64748b",
        "bgColor": "transparent",
        "fontSize": 10,
        "fontFamily": "",
        "zIndex": 1,
        "showBorder": False,
        "alignX": "start",
        "alignY": "start",
        "textAutoWrap": True,
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
    }

    body = [title, *params, mixed_table, horizontal_fill_table, vertical_fill_table, note]

    # 页眉 / 页脚（需 headerBandMm / footerBandMm > 0）
    header_elements = [
        _zone_text(x=12, y=6, w=220, h=20, text="Report Editor · Binding Smoke", font_size=12),
        _zone_text(
            x=240,
            y=6,
            w=160,
            h=20,
            text="OPC·温度",
            font_size=11,
            binding_kind="opcua",
            opcua=nodes["float"],
        ),
        _zone_date(x=420, y=6),
    ]
    footer_elements = [
        _zone_text(x=12, y=4, w=280, h=18, text="测试模版 · 请勿用于生产结批", font_size=10),
        _zone_page_number(x=460, y=4),
    ]

    snap = {
        "marginTopMm": 12,
        "marginRightMm": 12,
        "marginBottomMm": 12,
        "marginLeftMm": 12,
        "headerBandMm": 22,
        "footerBandMm": 18,
    }
    tpl_id = existing_id or str(uuid.uuid4())
    raw = {
        "schemaVersion": 4,
        "id": tpl_id,
        "name": tpl_name,
        "updatedAt": _now_iso(),
        "paperKind": "A4",
        "orientation": "portrait",
        "layoutSnapshot": snap,
        "coverLayoutSnapshot": snap,
        "backLayoutSnapshot": snap,
        "elements": body,
        "bodyPages": [body],
        "headerText": "",
        "footerText": "",
        "headerElements": header_elements,
        "footerElements": footer_elements,
        "coverElements": [],
        "backElements": [],
        "coverHeaderElements": [],
        "coverFooterElements": [],
        "coverBodyZoneElements": [],
        "backHeaderElements": [],
        "backFooterElements": [],
        "backBodyZoneElements": [],
    }
    tpl = parse_report_template(raw)
    template_store.save_template(tpl)

    cfg = _cfg()
    prefs = dict(cfg.get("app_preferences") or {})
    prefs["last_connection_id"] = cid
    prefs["last_opcua_server_id"] = opc.get("id")
    cfg["app_preferences"] = prefs
    config_store.save_config(CONFIG_FILE, cfg)

    ai_asset_ops.mark_ui_reload(assets=True, datasource=True, reason="create_binding_smoke_template")

    return {
        "ok": True,
        "template_id": tpl.id,
        "name": tpl.name,
        "replaced_existing": bool(existing_id),
        "connection_id": cid,
        "database": DEMO_DB,
        "opc_server_id": opc.get("id"),
        "opc_nodes": nodes,
        "batch_no": DEMO_BATCH_NO,
        "schema": schema_info,
        "summary": {
            "parameters": 5,
            "tables": 3,
            "mixed_binding_table": True,
            "visual_horizontal_fill": True,
            "visual_vertical_fill": True,
            "header_footer": True,
            "opc_filter": True,
        },
        "ui_reload": True,
        "message": (
            f"已{'更新' if existing_id else '创建'}模版「{tpl.name}」"
            "（页眉页脚 + 横/纵可视化 SQL，筛选走 OPC）。前端将自动刷新列表。"
        ),
    }
