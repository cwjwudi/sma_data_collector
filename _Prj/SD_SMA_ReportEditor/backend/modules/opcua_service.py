"""OPC UA：连接测试、浏览节点（短时连接）。"""
from __future__ import annotations

import logging
from typing import Any

from asyncua import Client

logger = logging.getLogger(__name__)


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
    """node_id 为空则从 ObjectsFolder 开始。"""
    client = Client(url=endpoint_url, timeout=15)
    nodes_out: list[dict[str, Any]] = []
    try:
        if username:
            client.set_user(username)
            client.set_password(password or "")
        await client.connect()
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
        await client.disconnect()
        return {"ok": True, "nodes": nodes_out}
    except Exception as e:
        logger.exception("OPC UA browse failed")
        try:
            await client.disconnect()
        except Exception:
            pass
        return {"ok": False, "message": str(e), "nodes": []}


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
        node = client.get_node(node_id)
        val = await node.read_value()
        attrs: dict[str, Any] = {}
        try:
            dt = await node.read_data_type_as_variant_type()
            attrs["data_type"] = str(dt)
        except Exception:
            pass
        await client.disconnect()
        return {"ok": True, "value": val, "attributes": attrs}
    except Exception as e:
        logger.exception("OPC UA read failed")
        try:
            await client.disconnect()
        except Exception:
            pass
        return {"ok": False, "message": str(e)}


async def _try_node_class(node) -> str:
    try:
        nc = await node.read_node_class()
        return nc.name if hasattr(nc, "name") else str(nc)
    except Exception:
        return ""
