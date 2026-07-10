"""AI 待办提示队列：密码、删除与业务确认（敏感信息永不进入 LLM）。"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from core.settings import DATA_DIR

PromptKind = Literal[
    "credential",
    "confirm_delete",
    "confirm_reset",
    "confirm_import_merge",
    "confirm_manual_export",
    "pick_export_dir",
    "check_update",
    "open_editor",
]
PromptStatus = Literal["pending", "done", "cancelled", "expired"]

TTL_SEC = 600
_FILE = DATA_DIR / "ai_pending_prompts.json"
_IMPORT_DIR = DATA_DIR / "ai_pending_imports"
_lock = threading.Lock()


def _now() -> float:
    return time.time()


def _load_raw() -> list[dict[str, Any]]:
    if not _FILE.exists():
        return []
    try:
        data = json.loads(_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save_raw(items: list[dict[str, Any]]) -> None:
    _FILE.parent.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _prune(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cutoff = _now() - TTL_SEC
    out: list[dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        created = float(it.get("created_at") or 0)
        status = str(it.get("status") or "pending")
        if status == "pending" and created < cutoff:
            it = {**it, "status": "expired", "updated_at": _now()}
        out.append(it)
    return out


def _public_item(it: dict[str, Any]) -> dict[str, Any]:
    payload = it.get("payload") if isinstance(it.get("payload"), dict) else {}
    safe_payload = {k: v for k, v in payload.items() if k not in ("password", "bundle", "content")}
    return {
        "id": it.get("id"),
        "kind": it.get("kind"),
        "target_kind": it.get("target_kind"),
        "connection_id": it.get("connection_id"),
        "connection_name": it.get("connection_name"),
        "title": it.get("title"),
        "message": it.get("message"),
        "status": it.get("status"),
        "username_hint": it.get("username_hint"),
        "payload": safe_payload,
        "created_at": it.get("created_at"),
    }


def list_pending(*, include_done: bool = False) -> list[dict[str, Any]]:
    with _lock:
        items = _prune(_load_raw())
        _save_raw(items)
        out = []
        for it in items:
            st = str(it.get("status") or "")
            if st == "pending" or (include_done and st == "done"):
                out.append(_public_item(it))
        return out


def count_pending() -> int:
    return len([x for x in list_pending() if x.get("status") == "pending"])


def get_prompt(prompt_id: str) -> dict[str, Any] | None:
    with _lock:
        items = _prune(_load_raw())
        for it in items:
            if it.get("id") == prompt_id:
                return it
        return None


def create_prompt(
    *,
    kind: PromptKind,
    target_kind: str = "",
    connection_id: str = "",
    connection_name: str = "",
    title: str,
    message: str,
    username_hint: str = "",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "target_kind": target_kind,
        "connection_id": connection_id,
        "connection_name": connection_name,
        "title": title,
        "message": message,
        "username_hint": username_hint,
        "payload": payload or {},
        "status": "pending",
        "created_at": _now(),
        "updated_at": _now(),
    }
    with _lock:
        items = _prune(_load_raw())
        items.append(item)
        _save_raw(items)
    return _public_item(item)


def store_import_payload(prompt_id: str, data: dict[str, Any]) -> Path:
    _IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = _IMPORT_DIR / f"{prompt_id}.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def load_import_payload(prompt_id: str) -> dict[str, Any] | None:
    path = _IMPORT_DIR / f"{prompt_id}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def delete_import_payload(prompt_id: str) -> None:
    path = _IMPORT_DIR / f"{prompt_id}.json"
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def cancel_prompt(prompt_id: str) -> dict[str, Any]:
    with _lock:
        items = _prune(_load_raw())
        found = None
        for it in items:
            if it.get("id") == prompt_id:
                it["status"] = "cancelled"
                it["updated_at"] = _now()
                found = _public_item(it)
                break
        if not found:
            return {"ok": False, "error": "未找到待办或已过期"}
        _save_raw(items)
    delete_import_payload(prompt_id)
    return {"ok": True, "prompt": found}


def complete_prompt(prompt_id: str, *, result: dict[str, Any] | None = None) -> None:
    with _lock:
        items = _prune(_load_raw())
        for it in items:
            if it.get("id") == prompt_id:
                it["status"] = "done"
                it["updated_at"] = _now()
                if result:
                    it["result"] = result
                break
        _save_raw(items)
    delete_import_payload(prompt_id)
