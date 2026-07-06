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
DEFAULT_RETENTION_DAYS = 90


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


def _maybe_trim(path: Path, *, retention_days: int = DEFAULT_RETENTION_DAYS) -> None:
    try:
        if not path.exists():
            return
        lines = path.read_text(encoding="utf-8").splitlines()
        if not lines:
            return
        cutoff = time.time() - max(1, retention_days) * 86400
        parsed: list[tuple[float, str]] = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                ts = float(obj.get("ts") or 0)
            except (json.JSONDecodeError, TypeError, ValueError):
                ts = 0.0
            if ts and ts < cutoff:
                continue
            parsed.append((ts, line))
        if len(parsed) > MAX_LINES:
            parsed.sort(key=lambda x: x[0])
            parsed = parsed[-MAX_LINES:]
        else:
            parsed.sort(key=lambda x: x[0])
        path.write_text("\n".join(line for _, line in parsed) + ("\n" if parsed else ""), encoding="utf-8")
    except OSError:
        pass


def _read_all_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    rows.append(obj)
            except json.JSONDecodeError:
                continue
    return rows


def _filter_rows(
    rows: list[dict[str, Any]],
    *,
    action: str | None = None,
    result: str | None = None,
    from_ts: float | None = None,
    to_ts: float | None = None,
) -> list[dict[str, Any]]:
    action_filter = (action or "").strip()
    result_filter = (result or "").strip()
    out: list[dict[str, Any]] = []
    for obj in rows:
        if action_filter and obj.get("action") != action_filter:
            continue
        if result_filter and obj.get("result") != result_filter:
            continue
        ts = float(obj.get("ts") or 0)
        if from_ts is not None and ts and ts < from_ts:
            continue
        if to_ts is not None and ts and ts > to_ts:
            continue
        out.append(obj)
    return out


def list_audit(
    data_dir: Path,
    *,
    limit: int = 100,
    offset: int = 0,
    action: str | None = None,
    result: str | None = None,
    from_ts: float | None = None,
    to_ts: float | None = None,
) -> dict[str, Any]:
    rows = _filter_rows(
        _read_all_rows(_audit_path(data_dir)),
        action=action,
        result=result,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    total = len(rows)
    rows.sort(key=lambda x: float(x.get("ts") or 0), reverse=True)
    page = rows[offset : offset + max(1, min(limit, 500))]
    return {"entries": page, "total": total}


def export_audit(
    data_dir: Path,
    *,
    action: str | None = None,
    result: str | None = None,
    from_ts: float | None = None,
    to_ts: float | None = None,
) -> list[dict[str, Any]]:
    rows = _filter_rows(
        _read_all_rows(_audit_path(data_dir)),
        action=action,
        result=result,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    rows.sort(key=lambda x: float(x.get("ts") or 0), reverse=True)
    return rows[:MAX_LINES]


def import_audit_entries(
    data_dir: Path,
    entries: list[Any],
    *,
    replace: bool = False,
) -> int:
    """导入审计条目（配置包恢复用）。

    - replace=True：清空后写入导入条目。
    - replace=False：按 id 去重后，把本地缺少的条目追加进去。
    返回实际写入（新增）的条目数量。
    """
    if not isinstance(entries, list):
        return 0
    incoming: list[dict[str, Any]] = []
    for item in entries:
        if isinstance(item, dict) and (item.get("action") or "").strip():
            incoming.append(item)

    path = _audit_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)

    if replace:
        merged = incoming
        added = len(incoming)
    else:
        existing = _read_all_rows(path)
        seen_ids = {str(r.get("id")) for r in existing if r.get("id")}
        added_rows: list[dict[str, Any]] = []
        for item in incoming:
            iid = str(item.get("id") or "")
            if iid and iid in seen_ids:
                continue
            if iid:
                seen_ids.add(iid)
            added_rows.append(item)
        merged = existing + added_rows
        added = len(added_rows)

    merged.sort(key=lambda x: float(x.get("ts") or 0))
    if len(merged) > MAX_LINES:
        merged = merged[-MAX_LINES:]
    with path.open("w", encoding="utf-8") as f:
        for row in merged:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return added


def export_audit_csv(
    data_dir: Path,
    *,
    action: str | None = None,
    result: str | None = None,
    from_ts: float | None = None,
    to_ts: float | None = None,
) -> str:
    import csv
    import io
    from datetime import datetime, timezone

    entries = export_audit(
        data_dir,
        action=action,
        result=result,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["time", "action", "result", "summary", "object_type", "object_id", "actor"])
    for e in entries:
        ts = float(e.get("ts") or 0)
        time_str = (
            datetime.fromtimestamp(ts, tz=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")
            if ts
            else ""
        )
        actor = e.get("actor") if isinstance(e.get("actor"), dict) else {}
        actor_str = ""
        if isinstance(actor, dict):
            parts = [p for p in [actor.get("os_user"), actor.get("hostname")] if p]
            actor_str = "@".join(parts) if parts else ""
        writer.writerow([
            time_str,
            e.get("action") or "",
            e.get("result") or "",
            e.get("summary") or "",
            e.get("object_type") or "",
            e.get("object_id") or "",
            actor_str,
        ])
    return buf.getvalue()
