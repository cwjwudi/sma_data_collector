"""模版 / 版式 AI 操作。"""
from __future__ import annotations

import copy
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from core.settings import DATA_DIR
from modules import ai_pending_prompts, layout_preset_store, template_store
from schemas.layout_preset import LayoutPreset
from schemas.report_template import LayoutSnapshot, ReportTemplate, parse_report_template, template_to_jsonable


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def list_layout_presets() -> dict[str, Any]:
    summaries = [s.model_dump(mode="json") for s in layout_preset_store.list_summaries()]
    return {"layouts": summaries, "count": len(summaries)}


def copy_template(source_id: str, new_name: str) -> dict[str, Any]:
    tid = (source_id or "").strip()
    if not tid:
        return {"ok": False, "error": "缺少 source_id"}
    tpl = template_store.load_template(tid)
    if not tpl:
        return {"ok": False, "error": "模版不存在"}
    raw = template_to_jsonable(tpl)
    dup = copy.deepcopy(raw)
    dup["id"] = str(uuid.uuid4())
    dup["name"] = (new_name or "").strip() or f"{tpl.name}（副本）"
    dup["updatedAt"] = _now_iso()
    parsed = parse_report_template(dup)
    template_store.save_template(parsed)
    mark_ui_reload(assets=True, reason="copy_template")
    return {"ok": True, "template_id": parsed.id, "name": parsed.name}


def copy_layout_preset(source_id: str, new_name: str) -> dict[str, Any]:
    lid = (source_id or "").strip()
    if not lid:
        return {"ok": False, "error": "缺少 source_id"}
    lp = layout_preset_store.load_preset(lid)
    if not lp:
        return {"ok": False, "error": "版式不存在"}
    raw = lp.model_dump(mode="json")
    dup = copy.deepcopy(raw)
    dup["id"] = str(uuid.uuid4())
    dup["name"] = (new_name or "").strip() or f"{lp.name}（副本）"
    dup["updatedAt"] = _now_iso()
    preset = LayoutPreset.model_validate(dup)
    layout_preset_store.save_preset(preset)
    mark_ui_reload(assets=True, reason="copy_layout_preset")
    return {"ok": True, "layout_id": preset.id, "name": preset.name}


def mark_ui_reload(
    *,
    assets: bool = False,
    datasource: bool = False,
    connection_probe: bool = False,
    reason: str = "",
) -> str:
    """写入 client_prefs 镜像，供前端轮询后主动 reload 模版/数据源/探活设置。

    每次写入刷新 ``pending_token``；前端 ack 时须带回该 token，避免清除冲掉更新的 pending。
    返回 pending_token。
    """
    path = DATA_DIR / "client_prefs_mirror.json"
    data: dict[str, Any] = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except (OSError, json.JSONDecodeError):
            data = {}
    token = str(uuid.uuid4())
    data["pending_apply"] = True
    data["pending_token"] = token
    reload = data.get("ui_reload") if isinstance(data.get("ui_reload"), dict) else {}
    if assets:
        reload["assets"] = True
    if datasource:
        reload["datasource"] = True
    if connection_probe:
        reload["connection_probe"] = True
    if reason:
        reload["reason"] = reason
    data["ui_reload"] = reload
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return token


def create_blank_template(name: str) -> dict[str, Any]:
    snap = LayoutSnapshot().model_dump()
    tpl = ReportTemplate(
        id=str(uuid.uuid4()),
        name=(name or "").strip() or "新建模版",
        updatedAt=_now_iso(),
        schemaVersion=4,
        layoutSnapshot=LayoutSnapshot.model_validate(snap),
        coverLayoutSnapshot=LayoutSnapshot.model_validate(snap),
        backLayoutSnapshot=LayoutSnapshot.model_validate(snap),
    )
    template_store.save_template(tpl)
    mark_ui_reload(assets=True, reason="create_blank_template")
    return {"ok": True, "template_id": tpl.id, "name": tpl.name}


def create_blank_layout(name: str) -> dict[str, Any]:
    preset = LayoutPreset(
        id=str(uuid.uuid4()),
        name=(name or "").strip() or "新建版式",
        updatedAt=_now_iso(),
    )
    layout_preset_store.save_preset(preset)
    mark_ui_reload(assets=True, reason="create_blank_layout")
    return {"ok": True, "layout_id": preset.id, "name": preset.name}


def request_delete_template(template_id: str) -> dict[str, Any]:
    tid = (template_id or "").strip()
    tpl = template_store.load_template(tid)
    if not tpl:
        return {"ok": False, "error": "模版不存在"}
    prompt = ai_pending_prompts.create_prompt(
        kind="confirm_delete",
        target_kind="template",
        connection_id=tid,
        connection_name=tpl.name,
        title="确认删除报表模版",
        message=f"AI 助手请求删除模版「{tpl.name}」。此操作不可撤销，请确认。",
    )
    return {"ok": True, "status": "awaiting_user_confirm", "prompt": prompt}


def request_delete_layout(layout_id: str) -> dict[str, Any]:
    lid = (layout_id or "").strip()
    lp = layout_preset_store.load_preset(lid)
    if not lp:
        return {"ok": False, "error": "版式不存在"}
    prompt = ai_pending_prompts.create_prompt(
        kind="confirm_delete",
        target_kind="layout",
        connection_id=lid,
        connection_name=lp.name,
        title="确认删除版式",
        message=f"AI 助手请求删除版式「{lp.name}」。此操作不可撤销，请确认。",
    )
    return {"ok": True, "status": "awaiting_user_confirm", "prompt": prompt}


def apply_delete_template(prompt_id: str, item: dict[str, Any]) -> dict[str, Any]:
    if item.get("kind") != "confirm_delete" or item.get("target_kind") != "template":
        return {"ok": False, "error": "待办类型不匹配"}
    tid = str(item.get("connection_id") or "")
    if not template_store.delete_template(tid):
        return {"ok": False, "error": "模版不存在或已删除"}
    mark_ui_reload(assets=True, reason="delete_template")
    ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True, "deleted": tid})
    return {"ok": True, "deleted": tid, "kind": "template"}


def apply_delete_layout(prompt_id: str, item: dict[str, Any]) -> dict[str, Any]:
    if item.get("kind") != "confirm_delete" or item.get("target_kind") != "layout":
        return {"ok": False, "error": "待办类型不匹配"}
    lid = str(item.get("connection_id") or "")
    if not layout_preset_store.delete_preset(lid):
        return {"ok": False, "error": "版式不存在或已删除"}
    mark_ui_reload(assets=True, reason="delete_layout")
    ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True, "deleted": lid})
    return {"ok": True, "deleted": lid, "kind": "layout"}
