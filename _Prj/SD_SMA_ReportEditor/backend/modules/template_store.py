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


def _meta_path_for(json_path: Path) -> Path:
    """模版摘要 sidecar：与 `{id}.json` 同目录的 `{id}.meta.json`。"""
    return json_path.with_name(f"{json_path.stem}.meta.json")


def _write_summary_sidecar(summary: ReportTemplateSummary) -> None:
    """写出轻量摘要 sidecar，使 list_summaries 无需解析整份大模版 JSON。"""
    try:
        mp = _ensure_dir() / f"{sanitize_template_id(summary.id)}.meta.json"
        tmp = mp.with_suffix(mp.suffix + ".tmp")
        tmp.write_text(
            json.dumps(summary.model_dump(mode="json"), ensure_ascii=False),
            encoding="utf-8",
        )
        tmp.replace(mp)
    except Exception:
        logger.warning("写入模版摘要 sidecar 失败: %s", summary.id, exc_info=True)


def _summary_from_raw(raw: dict[str, Any]) -> ReportTemplateSummary | None:
    """仅取顶层标量字段构建摘要，避免对整份模板做完整校验（大模板/多模板时更快）。"""
    tid = raw.get("id")
    if not isinstance(tid, str) or not tid:
        return None
    paper = raw.get("paperKind")
    if paper not in ("A3", "A4", "A5", "Letter"):
        paper = "A4"
    orient = raw.get("orientation")
    if orient not in ("portrait", "landscape"):
        orient = "portrait"
    name = raw.get("name")
    updated = raw.get("updatedAt")
    return ReportTemplateSummary(
        id=tid,
        name=name if isinstance(name, str) else tid,
        updatedAt=updated if isinstance(updated, str) else "",
        paperKind=paper,
        orientation=orient,
    )


def list_summaries() -> list[ReportTemplateSummary]:
    out: list[ReportTemplateSummary] = []
    root = _ensure_dir()
    for p in sorted(root.glob("*.json")):
        if p.name.endswith(".meta.json"):
            continue  # 摘要 sidecar 不是模版文件
        try:
            summary: ReportTemplateSummary | None = None
            meta = _meta_path_for(p)
            # sidecar 存在且不比模版旧时直接采用，避免解析整份大模版（含 base64 图片）
            if meta.is_file():
                try:
                    if meta.stat().st_mtime >= p.stat().st_mtime:
                        mraw = json.loads(meta.read_text(encoding="utf-8"))
                        if isinstance(mraw, dict):
                            summary = ReportTemplateSummary.model_validate(mraw)
                except Exception:
                    summary = None  # sidecar 损坏则回退到解析全文件
            if summary is None:
                raw = json.loads(p.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    continue
                summary = _summary_from_raw(raw)
                if summary is not None:
                    _write_summary_sidecar(summary)  # 回填，下次即可走 sidecar
            if summary is not None:
                out.append(summary)
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
    raw = template_to_jsonable(t)
    payload = json.dumps(raw, ensure_ascii=False, indent=2)
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(path)
    # 主文件写入后再写摘要 sidecar，确保其 mtime 不早于主文件
    if isinstance(raw, dict):
        summary = _summary_from_raw(raw)
        if summary is not None:
            _write_summary_sidecar(summary)


def delete_template(template_id: str) -> bool:
    path = template_path(template_id)
    if not path.is_file():
        return False
    path.unlink()
    meta = _meta_path_for(path)
    if meta.is_file():
        try:
            meta.unlink()
        except Exception:
            logger.warning("删除模版摘要 sidecar 失败: %s", meta, exc_info=True)
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
