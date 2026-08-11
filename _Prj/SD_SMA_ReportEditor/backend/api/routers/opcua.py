from fastapi import APIRouter, Body, HTTPException

from core.settings import CONFIG_FILE, DATA_DIR
from modules import audit_log, config_store, datasource_lock, opcua_service
from schemas.common import (
    OpcUaBrowseRequest,
    OpcUaReadRequest,
    OpcUaSavedVariableSearch,
    OpcUaSavedWriteRequest,
    OpcUaServerSave,
    OpcUaTestRequest,
    OpcUaVariableSearchRequest,
)

router = APIRouter(tags=["opcua"])


def _load_cfg():
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _save_cfg(data):
    config_store.save_config(CONFIG_FILE, data)


@router.get("/opcua/servers")
async def list_servers():
    cfg = _load_cfg()
    raw = cfg.get("opcua_servers", [])
    # 仅当存在缺 id / 仅旧字段 endpoint 的条目才回写磁盘（此接口被预检与轮询高频调用）
    needs_fix = any(
        not s.get("id")
        or (not str(s.get("endpoint_url") or "").strip() and str(s.get("endpoint") or "").strip())
        for s in raw
    )
    srv = config_store.ensure_opcua_ids(raw)
    if needs_fix:
        cfg["opcua_servers"] = srv
        _save_cfg(cfg)
    return {"servers": [config_store.mask_opcua_for_response(s) for s in srv]}


@router.post("/opcua/servers")
async def upsert_server(body: OpcUaServerSave):
    datasource_lock.assert_datasource_writable(
        attempted_action="opcua.connection_save",
        object_id=body.id,
    )
    cfg = _load_cfg()
    servers = cfg.get("opcua_servers", [])
    before = next((s for s in servers if s.get("id") == body.id), None) if body.id else None
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
    after = next((s for s in servers if s.get("id") == entry.get("id")), entry)
    try:
        audit_log.append_audit(
            DATA_DIR,
            action="opcua.connection_save",
            result="ok",
            summary=str(after.get("name") or after.get("endpoint_url") or "OPC UA"),
            object_type="opcua_server",
            object_id=after.get("id"),
            detail={
                "before": datasource_lock.opc_server_audit_summary(before),
                "after": datasource_lock.opc_server_audit_summary(after),
                "password_changed": pwd_plain is not None,
            },
        )
    except Exception:
        pass
    saved_id = after.get("id") or entry.get("id")
    return {
        "servers": [config_store.mask_opcua_for_response(s) for s in servers],
        "saved_id": saved_id,
    }


@router.delete("/opcua/servers/{server_id}")
async def delete_server(server_id: str):
    datasource_lock.assert_datasource_writable(
        attempted_action="opcua.connection_delete",
        object_id=server_id,
    )
    cfg = _load_cfg()
    before = next((s for s in cfg.get("opcua_servers", []) if s.get("id") == server_id), None)
    await opcua_service.drop_saved_server_pool(server_id)
    servers = [s for s in cfg.get("opcua_servers", []) if s.get("id") != server_id]
    cfg["opcua_servers"] = servers
    _save_cfg(cfg)
    # 幂等连点删除：条目已不存在时不再刷审计，避免连点刷屏
    if before is not None:
        try:
            audit_log.append_audit(
                DATA_DIR,
                action="opcua.connection_delete",
                result="ok",
                summary=str(before.get("name") or server_id),
                object_type="opcua_server",
                object_id=server_id,
                detail={
                    "before": datasource_lock.opc_server_audit_summary(before),
                    "after": None,
                },
            )
        except Exception:
            pass
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
        connection_name=str(srv.get("name") or server_id),
    )


@router.post("/opcua/ping_saved/{server_id}")
async def ping_saved_opcua(server_id: str):
    """结批预检用的轻量连通检查：复用连接池会话，避免每次导出完整握手。"""
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
    return await opcua_service.ping_saved_server(
        server_id,
        endpoint,
        srv.get("username"),
        pwd,
        connection_name=str(srv.get("name") or server_id),
    )


@router.post("/opcua/test")
async def test_opcua(body: OpcUaTestRequest):
    res = await opcua_service.test_connection(
        body.endpoint_url,
        body.username,
        body.password,
    )
    return res


@router.post("/opcua/search")
async def search_opcua_variables(body: OpcUaVariableSearchRequest):
    q = (body.query or "").strip()
    if not q:
        return {"ok": True, "hits": [], "nodes_scanned": 0, "truncated": False}
    return await opcua_service.search_variables_ephemeral(
        body.endpoint_url,
        body.username,
        body.password,
        q,
        body.max_scan,
        body.max_results,
        body.max_depth,
    )


@router.post("/opcua/browse")
async def browse_opcua(body: OpcUaBrowseRequest):
    mc = body.max_children
    if mc is None:
        mc = opcua_service.DEFAULT_OPCUA_BROWSE_MAX_CHILDREN
    res = await opcua_service.browse_children(
        body.endpoint_url,
        body.node_id,
        body.username,
        body.password,
        max_children=mc,
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
    dt = str((payload or {}).get("data_type") or "").strip() or None
    raw_mc = (payload or {}).get("max_children")
    mc = opcua_service.DEFAULT_OPCUA_BROWSE_MAX_CHILDREN
    if raw_mc is not None:
        try:
            n = int(raw_mc)
            mc = max(1, min(n, 3000))
        except (TypeError, ValueError):
            pass
    return await opcua_service.browse_children_for_saved_server(
        server_id,
        ep,
        node_id,
        srv.get("username"),
        pwd,
        max_children=mc,
        data_type_filter=dt,
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


@router.post("/opcua/write_saved/{server_id}")
async def write_saved(server_id: str, body: OpcUaSavedWriteRequest):
    """对已保存 OPC UA 连接写入变量值（用于导出结果反馈 PLC 等）。"""
    cfg = _load_cfg()
    srv = next((s for s in cfg.get("opcua_servers", []) if s.get("id") == server_id), None)
    if not srv:
        raise HTTPException(404, "未找到服务器配置")
    ep = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
    if not ep:
        return {"ok": False, "message": "该连接 Endpoint URL 为空，请先保存有效配置。"}
    node_id = (body.node_id or "").strip()
    if not node_id:
        raise HTTPException(400, "缺少 node_id")
    try:
        pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
    except ValueError as e:
        return {"ok": False, "message": str(e)}
    return await opcua_service.write_node_value_for_saved_server(
        server_id,
        ep,
        node_id,
        body.value,
        srv.get("username"),
        pwd,
    )


@router.post("/opcua/search_saved/{server_id}")
async def search_saved_variables(server_id: str, body: OpcUaSavedVariableSearch):
    cfg = _load_cfg()
    srv = next((s for s in cfg.get("opcua_servers", []) if s.get("id") == server_id), None)
    if not srv:
        raise HTTPException(404, "未找到服务器配置")
    ep = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
    try:
        pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    q = (body.query or "").strip()
    dt = (body.data_type or "").strip() or None
    if not q and not dt:
        return {"ok": True, "hits": [], "nodes_scanned": 0, "truncated": False}
    return await opcua_service.search_variables_for_saved_server(
        server_id,
        ep,
        srv.get("username"),
        pwd,
        q,
        body.max_scan,
        body.max_results,
        body.max_depth,
        dt,
    )


@router.post("/opcua/resolve_path_saved/{server_id}")
async def resolve_path_saved(server_id: str, payload: dict = Body(default_factory=dict)):
    """解析已配置 NodeId 的 Objects 子树祖先链（根→叶），供选择器自动展开。失败仍返回 HTTP 200。"""
    cfg = _load_cfg()
    srv = next((s for s in cfg.get("opcua_servers", []) if s.get("id") == server_id), None)
    if not srv:
        raise HTTPException(404, "未找到服务器配置")
    ep = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
    node_id = str((payload or {}).get("node_id") or "").strip()
    if not node_id:
        return {"ok": False, "error": "缺少 node_id", "path": []}
    try:
        pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
    except ValueError as e:
        return {"ok": False, "error": str(e), "path": []}
    return await opcua_service.resolve_node_path_for_saved_server(
        server_id,
        ep,
        node_id,
        srv.get("username"),
        pwd,
    )
