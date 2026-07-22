#!/usr/bin/env python3
"""Strip showBorder on all templates; create portrait+landscape smoke templates via MariaDB docker."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

DATA = Path(os.environ.get(
    "REPORT_EDITOR_DATA_DIR",
    r"C:\Users\qih\AppData\Roaming\sd-sma-report-editor-ai\backend-data",
))
os.environ["REPORT_EDITOR_DATA_DIR"] = str(DATA)
BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def strip_borders_in_obj(node):
    if isinstance(node, dict):
        if "showBorder" in node:
            node["showBorder"] = False
        for v in node.values():
            strip_borders_in_obj(v)
    elif isinstance(node, list):
        for item in node:
            strip_borders_in_obj(item)


def strip_all_templates() -> int:
    tpl_dir = DATA / "templates"
    n = 0
    if not tpl_dir.is_dir():
        return 0
    for f in tpl_dir.glob("*.json"):
        if f.name.endswith(".meta.json") or f.suffixes[-2:] == [".meta", ".json"]:
            continue
        if ".meta" in f.name:
            continue
        try:
            raw = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(raw, dict) or "id" not in raw:
            continue
        strip_borders_in_obj(raw)
        f.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        n += 1
    return n


async def main() -> int:
    from modules import ai_tools

    stripped = strip_all_templates()
    print(f"stripped_borders_templates={stripped}")

    # Prefer MariaDB docker (3306) for smoke schema
    maria = "acfa7334-d8d5-4b9d-84a0-b6af7e4ce588"
    mysql = "8c742896-40a9-40b2-aecc-60addf9f1f16"
    conn = maria
    # probe: if create fails, try mysql
    results = []
    for name, orient in (
        ("冒烟测试报表·竖版", "portrait"),
        ("冒烟测试报表·横版", "landscape"),
    ):
        out = await ai_tools.execute_tool(
            "create_binding_smoke_template",
            {
                "name": name,
                "connection_id": conn,
                "opc_server_id": "93701d34-7ccf-4317-9550-94e40394b33a",
                "ensure_schema": True,
                "orientation": orient,
            },
        )
        if not out.get("ok") and conn == maria:
            print("maria failed, retry mysql:", out)
            conn = mysql
            out = await ai_tools.execute_tool(
                "create_binding_smoke_template",
                {
                    "name": name,
                    "connection_id": conn,
                    "opc_server_id": "93701d34-7ccf-4317-9550-94e40394b33a",
                    "ensure_schema": True,
                    "orientation": orient,
                },
            )
        results.append(out)
        print(json.dumps({"name": name, "orient": orient, "ok": out.get("ok"), "id": out.get("template_id"), "err": out.get("error"), "msg": out.get("message")}, ensure_ascii=False))

    ok = all(r.get("ok") for r in results)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
