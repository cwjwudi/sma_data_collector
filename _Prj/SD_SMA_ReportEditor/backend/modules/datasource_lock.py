"""数据源配置锁定：偏好读写、写保护与脱敏审计摘要。"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from core.settings import CONFIG_FILE, DATA_DIR
from modules import audit_log, config_store


LOCK_MSG = "数据源已锁定，仅可查看。请在「数据源配置」页滑动解锁后再修改。"


def load_cfg() -> dict[str, Any]:
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def is_datasource_locked(cfg: dict[str, Any] | None = None) -> bool:
    data = cfg if isinstance(cfg, dict) else load_cfg()
    prefs = data.get("app_preferences") or {}
    return bool(prefs.get("datasource_locked"))


def assert_datasource_writable(*, attempted_action: str = "", object_id: str | None = None) -> None:
    """锁定时抛 HTTP 403，并记 write_blocked 审计。"""
    if not is_datasource_locked():
        return
    try:
        audit_log.append_audit(
            DATA_DIR,
            action="datasource.write_blocked",
            result="fail",
            summary=LOCK_MSG,
            object_type="datasource",
            object_id=object_id,
            detail={"attempted_action": attempted_action or "write"},
        )
    except Exception:
        pass
    raise HTTPException(403, LOCK_MSG)


def set_datasource_locked(
    locked: bool,
    *,
    via: str = "ui",
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """设置锁定状态并写审计；返回更新后的公开偏好片段。"""
    data = cfg if isinstance(cfg, dict) else load_cfg()
    prefs = dict(data.get("app_preferences") or {})
    before = bool(prefs.get("datasource_locked"))
    after = bool(locked)
    prefs["datasource_locked"] = after
    data["app_preferences"] = prefs
    config_store.save_config(CONFIG_FILE, data)
    if before != after:
        action = "datasource.lock" if after else "datasource.unlock"
        audit_log.append_audit(
            DATA_DIR,
            action=action,
            result="ok",
            summary="数据源已锁定" if after else "数据源已解锁",
            object_type="datasource",
            detail={"before": {"locked": before}, "after": {"locked": after}, "via": via},
        )
    return {"datasource_locked": after}


def db_connection_audit_summary(conn: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(conn, dict):
        return None
    return {
        "id": conn.get("id"),
        "name": conn.get("name"),
        "engine": conn.get("engine"),
        "host": conn.get("host"),
        "port": conn.get("port"),
        "database": conn.get("database"),
        "username": conn.get("username"),
        "sqlite_path": conn.get("sqlite_path"),
        "has_password": bool(conn.get("password_enc") or conn.get("has_password")),
        "is_demo": bool(conn.get("is_demo")),
    }


def opc_server_audit_summary(srv: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(srv, dict):
        return None
    ep = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
    return {
        "id": srv.get("id"),
        "name": srv.get("name"),
        "endpoint_url": ep,
        "username": srv.get("username"),
        "has_password": bool(srv.get("password_enc") or srv.get("has_password")),
        "is_demo": bool(srv.get("is_demo")),
    }
