"""演示环境：远程 / 本地双通道预设、健康检查、写入仿真连接。"""
from __future__ import annotations

import os
from typing import Any, Literal

from schemas.common import DbConnectionSave

from modules import config_store, db_connection_ops, opcua_service

DemoChannel = Literal["remote", "local"]

DEMO_DB_ID = {
    "remote": "demo-remote-db",
    "local": "demo-local-db",
}
DEMO_OPC_ID = {
    "remote": "demo-remote-opc",
    "local": "demo-local-opc",
}

LOCAL_DB = {
    "name": "演示 MariaDB（本地）",
    "engine": "mariadb",
    "host": "127.0.0.1",
    "port": 3306,
    "database": "report",
    "username": "root",
    "password": os.environ.get("REPORT_EDITOR_DEMO_LOCAL_DB_PASSWORD", "Br54644800@"),
}

LOCAL_OPC = {
    "name": "演示 OPC UA（本地）",
    "endpoint_url": os.environ.get(
        "REPORT_EDITOR_DEMO_LOCAL_OPC_ENDPOINT",
        "opc.tcp://127.0.0.1:4840/report-editor/demo-opcua/",
    ),
    "username": None,
    "password": None,
}


def _prefs(cfg: dict[str, Any]) -> dict[str, Any]:
    p = cfg.get("app_preferences")
    return p if isinstance(p, dict) else {}


def _remote_db_from_prefs(cfg: dict[str, Any]) -> dict[str, Any]:
    p = _prefs(cfg)
    host = str(p.get("demo_remote_db_host") or os.environ.get("REPORT_EDITOR_DEMO_REMOTE_DB_HOST") or "").strip()
    port = p.get("demo_remote_db_port")
    try:
        port_n = int(port) if port is not None else 3306
    except (TypeError, ValueError):
        port_n = 3306
    return {
        "name": "演示 MariaDB（远程）",
        "engine": "mariadb",
        "host": host,
        "port": port_n,
        "database": str(p.get("demo_remote_db_name") or "report").strip() or "report",
        "username": str(p.get("demo_remote_db_user") or "demo").strip() or "demo",
        "password": str(p.get("demo_remote_db_password") or "").strip(),
    }


def _remote_opc_from_prefs(cfg: dict[str, Any]) -> dict[str, Any]:
    p = _prefs(cfg)
    endpoint = str(
        p.get("demo_remote_opcua_endpoint")
        or os.environ.get("REPORT_EDITOR_DEMO_REMOTE_OPC_ENDPOINT")
        or "",
    ).strip()
    return {
        "name": "演示 OPC UA（远程）",
        "endpoint_url": endpoint,
        "username": p.get("demo_remote_opcua_user") or None,
        "password": str(p.get("demo_remote_opcua_password") or "").strip() or None,
    }


def get_presets(cfg: dict[str, Any]) -> dict[str, Any]:
    remote_db = _remote_db_from_prefs(cfg)
    remote_opc = _remote_opc_from_prefs(cfg)
    return {
        "channels": ["remote", "local"],
        "preferred_channel": _prefs(cfg).get("demo_preferred_channel") or "remote",
        "remote": {
            "configured": bool(remote_db.get("host") and remote_opc.get("endpoint_url")),
            "db": {k: remote_db[k] for k in ("name", "host", "port", "database", "username") if k in remote_db},
            "opcua": {"name": remote_opc["name"], "endpoint_url": remote_opc.get("endpoint_url") or ""},
        },
        "local": {
            "db": {k: LOCAL_DB[k] for k in ("name", "host", "port", "database", "username")},
            "opcua": {"name": LOCAL_OPC["name"], "endpoint_url": LOCAL_OPC["endpoint_url"]},
        },
    }


async def check_health(cfg: dict[str, Any], channel: DemoChannel) -> dict[str, Any]:
    if channel == "local":
        db_spec = LOCAL_DB
        opc_spec = LOCAL_OPC
    else:
        db_spec = _remote_db_from_prefs(cfg)
        opc_spec = _remote_opc_from_prefs(cfg)
        if not db_spec.get("host") or not opc_spec.get("endpoint_url"):
            return {
                "ok": False,
                "channel": channel,
                "db": {"ok": False, "message": "未配置远程演示数据库地址"},
                "opcua": {"ok": False, "message": "未配置远程演示 OPC UA 地址"},
            }

    db_body = DbConnectionSave(
        name=db_spec["name"],
        engine=db_spec["engine"],
        host=db_spec.get("host"),
        port=db_spec.get("port"),
        database=db_spec.get("database"),
        username=db_spec.get("username"),
        password=db_spec.get("password") or "",
    )
    db_ok, db_msg = db_connection_ops.run_connectivity_test(db_body, connection_name=db_spec["name"])
    opc_res = await opcua_service.test_connection(
        opc_spec.get("endpoint_url") or "",
        opc_spec.get("username"),
        opc_spec.get("password") or "",
        connection_name=opc_spec.get("name"),
    )
    opc_ok = bool(opc_res.get("ok"))
    opc_msg = str(opc_res.get("message") or "")
    overall = db_ok and opc_ok
    return {
        "ok": overall,
        "channel": channel,
        "db": {"ok": db_ok, "message": db_msg or ""},
        "opcua": {"ok": opc_ok, "message": opc_msg},
    }


def apply_demo_connections(
    cfg: dict[str, Any],
    data_dir,
    channel: DemoChannel,
) -> dict[str, Any]:
    if channel == "local":
        db_spec = LOCAL_DB
        opc_spec = LOCAL_OPC
    else:
        db_spec = _remote_db_from_prefs(cfg)
        opc_spec = _remote_opc_from_prefs(cfg)
        if not db_spec.get("host") or not opc_spec.get("endpoint_url"):
            raise ValueError("远程演示服务器未配置，请在下方填写地址或改用本地工具包。")

    db_id = DEMO_DB_ID[channel]
    opc_id = DEMO_OPC_ID[channel]

    conns = list(cfg.get("db_connections") or [])
    db_entry: dict[str, Any] = {
        "id": db_id,
        "name": db_spec["name"],
        "engine": db_spec["engine"],
        "host": db_spec.get("host"),
        "port": db_spec.get("port"),
        "database": db_spec.get("database"),
        "username": db_spec.get("username"),
        "password_enc": config_store.encrypt_db_password(data_dir, db_spec.get("password") or ""),
        "is_demo": True,
        "demo_channel": channel,
    }
    replaced_db = False
    for i, c in enumerate(conns):
        if c.get("id") == db_id:
            conns[i] = {**c, **db_entry}
            replaced_db = True
            break
    if not replaced_db:
        conns.append(db_entry)

    servers = list(cfg.get("opcua_servers") or [])
    opc_entry: dict[str, Any] = {
        "id": opc_id,
        "name": opc_spec["name"],
        "endpoint_url": opc_spec.get("endpoint_url") or "",
        "username": opc_spec.get("username"),
        "password_enc": config_store.encrypt_opcua_password(data_dir, opc_spec.get("password") or ""),
        "is_demo": True,
        "demo_channel": channel,
    }
    replaced_opc = False
    for i, s in enumerate(servers):
        if s.get("id") == opc_id:
            servers[i] = {**s, **opc_entry}
            replaced_opc = True
            break
    if not replaced_opc:
        servers.append(opc_entry)

    prefs = dict(_prefs(cfg))
    prefs["demo_preferred_channel"] = channel
    prefs["last_connection_id"] = db_id
    prefs["last_opcua_server_id"] = opc_id

    cfg["db_connections"] = conns
    cfg["opcua_servers"] = servers
    cfg["app_preferences"] = prefs
    return {
        "ok": True,
        "channel": channel,
        "db_id": db_id,
        "opc_id": opc_id,
        "created_db": not replaced_db,
        "created_opc": not replaced_opc,
    }
