from __future__ import annotations

import json
import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request

from core.settings import CONFIG_FILE, DATA_DIR, QUERY_SESSION_FILE
from modules import config_bundle as cbundle
from modules import config_import_export as cie
from modules import config_store
from schemas.common import AppPreferencesPatch

router = APIRouter(tags=["settings"])
logger = logging.getLogger(__name__)


def _load() -> dict[str, Any]:
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _save(cfg: dict[str, Any]) -> None:
    normalized = cie.normalize_top_level(cfg)
    for c in normalized.get("db_connections") or []:
        if isinstance(c, dict):
            c.pop("has_password", None)
    for s in normalized.get("opcua_servers") or []:
        if isinstance(s, dict):
            s.pop("has_password", None)
    config_store.save_config(CONFIG_FILE, normalized)


@router.get("/settings/app_preferences")
async def get_app_preferences():
    cfg = _load()
    return cfg.get("app_preferences", {})


@router.patch("/settings/app_preferences")
async def patch_app_preferences(body: AppPreferencesPatch):
    try:
        cfg = _load()
        prefs = dict(cfg.get("app_preferences") or {})
        for k, v in body.model_dump(exclude_unset=True).items():
            prefs[k] = v
        cfg["app_preferences"] = prefs
        _save(cfg)
        return prefs
    except Exception as e:
        logger.exception("patch_app_preferences")
        raise HTTPException(503, f"保存偏好失败: {e}") from e


@router.get("/settings/config/export")
async def export_config(mode: Literal["share", "backup"] = Query("share")):
    cfg = _load()
    if mode == "backup":
        return cbundle.build_export_bundle(
            cfg,
            mask_conn=config_store.mask_connection_for_response,
            mask_opcua=config_store.mask_opcua_for_response,
            mode="backup",
            data_dir=DATA_DIR,
            decrypt_db=config_store.decrypt_db_password,
            decrypt_opcua=config_store.decrypt_opcua_password,
        )
    return cbundle.build_export_bundle(
        cfg,
        mask_conn=config_store.mask_connection_for_response,
        mask_opcua=config_store.mask_opcua_for_response,
        mode="share",
    )


@router.post("/settings/config/import")
async def import_config(request: Request):
    raw_bytes = await request.body()
    max_bytes = cbundle.MAX_BUNDLE_JSON_BYTES
    if len(raw_bytes) > max_bytes:
        raise HTTPException(400, f"请求体超过 {max_bytes} 字节")
    try:
        payload = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HTTPException(400, f"无效 JSON: {e}") from e
    if not isinstance(payload, dict):
        raise HTTPException(400, "请求体须为 JSON 对象")
    mode = str(payload.get("mode") or "merge").lower()
    if mode not in ("merge", "replace"):
        raise HTTPException(400, "mode 须为 merge 或 replace")
    if isinstance(payload.get("data"), dict):
        data = payload["data"]
    elif isinstance(payload.get("db_connections"), list) or isinstance(payload.get("opcua_servers"), list):
        data = {k: v for k, v in payload.items() if k != "mode"}
    else:
        raise HTTPException(400, "缺少 db_connections / opcua_servers，或使用 { \"mode\", \"data\" } 包裹")
    try:
        cur = _load()
        client_prefs: dict = {}
        imported_stats: dict = {}
        warnings: list[str] = []
        cred = cie.import_credential_kwargs(DATA_DIR)
        if isinstance(data, dict) and cbundle.is_bundle_payload(data):
            merged, bundle_result = cbundle.apply_bundle_import(cur, data, mode, **cred)
            client_prefs = bundle_result.get("client_prefs") or {}
            imported_stats = bundle_result.get("imported") or {}
            warnings = list(bundle_result.get("warnings") or [])
        elif mode == "replace":
            merged, raw_warn = cie.apply_import_replace(data, **cred)
            warnings = cie.format_import_warnings(raw_warn)
        else:
            merged, raw_warn = cie.apply_import_merge(cur, data, **cred)
            warnings = cie.format_import_warnings(raw_warn)
        _save(merged)
        return {
            "ok": True,
            "mode": mode,
            "client_prefs": client_prefs,
            "imported": imported_stats,
            "warnings": warnings,
        }
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        logger.exception("import_config")
        raise HTTPException(503, f"导入失败: {e}") from e


@router.delete("/settings/query_sessions")
async def clear_query_sessions():
    try:
        QUERY_SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        empty = {"favorites": [], "history": []}
        QUERY_SESSION_FILE.write_text(json.dumps(empty, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"ok": True}
    except Exception as e:
        logger.exception("clear_query_sessions")
        raise HTTPException(503, f"清空失败: {e}") from e
