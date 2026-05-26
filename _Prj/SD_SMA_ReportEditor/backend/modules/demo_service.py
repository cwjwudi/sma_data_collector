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

# 远程演示数据库（内置，可通过环境变量覆盖；勿在前端暴露）
REMOTE_DB = {
    "name": "演示数据库（远程）",
    "engine": "mariadb",
    "host": os.environ.get("REPORT_EDITOR_DEMO_REMOTE_DB_HOST", "6.tcp.cpolar.cn").strip(),
    "port": int(os.environ.get("REPORT_EDITOR_DEMO_REMOTE_DB_PORT", "11742")),
    "database": os.environ.get("REPORT_EDITOR_DEMO_REMOTE_DB_NAME", "report").strip() or "report",
    "username": os.environ.get("REPORT_EDITOR_DEMO_REMOTE_DB_USER", "root").strip() or "root",
    "password": os.environ.get("REPORT_EDITOR_DEMO_REMOTE_DB_PASSWORD", "Br54644800@"),
}

LOCAL_DB = {
    "name": "演示数据库（本地）",
    "engine": "mariadb",
    "host": "127.0.0.1",
    "port": 3306,
    "database": "report",
    "username": "root",
    "password": os.environ.get("REPORT_EDITOR_DEMO_LOCAL_DB_PASSWORD", "Br54644800@"),
}

LOCAL_OPC = {
    "name": "演示 OPC（本地）",
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


def _remote_db_spec(cfg: dict[str, Any]) -> dict[str, Any]:
    """合并内置远程库与可选偏好覆盖（密码等敏感项不依赖用户填写）。"""
    p = _prefs(cfg)
    spec = dict(REMOTE_DB)
    host = str(p.get("demo_remote_db_host") or spec["host"] or "").strip()
    port_raw = p.get("demo_remote_db_port")
    try:
        port_n = int(port_raw) if port_raw is not None else int(spec["port"])
    except (TypeError, ValueError):
        port_n = int(spec["port"])
    pwd = str(p.get("demo_remote_db_password") or "").strip()
    return {
        "name": spec["name"],
        "engine": spec["engine"],
        "host": host,
        "port": port_n,
        "database": str(p.get("demo_remote_db_name") or spec["database"]).strip() or spec["database"],
        "username": str(p.get("demo_remote_db_user") or spec["username"]).strip() or spec["username"],
        "password": pwd or spec["password"],
    }


def _remote_opc_spec(cfg: dict[str, Any]) -> dict[str, Any]:
    p = _prefs(cfg)
    endpoint = str(
        p.get("demo_remote_opcua_endpoint")
        or os.environ.get("REPORT_EDITOR_DEMO_REMOTE_OPC_ENDPOINT")
        or "",
    ).strip()
    pwd = str(p.get("demo_remote_opcua_password") or "").strip()
    return {
        "name": "演示 OPC（远程）",
        "endpoint_url": endpoint,
        "username": p.get("demo_remote_opcua_user") or None,
        "password": pwd or None,
    }


def get_presets(cfg: dict[str, Any]) -> dict[str, Any]:
    remote_db = _remote_db_spec(cfg)
    remote_opc = _remote_opc_spec(cfg)
    opc_ready = bool(remote_opc.get("endpoint_url"))
    return {
        "channels": ["remote", "local"],
        "preferred_channel": _prefs(cfg).get("demo_preferred_channel") or "remote",
        "remote": {
            "configured": bool(remote_db.get("host")),
            "db_ready": bool(remote_db.get("host")),
            "opc_ready": opc_ready,
            "label": "远程演示服务器",
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
        db_spec = _remote_db_spec(cfg)
        opc_spec = _remote_opc_spec(cfg)
        if not db_spec.get("host"):
            return {
                "ok": False,
                "channel": channel,
                "db": {"ok": False, "message": "远程演示服务暂不可用，请稍后再试或改用本地演示工具包。"},
                "opcua": {"ok": False, "message": "—"},
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

    opc_endpoint = opc_spec.get("endpoint_url") or ""
    if opc_endpoint:
        opc_res = await opcua_service.test_connection(
            opc_endpoint,
            opc_spec.get("username"),
            opc_spec.get("password") or "",
            connection_name=opc_spec.get("name"),
        )
        opc_ok = bool(opc_res.get("ok"))
        opc_msg = str(opc_res.get("message") or "")
        overall = db_ok and opc_ok
    else:
        opc_ok = False
        opc_msg = "演示用 OPC 尚未开放，可先连接演示数据库进行练习。"
        overall = db_ok

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
        db_spec = _remote_db_spec(cfg)
        opc_spec = _remote_opc_spec(cfg)
        if not db_spec.get("host"):
            raise ValueError("远程演示服务暂不可用，请稍后再试，或选择「本地演示工具包」。")

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

    created_opc = False
    replaced_opc = False
    servers = list(cfg.get("opcua_servers") or [])
    opc_endpoint = opc_spec.get("endpoint_url") or ""
    if opc_endpoint:
        opc_entry: dict[str, Any] = {
            "id": opc_id,
            "name": opc_spec["name"],
            "endpoint_url": opc_endpoint,
            "username": opc_spec.get("username"),
            "password_enc": config_store.encrypt_opcua_password(data_dir, opc_spec.get("password") or ""),
            "is_demo": True,
            "demo_channel": channel,
        }
        for i, s in enumerate(servers):
            if s.get("id") == opc_id:
                servers[i] = {**s, **opc_entry}
                replaced_opc = True
                break
        if not replaced_opc:
            servers.append(opc_entry)
            created_opc = True

    prefs = dict(_prefs(cfg))
    prefs["demo_preferred_channel"] = channel
    prefs["last_connection_id"] = db_id
    if opc_endpoint:
        prefs["last_opcua_server_id"] = opc_id

    cfg["db_connections"] = conns
    cfg["opcua_servers"] = servers
    cfg["app_preferences"] = prefs
    return {
        "ok": True,
        "channel": channel,
        "db_id": db_id,
        "opc_id": opc_id if opc_endpoint else None,
        "created_db": not replaced_db,
        "created_opc": created_opc,
        "opc_skipped": not opc_endpoint,
    }
