"""OPC UA：连接测试、浏览节点（短时连接）；已保存服务器可走连接池复用会话。"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from asyncua import Client, ua
from asyncua.common.node import Node as OpcUaNode
from asyncua.ua.uaerrors import UaStatusCodeError

from modules.connection_error_hints import humanize_opcua_error

logger = logging.getLogger(__name__)

POOL_IDLE_SEC = 90.0

# 单层浏览返回的最大子节点数（PLC 数据块下变量极多时过小的上限会截掉末尾项）
DEFAULT_OPCUA_BROWSE_MAX_CHILDREN = 2000

# 全地址空间变量名搜索（BFS）默认上限
SEARCH_VARS_DEFAULT_MAX_SCAN = 24000
SEARCH_VARS_DEFAULT_MAX_RESULTS = 300
SEARCH_VARS_DEFAULT_MAX_DEPTH = 56
SEARCH_ROOT_TOKEN = "__objects_root__"

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
    *,
    connection_name: str | None = None,
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
        return {
            "ok": False,
            "message": humanize_opcua_error(
                str(e),
                connection_name=connection_name,
                endpoint=endpoint_url,
            ),
        }


async def browse_children(
    endpoint_url: str,
    node_id: str | None,
    username: str | None = None,
    password: str | None = None,
    max_children: int = DEFAULT_OPCUA_BROWSE_MAX_CHILDREN,
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
    max_children: int = DEFAULT_OPCUA_BROWSE_MAX_CHILDREN,
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


async def _merged_hierarchical_and_property_children(parent: Any, max_children: int) -> list[Any]:
    """合并多种 Browse 来源（按 NodeId 去重），尽量贴近 UA Expert 可见的地址空间。

    - 层级引用（默认）：文件夹、设备等主干
    - HasProperty：常见于字符串配置等 Property 变量
    - HasComponent + Variable：asyncua 显式列举变量（少数网关层级 Browse 不完整时仍能列出）
    - 任意前向引用且目标为 Variable：部分 PLC OPC 网关用非典型引用类型挂 DB/String 标签
    """
    merged: list[Any] = []
    seen: set[str] = set()

    def node_key(node: Any) -> str | None:
        try:
            return node.nodeid.to_string()
        except Exception:
            return None

    def append_unique(nodes: list[Any]) -> None:
        for ch in nodes:
            if len(merged) >= max_children:
                break
            key = node_key(ch)
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(ch)

    try:
        hierarchical = await parent.get_children()
    except Exception:
        hierarchical = []
    append_unique(hierarchical)

    try:
        append_unique(await parent.get_properties())
    except Exception:
        logger.debug("OPC UA get_properties supplement failed", exc_info=True)

    try:
        append_unique(await parent.get_variables())
    except Exception:
        logger.debug("OPC UA get_variables supplement failed", exc_info=True)

    # 前向任意引用 + Variable：补齐 Siemens/三方网关仅用 Organizes 以外引用暴露的标签
    if len(merged) < max_children:
        try:
            session = parent.session
            descs = await parent.get_references(
                ua.ObjectIds.References,
                ua.BrowseDirection.Forward,
                ua.NodeClass.Variable,
            )
            extra: list[Any] = []
            for d in descs:
                try:
                    extra.append(OpcUaNode(session, d.NodeId))
                except Exception:
                    continue
            append_unique(extra)
        except Exception:
            logger.debug("OPC UA Variable-mask forward references supplement failed", exc_info=True)

    return merged


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

    children = await _merged_hierarchical_and_property_children(parent, max_children)
    for ch in children:
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
            # _read_with_client 将服务端拒绝（如 BadNotSupported）转为 ok:false，不断开池连接
            return await _read_with_client(client, node_id)
        except Exception as e:
            logger.exception("OPC UA read (pooled) failed")
            await _invalidate_entry_client(entry)
            return {"ok": False, "message": str(e)}


async def _read_with_client(client: Client, node_id: str) -> dict[str, Any]:
    """读取变量 Value；服务端返回 BadNotSupported 等时不抛异常，以免误判为连接故障并刷屏 ERROR。"""
    node = client.get_node(node_id)
    try:
        val = await node.read_value()
    except UaStatusCodeError as e:
        code = int(e.code)
        # 预期内的「节点不支持读值」等：一行 WARNING，避免 logger.exception 栈追踪
        logger.warning("OPC UA read_value rejected node_id=%s code=%s (%s)", node_id, code, e)
        return {"ok": False, "message": str(e), "status_code": code}
    attrs: dict[str, Any] = {}
    try:
        dt = await node.read_data_type_as_variant_type()
        nm = getattr(dt, "name", None)
        if isinstance(nm, str) and nm.strip():
            attrs["data_type"] = nm.strip()
        else:
            attrs["data_type"] = str(dt)
    except UaStatusCodeError as e:
        logger.debug("OPC UA read_data_type rejected after successful read: %s", e)
    except Exception:
        pass
    return {"ok": True, "value": opc_value_to_json_safe(val), "attributes": attrs}


async def _write_with_client(client: Client, node_id: str, value: Any) -> dict[str, Any]:
    """写入变量 Value；BadNotWritable 等转为 ok:false 而不抛栈。"""
    node = client.get_node(node_id)
    variant_type = await _read_write_variant_type(node)
    clean_value = _coerce_write_value(value, variant_type)
    clean_data_value = ua.DataValue(ua.Variant(clean_value, variant_type))
    try:
        # asyncua.write_value() adds SourceTimestamp. Some strict PLC OPC UA servers
        # reject that combination with BadWriteNotSupported, so write only Value.
        await node.write_attribute(ua.AttributeIds.Value, clean_data_value)
        return {"ok": True}
    except UaStatusCodeError as e:
        code = int(e.code)
        logger.warning("OPC UA write_attribute(Value) rejected node_id=%s code=%s (%s)", node_id, code, e)
        return {"ok": False, "message": str(e), "status_code": code}
    except Exception as e:
        logger.exception("OPC UA write_attribute(Value) failed node_id=%s", node_id)
        return {"ok": False, "message": str(e)}


async def _read_write_variant_type(node: Any) -> ua.VariantType | None:
    try:
        vt = await node.read_data_type_as_variant_type()
        return vt if isinstance(vt, ua.VariantType) else None
    except UaStatusCodeError as e:
        logger.debug("OPC UA write: read_data_type rejected before write: %s", e)
    except Exception:
        logger.debug("OPC UA write: read_data_type failed before write", exc_info=True)
    return None


def _coerce_write_value(value: Any, variant_type: ua.VariantType | None) -> Any:
    if variant_type == ua.VariantType.Boolean:
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "yes", "y", "on")
        return bool(value)
    if variant_type in (
        ua.VariantType.SByte,
        ua.VariantType.Byte,
        ua.VariantType.Int16,
        ua.VariantType.UInt16,
        ua.VariantType.Int32,
        ua.VariantType.UInt32,
        ua.VariantType.Int64,
        ua.VariantType.UInt64,
    ):
        if isinstance(value, bool):
            return 1 if value else 0
        return int(value)
    if variant_type in (ua.VariantType.Float, ua.VariantType.Double):
        return float(value)
    if variant_type == ua.VariantType.String:
        return "" if value is None else str(value)
    return value


async def write_node_value_for_saved_server(
    server_id: str,
    endpoint_url: str,
    node_id: str,
    value: Any,
    username: str | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    entry = _get_entry(server_id)
    async with entry.lock:
        try:
            client = await _ensure_connected(entry, endpoint_url, username, password)
            return await _write_with_client(client, node_id, value)
        except Exception as e:
            logger.exception("OPC UA write (pooled) failed")
            await _invalidate_entry_client(entry)
            return {"ok": False, "message": str(e)}


def opc_value_to_json_safe(val: Any, _depth: int = 0) -> Any:
    """把 OPC/asyncua 常见 Variant、String、LocalizedText、ByteString 等转成 JSON 安全类型（前端易展示与筛选）。"""
    if _depth > 14:
        return str(val)
    if val is None:
        return None
    try:
        from asyncua import ua as _ua

        if isinstance(val, _ua.Variant):
            return opc_value_to_json_safe(val.Value, _depth + 1)
    except Exception:
        pass
    if isinstance(val, (bool, int, float, str)):
        return val
    if isinstance(val, (bytes, bytearray)):
        try:
            return val.decode("utf-8", errors="replace")
        except Exception:
            return val.hex() if isinstance(val, bytes) else str(val)

    try:
        import datetime as dt_mod
        import uuid as uuid_mod

        if isinstance(val, dt_mod.datetime):
            return val.isoformat()
        if isinstance(val, uuid_mod.UUID):
            return str(val)
    except Exception:
        pass

    try:
        import enum

        if isinstance(val, enum.Enum):
            nm = getattr(val, "name", None)
            if isinstance(nm, str) and nm.strip():
                return nm.strip()
            return str(val.value)
    except Exception:
        pass

    # asyncua：LocalizedText、String、Variant 等常有嵌套属性
    for attr in ("Value", "value", "Text", "text"):
        if hasattr(val, attr):
            try:
                inner = getattr(val, attr)
                if inner is not None and inner is not val:
                    return opc_value_to_json_safe(inner, _depth + 1)
            except Exception:
                break

    if isinstance(val, dict):
        return {str(k): opc_value_to_json_safe(v, _depth + 1) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [opc_value_to_json_safe(x, _depth + 1) for x in val]

    return str(val)


async def _try_node_class(node) -> str:
    try:
        nc = await node.read_node_class()
        # IntEnum / Enum：统一成简短名称（前端识别 Variable）
        name = getattr(nc, "name", None)
        if isinstance(name, str) and name.strip():
            return name.strip()
        return str(nc).strip()
    except Exception:
        return ""


def _clamp_variable_search_params(max_scan: Any, max_results: Any, max_depth: Any) -> tuple[int, int, int]:
    try:
        ms = int(max_scan) if max_scan is not None else SEARCH_VARS_DEFAULT_MAX_SCAN
    except (TypeError, ValueError):
        ms = SEARCH_VARS_DEFAULT_MAX_SCAN
    ms = max(400, min(ms, 80000))
    try:
        mr = int(max_results) if max_results is not None else SEARCH_VARS_DEFAULT_MAX_RESULTS
    except (TypeError, ValueError):
        mr = SEARCH_VARS_DEFAULT_MAX_RESULTS
    mr = max(1, min(mr, 500))
    try:
        md = int(max_depth) if max_depth is not None else SEARCH_VARS_DEFAULT_MAX_DEPTH
    except (TypeError, ValueError):
        md = SEARCH_VARS_DEFAULT_MAX_DEPTH
    md = max(8, min(md, 72))
    return ms, mr, md


def _is_opcua_variable_value_class(cls: str) -> bool:
    """NodeClass 为实例 Variable（排除 VariableType）；与前端 isOpcVariableValueNode 语义对齐。"""
    if not cls or not str(cls).strip():
        return False
    raw = str(cls).strip()
    if raw.isdigit():
        return int(raw) == 2
    u = raw.upper()
    if "VARIABLETYPE" in u:
        return False
    token = re.split(r"[.\s/]+", u)[-1]
    return token == "VARIABLE" or token == "2"


async def _try_node_data_type_name(ch: Any) -> str | None:
    try:
        dt = await ch.read_data_type_as_variant_type()
        nm = getattr(dt, "name", None)
        if isinstance(nm, str) and nm.strip():
            return nm.strip()
    except Exception:
        pass
    return None


def _data_type_matches_filter(type_name: str | None, filter_name: str) -> bool:
    t = (type_name or "").strip().lower()
    f = (filter_name or "").strip().lower()
    if not f:
        return True
    if f in ("string", "str"):
        return t == "string" or t.endswith(".string")
    return f in t


async def _search_variables_bfs(
    client: Client,
    query: str,
    max_scan: int,
    max_results: int,
    max_depth: int,
    data_type_filter: str | None = None,
) -> dict[str, Any]:
    """从 Objects 起广度优先浏览，匹配 Variable 的显示名 / BrowseName / NodeId 子串。"""
    q_raw = (query or "").strip()
    dt_filter = (data_type_filter or "").strip() or None
    if not q_raw and not dt_filter:
        return {"ok": True, "hits": [], "nodes_scanned": 0, "truncated": False}

    q_lower = q_raw.lower()
    queue: deque[tuple[str | None, list[str]]] = deque()
    queue.append((None, ["Objects"]))

    expanded_parents: set[str] = set()
    queued_expand: set[str] = set()
    hits: list[dict[str, Any]] = []
    nodes_scanned = 0
    truncated = False

    while queue and len(hits) < max_results and nodes_scanned < max_scan:
        parent_key, path_parts = queue.popleft()
        ek = SEARCH_ROOT_TOKEN if parent_key is None else parent_key
        if ek in expanded_parents:
            continue
        expanded_parents.add(ek)

        try:
            parent = client.nodes.objects if parent_key is None else client.get_node(parent_key)
            children = await _merged_hierarchical_and_property_children(
                parent,
                DEFAULT_OPCUA_BROWSE_MAX_CHILDREN,
            )
        except Exception as ex:
            logger.debug("OPC UA variable search: browse parent=%s failed: %s", parent_key, ex)
            continue

        for ch in children:
            if nodes_scanned >= max_scan:
                truncated = True
                break
            nodes_scanned += 1

            try:
                bn = await ch.read_browse_name()
                nid = ch.nodeid.to_string()
                disp = (await ch.read_display_name()).Text
                browse_full = f"{bn.NamespaceIndex}:{bn.Name}"
                cls = await _try_node_class(ch)
            except Exception:
                continue

            label = (disp or "").strip() or (browse_full or "").strip() or nid
            child_path = path_parts + [label]
            hay = f"{disp} {browse_full} {nid}".lower()

            if _is_opcua_variable_value_class(cls):
                type_name = await _try_node_data_type_name(ch) if dt_filter else None
                if dt_filter and not _data_type_matches_filter(type_name, dt_filter):
                    continue
                if q_lower and q_lower not in hay:
                    continue
                hits.append(
                    {
                        "node_id": nid,
                        "browse_name": browse_full,
                        "display_name": disp,
                        "node_class": cls,
                        "data_type": type_name,
                        "path_str": " → ".join(child_path),
                    }
                )
                if len(hits) >= max_results:
                    truncated = True

            if truncated and len(hits) >= max_results:
                break

            if _is_opcua_variable_value_class(cls):
                continue

            nc_up = (cls or "").upper()
            if "METHOD" in nc_up:
                continue

            child_depth = len(child_path) - 1
            if child_depth >= max_depth:
                continue

            if nid in queued_expand:
                continue
            queued_expand.add(nid)
            queue.append((nid, child_path))

        if truncated and len(hits) >= max_results:
            break
        if nodes_scanned >= max_scan:
            truncated = True

    return {"ok": True, "hits": hits, "nodes_scanned": nodes_scanned, "truncated": truncated}


async def search_variables_ephemeral(
    endpoint_url: str,
    username: str | None,
    password: str | None,
    query: str,
    max_scan: Any = None,
    max_results: Any = None,
    max_depth: Any = None,
) -> dict[str, Any]:
    ms, mr, md = _clamp_variable_search_params(max_scan, max_results, max_depth)
    client = Client(url=endpoint_url, timeout=25)
    try:
        if username:
            client.set_user(username)
            client.set_password(password or "")
        await client.connect()
        return await _search_variables_bfs(client, query, ms, mr, md)
    except Exception as e:
        logger.exception("OPC UA variable search (ephemeral) failed")
        return {"ok": False, "message": str(e), "hits": [], "nodes_scanned": 0, "truncated": False}
    finally:
        await _safe_disconnect(client)


async def search_variables_for_saved_server(
    server_id: str,
    endpoint_url: str,
    username: str | None,
    password: str | None,
    query: str,
    max_scan: Any = None,
    max_results: Any = None,
    max_depth: Any = None,
    data_type_filter: str | None = None,
) -> dict[str, Any]:
    ms, mr, md = _clamp_variable_search_params(max_scan, max_results, max_depth)
    entry = _get_entry(server_id)
    async with entry.lock:
        try:
            client = await _ensure_connected(entry, endpoint_url, username, password)
            return await _search_variables_bfs(client, query, ms, mr, md, data_type_filter)
        except Exception as e:
            logger.exception("OPC UA variable search (pooled) failed")
            await _invalidate_entry_client(entry)
            return {"ok": False, "message": str(e), "hits": [], "nodes_scanned": 0, "truncated": False}


async def drop_saved_server_pool(server_id: str) -> None:
    """删除已保存服务器配置时释放对应连接，避免持有无效会话。"""
    entry = _pool.pop(server_id, None)
    if not entry:
        return
    async with entry.lock:
        await _invalidate_entry_client(entry)
