"""读写 config.json：数据源连接与 OPC UA 列表。"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from . import secrets as secrets_mod


def load_config(config_file: Path, data_dir: Path) -> dict[str, Any]:
    if not config_file.exists():
        return {"db_connections": [], "opcua_servers": []}
    raw = json.loads(config_file.read_text(encoding="utf-8"))
    raw.setdefault("db_connections", [])
    raw.setdefault("opcua_servers", [])
    return raw


def save_config(config_file: Path, data: dict[str, Any]) -> None:
    config_file.parent.mkdir(parents=True, exist_ok=True)
    config_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def mask_connection_for_response(conn: dict[str, Any]) -> dict[str, Any]:
    """返回给前端：去掉解密密码，仅标记是否已配置密码。"""
    out = dict(conn)
    out.pop("password_enc", None)
    out["has_password"] = bool(conn.get("password_enc"))
    return out


def mask_opcua_for_response(srv: dict[str, Any]) -> dict[str, Any]:
    out = dict(srv)
    out.pop("password_enc", None)
    out["has_password"] = bool(srv.get("password_enc"))
    return out


def ensure_db_connection_ids(conns: list[dict]) -> list[dict]:
    for c in conns:
        if not c.get("id"):
            c["id"] = str(uuid.uuid4())
    return conns


def ensure_opcua_ids(servers: list[dict]) -> list[dict]:
    for s in servers:
        if not s.get("id"):
            s["id"] = str(uuid.uuid4())
    return servers


def decrypt_db_password(data_dir: Path, conn: dict[str, Any]) -> str:
    return secrets_mod.decrypt_secret(data_dir, conn.get("password_enc"))


def encrypt_db_password(data_dir: Path, plain: str | None) -> str | None:
    return secrets_mod.encrypt_secret(data_dir, plain)


def decrypt_opcua_password(data_dir: Path, srv: dict[str, Any]) -> str:
    return secrets_mod.decrypt_secret(data_dir, srv.get("password_enc"))


def encrypt_opcua_password(data_dir: Path, plain: str | None) -> str | None:
    return secrets_mod.encrypt_secret(data_dir, plain)
