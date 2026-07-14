"""AI 数据源 CRUD（密码/删除确认走 pending，永不进入 LLM）。"""
from __future__ import annotations

import uuid
from typing import Any, Literal

from core.settings import CONFIG_FILE, DATA_DIR
from modules import ai_pending_prompts, audit_log, config_store, datasource_lock, db_readonly_service, opcua_service
from modules.ai_asset_ops import mark_ui_reload
from schemas.common import DbConnectionSave, OpcUaServerSave

TargetKind = Literal["db", "opcua"]

_UNLOCK_MSG = "数据源已锁定，请确认解锁后 AI 才能修改连接配置。"


def _cfg() -> dict[str, Any]:
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _save(data: dict[str, Any]) -> None:
    config_store.save_config(CONFIG_FILE, data)


def refuse_if_locked(*, attempted_action: str, object_id: str | None = None) -> dict[str, Any] | None:
    """锁定时不落库，创建解锁确认框并返回工具错误结果。"""
    if not datasource_lock.is_datasource_locked():
        return None
    try:
        audit_log.append_audit(
            DATA_DIR,
            action="datasource.write_blocked",
            result="fail",
            summary=_UNLOCK_MSG,
            object_type="datasource",
            object_id=object_id,
            detail={"attempted_action": attempted_action, "via": "ai"},
        )
    except Exception:
        pass
    prompt = ai_pending_prompts.create_prompt(
        kind="confirm_unlock_datasource",
        target_kind="datasource",
        title="请解锁数据源",
        message=_UNLOCK_MSG + " AI 无法自行解锁，需您在此确认或到「数据源配置」页滑动解锁。",
        payload={"attempted_action": attempted_action},
    )
    return {
        "ok": False,
        "error": _UNLOCK_MSG,
        "status": "awaiting_user_unlock",
        "datasource_locked": True,
        "pending_prompt_id": prompt.get("id"),
        "prompt": prompt,
        "message": _UNLOCK_MSG,
    }


# 兼容旧名
_refuse_if_locked = refuse_if_locked


def apply_confirm_unlock(prompt_id: str, confirmed: bool) -> dict[str, Any]:
    item = ai_pending_prompts.get_prompt(prompt_id)
    if not item or item.get("status") != "pending" or item.get("kind") != "confirm_unlock_datasource":
        return {"ok": False, "error": "待办不存在或已过期"}
    if not confirmed:
        ai_pending_prompts.cancel_prompt(prompt_id)
        return {"ok": True, "cancelled": True, "datasource_locked": True}
    datasource_lock.set_datasource_locked(False, via="ai_prompt")
    ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True, "datasource_locked": False})
    return {"ok": True, "datasource_locked": False}


def _is_mysql_family(engine: str) -> bool:
    return (engine or "").lower() in ("mysql", "mariadb")


def _conn_by_id(cid: str) -> dict[str, Any] | None:
    for c in _cfg().get("db_connections") or []:
        if c.get("id") == cid:
            return c
    return None


def _opc_by_id(sid: str) -> dict[str, Any] | None:
    for s in _cfg().get("opcua_servers") or []:
        if s.get("id") == sid:
            return s
    return None


def _engine_needs_password(engine: str) -> bool:
    return (engine or "").lower() in ("mysql", "mariadb", "postgres", "mongodb")


def get_db_connection_detail(connection_id: str) -> dict[str, Any]:
    conn = _conn_by_id(connection_id)
    if not conn:
        return {"ok": False, "error": "未找到数据库连接"}
    return {"ok": True, "connection": config_store.mask_connection_for_response(conn)}


def get_opc_server_detail(server_id: str) -> dict[str, Any]:
    srv = _opc_by_id(server_id)
    if not srv:
        return {"ok": False, "error": "未找到 OPC UA 配置"}
    return {"ok": True, "server": config_store.mask_opcua_for_response(srv)}


def list_db_catalog(connection_id: str, database: str | None = None) -> dict[str, Any]:
    conn = _conn_by_id(connection_id)
    if not conn:
        return {"ok": False, "error": "未找到数据库连接"}
    if conn.get("is_demo") and conn.get("demo_channel") == "remote":
        return {"ok": False, "error": "演示远程连接不支持目录查询"}
    engine = (conn.get("engine") or "").lower()
    try:
        user, pwd = conn.get("username") or "", config_store.decrypt_db_password(DATA_DIR, conn) if conn.get("password_enc") else ""
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    try:
        if _is_mysql_family(engine):
            host = conn.get("host") or "127.0.0.1"
            port = int(conn.get("port") or 3306)
            if database:
                tables = db_readonly_service.introspect_mysql_tables(host, port, user, pwd, database)
                return {"ok": True, "engine": engine, "tables": tables}
            dbs = db_readonly_service.mysql_list_databases(host, port, user, pwd)
            return {"ok": True, "engine": engine, "databases": dbs}
        if engine == "postgres":
            host = conn.get("host") or "127.0.0.1"
            port = int(conn.get("port") or 5432)
            if database:
                tables = db_readonly_service.introspect_pg_tables(host, port, user, pwd, database)
                return {"ok": True, "engine": engine, "tables": tables}
            dbs = db_readonly_service.postgres_list_databases(host, port, user, pwd)
            return {"ok": True, "engine": engine, "databases": dbs}
        if engine == "sqlite":
            path = conn.get("sqlite_path") or ""
            tables = db_readonly_service.introspect_sqlite_tables(path)
            return {"ok": True, "engine": engine, "tables": tables}
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
                return {"ok": True, "engine": engine, "collections": cols}
            dbs = db_readonly_service.mongo_list_databases(vars_)
            return {"ok": True, "engine": engine, "databases": dbs}
        return {"ok": False, "error": f"未知引擎: {engine}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _needs_db_credential(*, conn: dict[str, Any] | None, engine: str, username: str | None) -> bool:
    if not _engine_needs_password(engine):
        return False
    if not conn:
        return bool((username or "").strip())
    if not conn.get("password_enc"):
        return True
    if username is not None and str(username).strip() != str(conn.get("username") or "").strip():
        return True
    return False


def upsert_db_connection(args: dict[str, Any]) -> dict[str, Any]:
    blocked = _refuse_if_locked(
        attempted_action="ai.upsert_db_connection",
        object_id=str(args.get("id") or "") or None,
    )
    if blocked:
        return blocked
    body = DbConnectionSave(
        id=args.get("id"),
        name=str(args.get("name") or ""),
        engine=str(args.get("engine") or ""),
        host=args.get("host"),
        port=args.get("port"),
        database=args.get("database"),
        username=args.get("username"),
        password=None,
        sqlite_path=args.get("sqlite_path"),
        mongo_auth_source=args.get("mongo_auth_source") or "admin",
    )
    if not body.engine:
        return {"ok": False, "error": "缺少 engine"}
    cfg = _cfg()
    conns = list(cfg.get("db_connections") or [])
    existing = _conn_by_id(body.id) if body.id else None
    if existing and existing.get("is_demo") and existing.get("demo_channel") == "remote":
        return {"ok": False, "error": "演示远程连接仅可改名称，请在 UI 中操作"}

    eng = body.engine.lower()
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
    saved_id = body.id
    before = datasource_lock.db_connection_audit_summary(existing)
    if body.id:
        found = False
        for i, c in enumerate(conns):
            if c.get("id") == body.id:
                entry["password_enc"] = c.get("password_enc")
                entry["id"] = body.id
                conns[i] = {**c, **entry}
                found = True
                break
        if not found:
            return {"ok": False, "error": "未找到连接"}
    else:
        saved_id = str(uuid.uuid4())
        entry["id"] = saved_id
        entry["password_enc"] = None
        conns.append(entry)

    cfg["db_connections"] = conns
    _save(cfg)
    after_row = _conn_by_id(saved_id) or entry
    try:
        audit_log.append_audit(
            DATA_DIR,
            action="db.connection_save",
            result="ok",
            summary=str(after_row.get("name") or after_row.get("engine") or "数据库连接"),
            object_type="db_connection",
            object_id=saved_id,
            detail={
                "before": before,
                "after": datasource_lock.db_connection_audit_summary(after_row),
                "via": "ai",
            },
        )
    except Exception:
        pass
    masked = config_store.mask_connection_for_response(after_row)
    mark_ui_reload(datasource=True, reason="upsert_db_connection")
    needs_cred = _needs_db_credential(conn=existing, engine=eng, username=body.username)
    if needs_cred:
        prompt = ai_pending_prompts.create_prompt(
            kind="credential",
            target_kind="db",
            connection_id=str(saved_id),
            connection_name=str(body.name or saved_id),
            title="填写数据库密码",
            message=f"AI 助手请求保存连接「{body.name or saved_id}」的非敏感字段，请在弹框中填写密码（密码不会发送给 LLM）。",
            username_hint=str(body.username or ""),
        )
        return {
            "ok": True,
            "status": "awaiting_user_credentials",
            "saved_id": saved_id,
            "connection": masked,
            "prompt": prompt,
            "message": "非敏感字段已保存。请在报表软件弹出的密码框中填写密码。",
        }
    return {"ok": True, "status": "saved", "saved_id": saved_id, "connection": masked}


def upsert_opc_server(args: dict[str, Any]) -> dict[str, Any]:
    blocked = _refuse_if_locked(
        attempted_action="ai.upsert_opc_server",
        object_id=str(args.get("id") or "") or None,
    )
    if blocked:
        return blocked
    body = OpcUaServerSave(
        id=args.get("id"),
        name=str(args.get("name") or ""),
        endpoint_url=str(args.get("endpoint_url") or ""),
        security_policy=args.get("security_policy"),
        message_security_mode=args.get("message_security_mode"),
        username=args.get("username"),
        password=None,
    )
    if not body.endpoint_url.strip():
        return {"ok": False, "error": "缺少 endpoint_url"}
    cfg = _cfg()
    servers = list(cfg.get("opcua_servers") or [])
    existing = _opc_by_id(body.id) if body.id else None
    before = datasource_lock.opc_server_audit_summary(existing)
    entry: dict[str, Any] = {
        "name": body.name,
        "endpoint_url": body.endpoint_url,
        "security_policy": body.security_policy,
        "message_security_mode": body.message_security_mode,
        "username": body.username,
    }
    saved_id = body.id
    if body.id:
        found = False
        for i, s in enumerate(servers):
            if s.get("id") == body.id:
                entry["password_enc"] = s.get("password_enc")
                entry["id"] = body.id
                servers[i] = {**s, **entry}
                found = True
                break
        if not found:
            return {"ok": False, "error": "未找到 OPC UA 配置"}
    else:
        saved_id = str(uuid.uuid4())
        entry["id"] = saved_id
        entry["password_enc"] = None
        servers.append(entry)

    cfg["opcua_servers"] = servers
    _save(cfg)
    after_row = _opc_by_id(saved_id) or entry
    try:
        audit_log.append_audit(
            DATA_DIR,
            action="opcua.connection_save",
            result="ok",
            summary=str(after_row.get("name") or after_row.get("endpoint_url") or "OPC UA"),
            object_type="opcua_server",
            object_id=saved_id,
            detail={
                "before": before,
                "after": datasource_lock.opc_server_audit_summary(after_row),
                "via": "ai",
            },
        )
    except Exception:
        pass
    masked = config_store.mask_opcua_for_response(after_row)
    mark_ui_reload(datasource=True, reason="upsert_opc_server")
    needs_cred = False
    if body.username and str(body.username).strip():
        if not existing or not existing.get("password_enc"):
            needs_cred = True
        elif str(body.username).strip() != str(existing.get("username") or "").strip():
            needs_cred = True
    if needs_cred:
        prompt = ai_pending_prompts.create_prompt(
            kind="credential",
            target_kind="opcua",
            connection_id=str(saved_id),
            connection_name=str(body.name or saved_id),
            title="填写 OPC UA 密码",
            message=f"AI 助手请求保存 OPC 连接「{body.name or saved_id}」，请在弹框中填写密码。",
            username_hint=str(body.username or ""),
        )
        return {
            "ok": True,
            "status": "awaiting_user_credentials",
            "saved_id": saved_id,
            "server": masked,
            "prompt": prompt,
            "message": "非敏感字段已保存。请在报表软件弹出的密码框中填写密码。",
        }
    return {"ok": True, "status": "saved", "saved_id": saved_id, "server": masked}


def request_connection_credentials(args: dict[str, Any]) -> dict[str, Any]:
    blocked = _refuse_if_locked(
        attempted_action="ai.request_connection_credentials",
        object_id=str(args.get("connection_id") or "") or None,
    )
    if blocked:
        return blocked
    kind = str(args.get("kind") or "").strip().lower()
    cid = str(args.get("connection_id") or "").strip()
    if not cid:
        return {"ok": False, "error": "缺少 connection_id"}
    if kind == "db":
        conn = _conn_by_id(cid)
        if not conn:
            return {"ok": False, "error": "未找到数据库连接"}
        prompt = ai_pending_prompts.create_prompt(
            kind="credential",
            target_kind="db",
            connection_id=cid,
            connection_name=str(conn.get("name") or cid),
            title="填写数据库密码",
            message=f"请在弹框中为连接「{conn.get('name') or cid}」填写密码。",
            username_hint=str(conn.get("username") or ""),
        )
        return {"ok": True, "status": "awaiting_user_credentials", "prompt": prompt}
    if kind in ("opcua", "opc"):
        srv = _opc_by_id(cid)
        if not srv:
            return {"ok": False, "error": "未找到 OPC UA 配置"}
        prompt = ai_pending_prompts.create_prompt(
            kind="credential",
            target_kind="opcua",
            connection_id=cid,
            connection_name=str(srv.get("name") or cid),
            title="填写 OPC UA 密码",
            message=f"请在弹框中为 OPC 连接「{srv.get('name') or cid}」填写密码。",
            username_hint=str(srv.get("username") or ""),
        )
        return {"ok": True, "status": "awaiting_user_credentials", "prompt": prompt}
    return {"ok": False, "error": "kind 须为 db 或 opcua"}


def delete_db_connection(connection_id: str) -> dict[str, Any]:
    blocked = _refuse_if_locked(attempted_action="ai.delete_db_connection", object_id=connection_id or None)
    if blocked:
        return blocked
    conn = _conn_by_id(connection_id)
    if not conn:
        return {"ok": False, "error": "未找到数据库连接"}
    if conn.get("is_demo"):
        return {"ok": False, "error": "演示连接不可通过 AI 删除"}
    prompt = ai_pending_prompts.create_prompt(
        kind="confirm_delete",
        target_kind="db",
        connection_id=connection_id,
        connection_name=str(conn.get("name") or connection_id),
        title="确认删除数据库连接",
        message=f"AI 助手请求删除数据库连接「{conn.get('name') or connection_id}」。此操作不可撤销，请确认。",
    )
    return {
        "ok": True,
        "status": "awaiting_user_confirm",
        "prompt": prompt,
        "message": "请在报表软件弹出的确认框中确认删除。",
    }


def delete_opc_server(server_id: str) -> dict[str, Any]:
    blocked = _refuse_if_locked(attempted_action="ai.delete_opc_server", object_id=server_id or None)
    if blocked:
        return blocked
    srv = _opc_by_id(server_id)
    if not srv:
        return {"ok": False, "error": "未找到 OPC UA 配置"}
    prompt = ai_pending_prompts.create_prompt(
        kind="confirm_delete",
        target_kind="opcua",
        connection_id=server_id,
        connection_name=str(srv.get("name") or server_id),
        title="确认删除 OPC UA 连接",
        message=f"AI 助手请求删除 OPC 连接「{srv.get('name') or server_id}」。此操作不可撤销，请确认。",
    )
    return {
        "ok": True,
        "status": "awaiting_user_confirm",
        "prompt": prompt,
        "message": "请在报表软件弹出的确认框中确认删除。",
    }


def apply_credential(prompt_id: str, password: str) -> dict[str, Any]:
    item = ai_pending_prompts.get_prompt(prompt_id)
    if not item or item.get("status") != "pending" or item.get("kind") != "credential":
        return {"ok": False, "error": "待办不存在或已过期"}
    blocked = _refuse_if_locked(
        attempted_action="ai.apply_credential",
        object_id=str(item.get("connection_id") or "") or None,
    )
    if blocked:
        return blocked
    cid = str(item.get("connection_id") or "")
    target = str(item.get("target_kind") or "")
    cfg = _cfg()
    if target == "db":
        conns = cfg.get("db_connections") or []
        for i, c in enumerate(conns):
            if c.get("id") == cid:
                before = datasource_lock.db_connection_audit_summary(c)
                conns[i] = {**c, "password_enc": config_store.encrypt_db_password(DATA_DIR, password)}
                cfg["db_connections"] = conns
                _save(cfg)
                try:
                    audit_log.append_audit(
                        DATA_DIR,
                        action="db.connection_save",
                        result="ok",
                        summary=str(c.get("name") or cid),
                        object_type="db_connection",
                        object_id=cid,
                        detail={
                            "before": before,
                            "after": datasource_lock.db_connection_audit_summary(conns[i]),
                            "password_changed": True,
                            "via": "ai_credential",
                        },
                    )
                except Exception:
                    pass
                ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True})
                mark_ui_reload(datasource=True, reason="apply_credential")
                return {"ok": True, "connection_id": cid}
        return {"ok": False, "error": "连接已不存在"}
    if target == "opcua":
        servers = cfg.get("opcua_servers") or []
        for i, s in enumerate(servers):
            if s.get("id") == cid:
                before = datasource_lock.opc_server_audit_summary(s)
                servers[i] = {**s, "password_enc": config_store.encrypt_opcua_password(DATA_DIR, password)}
                cfg["opcua_servers"] = servers
                _save(cfg)
                try:
                    audit_log.append_audit(
                        DATA_DIR,
                        action="opcua.connection_save",
                        result="ok",
                        summary=str(s.get("name") or cid),
                        object_type="opcua_server",
                        object_id=cid,
                        detail={
                            "before": before,
                            "after": datasource_lock.opc_server_audit_summary(servers[i]),
                            "password_changed": True,
                            "via": "ai_credential",
                        },
                    )
                except Exception:
                    pass
                ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True})
                mark_ui_reload(datasource=True, reason="apply_credential")
                return {"ok": True, "connection_id": cid}
        return {"ok": False, "error": "OPC 连接已不存在"}
    return {"ok": False, "error": "未知 target_kind"}


async def apply_confirm_delete(prompt_id: str, confirmed: bool) -> dict[str, Any]:
    item = ai_pending_prompts.get_prompt(prompt_id)
    if not item or item.get("status") != "pending" or item.get("kind") != "confirm_delete":
        return {"ok": False, "error": "待办不存在或已过期"}
    if not confirmed:
        ai_pending_prompts.cancel_prompt(prompt_id)
        return {"ok": True, "cancelled": True}
    blocked = _refuse_if_locked(
        attempted_action="ai.apply_confirm_delete",
        object_id=str(item.get("connection_id") or "") or None,
    )
    if blocked:
        return blocked
    cid = str(item.get("connection_id") or "")
    target = str(item.get("target_kind") or "")
    cfg = _cfg()
    if target == "db":
        before = next((c for c in cfg.get("db_connections") or [] if c.get("id") == cid), None)
        conns = [c for c in cfg.get("db_connections") or [] if c.get("id") != cid]
        cfg["db_connections"] = conns
        _save(cfg)
        try:
            audit_log.append_audit(
                DATA_DIR,
                action="db.connection_delete",
                result="ok",
                summary=str((before or {}).get("name") or cid),
                object_type="db_connection",
                object_id=cid,
                detail={
                    "before": datasource_lock.db_connection_audit_summary(before),
                    "after": None,
                    "via": "ai",
                },
            )
        except Exception:
            pass
        ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True, "deleted": cid})
        mark_ui_reload(datasource=True, reason="delete_db_connection")
        return {"ok": True, "deleted": cid, "kind": "db"}
    if target == "opcua":
        before = next((s for s in cfg.get("opcua_servers") or [] if s.get("id") == cid), None)
        await opcua_service.drop_saved_server_pool(cid)
        servers = [s for s in cfg.get("opcua_servers") or [] if s.get("id") != cid]
        cfg["opcua_servers"] = servers
        _save(cfg)
        try:
            audit_log.append_audit(
                DATA_DIR,
                action="opcua.connection_delete",
                result="ok",
                summary=str((before or {}).get("name") or cid),
                object_type="opcua_server",
                object_id=cid,
                detail={
                    "before": datasource_lock.opc_server_audit_summary(before),
                    "after": None,
                    "via": "ai",
                },
            )
        except Exception:
            pass
        ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True, "deleted": cid})
        mark_ui_reload(datasource=True, reason="delete_opc_server")
        return {"ok": True, "deleted": cid, "kind": "opcua"}
    return {"ok": False, "error": "未知 target_kind"}


_SYSTEM_DB_NAMES = frozenset(
    {
        "information_schema",
        "mysql",
        "performance_schema",
        "sys",
        "postgres",
        "template0",
        "template1",
    }
)


def _is_system_db_name(name: str) -> bool:
    return (name or "").strip().lower() in _SYSTEM_DB_NAMES


async def get_datasource_inventory(
    *,
    include_system_databases: bool = False,
    count_opc_variables: bool = True,
    opc_max_scan: int = 50000,
    opc_max_depth: int = 56,
) -> dict[str, Any]:
    """汇总：连接数、库/表数量、OPC 变量数量（现场探查，只读）。"""
    cfg = _cfg()
    db_conns = list(cfg.get("db_connections") or [])
    opc_servers = list(cfg.get("opcua_servers") or [])

    db_rows: list[dict[str, Any]] = []
    total_databases = 0
    total_tables = 0
    total_user_databases = 0
    total_user_tables = 0

    for conn in db_conns:
        cid = str(conn.get("id") or "")
        name = str(conn.get("name") or cid)
        engine = str(conn.get("engine") or "").lower()
        row: dict[str, Any] = {
            "id": cid,
            "name": name,
            "engine": engine,
            "ok": False,
            "databases": [],
            "database_count": 0,
            "table_count": 0,
            "user_database_count": 0,
            "user_table_count": 0,
        }
        cat = list_db_catalog(cid)
        if not cat.get("ok"):
            row["error"] = cat.get("error") or "目录查询失败"
            db_rows.append(row)
            continue

        row["ok"] = True
        if engine == "sqlite":
            tables = cat.get("tables") or []
            n = len(tables) if isinstance(tables, list) else 0
            row["databases"] = [{"name": "(sqlite)", "table_count": n, "system": False}]
            row["database_count"] = 1
            row["table_count"] = n
            row["user_database_count"] = 1
            row["user_table_count"] = n
        else:
            dbs = cat.get("databases") or []
            db_names: list[str] = []
            for d in dbs:
                if isinstance(d, str):
                    db_names.append(d)
                elif isinstance(d, dict):
                    db_names.append(str(d.get("name") or d.get("database") or ""))
            details: list[dict[str, Any]] = []
            for dbn in db_names:
                if not dbn:
                    continue
                is_sys = _is_system_db_name(dbn)
                if is_sys and not include_system_databases:
                    continue
                tr = list_db_catalog(cid, dbn)
                tn = 0
                if tr.get("ok"):
                    tn = len(tr.get("tables") or tr.get("collections") or [])
                details.append(
                    {
                        "name": dbn,
                        "table_count": tn,
                        "system": is_sys,
                        "ok": bool(tr.get("ok")),
                        "error": tr.get("error"),
                    }
                )
            # 若默认跳过系统库，再单独扫一遍系统库计入全量（可选）
            all_details = list(details)
            if not include_system_databases:
                for dbn in db_names:
                    if not dbn or not _is_system_db_name(dbn):
                        continue
                    tr = list_db_catalog(cid, dbn)
                    tn = len(tr.get("tables") or tr.get("collections") or []) if tr.get("ok") else 0
                    all_details.append(
                        {
                            "name": dbn,
                            "table_count": tn,
                            "system": True,
                            "ok": bool(tr.get("ok")),
                            "error": tr.get("error"),
                        }
                    )
            row["databases"] = all_details if include_system_databases else details
            row["database_count"] = len(all_details)
            row["table_count"] = sum(int(x.get("table_count") or 0) for x in all_details)
            user_details = [x for x in all_details if not x.get("system")]
            row["user_database_count"] = len(user_details)
            row["user_table_count"] = sum(int(x.get("table_count") or 0) for x in user_details)
            if not include_system_databases:
                row["databases"] = user_details
                row["note"] = "明细仅含用户库；summary 含系统库合计"

        total_databases += int(row["database_count"])
        total_tables += int(row["table_count"])
        total_user_databases += int(row["user_database_count"])
        total_user_tables += int(row["user_table_count"])
        db_rows.append(row)

    opc_rows: list[dict[str, Any]] = []
    total_opc_variables = 0
    for srv in opc_servers:
        sid = str(srv.get("id") or "")
        sname = str(srv.get("name") or sid)
        ep = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
        orow: dict[str, Any] = {
            "id": sid,
            "name": sname,
            "endpoint_url": ep,
            "ok": False,
            "variable_count": 0,
        }
        if not count_opc_variables:
            orow["ok"] = True
            orow["skipped"] = True
            opc_rows.append(orow)
            continue
        try:
            pwd = config_store.decrypt_opcua_password(DATA_DIR, srv) if srv.get("password_enc") else ""
        except ValueError as e:
            orow["error"] = str(e)
            opc_rows.append(orow)
            continue
        counted = await opcua_service.count_variables_for_saved_server(
            sid,
            ep,
            srv.get("username"),
            pwd,
            max_scan=opc_max_scan,
            max_depth=opc_max_depth,
        )
        if not counted.get("ok"):
            orow["error"] = counted.get("message") or "OPC 变量统计失败"
            opc_rows.append(orow)
            continue
        orow["ok"] = True
        orow["variable_count"] = int(counted.get("variable_count") or 0)
        orow["structure_containers"] = int(counted.get("structure_containers") or 0)
        orow["nodes_scanned"] = counted.get("nodes_scanned")
        orow["truncated"] = bool(counted.get("truncated"))
        total_opc_variables += int(orow["variable_count"])
        opc_rows.append(orow)

    return {
        "ok": True,
        "datasource_locked": datasource_lock.is_datasource_locked(cfg),
        "summary": {
            "db_connection_count": len(db_conns),
            "opc_connection_count": len(opc_servers),
            "database_count": total_databases,
            "table_count": total_tables,
            "user_database_count": total_user_databases,
            "user_table_count": total_user_tables,
            "opc_variable_count": total_opc_variables,
            "include_system_databases": bool(include_system_databases),
            "datasource_locked": datasource_lock.is_datasource_locked(cfg),
        },
        "databases": db_rows,
        "opcua_servers": opc_rows,
    }
