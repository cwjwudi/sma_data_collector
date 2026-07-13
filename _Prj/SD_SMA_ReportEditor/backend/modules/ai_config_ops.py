"""配置备份 / 复位 / 输出目录偏好 AI 操作。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.settings import CONFIG_FILE, DATA_DIR, DEFAULT_CONFIG, LAYOUT_PRESETS_DIR, QUERY_SESSION_FILE, SIGNATURE_ASSETS_DIR, TEMPLATES_DIR
from modules import ai_asset_ops, ai_pending_prompts, audit_log, config_bundle as cbundle, config_import_export as cie, config_store

_CLIENT_PREFS_MIRROR = DATA_DIR / "client_prefs_mirror.json"


def _load_cfg() -> dict[str, Any]:
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _save_cfg(cfg: dict[str, Any]) -> None:
    config_store.save_config(CONFIG_FILE, cie.normalize_top_level(cfg))


def export_config_share_summary() -> dict[str, Any]:
    cfg = _load_cfg()
    bundle = cbundle.build_export_bundle(
        cfg,
        mask_conn=config_store.mask_connection_for_response,
        mask_opcua=config_store.mask_opcua_for_response,
        mode="share",
        data_dir=DATA_DIR,
        decrypt_db=config_store.decrypt_db_password,
        decrypt_opcua=config_store.decrypt_opcua_password,
        client_prefs=None,
    )
    return {
        "ok": True,
        "summary": {
            "db_connections": len(bundle.get("db_connections") or []),
            "opcua_servers": len(bundle.get("opcua_servers") or []),
            "templates": len(bundle.get("templates") or []),
            "layout_presets": len(bundle.get("layout_presets") or []),
            "signature_assets": len(bundle.get("signature_assets") or []),
        },
        "bundle_version": bundle.get("bundle_version"),
    }


def request_config_backup_export() -> dict[str, Any]:
    prompt = ai_pending_prompts.create_prompt(
        kind="pick_export_dir",
        target_kind="config",
        title="导出加密配置备份",
        message="AI 助手请求导出含口令的 .rebak 备份。请在弹框中选择保存位置（备份内容不会发送给 LLM）。",
        payload={"action": "backup_export"},
    )
    return {"ok": True, "status": "awaiting_user_action", "prompt": prompt}


def request_config_import_merge(bundle: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(bundle, dict):
        return {"ok": False, "error": "导入内容须为 JSON 对象"}
    prompt = ai_pending_prompts.create_prompt(
        kind="confirm_import_merge",
        target_kind="config",
        title="确认 merge 导入配置",
        message="AI 助手请求 merge 导入配置包。将合并连接与资产，不会先清空现有数据。请确认。",
        payload={"mode": "merge"},
    )
    ai_pending_prompts.store_import_payload(prompt["id"], bundle)
    return {"ok": True, "status": "awaiting_user_confirm", "prompt": prompt}


def request_config_reset() -> dict[str, Any]:
    prompt = ai_pending_prompts.create_prompt(
        kind="confirm_reset",
        target_kind="config",
        title="确认快速复位",
        message="AI 助手请求快速复位：将清空数据源、模版、版式、签名与审计，恢复默认配置。此操作不可撤销，请确认。",
    )
    return {"ok": True, "status": "awaiting_user_confirm", "prompt": prompt}


def apply_reset(prompt_id: str) -> dict[str, Any]:
    item = ai_pending_prompts.get_prompt(prompt_id)
    if not item or item.get("kind") != "confirm_reset":
        return {"ok": False, "error": "待办不存在或类型不匹配"}
    config_store.save_config(CONFIG_FILE, cie.normalize_top_level(dict(DEFAULT_CONFIG)))
    removed = {
        "templates": _clear_dir_json(TEMPLATES_DIR),
        "layout_presets": _clear_dir_json(LAYOUT_PRESETS_DIR),
        "signature_assets": _clear_dir_json(SIGNATURE_ASSETS_DIR),
    }
    try:
        for p in TEMPLATES_DIR.glob("*.meta.json"):
            p.unlink(missing_ok=True)
    except OSError:
        pass
    try:
        for p in SIGNATURE_ASSETS_DIR.iterdir():
            if p.is_file() and p.suffix.lower() != ".json":
                p.unlink(missing_ok=True)
    except OSError:
        pass
    audit_path = DATA_DIR / "audit" / "audit.jsonl"
    try:
        audit_path.unlink(missing_ok=True)
    except OSError:
        pass
    try:
        QUERY_SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        QUERY_SESSION_FILE.write_text(json.dumps({"favorites": [], "history": []}, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    audit_log.append_audit(DATA_DIR, action="config.reset", result="ok", summary="AI pending 快速复位")
    ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True, "removed": removed})
    ai_asset_ops.mark_ui_reload(assets=True, datasource=True, reason="config_reset")
    return {"ok": True, "removed": removed}


def apply_import_merge(prompt_id: str, item: dict[str, Any]) -> dict[str, Any]:
    if item.get("kind") != "confirm_import_merge":
        return {"ok": False, "error": "待办类型不匹配"}
    data = ai_pending_prompts.load_import_payload(prompt_id)
    if not data:
        return {"ok": False, "error": "导入数据已过期或不存在"}
    try:
        cur = _load_cfg()
        cred = cie.import_credential_kwargs(DATA_DIR)
        if cbundle.is_bundle_payload(data):
            merged, bundle_result = cbundle.apply_bundle_import(cur, data, "merge", **cred)
            warnings = list(bundle_result.get("warnings") or [])
        else:
            merged, raw_warn = cie.apply_import_merge(cur, data, **cred)
            warnings = cie.format_import_warnings(raw_warn)
        _save_cfg(merged)
        ai_pending_prompts.complete_prompt(prompt_id, result={"ok": True, "warnings": warnings})
        ai_asset_ops.mark_ui_reload(assets=True, datasource=True, reason="config_import_merge")
        return {"ok": True, "warnings": warnings}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _clear_dir_json(directory: Path) -> int:
    n = 0
    if not directory.exists():
        return 0
    for p in directory.glob("*.json"):
        try:
            p.unlink()
            n += 1
        except OSError:
            pass
    return n


def get_export_dir_prefs() -> dict[str, Any]:
    if not _CLIENT_PREFS_MIRROR.is_file():
        return {"ok": True, "mirror_exists": False, "prefs": {}}
    try:
        data = json.loads(_CLIENT_PREFS_MIRROR.read_text(encoding="utf-8"))
        rg = data.get("report_generator") if isinstance(data, dict) else {}
        rexp = data.get("report_export") if isinstance(data, dict) else {}
        return {
            "ok": True,
            "mirror_exists": True,
            "auto_export_dir": (rg or {}).get("autoExportDir"),
            "auto_export_dir_source": (rg or {}).get("autoExportDirSource"),
            "watch_dir": (rexp or {}).get("watchDir"),
        }
    except (OSError, json.JSONDecodeError) as e:
        return {"ok": False, "error": str(e)}


def set_export_dir(path: str) -> dict[str, Any]:
    import uuid

    p = (path or "").strip()
    if not p:
        return {"ok": False, "error": "路径不能为空"}
    mirror: dict[str, Any] = {}
    if _CLIENT_PREFS_MIRROR.is_file():
        try:
            mirror = json.loads(_CLIENT_PREFS_MIRROR.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            mirror = {}
    if not isinstance(mirror, dict):
        mirror = {}
    rg = dict(mirror.get("report_generator") or {})
    rexp = dict(mirror.get("report_export") or {})
    rg["autoExportDir"] = p
    rg["autoExportDirSource"] = "default"
    rexp["watchDir"] = p
    mirror["report_generator"] = rg
    mirror["report_export"] = rexp
    mirror["pending_apply"] = True
    mirror["pending_token"] = str(uuid.uuid4())
    _CLIENT_PREFS_MIRROR.parent.mkdir(parents=True, exist_ok=True)
    _CLIENT_PREFS_MIRROR.write_text(json.dumps(mirror, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "path": p, "note": "前端将在轮询时应用至 localStorage"}


def request_pick_export_dir() -> dict[str, Any]:
    prompt = ai_pending_prompts.create_prompt(
        kind="pick_export_dir",
        target_kind="export",
        title="选择报表输出目录",
        message="请在弹框中选择 PDF 默认输出目录。",
        payload={"action": "set_export_dir"},
    )
    return {"ok": True, "status": "awaiting_user_action", "prompt": prompt}


def request_check_app_update() -> dict[str, Any]:
    """仅排队本机检查更新；确认后走 Electron 检查，绝不自动安装。"""
    prompt = ai_pending_prompts.create_prompt(
        kind="check_update",
        target_kind="app",
        title="检查软件更新",
        message="AI 助手请求检查是否有新版本。确认后将执行检查（不会自动安装）。",
        payload={"action": "check_update", "auto_install": False},
    )
    return {"ok": True, "status": "awaiting_user_confirm", "prompt": prompt}


async def preflight_export(template_id: str) -> dict[str, Any]:
    """结批预检：返回绑定问题事实；issue 非空时 ok/ready=false（供口播，不触发导出）。"""
    from modules import ai_work_chain

    tid = (template_id or "").strip()
    if not tid:
        return {"ok": False, "error": "缺少 template_id"}
    try:
        bindings = ai_work_chain.inspect_template_bindings(tid)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    if not bindings.get("ok"):
        return bindings
    issues = bindings.get("issues") or []
    return {
        "ok": len(issues) == 0,
        "template_id": tid,
        "template_name": bindings.get("template_name"),
        "issue_count": len(issues),
        "issues": issues,
        "ready": len(issues) == 0,
        "resolved_connections": bindings.get("resolved_connections") or [],
    }


def request_manual_export(template_id: str) -> dict[str, Any]:
    """仅排队模拟结批确认；确认后由本机 Electron 导出，禁止口头宣称已导出。"""
    tid = (template_id or "").strip()
    if not tid:
        return {"ok": False, "error": "缺少 template_id"}
    from modules import template_store

    try:
        tpl = template_store.load_template(tid)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    if not tpl:
        return {"ok": False, "error": "模版不存在"}
    prompt = ai_pending_prompts.create_prompt(
        kind="confirm_manual_export",
        target_kind="export",
        connection_id=tid,
        connection_name=tpl.name,
        title="确认模拟结批",
        message=f"AI 助手请求对模版「{tpl.name}」执行一次模拟结批（PDF 导出）。请确认。",
        payload={"template_id": tid, "template_name": tpl.name},
    )
    return {"ok": True, "status": "awaiting_user_confirm", "prompt": prompt}
