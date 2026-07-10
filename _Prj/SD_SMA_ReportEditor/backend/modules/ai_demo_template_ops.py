"""创建绑定冒烟测试用：用户库表 + 含 OPC/SQL 绑定的报表模版。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pymysql

from core.settings import CONFIG_FILE, DATA_DIR
from modules import config_store, opcua_service, template_store
from schemas.report_template import LayoutSnapshot, parse_report_template

DEMO_DB = "report_user_lib"
DEMO_BATCH_NO = "B20260710"

# ARSim（本机现有 OPC）常用 Program 变量：覆盖 Boolean / Float / UInt16 / Int32
DEFAULT_OPC_NODES = {
    "bool": "ns=6;s=::Program:SegTempStatus.ActProtectActive",
    "float": "ns=6;s=::Program:SegTempActValue",
    "uint16": "ns=6;s=::Program:SegTempCalcValidCnt",
    "int32": "ns=6;s=::Program:SegTempStatus.SegTempSetScanInterval",
    "float_avg": "ns=6;s=::Program:SegTempStatus.ActAvgTemp",
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


async def create_binding_smoke_template(
    *,
    name: str | None = None,
    connection_id: str | None = None,
    opc_server_id: str | None = None,
    ensure_schema: bool = True,
) -> dict[str, Any]:
    """
    创建测试模版：参数（OPC 多类型 + SQL）+ 混合绑定表格 + SQL 整表填充。
    依赖现有 DB/OPC；可选先 ensure 用户库。
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
    nodes = await _resolve_opc_nodes(opc)

    lit_batch = {
        "source": "literal",
        "opcuaNodeId": "",
        "aboveCellColumnIndex": 0,
        "literalFallback": DEMO_BATCH_NO,
    }
    # SQL 参数也可绑 OPC（UInt16 作演示）；字面量兜底批次号
    opc_or_lit = {
        "source": "opcua",
        "opcuaNodeId": nodes["uint16"],
        "aboveCellColumnIndex": 0,
        "literalFallback": DEMO_BATCH_NO,
    }

    title = {
        "id": _nid(),
        "type": "text",
        "x": 40,
        "y": 28,
        "w": 520,
        "h": 36,
        "text": "绑定冒烟测试（OPC UA + SQL）",
        "color": "#0f172a",
        "bgColor": "transparent",
        "fontSize": 20,
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
        _param_el(
            x=40,
            y=80,
            w=240,
            label="OPC·温度(Float)",
            binding_kind="opcua",
            opcua=nodes["float"],
        ),
        _param_el(
            x=300,
            y=80,
            w=240,
            label="OPC·保护(Boolean)",
            binding_kind="opcua",
            opcua=nodes["bool"],
        ),
        _param_el(
            x=40,
            y=124,
            w=240,
            label="OPC·有效段(UInt16)",
            binding_kind="opcua",
            opcua=nodes["uint16"],
        ),
        _param_el(
            x=300,
            y=124,
            w=240,
            label="OPC·扫描间隔(Int32)",
            binding_kind="opcua",
            opcua=nodes["int32"],
        ),
        _param_el(
            x=40,
            y=168,
            w=500,
            label="SQL·批次名",
            binding_kind="sql",
            sql=(
                f"SELECT batch_name FROM `{DEMO_DB}`.`demo_batches` "
                "WHERE batch_no = {{p0}} LIMIT 1"
            ),
            sql_params=[lit_batch],
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
        "y": 220,
        "w": 520,
        "h": 160,
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
                _cell(text="项目", binding_kind="none"),
                _cell(text="OPC UA", binding_kind="none"),
                _cell(text="SQL", binding_kind="none"),
            ],
            [
                _cell(text="温度", binding_kind="none"),
                _cell(binding_kind="opcua", opcua=nodes["float"]),
                _cell(
                    binding_kind="sql",
                    sql=(
                        f"SELECT metric_value FROM `{DEMO_DB}`.`demo_metrics` "
                        "WHERE metric_name='temp' AND batch_no={{p0}} LIMIT 1"
                    ),
                    sql_params=[lit_batch],
                ),
            ],
            [
                _cell(text="保护激活", binding_kind="none"),
                _cell(binding_kind="opcua", opcua=nodes["bool"]),
                _cell(
                    binding_kind="sql",
                    sql=(
                        f"SELECT status FROM `{DEMO_DB}`.`demo_batches` "
                        "WHERE batch_no={{p0}} LIMIT 1"
                    ),
                    sql_params=[lit_batch],
                ),
            ],
            [
                _cell(text="平均温度", binding_kind="none"),
                _cell(binding_kind="opcua", opcua=nodes["float_avg"]),
                _cell(
                    binding_kind="sql",
                    sql=(
                        f"SELECT metric_value FROM `{DEMO_DB}`.`demo_metrics` "
                        "WHERE metric_name='pressure' AND batch_no={{p0}} LIMIT 1"
                    ),
                    sql_params=[opc_or_lit],
                ),
            ],
        ],
        "tableSqlFill": {
            "enabled": False,
            "fillMode": "manual_sql",
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

    fill_table = {
        "id": _nid(),
        "type": "table",
        "x": 40,
        "y": 400,
        "w": 520,
        "h": 200,
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
            [
                _cell(text="metric_name"),
                _cell(text="metric_value"),
                _cell(text="unit"),
                _cell(text="recorded_at"),
            ],
            [_cell(), _cell(), _cell(), _cell()],
            [_cell(), _cell(), _cell(), _cell()],
            [_cell(), _cell(), _cell(), _cell()],
            [_cell(), _cell(), _cell(), _cell()],
        ],
        "tableSqlFill": {
            "enabled": True,
            "fillMode": "manual_sql",
            "querySql": (
                f"SELECT metric_name, metric_value, unit, recorded_at "
                f"FROM `{DEMO_DB}`.`demo_metrics` "
                "WHERE batch_no = {{p0}} ORDER BY id LIMIT 50"
            ),
            "params": [lit_batch, {**lit_batch}],
            "resultColumnNames": ["metric_name", "metric_value", "unit", "recorded_at"],
            "repeatHeaderOnPageBreak": True,
            "splitReportsOnMaxRows": False,
            "allowWidgetsBelowSqlFillTable": True,
            "maxRows": 2000,
            "visualSource": {
                "connectionId": cid,
                "database": DEMO_DB,
                "table": "demo_metrics",
                "engine": eng,
                "columns": ["metric_name", "metric_value", "unit", "recorded_at"],
                "tableSource": "manual",
                "tableOpcNodeId": "",
            },
            "visualFilters": [],
            "mongoQuery": None,
            "layoutMode": "horizontal",
            "columnRoles": ["field", "field", "field", "field"],
            "sequencePageMode": "continuous",
            "verticalMultiRecordMode": "continue",
            "verticalFieldLabels": [],
        },
    }

    note = {
        "id": _nid(),
        "type": "text",
        "x": 40,
        "y": 620,
        "w": 520,
        "h": 48,
        "text": (
            f"数据源：DB={conn.get('name')} / `{DEMO_DB}`；"
            f"OPC={opc.get('name')}；演示批次={DEMO_BATCH_NO}"
        ),
        "color": "#64748b",
        "bgColor": "transparent",
        "fontSize": 11,
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

    body = [title, *params, mixed_table, fill_table, note]
    snap = LayoutSnapshot().model_dump()
    raw = {
        "schemaVersion": 4,
        "id": str(uuid.uuid4()),
        "name": (name or "").strip() or "绑定冒烟测试（OPC+SQL）",
        "updatedAt": _now_iso(),
        "paperKind": "A4",
        "orientation": "portrait",
        "layoutSnapshot": snap,
        "coverLayoutSnapshot": snap,
        "backLayoutSnapshot": snap,
        "elements": body,
        "bodyPages": [body],
        "headerText": "Report Editor · Binding Smoke",
        "footerText": "测试模版 · 请勿用于生产结批",
        "headerElements": [],
        "footerElements": [],
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

    # 偏好：记住本次连接，便于预览取数
    cfg = _cfg()
    prefs = dict(cfg.get("app_preferences") or {})
    prefs["last_connection_id"] = cid
    prefs["last_opcua_server_id"] = opc.get("id")
    cfg["app_preferences"] = prefs
    config_store.save_config(CONFIG_FILE, cfg)

    return {
        "ok": True,
        "template_id": tpl.id,
        "name": tpl.name,
        "connection_id": cid,
        "database": DEMO_DB,
        "opc_server_id": opc.get("id"),
        "opc_nodes": nodes,
        "batch_no": DEMO_BATCH_NO,
        "schema": schema_info,
        "summary": {
            "parameters": 5,
            "tables": 2,
            "mixed_binding_table": True,
            "sql_fill_table": True,
        },
        "message": f"已创建模版「{tpl.name}」，可在模版管理中打开预览。",
    }
