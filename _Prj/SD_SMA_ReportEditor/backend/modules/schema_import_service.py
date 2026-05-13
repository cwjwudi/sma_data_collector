"""导入外部 schema（JSON / 简易 SQL CREATE TABLE）供 ER 与构建器使用。"""
from __future__ import annotations

import json
import re
from typing import Any


def parse_schema_json(text: str) -> dict[str, Any]:
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("JSON 根须为对象")
    tables = data.get("tables") or []
    relationships = data.get("relationships") or []
    if not isinstance(tables, list):
        raise ValueError("tables 须为数组")
    nodes = []
    edges = []
    for t in tables:
        if isinstance(t, dict) and t.get("name"):
            nodes.append(
                {
                    "id": str(t["name"]),
                    "label": str(t["name"]),
                    "columns": t.get("columns") or [],
                }
            )
    for i, rel in enumerate(relationships):
        if not isinstance(rel, dict):
            continue
        src = rel.get("from") or rel.get("source")
        tgt = rel.get("to") or rel.get("target")
        if src and tgt:
            edges.append(
                {
                    "id": f"e{i}",
                    "source": str(src),
                    "target": str(tgt),
                    "label": rel.get("type") or "",
                }
            )
    return {"nodes": nodes, "edges": edges}


def parse_sql_create_tables(sql_text: str) -> dict[str, Any]:
    """粗略解析 CREATE TABLE name (...) 用于 ER 草稿。"""
    pattern = re.compile(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\"]?(?P<name>[a-zA-Z0-9_]+)[`\"]?\s*\((?P<body>[^;]+)\)",
        re.IGNORECASE | re.DOTALL,
    )
    nodes = []
    for m in pattern.finditer(sql_text):
        name = m.group("name")
        body = m.group("body")
        cols = []
        for line in body.split(","):
            line = line.strip().split()[0] if line.strip() else ""
            line = line.strip("`\"")
            if line and line.upper() not in ("PRIMARY", "KEY", "CONSTRAINT", "FOREIGN", "UNIQUE", "INDEX"):
                cols.append({"name": line})
        nodes.append({"id": name, "label": name, "columns": cols})
    edges: list[dict[str, Any]] = []
    fk_pattern = re.compile(
        r"FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+[`\"]?(?P<ref>[a-zA-Z0-9_]+)[`\"]?",
        re.IGNORECASE,
    )
    for m in fk_pattern.finditer(sql_text):
        edges.append({"id": f"fk{len(edges)}", "source": "", "target": m.group("ref"), "label": "FK"})
    return {"nodes": nodes, "edges": edges}


def merge_er_graph(
    introspect_nodes: list[dict[str, Any]],
    imported: dict[str, Any] | None,
) -> dict[str, Any]:
    base_nodes = {n["id"]: n for n in introspect_nodes}
    base_edges: list[dict[str, Any]] = []

    if not imported:
        return {"nodes": list(base_nodes.values()), "edges": base_edges}

    for n in imported.get("nodes") or []:
        nid = n.get("id") or n.get("label")
        if nid and nid not in base_nodes:
            base_nodes[nid] = {"id": nid, "label": n.get("label") or nid, "columns": n.get("columns") or []}
    for e in imported.get("edges") or []:
        base_edges.append(e)
    return {"nodes": list(base_nodes.values()), "edges": base_edges}
