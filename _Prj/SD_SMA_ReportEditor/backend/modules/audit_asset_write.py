"""模版 / 版式保存成功后写审计（对比 + 15 分钟合并）。"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal

from modules import audit_log
from modules.audit_asset_diff import (
    build_save_summary,
    diff_layout_preset,
    diff_report_template,
)

logger = logging.getLogger(__name__)

AssetKind = Literal["template", "layout"]


def record_asset_save(
    data_dir: Path,
    *,
    kind: AssetKind,
    object_id: str,
    old: dict[str, Any] | None,
    new: dict[str, Any],
    skip: bool = False,
) -> dict[str, Any] | None:
    """保存成功后记审计。无内容变更（且非新建）则返回 None。"""
    if skip:
        return None
    oid = (object_id or "").strip()
    if not oid:
        logger.warning("asset save audit skipped: empty object_id")
        return None
    try:
        if kind == "template":
            diff = diff_report_template(old, new)
            action = "template.save"
            object_type = "template"
        else:
            diff = diff_layout_preset(old, new)
            action = "layout.save"
            object_type = "layout"

        created = bool(diff.get("created"))
        change_count = int(diff.get("change_count") or 0)
        changes = diff.get("changes") if isinstance(diff.get("changes"), list) else []

        if not created and change_count == 0 and not changes:
            return None

        name = str(new.get("name") or "").strip() or "未命名"
        summary = build_save_summary(
            kind=kind,
            name=name,
            change_count=change_count,
            save_count=1,
            created=created,
        )
        detail: dict[str, Any] = {
            "kind": kind,
            "name": name,
            "created": created,
            "change_count": change_count,
            "changes": changes,
            "change_lines": diff.get("change_lines") or [],
            "truncated": bool(diff.get("truncated")),
            "save_count": 1,
        }
        return audit_log.append_or_coalesce_audit(
            data_dir,
            action=action,
            result="ok",
            summary=summary,
            object_type=object_type,
            object_id=oid,
            detail=detail,
        )
    except Exception:
        logger.exception("record_asset_save failed kind=%s id=%s", kind, oid)
        return None
