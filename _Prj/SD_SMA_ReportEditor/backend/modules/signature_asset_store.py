"""签名库条目磁盘存取。"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from core.settings import SIGNATURE_ASSETS_DIR, init_data_dirs
from pydantic import BaseModel
from schemas.signature_asset import SignatureAsset

logger = logging.getLogger(__name__)

_SAFE_ID = re.compile(r"^[a-zA-Z0-9_.-]{1,128}$")


class SignatureAssetSummary(BaseModel):
    id: str
    label: str
    updatedAt: str


def sanitize_id(asset_id: str) -> str:
    tid = asset_id.strip()
    if not _SAFE_ID.match(tid):
        raise ValueError("无效的签名 id")
    return tid


def asset_path(asset_id: str) -> Path:
    init_data_dirs()
    return SIGNATURE_ASSETS_DIR / f"{sanitize_id(asset_id)}.json"


def load_asset(asset_id: str) -> SignatureAsset | None:
    p = asset_path(asset_id)
    if not p.is_file():
        return None
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        return SignatureAsset.model_validate(raw)
    except Exception:
        logger.exception("读取签名条目失败")
        return None


def save_asset(asset: SignatureAsset) -> None:
    p = asset_path(asset.id)
    tmp = p.with_suffix(".tmp.json")
    tmp.write_text(json.dumps(asset.model_dump(mode="json"), ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def delete_asset(asset_id: str) -> bool:
    p = asset_path(asset_id)
    if not p.is_file():
        return False
    p.unlink()
    return True


def list_summaries() -> list[SignatureAssetSummary]:
    init_data_dirs()
    out: list[SignatureAssetSummary] = []
    for f in sorted(SIGNATURE_ASSETS_DIR.glob("*.json")):
        try:
            a = SignatureAsset.model_validate(json.loads(f.read_text(encoding="utf-8")))
            out.append(SignatureAssetSummary(id=a.id, label=a.label, updatedAt=a.updatedAt))
        except Exception:
            logger.warning("跳过损坏的签名条目: %s", f)
    out.sort(key=lambda x: x.updatedAt, reverse=True)
    return out
