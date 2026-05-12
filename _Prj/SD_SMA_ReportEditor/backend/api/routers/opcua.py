from fastapi import APIRouter, Body, HTTPException

from core.settings import CONFIG_FILE, DATA_DIR
from modules import config_store, opcua_service
from schemas.common import OpcUaBrowseRequest, OpcUaReadRequest, OpcUaServerSave, OpcUaTestRequest

router = APIRouter(tags=["opcua"])


def _load_cfg():
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _save_cfg(data):
    config_store.save_config(CONFIG_FILE, data)


@router.get("/opcua/servers")
async def list_servers():
    cfg = _load_cfg()
    srv = config_store.ensure_opcua_ids(cfg.get("opcua_servers", []))
    cfg["opcua_servers"] = srv
    _save_cfg(cfg)
    return {"servers": [config_store.mask_opcua_for_response(s) for s in srv]}


@router.post("/opcua/servers")
async def upsert_server(body: OpcUaServerSave):
    cfg = _load_cfg()
    servers = cfg.get("opcua_servers", [])
    pwd_plain = body.password
    entry = {
        "id": body.id or "",
        "name": body.name,
        "endpoint_url": body.endpoint_url,
        "security_policy": body.security_policy,
        "message_security_mode": body.message_security_mode,
        "username": body.username,
    }
    if body.id:
        found = False
        for i, s in enumerate(servers):
            if s.get("id") == body.id:
                enc = s.get("password_enc")
                if pwd_plain is not None:
                    enc = config_store.encrypt_opcua_password(DATA_DIR, pwd_plain)
                entry["password_enc"] = enc
                servers[i] = {**s, **entry}
                found = True
                break
        if not found:
            raise HTTPException(404, "未找到 OPC UA 配置")
    else:
        import uuid

        entry["id"] = str(uuid.uuid4())
        entry["password_enc"] = config_store.encrypt_opcua_password(DATA_DIR, pwd_plain)
        servers.append(entry)
    cfg["opcua_servers"] = servers
    _save_cfg(cfg)
    return {"servers": [config_store.mask_opcua_for_response(s) for s in servers]}


@router.delete("/opcua/servers/{server_id}")
async def delete_server(server_id: str):
    cfg = _load_cfg()
    servers = [s for s in cfg.get("opcua_servers", []) if s.get("id") != server_id]
    cfg["opcua_servers"] = servers
    _save_cfg(cfg)
    return {"ok": True}


@router.post("/opcua/test")
async def test_opcua(body: OpcUaTestRequest):
    res = await opcua_service.test_connection(
        body.endpoint_url,
        body.username,
        body.password,
    )
    return res


@router.post("/opcua/browse")
async def browse_opcua(body: OpcUaBrowseRequest):
    res = await opcua_service.browse_children(
        body.endpoint_url,
        body.node_id,
        body.username,
        body.password,
    )
    return res


@router.post("/opcua/read")
async def read_opcua(body: OpcUaReadRequest):
    res = await opcua_service.read_node_value(
        body.endpoint_url,
        body.node_id,
        body.username,
        body.password,
    )
    return res


@router.post("/opcua/browse_saved/{server_id}")
async def browse_saved(server_id: str, payload: dict = Body(default_factory=dict)):
    cfg = _load_cfg()
    srv = next((s for s in cfg.get("opcua_servers", []) if s.get("id") == server_id), None)
    if not srv:
        raise HTTPException(404, "未找到服务器配置")
    try:
        pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    node_id = (payload or {}).get("node_id")
    return await opcua_service.browse_children(
        srv.get("endpoint_url", ""),
        node_id,
        srv.get("username"),
        pwd,
    )


@router.post("/opcua/read_saved/{server_id}")
async def read_saved(server_id: str, payload: dict):
    cfg = _load_cfg()
    srv = next((s for s in cfg.get("opcua_servers", []) if s.get("id") == server_id), None)
    if not srv:
        raise HTTPException(404, "未找到服务器配置")
    try:
        pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    node_id = payload.get("node_id")
    if not node_id:
        raise HTTPException(400, "缺少 node_id")
    return await opcua_service.read_node_value(
        srv.get("endpoint_url", ""),
        node_id,
        srv.get("username"),
        pwd,
    )
