"""磁盘上的版式预设 JSON。"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from core.settings import LAYOUT_PRESETS_DIR, init_data_dirs
from modules import json_head_scan as jhs
from schemas.layout_preset import LayoutPreset, LayoutPresetSummary

logger = logging.getLogger(__name__)

_SAFE_ID = re.compile(r"^[a-zA-Z0-9_.-]{1,128}$")
_PAPER_KINDS = ("A3", "A4", "A5", "Letter")
_ORIENTATIONS = ("portrait", "landscape")
_PAGE_ROLES = ("normal", "cover", "back")


def sanitize_id(layout_id: str) -> str:
    tid = layout_id.strip()
    if not _SAFE_ID.match(tid):
        raise ValueError("无效的版式 id")
    return tid


def preset_path(layout_id: str) -> Path:
    init_data_dirs()
    return LAYOUT_PRESETS_DIR / f"{sanitize_id(layout_id)}.json"


def _summary_from_raw(raw: dict[str, Any]) -> LayoutPresetSummary | None:
    """仅取顶层标量字段构建摘要，避免对整份版式（含所有控件）做完整校验。"""
    pid = raw.get("id")
    if not isinstance(pid, str) or not pid:
        return None
    paper = raw.get("paperKind")
    if paper not in ("A3", "A4", "A5", "Letter"):
        paper = "A4"
    orient = raw.get("orientation")
    if orient not in ("portrait", "landscape"):
        orient = "portrait"
    role = raw.get("pageRole")
    if role not in ("normal", "cover", "back"):
        role = "normal"
    name = raw.get("name")
    updated = raw.get("updatedAt")
    return LayoutPresetSummary(
        id=pid,
        name=name if isinstance(name, str) else pid,
        updatedAt=updated if isinstance(updated, str) else "",
        paperKind=paper,
        orientation=orient,
        pageRole=role,
    )


def _fast_summary_from_head(p: Path) -> LayoutPresetSummary | None:
    """版式的全部摘要字段（id/name/updatedAt/paperKind/orientation/pageRole）均排在
    页眉页脚等大数组之前，读文件头部即可完整提取，避免解析整份版式。"""
    try:
        head = jhs.read_head(p)
    except OSError:
        return None
    pid = jhs.extract_string(head, "id")
    if not pid:
        return None
    name = jhs.extract_string(head, "name") or pid
    updated = jhs.extract_string(head, "updatedAt") or ""
    paper = jhs.extract_string(head, "paperKind")
    orient = jhs.extract_string(head, "orientation")
    role = jhs.extract_string(head, "pageRole")
    return LayoutPresetSummary(
        id=pid,
        name=name,
        updatedAt=updated,
        paperKind=paper if paper in _PAPER_KINDS else "A4",
        orientation=orient if orient in _ORIENTATIONS else "portrait",
        pageRole=role if role in _PAGE_ROLES else "normal",
    )


def list_summaries() -> list[LayoutPresetSummary]:
    init_data_dirs()
    out: list[LayoutPresetSummary] = []
    for p in sorted(LAYOUT_PRESETS_DIR.glob("*.json")):
        try:
            summary = _fast_summary_from_head(p)
            if summary is None:
                # 头部无法提取时回退整份解析
                raw = json.loads(p.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    continue
                summary = _summary_from_raw(raw)
            if summary is not None:
                out.append(summary)
        except Exception:
            logger.warning("跳过损坏的版式文件: %s", p, exc_info=True)
    out.sort(key=lambda x: x.updatedAt or "", reverse=True)
    return out


def load_preset(layout_id: str) -> LayoutPreset | None:
    path = preset_path(layout_id)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        return LayoutPreset.model_validate(raw)
    except Exception:
        logger.exception("读取版式失败: %s", path)
        return None


def save_preset(preset: LayoutPreset) -> None:
    path = preset_path(preset.id)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(preset.model_dump(mode="json"), ensure_ascii=False, indent=2)
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(path)


def delete_preset(layout_id: str) -> bool:
    try:
        sanitize_id(layout_id)
    except ValueError:
        return False
    path = LAYOUT_PRESETS_DIR / f"{layout_id.strip()}.json"
    if not path.is_file():
        return False
    path.unlink()
    return True


def import_presets_bulk(items: list[dict[str, Any]]) -> int:
    """从数组导入（如浏览器 localStorage 迁移）。"""
    n = 0
    init_data_dirs()
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            lp = LayoutPreset.model_validate(item)
            save_preset(lp)
            n += 1
        except Exception:
            logger.warning("跳过无法解析的版式", exc_info=True)
    return n
