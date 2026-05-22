"""本地操作审计（M14 MVP）：JSONL 追加写入，供设置页查询与导出。"""
from __future__ import annotations

import json
import os
import socket
import time
import uuid
from pathlib import Path
from typing import Any

AUDIT_DIR_NAME = "audit"
AUDIT_FILE_NAME = "operations.jsonl"
MAX_LINES = 5000


def _audit_path(data_dir: Path) -> Path:
    return data_dir / AUDIT_DIR_NAME / AUDIT_FILE_NAME


def _actor() -> dict[str, str]:
    user = ""
    try:
        user = os.environ.get("USER") or os.environ.get("USERNAME") or ""
    except Exception:
        pass
    host = ""
    try:
        host = socket.gethostname() or ""
    except Exception:
        pass
    return {"os_user": user.strip(), "hostname": host.strip()}


def append_audit(
    data_dir: Path,
    *,
    action: str,
    result: str = "ok",
    summary: str = "",
    object_type: str | None = None,
    object_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> dict[str, Any]:
    action_key = (action or "").strip()
    if not action_key:
        raise ValueError("action 不能为空")
    entry: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "ts": time.time(),
        "action": action_key,
        "result": (result or "ok").strip() or "ok",
        "summary": (summary or "").strip(),
        "object_type": (object_type or "").strip() or None,
        "object_id": (object_id or "").strip() or None,
        "detail": detail if isinstance(detail, dict) else {},
        "actor": _actor(),
    }
    audit_dir = data_dir / AUDIT_DIR_NAME
    audit_dir.mkdir(parents=True, exist_ok=True)
    path = _audit_path(data_dir)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    _maybe_trim(path)
    return entry


def _maybe_trim(path: Path) -> None:
    try:
        if not path.exists():
            return
        lines = path.read_text(encoding="utf-8").splitlines()
        if len(lines) <= MAX_LINES:
            return
        keep = lines[-MAX_LINES:]
        path.write_text("\n".join(keep) + "\n", encoding="utf-8")
    except OSError:
        pass


def list_audit(
    data_dir: Path,
    *,
    limit: int = 100,
    offset: int = 0,
    action: str | None = None,
) -> dict[str, Any]:
    path = _audit_path(data_dir)
    if not path.exists():
        return {"entries": [], "total": 0}
    rows: list[dict[str, Any]] = []
    action_filter = (action or "").strip()
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if action_filter and obj.get("action") != action_filter:
                continue
            rows.append(obj)
    total = len(rows)
    rows.sort(key=lambda x: float(x.get("ts") or 0), reverse=True)
    page = rows[offset : offset + max(1, min(limit, 500))]
    return {"entries": page, "total": total}


def export_audit(data_dir: Path, *, action: str | None = None) -> list[dict[str, Any]]:
    return list_audit(data_dir, limit=MAX_LINES, offset=0, action=action).get("entries") or []
