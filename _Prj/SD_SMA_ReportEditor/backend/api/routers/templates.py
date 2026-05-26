"""报表模版 CRUD API。"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from modules import template_store as store
from schemas.report_template import (
    TEMPLATE_SCHEMA_VERSION,
    ReportTemplate,
    parse_report_template,
)

router = APIRouter(tags=["templates"])
logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@router.get("/templates")
async def list_templates():
    return [s.model_dump(mode="json") for s in store.list_summaries()]


@router.get("/templates/full")
async def list_templates_full():
    """完整模版列表（须在 :template_id 之前注册）。"""
    out = []
    for s in store.list_summaries():
        t = store.load_template(s.id)
        if t:
            out.append(t.model_dump(mode="json"))
    return out


@router.get("/templates/{template_id}")
async def get_template(template_id: str):
    try:
        t = store.load_template(template_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not t:
        raise HTTPException(status_code=404, detail="模版不存在")
    return t.model_dump(mode="json")


@router.put("/templates/{template_id}")
async def put_template(template_id: str, body: dict[str, Any]):
    try:
        store.sanitize_template_id(template_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="请求体须为 JSON 对象")
    data = dict(body)
    data["id"] = template_id
    if "updatedAt" not in data:
        data["updatedAt"] = _now_iso()
    data.setdefault("schemaVersion", TEMPLATE_SCHEMA_VERSION)
    try:
        t = parse_report_template(data)
    except Exception as e:
        logger.exception("put_template validation")
        raise HTTPException(status_code=422, detail=f"模版数据无效: {e}") from e
    store.save_template(t)
    return t.model_dump(mode="json")


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    try:
        ok = store.delete_template(template_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not ok:
        raise HTTPException(status_code=404, detail="模版不存在")
    return {"ok": True}


@router.post("/templates/import-bulk")
async def import_bulk(request: dict[str, Any]):
    items = request.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="body.items 必须为数组")
    n = store.migrate_from_payload_list([x for x in items if isinstance(x, dict)])
    return {"imported": n}
