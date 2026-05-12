from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, HTTPException

from core.settings import CONFIG_FILE, DATA_DIR, QUERY_SESSION_FILE
from modules import config_store, db_readonly_service
from schemas.common import (
    DbConnectionSave,
    DbDdlPreviewRequest,
    DbExecuteSqlRequest,
    DbMongoAggregateRequest,
    DbTablePreviewRequest,
    QuerySessionsSave,
    VisualQueryBuildRequest,
)

router = APIRouter(tags=["database"])


def _is_mysql_family(engine: str) -> bool:
    """MariaDB 与 MySQL 协议兼容，复用 PyMySQL 只读路径。"""
    return (engine or "").lower() in ("mysql", "mariadb")


def _safe_sql_table(name: str) -> str:
    if not name or not re.match(r"^[a-zA-Z0-9_]+$", name):
        raise HTTPException(400, "非法表名")
    return name


def _cfg():
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _save(data):
    config_store.save_config(CONFIG_FILE, data)


def _conn_by_id(cid: str) -> dict[str, Any]:
    for c in _cfg().get("db_connections", []):
        if c.get("id") == cid:
            return c
    raise HTTPException(404, "未找到数据库连接")


def _credentials(conn: dict[str, Any]) -> tuple[str, str]:
    try:
        pwd = config_store.decrypt_db_password(DATA_DIR, conn)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return conn.get("username") or "", pwd


@router.get("/database/connections")
async def list_connections():
    cfg = _cfg()
    conns = config_store.ensure_db_connection_ids(cfg.get("db_connections", []))
    cfg["db_connections"] = conns
    _save(cfg)
    return {"connections": [config_store.mask_connection_for_response(c) for c in conns]}


@router.post("/database/connections")
async def upsert_connection(body: DbConnectionSave):
    cfg = _cfg()
    conns = cfg.get("db_connections", [])
    pwd_plain = body.password
    eng = (body.engine or "").lower()
    default_port = 3306
    if eng == "postgres":
        default_port = 5432
    elif eng == "mongodb":
        default_port = 27017
    entry: dict[str, Any] = {
        "name": body.name,
        "engine": eng,
        "host": body.host,
        "port": body.port if body.port is not None else default_port,
        "database": body.database,
        "username": body.username,
        "sqlite_path": body.sqlite_path,
        "mongo_auth_source": body.mongo_auth_source or "admin",
    }
    if body.id:
        found = False
        for i, c in enumerate(conns):
            if c.get("id") == body.id:
                enc = c.get("password_enc")
                if pwd_plain is not None:
                    enc = config_store.encrypt_db_password(DATA_DIR, pwd_plain)
                entry["password_enc"] = enc
                entry["id"] = body.id
                conns[i] = {**c, **entry}
                found = True
                break
        if not found:
            raise HTTPException(404, "未找到连接")
    else:
        import uuid

        entry["id"] = str(uuid.uuid4())
        entry["password_enc"] = config_store.encrypt_db_password(DATA_DIR, pwd_plain)
        conns.append(entry)
    cfg["db_connections"] = conns
    _save(cfg)
    saved_id = entry.get("id")
    return {
        "connections": [config_store.mask_connection_for_response(c) for c in conns],
        "saved_id": saved_id,
    }


@router.delete("/database/connections/{connection_id}")
async def delete_connection(connection_id: str):
    cfg = _cfg()
    conns = [c for c in cfg.get("db_connections", []) if c.get("id") != connection_id]
    cfg["db_connections"] = conns
    _save(cfg)
    return {"ok": True}


@router.post("/database/test")
async def test_connection(body: DbConnectionSave):
    """不落库的连通性测试。"""
    try:
        engine = body.engine.lower()
        pwd = body.password or ""
        if _is_mysql_family(engine):
            db_readonly_service.mysql_list_databases(
                body.host or "127.0.0.1",
                int(body.port or 3306),
                body.username or "",
                pwd,
            )
        elif engine == "postgres":
            db_readonly_service.postgres_list_databases(
                body.host or "127.0.0.1",
                int(body.port or 5432),
                body.username or "",
                pwd,
            )
        elif engine == "sqlite":
            path = body.sqlite_path or ""
            if not path:
                raise ValueError("缺少 SQLite 路径")
            db_readonly_service.introspect_sqlite_tables(path)
        elif engine == "mongodb":
            db_readonly_service.mongo_list_databases(
                {
                    "host": body.host or "127.0.0.1",
                    "port": int(body.port or 27017),
                    "username": body.username or "",
                    "password": pwd,
                    "auth_source": body.mongo_auth_source or "admin",
                }
            )
        else:
            raise HTTPException(400, "未知引擎")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        return {"ok": False, "message": str(e)}


@router.post("/database/catalog")
async def catalog(payload: dict[str, Any]):
    cid = payload.get("connection_id")
    if not cid:
        raise HTTPException(400, "缺少 connection_id")
    conn = _conn_by_id(cid)
    engine = (conn.get("engine") or "").lower()
    database = payload.get("database")
    user, pwd = _credentials(conn)
    try:
        if _is_mysql_family(engine):
            host = conn.get("host") or "127.0.0.1"
            port = int(conn.get("port") or 3306)
            if database:
                tables = db_readonly_service.introspect_mysql_tables(host, port, user, pwd, database)
                return {"engine": engine, "tables": tables}
            dbs = db_readonly_service.mysql_list_databases(host, port, user, pwd)
            return {"engine": engine, "databases": dbs}
        if engine == "postgres":
            host = conn.get("host") or "127.0.0.1"
            port = int(conn.get("port") or 5432)
            if database:
                tables = db_readonly_service.introspect_pg_tables(host, port, user, pwd, database)
                return {"engine": engine, "tables": tables}
            dbs = db_readonly_service.postgres_list_databases(host, port, user, pwd)
            return {"engine": engine, "databases": dbs}
        if engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            tables = db_readonly_service.introspect_sqlite_tables(path)
            return {"engine": engine, "tables": tables}
        if engine == "mongodb":
            host = conn.get("host") or "127.0.0.1"
            port = int(conn.get("port") or 27017)
            vars_ = {
                "host": host,
                "port": port,
                "username": user,
                "password": pwd,
                "auth_source": conn.get("mongo_auth_source") or "admin",
            }
            if database:
                cols = db_readonly_service.mongo_list_collections(vars_, database)
                return {"engine": engine, "collections": cols}
            dbs = db_readonly_service.mongo_list_databases(vars_)
            return {"engine": engine, "databases": dbs}
        raise HTTPException(400, "未知引擎")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/query/sql")
async def query_sql(body: DbExecuteSqlRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    user, pwd = _credentials(conn)
    lim = max(1, min(body.limit, 2000))
    try:
        if _is_mysql_family(engine):
            res = db_readonly_service.run_mysql_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                conn.get("database") or "",
                body.sql,
                lim,
            )
        elif engine == "postgres":
            res = db_readonly_service.run_postgres_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                conn.get("database") or "postgres",
                body.sql,
                lim,
            )
        elif engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            res = db_readonly_service.run_sqlite_readonly(path, body.sql, lim)
        else:
            raise HTTPException(400, "该引擎请使用 Mongo 查询接口")
        return res
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/query/mongo_aggregate")
async def query_mongo(body: DbMongoAggregateRequest):
    conn = _conn_by_id(body.connection_id)
    if (conn.get("engine") or "").lower() != "mongodb":
        raise HTTPException(400, "非 MongoDB 连接")
    user, pwd = _credentials(conn)
    vars_ = {
        "host": conn.get("host") or "127.0.0.1",
        "port": int(conn.get("port") or 27017),
        "username": user,
        "password": pwd,
        "auth_source": conn.get("mongo_auth_source") or "admin",
    }
    lim = max(1, min(body.limit, 2000))
    try:
        return db_readonly_service.mongo_aggregate_readonly(
            vars_,
            body.database,
            body.collection,
            body.pipeline,
            lim,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/table/preview")
async def table_preview(body: DbTablePreviewRequest):
    try:
        conn = _conn_by_id(body.connection_id)
        engine = (conn.get("engine") or "").lower()
        user, pwd = _credentials(conn)
        lim = max(1, min(body.limit, 500))
        dbname = body.database or conn.get("database") or ""
        tbl_raw = body.table
        if engine == "mongodb":
            if not dbname:
                raise HTTPException(400, "MongoDB 需要 database")
            vars_ = {
                "host": conn.get("host") or "127.0.0.1",
                "port": int(conn.get("port") or 27017),
                "username": user,
                "password": pwd,
                "auth_source": conn.get("mongo_auth_source") or "admin",
            }
            return db_readonly_service.mongo_find_sample(vars_, dbname, tbl_raw, lim)
        tbl = _safe_sql_table(tbl_raw)
        sql_mysql = f"SELECT * FROM `{tbl}` LIMIT {lim}"
        sql_pg = f'SELECT * FROM "{tbl}" LIMIT {lim}'
        if _is_mysql_family(engine):
            return db_readonly_service.run_mysql_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
                sql_mysql,
                lim,
            )
        if engine == "postgres":
            return db_readonly_service.run_postgres_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
                sql_pg,
                lim,
            )
        if engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            sql_lite = f"SELECT * FROM {tbl} LIMIT {lim}"
            return db_readonly_service.run_sqlite_readonly(path, sql_lite, lim)
        raise HTTPException(400, "未知引擎")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/ddl")
async def ddl_preview(body: DbDdlPreviewRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    user, pwd = _credentials(conn)
    dbname = body.database or conn.get("database") or ""
    tbl = _safe_sql_table(body.table)
    try:
        if _is_mysql_family(engine):
            text = db_readonly_service.ddl_preview_mysql(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
                tbl,
            )
        elif engine == "postgres":
            text = db_readonly_service.ddl_preview_pg(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
                tbl,
            )
        elif engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            text = db_readonly_service.ddl_preview_sqlite(path, tbl)
        elif engine == "mongodb":
            text = "-- MongoDB 集合无 SQL DDL；请使用文档视图或 ER 导入。"
        else:
            raise HTTPException(400, "未知引擎")
        return {"ddl": text}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/visual/build_sql")
async def visual_build(body: VisualQueryBuildRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    if engine not in ("mysql", "mariadb", "postgres", "sqlite"):
        raise HTTPException(400, "可视化构建仅支持 SQL 引擎")
    try:
        sql = db_readonly_service.build_visual_select(
            body.base_table,
            body.joins,
            body.columns,
            body.limit,
        )
        return {"sql": sql}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/visual/run")
async def visual_run(body: VisualQueryBuildRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    if engine not in ("mysql", "mariadb", "postgres", "sqlite"):
        raise HTTPException(400, "可视化构建仅支持 SQL 引擎")
    try:
        sql = db_readonly_service.build_visual_select(
            body.base_table,
            body.joins,
            body.columns,
            body.limit,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    result = await query_sql(
        DbExecuteSqlRequest(connection_id=body.connection_id, sql=sql, limit=body.limit)
    )
    return {"sql": sql, **result}


@router.post("/database/schema/parse")
async def schema_parse(payload: dict[str, Any]):
    fmt = payload.get("format", "json")
    content = payload.get("content") or ""
    from modules import schema_import_service

    try:
        if fmt == "sql":
            graph = schema_import_service.parse_sql_create_tables(content)
        else:
            graph = schema_import_service.parse_schema_json(content)
        return {"graph": graph}
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/er/merge")
async def er_merge(payload: dict[str, Any]):
    """将当前 catalog 表名与导入图合并（浅合并）。"""
    from modules import schema_import_service

    cid = payload.get("connection_id")
    imported = payload.get("graph")
    if not cid:
        raise HTTPException(400, "缺少 connection_id")
    _conn_by_id(cid)
    nodes_meta: list[dict[str, Any]] = []
    try:
        cat_req = {"connection_id": cid, "database": payload.get("database")}
        cat = await catalog(cat_req)
        for t in cat.get("tables") or []:
            name = t.get("name")
            if name:
                nodes_meta.append({"id": name, "label": name, "columns": []})
    except Exception:
        pass
    merged = schema_import_service.merge_er_graph(nodes_meta, imported)
    return {"graph": merged}


@router.get("/database/query_sessions")
async def get_query_sessions():
    if not QUERY_SESSION_FILE.exists():
        return {"favorites": [], "history": []}
    try:
        return json.loads(QUERY_SESSION_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"favorites": [], "history": []}


@router.post("/database/query_sessions")
async def save_query_sessions(body: QuerySessionsSave):
    QUERY_SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {"favorites": body.favorites[:200], "history": body.history[:500]}
    QUERY_SESSION_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}
