"""从报表模版 JSON 提取数据源绑定引用（只读）。"""
from __future__ import annotations

from typing import Any


def _walk(obj: Any, path: str, refs: list[dict[str, Any]]) -> None:
    if isinstance(obj, dict):
        cid = obj.get("connectionId") or obj.get("connection_id")
        if isinstance(cid, str) and cid.strip():
            refs.append(
                {
                    "type": "db",
                    "connection_id": cid.strip(),
                    "path": path,
                    "database": obj.get("database") or "",
                }
            )
        opc_nid = obj.get("opcuaNodeId") or obj.get("tableOpcNodeId")
        if isinstance(opc_nid, str) and opc_nid.strip():
            refs.append({"type": "opc_node", "node_id": opc_nid.strip(), "path": path})
        for k, v in obj.items():
            _walk(v, f"{path}.{k}" if path else k, refs)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _walk(v, f"{path}[{i}]", refs)


def extract_template_bindings(template: dict[str, Any]) -> dict[str, Any]:
    refs: list[dict[str, Any]] = []
    _walk(template, "", refs)
    db_ids: set[str] = set()
    opc_nodes: list[str] = []
    for r in refs:
        if r.get("type") == "db":
            db_ids.add(str(r["connection_id"]))
        elif r.get("type") == "opc_node":
            opc_nodes.append(str(r["node_id"]))
    return {
        "db_connection_ids": sorted(db_ids),
        "opc_node_ids": opc_nodes[:50],
        "references": refs[:80],
        "reference_count": len(refs),
    }


def validate_bindings_against_config(
    bindings: dict[str, Any],
    *,
    db_by_id: dict[str, dict[str, Any]],
    opc_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for cid in bindings.get("db_connection_ids") or []:
        conn = db_by_id.get(cid)
        if not conn:
            issues.append({"kind": "missing_db", "connection_id": cid, "message": "绑定的数据库连接不存在"})
            continue
        if conn.get("is_demo") and conn.get("demo_channel") == "remote":
            continue
        if not conn.get("has_password") and conn.get("engine") not in ("sqlite",):
            issues.append(
                {
                    "kind": "missing_password",
                    "connection_id": cid,
                    "name": conn.get("name"),
                    "message": "连接未配置密码",
                }
            )
        if not str(conn.get("database") or "").strip() and conn.get("engine") in (
            "mysql",
            "mariadb",
            "postgres",
            "mongodb",
        ):
            issues.append(
                {
                    "kind": "missing_default_database",
                    "connection_id": cid,
                    "name": conn.get("name"),
                    "message": "连接未设置默认数据库，标量/SQL 可能报 1046",
                }
            )
    return issues
