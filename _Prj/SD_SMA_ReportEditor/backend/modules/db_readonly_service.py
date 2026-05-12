"""数据库只读访问：MySQL / PostgreSQL / SQLite / MongoDB。"""
from __future__ import annotations

import json
import re
import sqlite3
from typing import Any

FORBIDDEN_SQL_TOKENS = (
    "INSERT ",
    "UPDATE ",
    "DELETE ",
    "DROP ",
    "ALTER ",
    "CREATE ",
    "TRUNCATE ",
    "GRANT ",
    "REVOKE ",
    "EXEC ",
    "CALL ",
    "REPLACE ",
)


def validate_readonly_sql(sql: str) -> str:
    stripped = sql.strip()
    if not stripped:
        raise ValueError("SQL 不能为空")
    parts = [p.strip() for p in stripped.split(";") if p.strip()]
    if len(parts) != 1:
        raise ValueError("仅允许单条语句")
    s = parts[0]
    upper = s.upper()
    for tok in FORBIDDEN_SQL_TOKENS:
        if tok in upper:
            raise ValueError(f"禁止关键字: {tok.strip()}")
    first = upper.split()[0] if upper else ""
    allowed_first = ("SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH")
    if first not in allowed_first:
        if first == "PRAGMA":
            if any(x in upper for x in ("JOURNAL", "SYNCHRONOUS", "PAGE_SIZE", "AUTOVACUUM")):
                raise ValueError("不允许此类 PRAGMA")
            return s
        raise ValueError("仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN / WITH / 部分 PRAGMA")
    return s


def validate_mongo_aggregate(pipeline: list[Any]) -> None:
    raw = json.dumps(pipeline)
    upper = raw.upper()
    if '"$OUT"' in upper or '"$MERGE"' in upper or "$OUT" in upper.replace('"', ""):
        raise ValueError("禁止 $out / $merge")


def run_mysql_readonly(host: str, port: int, user: str, password: str, database: str, sql: str, limit: int) -> dict[str, Any]:
    import pymysql

    sql_v = validate_readonly_sql(sql)
    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database or None,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10,
        read_timeout=60,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(sql_v)
            rows = cur.fetchmany(limit)
            cols = [d[0] for d in cur.description] if cur.description else []
        return {"columns": cols, "rows": rows}
    finally:
        conn.close()


def run_postgres_readonly(host: str, port: int, user: str, password: str, database: str, sql: str, limit: int) -> dict[str, Any]:
    import psycopg2
    import psycopg2.extras

    sql_v = validate_readonly_sql(sql)
    conn = psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=database or "postgres",
        connect_timeout=10,
    )
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql_v)
            rows = cur.fetchmany(limit)
            cols = [c.name for c in cur.description] if cur.description else []
            rows_list = [dict(r) for r in rows]
        return {"columns": cols, "rows": rows_list}
    finally:
        conn.close()


def run_sqlite_readonly(path: str, sql: str, limit: int) -> dict[str, Any]:
    sql_v = validate_readonly_sql(sql)
    uri = f"file:{path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(sql_v)
        rows = cur.fetchmany(limit)
        cols = [d[0] for d in cur.description] if cur.description else []
        return {"columns": cols, "rows": [dict(zip(cols, row)) for row in rows]}
    finally:
        conn.close()


def mongo_list_databases(uri_host_vars: dict[str, Any]) -> list[str]:
    from pymongo import MongoClient

    uri = _mongo_uri(**uri_host_vars)
    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    try:
        return sorted(client.list_database_names())
    finally:
        client.close()


def mongo_list_collections(uri_host_vars: dict[str, Any], database: str) -> list[str]:
    from pymongo import MongoClient

    uri = _mongo_uri(**uri_host_vars)
    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    try:
        db = client[database]
        return sorted(db.list_collection_names())
    finally:
        client.close()


def mongo_find_sample(
    uri_host_vars: dict[str, Any],
    database: str,
    collection: str,
    limit: int,
) -> dict[str, Any]:
    from pymongo import MongoClient

    uri = _mongo_uri(**uri_host_vars)
    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    try:
        db = client[database]
        col = db[collection]
        docs = list(col.find({}, limit=limit))
        for d in docs:
            if "_id" in d:
                d["_id"] = str(d["_id"])
        cols = sorted({k for d in docs for k in d.keys()}) if docs else []
        return {"columns": cols, "rows": docs}
    finally:
        client.close()


def mongo_aggregate_readonly(
    uri_host_vars: dict[str, Any],
    database: str,
    collection: str,
    pipeline: list[Any],
    limit: int,
) -> dict[str, Any]:
    from pymongo import MongoClient

    validate_mongo_aggregate(pipeline)
    uri = _mongo_uri(**uri_host_vars)
    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    try:
        db = client[database]
        col = db[collection]
        # append $limit if not present
        pl = list(pipeline)
        if not any(isinstance(s, dict) and "$limit" in s for s in pl):
            pl.append({"$limit": limit})
        docs = list(col.aggregate(pl))
        for d in docs:
            if "_id" in d:
                d["_id"] = str(d["_id"])
        cols = sorted({k for d in docs for k in d.keys()}) if docs else []
        return {"columns": cols, "rows": docs}
    finally:
        client.close()


def _mongo_uri(
    host: str,
    port: int,
    username: str,
    password: str,
    auth_source: str = "admin",
) -> str:
    from urllib.parse import quote_plus

    if username:
        u = quote_plus(username)
        p = quote_plus(password or "")
        return f"mongodb://{u}:{p}@{host}:{port}/?authSource={quote_plus(auth_source)}"
    return f"mongodb://{host}:{port}/"


def mysql_list_databases(host: str, port: int, user: str, password: str) -> list[str]:
    import pymysql

    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        charset="utf8mb4",
        connect_timeout=10,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW DATABASES")
            return [r[0] for r in cur.fetchall()]
    finally:
        conn.close()


def postgres_list_databases(host: str, port: int, user: str, password: str) -> list[str]:
    import psycopg2

    conn = psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname="postgres",
        connect_timeout=10,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
            return [r[0] for r in cur.fetchall()]
    finally:
        conn.close()


    import pymysql

    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        connect_timeout=10,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT TABLE_NAME, TABLE_TYPE
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = %s
                ORDER BY TABLE_NAME
                """,
                (database,),
            )
            rows = cur.fetchall()
        return [{"name": r[0], "kind": r[1]} for r in rows]
    finally:
        conn.close()


def introspect_pg_tables(host: str, port: int, user: str, password: str, database: str) -> list[dict[str, Any]]:
    import psycopg2

    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=database, connect_timeout=10)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name, table_type
                FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog','information_schema')
                ORDER BY table_name
                """
            )
            rows = cur.fetchall()
        return [{"name": r[0], "kind": r[1]} for r in rows]
    finally:
        conn.close()


def introspect_sqlite_tables(path: str) -> list[dict[str, Any]]:
    uri = f"file:{path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        cur = conn.execute(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"
        )
        return [{"name": r[0], "kind": r[1]} for r in cur.fetchall()]
    finally:
        conn.close()


def _safe_ident(name: str) -> str:
    if not name or not re.match(r"^[a-zA-Z0-9_]+$", name):
        raise ValueError("非法表名/标识符")
    return name


def ddl_preview_mysql(host: str, port: int, user: str, password: str, database: str, table: str) -> str:
    import pymysql

    table = _safe_ident(table)
    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        connect_timeout=10,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(f"SHOW CREATE TABLE `{table}`")
            row = cur.fetchone()
            return row[1] if row else ""
    finally:
        conn.close()


def ddl_preview_pg(host: str, port: int, user: str, password: str, database: str, table: str) -> str:
    import psycopg2

    table = _safe_ident(table)
    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=database, connect_timeout=10)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name=%s
                ORDER BY ordinal_position
                """,
                (table,),
            )
            rows = cur.fetchall()
        lines = [f"  {r[0]} {r[1]}" for r in rows]
        if not lines:
            return f"-- 未找到表 {table} 的列信息"
        return f"-- 近似 DDL（只读预览）\nCREATE TABLE {table} (\n" + ",\n".join(lines) + "\n);"
    finally:
        conn.close()


def ddl_preview_sqlite(path: str, table: str) -> str:
    uri = f"file:{path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        table = _safe_ident(table)
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        return row[0] if row and row[0] else ""
    finally:
        conn.close()


def _safe_qualified(ref: str) -> str:
    parts = ref.strip().split(".")
    if len(parts) != 2:
        raise ValueError("JOIN ON 须为 table.column 形式")
    return f"{_safe_ident(parts[0])}.{_safe_ident(parts[1])}"


def build_visual_select(
    base_table: str,
    joins: list[dict[str, str]],
    columns: list[str],
    limit: int,
) -> str:
    bt = _safe_ident(base_table)
    cols_sql: list[str] = []
    for c in columns:
        c = c.strip()
        if not c:
            continue
        if "." in c:
            a, b = c.split(".", 1)
            cols_sql.append(f"{_safe_ident(a)}.{_safe_ident(b)}")
        else:
            cols_sql.append(f"{bt}.{_safe_ident(c)}")
    if not cols_sql:
        cols_sql = [f"{bt}.*"]
    sql = f"SELECT {', '.join(cols_sql)} FROM {bt}"
    for j in joins:
        jt = _safe_ident(j.get("table", ""))
        left = j.get("on_left", "")
        right = j.get("on_right", "")
        sql += f" INNER JOIN {jt} ON {_safe_qualified(left)} = {_safe_qualified(right)}"
    lim = max(1, min(int(limit), 5000))
    sql += f" LIMIT {lim}"
    return sql
