"""磁盘上的报表模版 JSON 文件存取。"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from core.settings import TEMPLATES_DIR, init_data_dirs
from schemas.report_template import (
    ReportTemplate,
    ReportTemplateSummary,
    parse_report_template,
    template_to_jsonable,
)

logger = logging.getLogger(__name__)

_SAFE_ID = re.compile(r"^[a-zA-Z0-9_.-]{1,128}$")


def _ensure_dir() -> Path:
    init_data_dirs()
    return TEMPLATES_DIR


def sanitize_template_id(template_id: str) -> str:
    tid = template_id.strip()
    if not _SAFE_ID.match(tid):
        raise ValueError("无效的模版 id")
    return tid


def template_path(template_id: str) -> Path:
    return _ensure_dir() / f"{sanitize_template_id(template_id)}.json"


def list_summaries() -> list[ReportTemplateSummary]:
    out: list[ReportTemplateSummary] = []
    root = _ensure_dir()
    for p in sorted(root.glob("*.json")):
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                continue
            t = parse_report_template(raw)
            out.append(
                ReportTemplateSummary(
                    id=t.id,
                    name=t.name,
                    updatedAt=t.updatedAt,
                    paperKind=t.paperKind,
                    orientation=t.orientation,
                )
            )
        except Exception:
            logger.warning("跳过损坏的模版文件: %s", p, exc_info=True)
    out.sort(key=lambda x: x.updatedAt or "", reverse=True)
    return out


def load_template(template_id: str) -> ReportTemplate | None:
    path = template_path(template_id)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        return parse_report_template(raw)
    except Exception:
        logger.exception("读取模版失败: %s", path)
        return None


def save_template(t: ReportTemplate) -> None:
    path = template_path(t.id)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(template_to_jsonable(t), ensure_ascii=False, indent=2)
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(path)


def delete_template(template_id: str) -> bool:
    path = template_path(template_id)
    if not path.is_file():
        return False
    path.unlink()
    return True


def migrate_from_payload_list(payloads: list[dict[str, Any]]) -> int:
    """将前端导出的模版数组写入磁盘（幂等覆盖同 id）。返回写入条数。"""
    n = 0
    _ensure_dir()
    for item in payloads:
        if not isinstance(item, dict):
            continue
        try:
            t = parse_report_template(item)
            save_template(t)
            n += 1
        except Exception:
            logger.warning("跳过无法解析的模版项", exc_info=True)
    return n
