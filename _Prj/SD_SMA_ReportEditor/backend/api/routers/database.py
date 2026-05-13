from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from core.settings import CONFIG_FILE, DATA_DIR, QUERY_SESSION_FILE
from modules import config_store, db_connection_ops, db_readonly_service, table_chart_service
from schemas.common import (
    DbChartProfileRequest,
    DbChartSeriesRequest,
    DbConnectionSave,
    DbDdlPreviewRequest,
    DbExecuteSqlRequest,
    DbMongoAggregateRequest,
    DbPreviewDrillRequest,
    DbRelationConsistencyRequest,
    DbRelationOrphanRequest,
    DbSchemaForeignKeysRequest,
    DbTableColumnsRequest,
    DbTableMetaRequest,
    DbTablePreviewRequest,
    QuerySessionsSave,
    VisualQueryBuildRequest,
)

router = APIRouter(tags=["database"])
logger = logging.getLogger(__name__)


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


def _sql_literal_filter(val: str) -> str:
    """WHERE 单行等值过滤：整数/浮点原样，其余按字符串转义。"""
    s = (val or "").strip()
    if not s:
        raise HTTPException(400, "过滤值为空")
    if len(s) > 512:
        raise HTTPException(400, "过滤值过长")
    if re.match(r"^-?\d+$", s):
        return s
    if re.match(r"^-?\d+\.\d+([eE][+-]?\d+)?$", s):
        return s
    return "'" + s.replace("'", "''") + "'"


def _effective_sql_database(conn: dict[str, Any], body_database: str | None, engine: str) -> str:
    """只读 SQL 使用的库：优先请求体（对象树选中），否则连接默认。"""
    if body_database is not None and str(body_database).strip():
        return str(body_database).strip()
    return conn.get("database") or ("postgres" if (engine or "").lower() == "postgres" else "")


@router.get("/database/connections")
async def list_connections():
    try:
        cfg = _cfg()
        conns = list(cfg.get("db_connections", []))
        dirty = False
        for c in conns:
            if not c.get("id"):
                c["id"] = str(uuid.uuid4())
                dirty = True
        if dirty:
            cfg["db_connections"] = conns
            _save(cfg)
        return {"connections": [config_store.mask_connection_for_response(c) for c in conns]}
    except Exception as e:
        logger.exception("list_connections")
        raise HTTPException(503, f"无法读取或写入数据库连接配置: {e}") from e


@router.post("/database/connections")
async def upsert_connection(body: DbConnectionSave):
    try:
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
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("upsert_connection")
        raise HTTPException(503, f"保存连接失败: {e}") from e


@router.delete("/database/connections/{connection_id}")
async def delete_connection(connection_id: str):
    try:
        cfg = _cfg()
        conns = [c for c in cfg.get("db_connections", []) if c.get("id") != connection_id]
        cfg["db_connections"] = conns
        _save(cfg)
        return {"ok": True}
    except Exception as e:
        logger.exception("delete_connection")
        raise HTTPException(503, f"删除连接失败: {e}") from e


@router.post("/database/test")
async def test_connection(body: DbConnectionSave):
    """不落库的连通性测试。始终返回 HTTP 200 与 JSON，避免前端收到 4xx/5xx 仅显示 Internal Server Error。"""
    try:
        ok, err = db_connection_ops.run_connectivity_test(body)
        return {"ok": ok, "message": err}
    except Exception as e:
        logger.exception("test_connection")
        return {"ok": False, "message": f"测试过程异常: {e}"}


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
    eff_db = _effective_sql_database(conn, body.database, engine)
    try:
        if _is_mysql_family(engine):
            res = db_readonly_service.run_mysql_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                eff_db,
                body.sql,
                lim,
            )
        elif engine == "postgres":
            res = db_readonly_service.run_postgres_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                eff_db or "postgres",
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
    PREVIEW_LIMIT_MAX = 1000
    PREVIEW_OFFSET_MAX = 9_999_999
    try:
        conn = _conn_by_id(body.connection_id)
        engine = (conn.get("engine") or "").lower()
        user, pwd = _credentials(conn)
        off = max(0, min(int(body.offset), PREVIEW_OFFSET_MAX))
        lim = max(1, min(int(body.limit), PREVIEW_LIMIT_MAX))
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
            return db_readonly_service.mongo_find_sample(
                vars_,
                dbname,
                tbl_raw,
                lim,
                off,
                body.include_total,
            )
        tbl = _safe_sql_table(tbl_raw)
        if body.pk_filter_column and body.pk_filter_value is not None:
            fcol = _safe_sql_table(body.pk_filter_column)
            lit = _sql_literal_filter(body.pk_filter_value)
            sql_mysql = f"SELECT * FROM `{tbl}` WHERE `{fcol}` = {lit} LIMIT {lim} OFFSET {off}"
            sql_pg = f'SELECT * FROM "{tbl}" WHERE "{fcol}" = {lit} LIMIT {lim} OFFSET {off}'
            sql_lite = f"SELECT * FROM {tbl} WHERE {fcol} = {lit} LIMIT {lim} OFFSET {off}"
            cnt_mysql = f"SELECT COUNT(*) AS __c FROM `{tbl}` WHERE `{fcol}` = {lit}"
            cnt_pg = f'SELECT COUNT(*) AS __c FROM "{tbl}" WHERE "{fcol}" = {lit}'
            cnt_lite = f"SELECT COUNT(*) AS __c FROM {tbl} WHERE {fcol} = {lit}"
        else:
            sql_mysql = f"SELECT * FROM `{tbl}` LIMIT {lim} OFFSET {off}"
            sql_pg = f'SELECT * FROM "{tbl}" LIMIT {lim} OFFSET {off}'
            sql_lite = f"SELECT * FROM {tbl} LIMIT {lim} OFFSET {off}"
            cnt_mysql = f"SELECT COUNT(*) AS __c FROM `{tbl}`"
            cnt_pg = f'SELECT COUNT(*) AS __c FROM "{tbl}"'
            cnt_lite = f"SELECT COUNT(*) AS __c FROM {tbl}"
        if _is_mysql_family(engine):
            res = db_readonly_service.run_mysql_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
                sql_mysql,
                lim,
            )
            if body.include_total:
                res["total"] = int(db_readonly_service.mysql_scalar(
                    conn.get("host") or "127.0.0.1",
                    int(conn.get("port") or 3306),
                    user,
                    pwd,
                    dbname,
                    cnt_mysql,
                ) or 0)
            return res
        if engine == "postgres":
            res = db_readonly_service.run_postgres_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
                sql_pg,
                lim,
            )
            if body.include_total:
                res["total"] = int(db_readonly_service.postgres_scalar(
                    conn.get("host") or "127.0.0.1",
                    int(conn.get("port") or 5432),
                    user,
                    pwd,
                    dbname or "postgres",
                    cnt_pg,
                ) or 0)
            return res
        if engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            res = db_readonly_service.run_sqlite_readonly(path, sql_lite, lim)
            if body.include_total:
                res["total"] = int(db_readonly_service.sqlite_scalar(path, cnt_lite) or 0)
            return res
        raise HTTPException(400, "未知引擎")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/table/chart_profile")
async def table_chart_profile(body: DbChartProfileRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    if engine == "mongodb":
        raise HTTPException(400, "MongoDB 暂不支持智能透视图表")
    user, pwd = _credentials(conn)
    dbname = _effective_sql_database(conn, body.database, engine)
    tbl = _safe_sql_table(body.table)
    try:
        cols = table_chart_service.fetch_columns_extended(engine, conn, user, pwd, dbname, tbl)
        return table_chart_service.chart_profile_from_columns(cols)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/table/chart_series")
async def table_chart_series(body: DbChartSeriesRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    if engine == "mongodb":
        raise HTTPException(400, "MongoDB 暂不支持智能透视图表")
    user, pwd = _credentials(conn)
    dbname = _effective_sql_database(conn, body.database, engine)
    tbl = _safe_sql_table(body.table)
    flist = [x.model_dump() for x in body.filters]
    try:
        return table_chart_service.run_chart_series(
            engine=engine,
            conn=conn,
            user=user,
            pwd=pwd,
            dbname=dbname,
            table=tbl,
            time_column=body.time_column,
            metric_columns=list(body.metric_columns),
            sample_limit=int(body.sample_limit),
            time_start=body.time_start,
            time_end=body.time_end,
            filters=flist,
            category_column=body.category_column,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/table/preview_drill")
async def table_preview_drill(body: DbPreviewDrillRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    if engine == "mongodb":
        raise HTTPException(400, "MongoDB 请使用数据分页预览")
    user, pwd = _credentials(conn)
    dbname = _effective_sql_database(conn, body.database, engine)
    tbl = _safe_sql_table(body.table)
    oc = body.order_column
    if oc and not re.match(r"^[a-zA-Z0-9_]+$", oc):
        raise HTTPException(400, "非法排序列")
    if body.time_column and not re.match(r"^[a-zA-Z0-9_]+$", body.time_column):
        raise HTTPException(400, "非法时间列")
    flist = [x.model_dump() for x in body.filters]
    try:
        return table_chart_service.run_preview_drill(
            engine=engine,
            conn=conn,
            user=user,
            pwd=pwd,
            dbname=dbname,
            table=tbl,
            limit=int(body.limit),
            offset=int(body.offset),
            time_column=body.time_column,
            time_start=body.time_start,
            time_end=body.time_end,
            filters=flist,
            order_column=oc,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
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


@router.post("/database/table/columns")
async def table_columns(body: DbTableColumnsRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    user, pwd = _credentials(conn)
    dbname = body.database or conn.get("database") or ""
    tbl = _safe_sql_table(body.table)
    try:
        if engine == "mongodb":
            raise HTTPException(400, "MongoDB 请使用快捷查询中的集合模板")
        if _is_mysql_family(engine):
            cols = db_readonly_service.list_mysql_columns(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
                tbl,
            )
        elif engine == "postgres":
            cols = db_readonly_service.list_pg_columns(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
                tbl,
            )
        elif engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            cols = db_readonly_service.list_sqlite_columns(path, tbl)
        else:
            raise HTTPException(400, "未知引擎")
        return {"columns": cols}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/schema/foreign_keys")
async def schema_foreign_keys(body: DbSchemaForeignKeysRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    user, pwd = _credentials(conn)
    dbname = body.database or conn.get("database") or ""
    safe_tables = [_safe_sql_table(t) for t in (body.tables or [])]
    try:
        if engine == "mongodb":
            return {"edges": []}
        if _is_mysql_family(engine):
            edges = db_readonly_service.list_mysql_foreign_keys(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
            )
            return {"edges": edges}
        if engine == "postgres":
            edges = db_readonly_service.list_postgres_foreign_keys(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
            )
            return {"edges": edges}
        if engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            edges = db_readonly_service.list_sqlite_foreign_keys(path, safe_tables if safe_tables else [])
            return {"edges": edges}
        raise HTTPException(400, "未知引擎")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/table/columns_extended")
async def table_columns_extended(body: DbTableColumnsRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    user, pwd = _credentials(conn)
    dbname = body.database or conn.get("database") or ""
    tbl = _safe_sql_table(body.table)
    try:
        if engine == "mongodb":
            raise HTTPException(400, "MongoDB 不适用")
        if _is_mysql_family(engine):
            cols = db_readonly_service.list_mysql_columns_extended(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
                tbl,
            )
        elif engine == "postgres":
            cols = db_readonly_service.list_pg_columns_extended(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
                tbl,
            )
        elif engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            cols = db_readonly_service.list_sqlite_columns_extended(path, tbl)
        else:
            raise HTTPException(400, "未知引擎")
        return {"columns": cols}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/table/meta")
async def table_meta(body: DbTableMetaRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    user, pwd = _credentials(conn)
    dbname = body.database or conn.get("database") or ""
    tbl = _safe_sql_table(body.table)
    try:
        if _is_mysql_family(engine):
            meta = db_readonly_service.mysql_table_meta(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
                tbl,
            )
        elif engine == "postgres":
            meta = db_readonly_service.pg_table_meta(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
                tbl,
            )
        elif engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            meta = db_readonly_service.sqlite_table_meta(path, tbl)
        else:
            raise HTTPException(400, "未知引擎或不支持")
        return meta
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/visual/count")
async def visual_count(body: VisualQueryBuildRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    if engine not in ("mysql", "mariadb", "postgres", "sqlite"):
        raise HTTPException(400, "仅支持 SQL 引擎")
    try:
        sql = db_readonly_service.build_visual_count_sql(body.base_table, body.joins)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    result = await query_sql(
        DbExecuteSqlRequest(
            connection_id=body.connection_id,
            sql=sql,
            limit=5,
            database=body.database,
        )
    )
    cnt = None
    rows = result.get("rows") or []
    cols = result.get("columns") or []
    if rows and cols:
        key = cols[0].lower() if cols else ""
        row0 = rows[0]
        if isinstance(row0, dict):
            for k, v in row0.items():
                if str(k).lower() in ("cnt", "count"):
                    cnt = int(v) if v is not None else None
                    break
            if cnt is None and key:
                cnt = int(row0.get(cols[0])) if row0.get(cols[0]) is not None else None
    return {"sql": sql, "count": cnt}


@router.post("/database/relation/orphan_summary")
async def relation_orphan_summary(body: DbRelationOrphanRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    user, pwd = _credentials(conn)
    dbname = body.database or conn.get("database") or ""
    ct = _safe_sql_table(body.child_table)
    pt = _safe_sql_table(body.parent_table)
    child_cols = [_safe_sql_table(c) for c in body.child_columns]
    parent_cols = [_safe_sql_table(c) for c in body.parent_columns]
    try:
        if _is_mysql_family(engine):
            sql = db_readonly_service.build_orphan_count_sql_mysql(ct, pt, child_cols, parent_cols)
            res = db_readonly_service.run_mysql_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
                sql,
                5,
            )
        elif engine == "postgres":
            sql = db_readonly_service.build_orphan_count_sql_postgres(ct, pt, child_cols, parent_cols)
            res = db_readonly_service.run_postgres_readonly(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
                sql,
                5,
            )
        elif engine == "sqlite":
            sql = db_readonly_service.build_orphan_count_sql_sqlite(ct, pt, child_cols, parent_cols)
            path = conn.get("sqlite_path") or ""
            res = db_readonly_service.run_sqlite_readonly(path, sql, 5)
        else:
            raise HTTPException(400, "未知引擎")
        orphan_cnt = None
        rows = res.get("rows") or []
        if rows:
            r0 = rows[0]
            if isinstance(r0, dict):
                for k, v in r0.items():
                    if "orphan" in str(k).lower():
                        orphan_cnt = int(v) if v is not None else None
                        break
                if orphan_cnt is None:
                    orphan_cnt = int(next(iter(r0.values()))) if r0 else None
        return {"sql": sql, "orphan_count": orphan_cnt}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, str(e)) from e


@router.post("/database/relation/consistency")
async def relation_consistency(body: DbRelationConsistencyRequest):
    conn = _conn_by_id(body.connection_id)
    engine = (conn.get("engine") or "").lower()
    user, pwd = _credentials(conn)
    dbname = body.database or conn.get("database") or ""
    try:
        if _is_mysql_family(engine):
            return db_readonly_service.fk_column_type_compare_mysql(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 3306),
                user,
                pwd,
                dbname,
                body.child_table,
                body.child_column,
                body.parent_table,
                body.parent_column,
            )
        if engine == "postgres":
            return db_readonly_service.fk_column_type_compare_postgres(
                conn.get("host") or "127.0.0.1",
                int(conn.get("port") or 5432),
                user,
                pwd,
                dbname or "postgres",
                body.child_table,
                body.child_column,
                body.parent_table,
                body.parent_column,
            )
        raise HTTPException(400, "当前引擎不支持一致性扫描（MySQL/MariaDB/PostgreSQL）")
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
        DbExecuteSqlRequest(
            connection_id=body.connection_id,
            sql=sql,
            limit=body.limit,
            database=body.database,
        )
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
