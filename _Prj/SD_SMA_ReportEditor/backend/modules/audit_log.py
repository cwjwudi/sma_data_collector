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


COALESCE_WINDOW_SEC = 15 * 60
_COALESCE_ACTIONS = frozenset({"template.save", "layout.save"})


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


def _replace_entry_by_id(path: Path, entry_id: str, new_entry: dict[str, Any]) -> bool:
    """按 id 原地改写一条 JSONL；找不到则返回 False。"""
    if not path.exists():
        return False
    lines = path.read_text(encoding="utf-8").splitlines()
    found = False
    out: list[str] = []
    for line in lines:
        raw = line.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            out.append(line)
            continue
        if isinstance(obj, dict) and str(obj.get("id") or "") == entry_id:
            out.append(json.dumps(new_entry, ensure_ascii=False))
            found = True
        else:
            out.append(raw)
    if not found:
        return False
    path.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")
    return True


def append_or_coalesce_audit(
    data_dir: Path,
    *,
    action: str,
    result: str = "ok",
    summary: str = "",
    object_type: str | None = None,
    object_id: str | None = None,
    detail: dict[str, Any] | None = None,
    coalesce_window_sec: float = COALESCE_WINDOW_SEC,
    merge_changes_fn: Any | None = None,
    build_summary_fn: Any | None = None,
) -> dict[str, Any]:
    """成功保存类审计：15 分钟内同一对象合并为一条。

    仅对 ``template.save`` / ``layout.save`` 且 ``result=ok`` 生效；其它走普通 append。
    合并时跳过中间的失败记录，只认上一次成功保存。
    """
    from modules.audit_asset_diff import build_save_summary, format_change_lines, merge_changes

    action_key = (action or "").strip()
    result_key = (result or "ok").strip() or "ok"
    oid = (object_id or "").strip() or None
    otype = (object_type or "").strip() or None
    incoming_detail = dict(detail) if isinstance(detail, dict) else {}

    if (
        result_key != "ok"
        or action_key not in _COALESCE_ACTIONS
        or not oid
        or coalesce_window_sec <= 0
    ):
        return append_audit(
            data_dir,
            action=action_key,
            result=result_key,
            summary=summary,
            object_type=otype,
            object_id=oid,
            detail=incoming_detail,
        )

    now = time.time()
    path = _audit_path(data_dir)
    rows = _read_all_rows(path)
    # 找窗口内最近一条同对象成功保存（按时间倒序扫）
    prev: dict[str, Any] | None = None
    for row in sorted(rows, key=lambda x: float(x.get("ts") or 0), reverse=True):
        if str(row.get("action") or "") != action_key:
            continue
        if str(row.get("result") or "") != "ok":
            continue
        if (row.get("object_id") or None) != oid:
            continue
        ts = float(row.get("ts") or 0)
        if not ts or (now - ts) > coalesce_window_sec:
            break
        prev = row
        break

    if prev is None:
        if "save_count" not in incoming_detail:
            incoming_detail["save_count"] = 1
        if "first_ts" not in incoming_detail:
            incoming_detail["first_ts"] = now
        incoming_detail["last_ts"] = now
        return append_audit(
            data_dir,
            action=action_key,
            result=result_key,
            summary=summary,
            object_type=otype,
            object_id=oid,
            detail=incoming_detail,
        )

    merge_fn = merge_changes_fn or merge_changes
    prev_detail = prev.get("detail") if isinstance(prev.get("detail"), dict) else {}
    save_count = int(prev_detail.get("save_count") or 1) + 1
    first_ts = float(prev_detail.get("first_ts") or prev.get("ts") or now)
    old_changes = prev_detail.get("changes") if isinstance(prev_detail.get("changes"), list) else []
    new_changes = (
        incoming_detail.get("changes") if isinstance(incoming_detail.get("changes"), list) else []
    )
    merged = merge_fn(old_changes, new_changes)
    change_count = len([c for c in merged if isinstance(c, dict) and c.get("key") != "__truncated__"])
    # 若有截断标记，尽量保留 incoming 的 change_count 上限语义
    if any(isinstance(c, dict) and c.get("key") == "__truncated__" for c in merged):
        change_count = max(
            change_count,
            int(incoming_detail.get("change_count") or 0),
            int(prev_detail.get("change_count") or 0),
        )

    kind = "template" if action_key == "template.save" else "layout"
    name = str(
        incoming_detail.get("name")
        or prev_detail.get("name")
        or ""
    ).strip() or "未命名"
    summary_fn = build_summary_fn or build_save_summary
    new_summary = summary_fn(
        kind=kind,
        name=name,
        change_count=change_count,
        save_count=save_count,
        created=bool(prev_detail.get("created") or incoming_detail.get("created")),
    )
    # 合并后若已有后续变更，摘要用「保存…共 N 次」而非「新建」
    if save_count > 1:
        new_summary = build_save_summary(
            kind=kind,
            name=name,
            change_count=change_count,
            save_count=save_count,
            created=False,
        )

    updated_detail = {
        **prev_detail,
        **{k: v for k, v in incoming_detail.items() if k not in ("changes", "change_lines", "save_count", "first_ts", "last_ts")},
        "name": name,
        "save_count": save_count,
        "first_ts": first_ts,
        "last_ts": now,
        "change_count": change_count,
        "changes": merged,
        "change_lines": format_change_lines(merged),
        "truncated": any(isinstance(c, dict) and c.get("key") == "__truncated__" for c in merged),
        "created": bool(prev_detail.get("created")),
    }
    updated: dict[str, Any] = {
        **prev,
        "ts": now,
        "summary": new_summary,
        "object_type": otype or prev.get("object_type"),
        "object_id": oid,
        "detail": updated_detail,
        "actor": _actor(),
        "result": "ok",
        "action": action_key,
    }
    if not _replace_entry_by_id(path, str(prev.get("id") or ""), updated):
        return append_audit(
            data_dir,
            action=action_key,
            result=result_key,
            summary=summary,
            object_type=otype,
            object_id=oid,
            detail=incoming_detail,
        )
    return updated


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
    writer.writerow(["time", "action", "result", "summary", "object_type", "object_id", "actor", "detail"])
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
        detail = e.get("detail") if isinstance(e.get("detail"), dict) else {}
        try:
            detail_str = json.dumps(detail or {}, ensure_ascii=False)
        except (TypeError, ValueError):
            detail_str = ""
        writer.writerow([
            time_str,
            e.get("action") or "",
            e.get("result") or "",
            e.get("summary") or "",
            e.get("object_type") or "",
            e.get("object_id") or "",
            actor_str,
            detail_str,
        ])
    return buf.getvalue()
