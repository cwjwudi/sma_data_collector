"""配置导出形态、导入校验与合并（与 config_store 配合）。"""
from __future__ import annotations

import copy
import uuid
from typing import Any

MAX_DB_CONNECTIONS = 500
MAX_OPCUA_SERVERS = 200
MAX_IMPORT_JSON_BYTES = 2 * 1024 * 1024
CURRENT_SCHEMA_VERSION = 1


def normalize_top_level(cfg: dict[str, Any]) -> dict[str, Any]:
    """保证顶层键存在（就地修改副本）。"""
    out = dict(cfg)
    out.setdefault("schema_version", CURRENT_SCHEMA_VERSION)
    out.setdefault("db_connections", [])
    out.setdefault("opcua_servers", [])
    prefs = out.get("app_preferences")
    if not isinstance(prefs, dict):
        prefs = {}
    prefs.setdefault("auto_select_last_connection", True)
    prefs.setdefault("default_connection_id", None)
    prefs.setdefault("last_connection_id", None)
    out["app_preferences"] = prefs
    return out


def export_share_shape(cfg: dict[str, Any], mask_conn, mask_opcua) -> dict[str, Any]:
    """脱敏导出：与前端列表一致的掩码字段。"""
    base = normalize_top_level(copy.deepcopy(cfg))
    dbs = []
    for c in base.get("db_connections") or []:
        if isinstance(c, dict):
            dbs.append(mask_conn(c))
    opcs = []
    for s in base.get("opcua_servers") or []:
        if isinstance(s, dict):
            opcs.append(mask_opcua(s))
    return {
        "schema_version": base.get("schema_version", CURRENT_SCHEMA_VERSION),
        "app_preferences": copy.deepcopy(base.get("app_preferences") or {}),
        "db_connections": dbs,
        "opcua_servers": opcs,
    }


def _strip_response_only_keys(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    out.pop("has_password", None)
    return out


def _merge_row(old: dict[str, Any], imp_raw: dict[str, Any]) -> dict[str, Any]:
    """合并单条连接/OPC UA：脱敏导入保留原 password_enc 规则。"""
    imp = _strip_response_only_keys(dict(imp_raw))
    merged = {**old}
    incoming_enc = imp_raw.get("password_enc")
    hp = imp_raw.get("has_password")
    for k, v in imp.items():
        if k == "password_enc":
            continue
        merged[k] = v
    if incoming_enc is not None:
        merged["password_enc"] = incoming_enc
    elif hp is False:
        merged.pop("password_enc", None)
    else:
        if old.get("password_enc") is not None:
            merged["password_enc"] = old["password_enc"]
        else:
            merged.pop("password_enc", None)
    merged.pop("has_password", None)
    return merged


def merge_id_rows(existing: list[dict[str, Any]], incoming: list[Any]) -> list[dict[str, Any]]:
    """按 id 更新已有项；未知 id 追加；未出现在导入中的本地项保留。"""
    out: list[dict[str, Any]] = [dict(x) for x in existing if isinstance(x, dict)]
    idx_by_id = {str(c.get("id")): i for i, c in enumerate(out) if c.get("id")}

    for imp_raw in incoming:
        if not isinstance(imp_raw, dict):
            continue
        imp_id = imp_raw.get("id")
        if imp_id and str(imp_id) in idx_by_id:
            i = idx_by_id[str(imp_id)]
            out[i] = _merge_row(out[i], imp_raw)
            continue
        row = _strip_response_only_keys(dict(imp_raw))
        row["id"] = str(row.get("id") or uuid.uuid4())
        if not row.get("password_enc"):
            row.pop("password_enc", None)
        out.append(row)
        idx_by_id[row["id"]] = len(out) - 1
    return out


def validate_import_payload(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("配置须为 JSON 对象")
    dbs = data.get("db_connections")
    opcs = data.get("opcua_servers")
    if dbs is None:
        dbs = []
    if opcs is None:
        opcs = []
    if not isinstance(dbs, list) or not isinstance(opcs, list):
        raise ValueError("db_connections 与 opcua_servers 须为数组（可省略空数组）")
    if len(dbs) > MAX_DB_CONNECTIONS or len(opcs) > MAX_OPCUA_SERVERS:
        raise ValueError("连接或 OPC UA 数量超过上限")
    for i, c in enumerate(dbs):
        if not isinstance(c, dict):
            raise ValueError(f"db_connections[{i}] 须为对象")
        if not (c.get("engine") or "").strip():
            raise ValueError(f"db_connections[{i}] 缺少 engine")
    for i, s in enumerate(opcs):
        if not isinstance(s, dict):
            raise ValueError(f"opcua_servers[{i}] 须为对象")
    return {**data, "db_connections": dbs, "opcua_servers": opcs}


def apply_import_merge(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    cur = normalize_top_level(copy.deepcopy(current))
    inc = validate_import_payload(incoming)
    cur["db_connections"] = merge_id_rows(cur.get("db_connections") or [], inc.get("db_connections") or [])
    cur["opcua_servers"] = merge_id_rows(cur.get("opcua_servers") or [], inc.get("opcua_servers") or [])
    inc_prefs = inc.get("app_preferences")
    if isinstance(inc_prefs, dict):
        base_prefs = dict(cur.get("app_preferences") or {})
        for k, v in inc_prefs.items():
            if k in ("auto_select_last_connection", "default_connection_id", "last_connection_id"):
                base_prefs[k] = v
        cur["app_preferences"] = base_prefs
    if isinstance(inc.get("schema_version"), int):
        cur["schema_version"] = max(int(cur.get("schema_version") or 1), int(inc["schema_version"]))
    return cur


def apply_import_replace(incoming: dict[str, Any]) -> dict[str, Any]:
    inc = validate_import_payload(incoming)
    prefs = inc.get("app_preferences")
    if not isinstance(prefs, dict):
        prefs = {}
    normalized_prefs = {
        "auto_select_last_connection": bool(prefs.get("auto_select_last_connection", True)),
        "default_connection_id": prefs.get("default_connection_id"),
        "last_connection_id": prefs.get("last_connection_id"),
    }
    sv = inc.get("schema_version")
    if not isinstance(sv, int):
        sv = CURRENT_SCHEMA_VERSION
    out: dict[str, Any] = {
        "schema_version": int(sv),
        "app_preferences": normalized_prefs,
        "db_connections": merge_id_rows([], inc.get("db_connections") or []),
        "opcua_servers": merge_id_rows([], inc.get("opcua_servers") or []),
    }
    return normalize_top_level(out)
