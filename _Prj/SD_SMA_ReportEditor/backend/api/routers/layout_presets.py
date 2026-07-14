"""版式预设 CRUD。"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from core.settings import DATA_DIR
from modules import layout_preset_store as store
from modules.audit_asset_write import record_asset_save
from schemas.layout_preset import LayoutPreset

router = APIRouter(tags=["layout_presets"])
logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@router.get("/layout-presets")
def list_layout_presets():
    return [x.model_dump(mode="json") for x in store.list_summaries()]


@router.get("/layout-presets/full")
def list_layout_presets_full():
    """完整版式列表（须在 :layout_id 之前注册）。"""
    out = []
    for s in store.list_summaries():
        lp = store.load_preset(s.id)
        if lp:
            out.append(lp.model_dump(mode="json"))
    return out


@router.get("/layout-presets/{layout_id}")
def get_layout_preset(layout_id: str):
    lp = store.load_preset(layout_id)
    if not lp:
        raise HTTPException(status_code=404, detail="版式不存在")
    return lp.model_dump(mode="json")


@router.put("/layout-presets/{layout_id}")
def put_layout_preset(
    layout_id: str,
    body: dict[str, Any],
    skip_asset_audit: bool = Query(False, description="复制/迁移等场景跳过保存审计"),
):
    try:
        store.sanitize_id(layout_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="请求体须为 JSON 对象")
    data = dict(body)
    data["id"] = layout_id
    if not data.get("updatedAt"):
        data["updatedAt"] = _now_iso()
    try:
        preset = LayoutPreset.model_validate(data)
    except Exception as e:
        logger.exception("put_layout_preset")
        raise HTTPException(status_code=422, detail=f"版式无效: {e}") from e
    old_obj = store.load_preset(layout_id)
    old_dict = old_obj.model_dump(mode="json") if old_obj else None
    store.save_preset(preset)
    new_dict = preset.model_dump(mode="json")
    record_asset_save(
        DATA_DIR,
        kind="layout",
        object_id=layout_id,
        old=old_dict,
        new=new_dict,
        skip=skip_asset_audit,
    )
    return new_dict


@router.delete("/layout-presets/{layout_id}")
def delete_layout_preset(layout_id: str):
    ok = store.delete_preset(layout_id)
    if not ok:
        raise HTTPException(status_code=404, detail="版式不存在")
    return {"ok": True}


@router.post("/layout-presets/import-bulk")
def import_bulk(request: dict[str, Any]):
    items = request.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="body.items 必须为数组")
    n = store.import_presets_bulk([x for x in items if isinstance(x, dict)])
    return {"imported": n}
