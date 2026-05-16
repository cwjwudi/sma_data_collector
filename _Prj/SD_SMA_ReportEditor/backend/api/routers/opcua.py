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
    await opcua_service.drop_saved_server_pool(server_id)
    cfg = _load_cfg()
    servers = [s for s in cfg.get("opcua_servers", []) if s.get("id") != server_id]
    cfg["opcua_servers"] = servers
    _save_cfg(cfg)
    return {"ok": True}


@router.post("/opcua/test_saved/{server_id}")
async def test_saved_opcua(server_id: str):
    """对已保存条目做连通测试：使用服务端配置中的 Endpoint 与本机解密后的密码，不依赖当前表单。"""
    cfg = _load_cfg()
    srv = next((s for s in cfg.get("opcua_servers", []) if s.get("id") == server_id), None)
    if not srv:
        return {"ok": False, "message": "未找到 OPC UA 配置"}
    endpoint = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
    if not endpoint:
        return {"ok": False, "message": "该连接在配置文件中 Endpoint URL 为空，请在工作台填写并保存。"}
    try:
        pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
    except ValueError as e:
        return {"ok": False, "message": str(e)}
    return await opcua_service.test_connection(
        endpoint,
        srv.get("username"),
        pwd,
    )


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
    ep = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
    try:
        pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    node_id = (payload or {}).get("node_id")
    return await opcua_service.browse_children_for_saved_server(
        server_id,
        ep,
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
    ep = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
    try:
        pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    node_id = payload.get("node_id")
    if not node_id:
        raise HTTPException(400, "缺少 node_id")
    return await opcua_service.read_node_value_for_saved_server(
        server_id,
        ep,
        node_id,
        srv.get("username"),
        pwd,
    )
