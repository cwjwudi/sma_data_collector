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
    """只读执行 SQL（MySQL 与 MariaDB 协议兼容，均使用 PyMySQL）。"""
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


def introspect_mysql_tables(host: str, port: int, user: str, password: str, database: str) -> list[dict[str, Any]]:
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


def list_mysql_columns(host: str, port: int, user: str, password: str, database: str, table: str) -> list[dict[str, str]]:
    import pymysql

    tbl = _safe_ident(table)
    if not database:
        raise ValueError("MySQL/MariaDB 需要 database")
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
                SELECT COLUMN_NAME, DATA_TYPE
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
                """,
                (database, tbl),
            )
            rows = cur.fetchall()
        return [{"name": str(r[0]), "data_type": str(r[1])} for r in rows]
    finally:
        conn.close()


def list_pg_columns(host: str, port: int, user: str, password: str, database: str, table: str) -> list[dict[str, str]]:
    import psycopg2

    tbl = _safe_ident(table)
    conn = psycopg2.connect(
        host=host, port=port, user=user, password=password, dbname=database or "postgres", connect_timeout=10
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position
                """,
                (tbl,),
            )
            rows = cur.fetchall()
        return [{"name": str(r[0]), "data_type": str(r[1])} for r in rows]
    finally:
        conn.close()


def list_sqlite_columns(path: str, table: str) -> list[dict[str, str]]:
    uri = f"file:{path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        tbl = _safe_ident(table)
        cur = conn.execute("SELECT name, type FROM pragma_table_info(?)", (tbl,))
        rows = cur.fetchall()
        return [{"name": str(r[0]), "data_type": str(r[1] or "")} for r in rows]
    finally:
        conn.close()


def _safe_qualified(ref: str) -> str:
    parts = ref.strip().split(".")
    if len(parts) != 2:
        raise ValueError("JOIN ON 须为 table.column 形式")
    return f"{_safe_ident(parts[0])}.{_safe_ident(parts[1])}"


def _join_on_clause(j: dict[str, Any]) -> str:
    pairs: list[str] = []
    raw_pairs = j.get("on_pairs")
    if isinstance(raw_pairs, list) and raw_pairs:
        for pair in raw_pairs:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                continue
            pairs.append(f"{_safe_qualified(str(pair[0]))} = {_safe_qualified(str(pair[1]))}")
    else:
        left = j.get("on_left", "")
        right = j.get("on_right", "")
        if left and right:
            pairs.append(f"{_safe_qualified(left)} = {_safe_qualified(right)}")
    if not pairs:
        raise ValueError("JOIN 缺少 ON 条件")
    return " AND ".join(pairs)


def build_visual_select(
    base_table: str,
    joins: list[dict[str, Any]],
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
        sql += f" INNER JOIN {jt} ON {_join_on_clause(j)}"
    lim = max(1, min(int(limit), 5000))
    sql += f" LIMIT {lim}"
    return sql


def build_visual_count_sql(base_table: str, joins: list[dict[str, Any]]) -> str:
    bt = _safe_ident(base_table)
    sql = f"SELECT COUNT(*) AS cnt FROM {bt}"
    for j in joins:
        jt = _safe_ident(j.get("table", ""))
        sql += f" INNER JOIN {jt} ON {_join_on_clause(j)}"
    return sql


def build_orphan_count_sql_mysql(
    child_table: str, parent_table: str, child_cols: list[str], parent_cols: list[str]
) -> str:
    ct = _safe_ident(child_table)
    pt = _safe_ident(parent_table)
    if len(child_cols) != len(parent_cols) or not child_cols:
        raise ValueError("孤儿检测须提供对齐的子列与父列")
    on_parts = [
        f"c.`{_safe_ident(cc)}` = p.`{_safe_ident(pc)}`"
        for cc, pc in zip(child_cols, parent_cols)
    ]
    null_chk = _safe_ident(parent_cols[0])
    return (
        f"SELECT COUNT(*) AS orphan_cnt FROM `{ct}` AS c "
        f"LEFT JOIN `{pt}` AS p ON {' AND '.join(on_parts)} "
        f"WHERE p.`{null_chk}` IS NULL"
    )


def build_orphan_count_sql_postgres(
    child_table: str, parent_table: str, child_cols: list[str], parent_cols: list[str]
) -> str:
    ct = _safe_ident(child_table)
    pt = _safe_ident(parent_table)
    if len(child_cols) != len(parent_cols) or not child_cols:
        raise ValueError("孤儿检测须提供对齐的子列与父列")
    on_parts = [
        f'c."{_safe_ident(cc)}" = p."{_safe_ident(pc)}"'
        for cc, pc in zip(child_cols, parent_cols)
    ]
    nc = _safe_ident(parent_cols[0])
    return (
        f'SELECT COUNT(*) AS orphan_cnt FROM "{ct}" AS c '
        f'LEFT JOIN "{pt}" AS p ON {" AND ".join(on_parts)} '
        f'WHERE p."{nc}" IS NULL'
    )


def build_orphan_count_sql_sqlite(
    child_table: str, parent_table: str, child_cols: list[str], parent_cols: list[str]
) -> str:
    ct = _safe_ident(child_table)
    pt = _safe_ident(parent_table)
    if len(child_cols) != len(parent_cols) or not child_cols:
        raise ValueError("孤儿检测须提供对齐的子列与父列")
    on_parts = [
        f"c.{_safe_ident(cc)} = p.{_safe_ident(pc)}"
        for cc, pc in zip(child_cols, parent_cols)
    ]
    nc = _safe_ident(parent_cols[0])
    return (
        f"SELECT COUNT(*) AS orphan_cnt FROM {ct} AS c "
        f"LEFT JOIN {pt} AS p ON {' AND '.join(on_parts)} "
        f"WHERE p.{nc} IS NULL"
    )


def list_postgres_foreign_keys(host: str, port: int, user: str, password: str, database: str) -> list[dict[str, Any]]:
    import psycopg2

    conn = psycopg2.connect(
        host=host, port=port, user=user, password=password, dbname=database or "postgres", connect_timeout=10
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.conname,
                       cl.relname AS child_table,
                       a.attname AS child_col,
                       cf.relname AS parent_table,
                       af.attname AS parent_col,
                       ord.idx
                FROM pg_constraint c
                JOIN pg_class cl ON cl.oid = c.conrelid
                JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
                JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS ord(attnum, idx) ON TRUE
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ord.attnum
                JOIN pg_class cf ON cf.oid = c.confrelid
                JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS ord2(attnum2, idx2) ON ord.idx = ord2.idx2
                JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ord2.attnum2
                WHERE c.contype = 'f'
                ORDER BY child_table, c.conname, ord.idx
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    grouped: dict[tuple[str, str], list[tuple[int, str, str, str]]] = {}
    for r in rows:
        cname = str(r[0])
        child_t = str(r[1])
        child_c = str(r[2])
        parent_t = str(r[3])
        parent_c = str(r[4])
        idx = int(r[5])
        grouped.setdefault((child_t, cname), []).append((idx, child_c, parent_t, parent_c))

    out: list[dict[str, Any]] = []
    for (child_table, cname), parts in grouped.items():
        parts.sort(key=lambda x: x[0])
        parent_table = parts[0][2]
        from_cols = [p[1] for p in parts]
        to_cols = [p[3] for p in parts]
        out.append(
            {
                "id": f"{child_table}.{cname}",
                "constraint_name": cname,
                "from_table": child_table,
                "from_columns": from_cols,
                "to_table": parent_table,
                "to_columns": to_cols,
                "kind": "fk",
            }
        )
    return out


def list_sqlite_foreign_keys(path: str, tables: list[str]) -> list[dict[str, Any]]:
    uri = f"file:{path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        edges: list[dict[str, Any]] = []
        seen: set[tuple[str, str, str]] = set()
        for tbl in tables:
            tbl_safe = _safe_ident(tbl)
            cur = conn.execute("PRAGMA foreign_key_list(?)", (tbl_safe,))
            fk_rows = cur.fetchall()
            by_id: dict[int, list[sqlite3.Row]] = {}
            for row in fk_rows:
                by_id.setdefault(int(row["id"]), []).append(row)
            for fid, group in by_id.items():
                group.sort(key=lambda r: int(r["seq"]))
                ref_table = str(group[0]["table"])
                from_cols = [str(g["from"]) for g in group]
                to_cols = [str(g["to"]) if g["to"] else str(g["from"]) for g in group]
                key = (tbl_safe, ref_table, str(fid))
                if key in seen:
                    continue
                seen.add(key)
                eid = f"{tbl_safe}.fk_{fid}"
                edges.append(
                    {
                        "id": eid,
                        "constraint_name": None,
                        "from_table": tbl_safe,
                        "from_columns": from_cols,
                        "to_table": ref_table,
                        "to_columns": to_cols,
                        "kind": "fk",
                    }
                )
        return edges
    finally:
        conn.close()


def list_mysql_foreign_keys(host: str, port: int, user: str, password: str, database: str) -> list[dict[str, Any]]:
    import pymysql

    if not database:
        raise ValueError("MySQL 外键枚举需要 database")
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
                SELECT k.CONSTRAINT_NAME, k.TABLE_NAME, k.COLUMN_NAME, k.ORDINAL_POSITION,
                       k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE k
                INNER JOIN information_schema.TABLE_CONSTRAINTS t
                  ON k.CONSTRAINT_SCHEMA = t.CONSTRAINT_SCHEMA
                  AND k.TABLE_NAME = t.TABLE_NAME
                  AND k.CONSTRAINT_NAME = t.CONSTRAINT_NAME
                WHERE k.TABLE_SCHEMA = %s
                  AND t.CONSTRAINT_TYPE = 'FOREIGN KEY'
                  AND k.REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION
                """,
                (database,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    grouped: dict[tuple[str, str], list[tuple[int, str, str, str]]] = {}
    for r in rows:
        cname = str(r[0])
        tname = str(r[1])
        col = str(r[2])
        ordpos = int(r[3]) if r[3] is not None else 0
        rtbl = str(r[4])
        rcol = str(r[5])
        grouped.setdefault((tname, cname), []).append((ordpos, col, rtbl, rcol))

    out: list[dict[str, Any]] = []
    for (from_table, cname), parts in grouped.items():
        parts.sort(key=lambda x: x[0])
        ref_table = parts[0][2]
        from_cols = [p[1] for p in parts]
        to_cols = [p[3] for p in parts]
        out.append(
            {
                "id": f"{from_table}.{cname}",
                "constraint_name": cname,
                "from_table": from_table,
                "from_columns": from_cols,
                "to_table": ref_table,
                "to_columns": to_cols,
                "kind": "fk",
            }
        )
    return out


def list_mysql_columns_extended(host: str, port: int, user: str, password: str, database: str, table: str) -> list[dict[str, Any]]:
    import pymysql

    tbl = _safe_ident(table)
    if not database:
        raise ValueError("MySQL/MariaDB 需要 database")
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
                SELECT c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_KEY,
                       k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME
                FROM information_schema.COLUMNS c
                LEFT JOIN information_schema.KEY_COLUMN_USAGE k
                  ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
                  AND c.TABLE_NAME = k.TABLE_NAME
                  AND c.COLUMN_NAME = k.COLUMN_NAME
                  AND k.REFERENCED_TABLE_NAME IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS t
                    WHERE t.TABLE_SCHEMA = k.TABLE_SCHEMA AND t.TABLE_NAME = k.TABLE_NAME
                      AND t.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND t.CONSTRAINT_TYPE = 'FOREIGN KEY'
                  )
                WHERE c.TABLE_SCHEMA = %s AND c.TABLE_NAME = %s
                ORDER BY c.ORDINAL_POSITION
                """,
                (database, tbl),
            )
            rows = cur.fetchall()
        cols_out: list[dict[str, Any]] = []
        for r in rows:
            ckey = str(r[2] or "")
            cols_out.append(
                {
                    "name": str(r[0]),
                    "data_type": str(r[1]),
                    "is_primary_key": ckey == "PRI",
                    "fk_to_table": str(r[3]) if r[3] else None,
                    "fk_to_columns": [str(r[4])] if r[4] else None,
                }
            )
        return cols_out
    finally:
        conn.close()


def list_pg_columns_extended(host: str, port: int, user: str, password: str, database: str, table: str) -> list[dict[str, Any]]:
    import psycopg2

    tbl = _safe_ident(table)
    conn = psycopg2.connect(
        host=host, port=port, user=user, password=password, dbname=database or "postgres", connect_timeout=10
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position
                """,
                (tbl,),
            )
            base_rows = cur.fetchall()
            cur.execute(
                """
                SELECT ku.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku
                  ON tc.constraint_schema = ku.constraint_schema
                  AND tc.constraint_name = ku.constraint_name
                WHERE tc.table_schema = 'public' AND tc.table_name = %s AND tc.constraint_type = 'PRIMARY KEY'
                """,
                (tbl,),
            )
            pk_cols = {str(r[0]) for r in cur.fetchall()}
            cur.execute(
                """
                SELECT kcu.column_name, ccu.table_name AS ft, ccu.column_name AS fc
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                  ON ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema = 'public' AND tc.table_name = %s
                """,
                (tbl,),
            )
            fk_map: dict[str, tuple[str, str]] = {}
            for r in cur.fetchall():
                fk_map[str(r[0])] = (str(r[1]), str(r[2]))
        out: list[dict[str, Any]] = []
        for r in base_rows:
            name = str(r[0])
            fk = fk_map.get(name)
            out.append(
                {
                    "name": name,
                    "data_type": str(r[1]),
                    "is_primary_key": name in pk_cols,
                    "fk_to_table": fk[0] if fk else None,
                    "fk_to_columns": [fk[1]] if fk else None,
                }
            )
        return out
    finally:
        conn.close()


def list_sqlite_columns_extended(path: str, table: str) -> list[dict[str, Any]]:
    uri = f"file:{path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        tbl = _safe_ident(table)
        cur = conn.execute("PRAGMA table_info(?)", (tbl,))
        infos = cur.fetchall()
        fk_cur = conn.execute("PRAGMA foreign_key_list(?)", (tbl,))
        fk_rows = fk_cur.fetchall()
        fk_from: dict[str, tuple[str, str]] = {}
        for row in fk_rows:
            fk_from[str(row["from"])] = (str(row["table"]), str(row["to"]) if row["to"] else "")
        out: list[dict[str, Any]] = []
        for row in infos:
            name = str(row["name"])
            tgt_table, tgt_col = fk_from.get(name, (None, None))
            out.append(
                {
                    "name": name,
                    "data_type": str(row["type"] or ""),
                    "is_primary_key": bool(row["pk"]),
                    "fk_to_table": tgt_table,
                    "fk_to_columns": [tgt_col] if tgt_col else None,
                }
            )
        return out
    finally:
        conn.close()


def mysql_table_meta(host: str, port: int, user: str, password: str, database: str, table: str) -> dict[str, Any]:
    import pymysql

    tbl = _safe_ident(table)
    if not database:
        raise ValueError("MySQL 需要 database")
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
                SELECT TABLE_ROWS, TABLE_COMMENT, UPDATE_TIME
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                """,
                (database, tbl),
            )
            row = cur.fetchone()
            if not row:
                return {"approx_row_count": None, "table_comment": None, "last_update_time": None}
            return {
                "approx_row_count": int(row[0]) if row[0] is not None else None,
                "table_comment": str(row[1]) if row[1] else None,
                "last_update_time": str(row[2]) if row[2] else None,
            }
    finally:
        conn.close()


def pg_table_meta(host: str, port: int, user: str, password: str, database: str, table: str) -> dict[str, Any]:
    import psycopg2

    tbl = _safe_ident(table)
    conn = psycopg2.connect(
        host=host, port=port, user=user, password=password, dbname=database or "postgres", connect_timeout=10
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.reltuples::bigint, obj_description(c.oid)
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = %s AND c.relkind = 'r'
                """,
                (tbl,),
            )
            row = cur.fetchone()
            if not row:
                return {"approx_row_count": None, "table_comment": None, "last_update_time": None}
            cnt = int(row[0]) if row[0] is not None else None
            comment = str(row[1]) if row[1] else None
            return {"approx_row_count": cnt, "table_comment": comment, "last_update_time": None}
    finally:
        conn.close()


def sqlite_table_meta(path: str, table: str) -> dict[str, Any]:
    """SQLite 不提供可靠的近似行数（避免 COUNT 全表）；仅返回占位。"""
    del path, table
    return {"approx_row_count": None, "table_comment": None, "last_update_time": None}


def fk_column_type_compare_mysql(
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    child_table: str,
    child_col: str,
    parent_table: str,
    parent_col: str,
) -> dict[str, Any]:
    import pymysql

    if not database:
        raise ValueError("MySQL 需要 database")
    ct = _safe_ident(child_table)
    cc = _safe_ident(child_col)
    pt = _safe_ident(parent_table)
    pc = _safe_ident(parent_col)
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
                SELECT COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s
                """,
                (database, ct, cc),
            )
            cr = cur.fetchone()
            cur.execute(
                """
                SELECT COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s
                """,
                (database, pt, pc),
            )
            pr = cur.fetchone()
        if not cr or not pr:
            return {"match": False, "warnings": ["无法在 information_schema 中找到列定义"]}
        warnings: list[str] = []
        if str(cr[0]).upper() != str(pr[0]).upper():
            warnings.append(f"类型不一致：子列 {cc}={cr[0]}，父列 {pc}={pr[0]}")
        cs_c, cs_p = cr[1], pr[1]
        if cs_c and cs_p and str(cs_c) != str(cs_p):
            warnings.append(f"字符集不同：{cs_c} vs {cs_p}")
        co_c, co_p = cr[2], pr[2]
        if co_c and co_p and str(co_c) != str(co_p):
            warnings.append(f"排序规则不同：{co_c} vs {co_p}")
        return {"match": len(warnings) == 0, "child": {"column_type": cr[0]}, "parent": {"column_type": pr[0]}, "warnings": warnings}
    finally:
        conn.close()


def fk_column_type_compare_postgres(
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    child_table: str,
    child_col: str,
    parent_table: str,
    parent_col: str,
) -> dict[str, Any]:
    import psycopg2

    ct = _safe_ident(child_table)
    cc = _safe_ident(child_col)
    pt = _safe_ident(parent_table)
    pc = _safe_ident(parent_col)
    conn = psycopg2.connect(
        host=host, port=port, user=user, password=password, dbname=database or "postgres", connect_timeout=10
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name=%s AND column_name=%s
                """,
                (ct, cc),
            )
            cr = cur.fetchone()
            cur.execute(
                """
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name=%s AND column_name=%s
                """,
                (pt, pc),
            )
            pr = cur.fetchone()
        if not cr or not pr:
            return {"match": False, "warnings": ["未找到列类型"]}
        warnings = []
        if str(cr[0]) != str(pr[0]) or str(cr[1]) != str(pr[1]):
            warnings.append(f"类型不一致：{cc} {cr[0]}/{cr[1]} vs {pc} {pr[0]}/{pr[1]}")
        return {"match": len(warnings) == 0, "child": {"data_type": cr[0]}, "parent": {"data_type": pr[0]}, "warnings": warnings}
    finally:
        conn.close()
