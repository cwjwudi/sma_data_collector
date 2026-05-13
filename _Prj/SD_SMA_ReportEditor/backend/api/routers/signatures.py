"""签名库 CRUD。"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from modules import signature_asset_store as store
from schemas.signature_asset import SignatureAsset

router = APIRouter(tags=["signatures"])
logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@router.get("/signatures")
async def list_assets():
    return [x.model_dump(mode="json") for x in store.list_summaries()]


@router.get("/signatures/{asset_id}")
async def get_asset(asset_id: str):
    a = store.load_asset(asset_id)
    if not a:
        raise HTTPException(status_code=404, detail="条目不存在")
    return a.model_dump(mode="json")


@router.put("/signatures/{asset_id}")
async def put_asset(asset_id: str, body: dict[str, Any]):
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="无效请求体")
    data = dict(body)
    data["id"] = asset_id
    if not data.get("updatedAt"):
        data["updatedAt"] = _now_iso()
    try:
        a = SignatureAsset.model_validate(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"条目无效: {e}") from e
    store.save_asset(a)
    return a.model_dump(mode="json")


@router.delete("/signatures/{asset_id}")
async def delete_asset(asset_id: str):
    if not store.delete_asset(asset_id):
        raise HTTPException(status_code=404, detail="条目不存在")
    return {"ok": True}
