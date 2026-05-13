"""OPC UA：连接测试、浏览节点（短时连接）；已保存服务器可走连接池复用会话。"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from asyncua import Client

logger = logging.getLogger(__name__)

POOL_IDLE_SEC = 90.0

# server_id -> 每条目独立锁，同服务器 browse/read 串行，避免单连接并发。
_pool: dict[str, "_PoolEntry"] = {}


@dataclass
class _PoolEntry:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    client: Client | None = None
    last_used: float = 0.0
    endpoint_url: str = ""
    username: str | None = None
    password_fp: str = ""


async def _safe_disconnect(client: Client | None) -> None:
    if not client:
        return
    try:
        await client.disconnect()
    except Exception:
        logger.debug("OPC UA disconnect ignored", exc_info=True)


async def _invalidate_entry_client(entry: _PoolEntry) -> None:
    c = entry.client
    entry.client = None
    await _safe_disconnect(c)


async def _prune_if_idle(entry: _PoolEntry) -> None:
    if entry.client and (time.monotonic() - entry.last_used > POOL_IDLE_SEC):
        await _invalidate_entry_client(entry)


def _password_fingerprint(password: str | None) -> str:
    if not password:
        return ""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _config_mismatch(
    entry: _PoolEntry,
    endpoint_url: str,
    username: str | None,
    password: str | None,
) -> bool:
    fp = _password_fingerprint(password)
    return (
        entry.endpoint_url != endpoint_url
        or entry.username != username
        or entry.password_fp != fp
    )


async def _ensure_connected(
    entry: _PoolEntry,
    endpoint_url: str,
    username: str | None,
    password: str | None,
) -> Client:
    if _config_mismatch(entry, endpoint_url, username, password) and entry.client:
        await _invalidate_entry_client(entry)
    entry.endpoint_url = endpoint_url
    entry.username = username
    entry.password_fp = _password_fingerprint(password)

    await _prune_if_idle(entry)

    if entry.client is None:
        client = Client(url=endpoint_url, timeout=15)
        if username:
            client.set_user(username)
            client.set_password(password or "")
        await client.connect()
        entry.client = client

    entry.last_used = time.monotonic()
    return entry.client


def _get_entry(server_id: str) -> _PoolEntry:
    if server_id not in _pool:
        _pool[server_id] = _PoolEntry()
    return _pool[server_id]


async def test_connection(
    endpoint_url: str,
    username: str | None = None,
    password: str | None = None,
    timeout_sec: float = 8.0,
) -> dict[str, Any]:
    client = Client(url=endpoint_url, timeout=int(timeout_sec))
    try:
        if username:
            client.set_user(username)
            client.set_password(password or "")
        await client.connect()
        root = client.nodes.objects
        await root.read_browse_name()
        await client.disconnect()
        return {"ok": True, "message": "连接成功"}
    except Exception as e:
        logger.exception("OPC UA test failed")
        try:
            await client.disconnect()
        except Exception:
            pass
        return {"ok": False, "message": str(e)}


async def browse_children(
    endpoint_url: str,
    node_id: str | None,
    username: str | None = None,
    password: str | None = None,
    max_children: int = 80,
) -> dict[str, Any]:
    """按需临时连接（例如未保存到配置的浏览）。"""
    client = Client(url=endpoint_url, timeout=15)
    try:
        if username:
            client.set_user(username)
            client.set_password(password or "")
        await client.connect()
        return await _browse_with_client(client, node_id, max_children)
    except Exception as e:
        logger.exception("OPC UA browse failed")
        return {"ok": False, "message": str(e), "nodes": []}
    finally:
        await _safe_disconnect(client)


async def browse_children_for_saved_server(
    server_id: str,
    endpoint_url: str,
    node_id: str | None,
    username: str | None = None,
    password: str | None = None,
    max_children: int = 80,
) -> dict[str, Any]:
    """已保存配置：复用长连接，减少每次握手的卡顿。"""
    entry = _get_entry(server_id)
    async with entry.lock:
        try:
            client = await _ensure_connected(entry, endpoint_url, username, password)
            return await _browse_with_client(client, node_id, max_children)
        except Exception as e:
            logger.exception("OPC UA browse (pooled) failed")
            await _invalidate_entry_client(entry)
            return {"ok": False, "message": str(e), "nodes": []}


async def _browse_with_client(
    client: Client,
    node_id: str | None,
    max_children: int,
) -> dict[str, Any]:
    nodes_out: list[dict[str, Any]] = []
    if node_id:
        parent = client.get_node(node_id)
    else:
        parent = client.nodes.objects

    children = await parent.get_children()
    for ch in children[:max_children]:
        try:
            bn = await ch.read_browse_name()
            nid = ch.nodeid.to_string()
            cls = await _try_node_class(ch)
            nodes_out.append(
                {
                    "node_id": nid,
                    "browse_name": f"{bn.NamespaceIndex}:{bn.Name}",
                    "display_name": (await ch.read_display_name()).Text,
                    "node_class": cls,
                }
            )
        except Exception as ex:
            nodes_out.append({"node_id": "", "browse_name": "", "display_name": "", "error": str(ex)})
    return {"ok": True, "nodes": nodes_out}


async def read_node_value(
    endpoint_url: str,
    node_id: str,
    username: str | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    client = Client(url=endpoint_url, timeout=15)
    try:
        if username:
            client.set_user(username)
            client.set_password(password or "")
        await client.connect()
        return await _read_with_client(client, node_id)
    except Exception as e:
        logger.exception("OPC UA read failed")
        return {"ok": False, "message": str(e)}
    finally:
        await _safe_disconnect(client)


async def read_node_value_for_saved_server(
    server_id: str,
    endpoint_url: str,
    node_id: str,
    username: str | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    entry = _get_entry(server_id)
    async with entry.lock:
        try:
            client = await _ensure_connected(entry, endpoint_url, username, password)
            return await _read_with_client(client, node_id)
        except Exception as e:
            logger.exception("OPC UA read (pooled) failed")
            await _invalidate_entry_client(entry)
            return {"ok": False, "message": str(e)}


async def _read_with_client(client: Client, node_id: str) -> dict[str, Any]:
    node = client.get_node(node_id)
    val = await node.read_value()
    attrs: dict[str, Any] = {}
    try:
        dt = await node.read_data_type_as_variant_type()
        attrs["data_type"] = str(dt)
    except Exception:
        pass
    return {"ok": True, "value": val, "attributes": attrs}


async def _try_node_class(node) -> str:
    try:
        nc = await node.read_node_class()
        return nc.name if hasattr(nc, "name") else str(nc)
    except Exception:
        return ""


async def drop_saved_server_pool(server_id: str) -> None:
    """删除已保存服务器配置时释放对应连接，避免持有无效会话。"""
    entry = _pool.pop(server_id, None)
    if not entry:
        return
    async with entry.lock:
        await _invalidate_entry_client(entry)
