"""AI pending 确认动作：按 kind 路由到各业务模块。"""
from __future__ import annotations

from typing import Any

from modules import ai_asset_ops, ai_config_ops, ai_datasource_ops, ai_pending_prompts


async def apply_confirm(prompt_id: str, confirmed: bool) -> dict[str, Any]:
    item = ai_pending_prompts.get_prompt(prompt_id)
    if not item or item.get("status") != "pending":
        return {"ok": False, "error": "待办不存在或已过期"}
    kind = str(item.get("kind") or "")
    if not confirmed:
        ai_pending_prompts.cancel_prompt(prompt_id)
        return {"ok": True, "cancelled": True}

    if kind == "confirm_delete":
        target = str(item.get("target_kind") or "")
        if target in ("db", "opcua"):
            return await ai_datasource_ops.apply_confirm_delete(prompt_id, True)
        if target == "template":
            return ai_asset_ops.apply_delete_template(prompt_id, item)
        if target == "layout":
            return ai_asset_ops.apply_delete_layout(prompt_id, item)
        return {"ok": False, "error": f"未知删除目标: {target}"}

    if kind == "confirm_reset":
        return ai_config_ops.apply_reset(prompt_id)

    if kind == "confirm_import_merge":
        return ai_config_ops.apply_import_merge(prompt_id, item)

    if kind in ("confirm_manual_export", "pick_export_dir", "check_update", "open_editor"):
        ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True, "client_action": kind})
        return {"ok": True, "client_action": kind, "payload": item.get("payload") or {}}

    return {"ok": False, "error": f"不支持的待办类型: {kind}"}
