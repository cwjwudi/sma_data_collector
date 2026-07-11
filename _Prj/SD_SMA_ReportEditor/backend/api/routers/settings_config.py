from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from core.settings import (
    CONFIG_FILE,
    DATA_DIR,
    DEFAULT_CONFIG,
    LAYOUT_PRESETS_DIR,
    QUERY_SESSION_FILE,
    SIGNATURE_ASSETS_DIR,
    TEMPLATES_DIR,
)
from modules import audit_log
from modules import bundle_crypto
from modules import config_bundle as cbundle
from modules import config_import_export as cie
from modules import config_store
from schemas.common import AppPreferencesPatch

router = APIRouter(tags=["settings"])
logger = logging.getLogger(__name__)

# 演示远程连接细节仅在后端维护，不返回给前端
_DEMO_SENSITIVE_PREF_KEYS = frozenset(
    {
        "demo_remote_db_host",
        "demo_remote_db_port",
        "demo_remote_db_name",
        "demo_remote_db_user",
        "demo_remote_db_password",
        "demo_remote_opcua_endpoint",
        "demo_remote_opcua_user",
        "demo_remote_opcua_password",
    }
)


def _public_app_preferences(prefs: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(prefs, dict):
        return {}
    return {k: v for k, v in prefs.items() if k not in _DEMO_SENSITIVE_PREF_KEYS}


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
def get_app_preferences():
    cfg = _load()
    return _public_app_preferences(cfg.get("app_preferences") or {})


@router.patch("/settings/app_preferences")
def patch_app_preferences(body: AppPreferencesPatch):
    try:
        cfg = _load()
        prefs = dict(cfg.get("app_preferences") or {})
        for k, v in body.model_dump(exclude_unset=True).items():
            prefs[k] = v
        cfg["app_preferences"] = prefs
        _save(cfg)
        return _public_app_preferences(prefs)
    except Exception as e:
        logger.exception("patch_app_preferences")
        raise HTTPException(503, f"保存偏好失败: {e}") from e


def _build_bundle(mode: str, client_prefs: dict[str, Any] | None) -> dict[str, Any]:
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
            client_prefs=client_prefs,
        )
    return cbundle.build_export_bundle(
        cfg,
        mask_conn=config_store.mask_connection_for_response,
        mask_opcua=config_store.mask_opcua_for_response,
        mode="share",
        client_prefs=client_prefs,
    )


@router.get("/settings/config/export")
def export_config(mode: Literal["share", "backup"] = Query("share")):
    """明文 JSON 导出（分享 / 兼容旧客户端）。加密备份请用 POST。"""
    return _build_bundle(mode, None)


@router.post("/settings/config/export")
async def export_config_post(request: Request):
    """完整配置导出。

    请求体（可选）：`{ "mode": "backup"|"share", "format": "encrypted"|"json", "client_prefs": {...} }`
    - format=encrypted（默认）：返回 `.rebak` 二进制密文（内置密钥加密、防篡改）。
    - format=json：返回明文 JSON 配置包。
    """
    raw = await request.body()
    body: dict[str, Any] = {}
    if raw:
        try:
            parsed = json.loads(raw.decode("utf-8"))
            if isinstance(parsed, dict):
                body = parsed
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            raise HTTPException(400, f"无效 JSON: {e}") from e

    mode = str(body.get("mode") or "backup").lower()
    if mode not in ("backup", "share"):
        raise HTTPException(400, "mode 须为 backup 或 share")
    fmt = str(body.get("format") or "encrypted").lower()
    if fmt not in ("encrypted", "json"):
        raise HTTPException(400, "format 须为 encrypted 或 json")
    client_prefs = body.get("client_prefs")
    if client_prefs is not None and not isinstance(client_prefs, dict):
        raise HTTPException(400, "client_prefs 须为对象")

    bundle = _build_bundle(mode, client_prefs if isinstance(client_prefs, dict) else None)

    if fmt == "json":
        return bundle

    try:
        blob = bundle_crypto.encrypt_bundle_obj(bundle)
    except Exception as e:
        logger.exception("encrypt_bundle")
        raise HTTPException(503, f"生成加密备份失败: {e}") from e
    stamp = datetime.now().strftime("%Y-%m-%d")
    filename = f"report-editor-backup-{stamp}.rebak"
    counts = cbundle.bundle_content_counts(bundle)
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Backup-Db-Count": str(counts.get("db_connections", 0)),
        "X-Backup-Opcua-Count": str(counts.get("opcua_servers", 0)),
        "X-Backup-Templates": str(counts.get("templates", 0)),
        "X-Backup-Layouts": str(counts.get("layout_presets", 0)),
        "X-Backup-Signatures": str(counts.get("signature_assets", 0)),
        "X-Backup-Query-Favorites": str(counts.get("query_session_favorites", 0)),
        "X-Backup-Has-Ai": "1" if counts.get("has_ai_settings") else "0",
        # CORS / 前端可读自定义头
        "Access-Control-Expose-Headers": (
            "Content-Disposition, X-Backup-Db-Count, X-Backup-Opcua-Count, "
            "X-Backup-Templates, X-Backup-Layouts, X-Backup-Signatures, "
            "X-Backup-Query-Favorites, X-Backup-Has-Ai"
        ),
    }
    return Response(
        content=blob,
        media_type="application/octet-stream",
        headers=headers,
    )


@router.post("/settings/config/import")
async def import_config(request: Request, mode: str | None = Query(None)):
    raw_bytes = await request.body()
    max_bytes = cbundle.MAX_BUNDLE_JSON_BYTES
    if len(raw_bytes) > max_bytes:
        raise HTTPException(400, f"请求体超过 {max_bytes} 字节")

    req_mode = (mode or "").lower()
    data: dict[str, Any] | None = None

    if bundle_crypto.is_encrypted_bundle(raw_bytes):
        try:
            data = bundle_crypto.decrypt_bundle_bytes(raw_bytes)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
    else:
        try:
            payload = json.loads(raw_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            raise HTTPException(400, f"无效 JSON: {e}") from e
        if not isinstance(payload, dict):
            raise HTTPException(400, "请求体须为 JSON 对象")
        body_mode = str(payload.get("mode") or "").lower()
        if body_mode:
            req_mode = body_mode
        if isinstance(payload.get("data"), dict):
            data = payload["data"]
        elif (
            isinstance(payload.get("db_connections"), list)
            or isinstance(payload.get("opcua_servers"), list)
            or cbundle.is_bundle_payload(payload)
        ):
            data = {k: v for k, v in payload.items() if k != "mode"}
        else:
            raise HTTPException(
                400, "缺少 db_connections / opcua_servers，或使用 { \"mode\", \"data\" } 包裹"
            )

    if not req_mode:
        req_mode = "merge"
    if req_mode not in ("merge", "replace"):
        raise HTTPException(400, "mode 须为 merge 或 replace")
    if not isinstance(data, dict):
        raise HTTPException(400, "备份内容为空或格式不正确")
    mode = req_mode
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
        if not imported_stats:
            imported_stats = {
                "db_connections": len(merged.get("db_connections") or []),
                "opcua_servers": len(merged.get("opcua_servers") or []),
                "has_ai_settings": bool(merged.get("ai_settings")),
            }
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
def clear_query_sessions():
    try:
        QUERY_SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        empty = {"favorites": [], "history": []}
        QUERY_SESSION_FILE.write_text(json.dumps(empty, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"ok": True}
    except Exception as e:
        logger.exception("clear_query_sessions")
        raise HTTPException(503, f"清空失败: {e}") from e


def _clear_dir_json(directory) -> int:
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


@router.post("/settings/config/reset")
def reset_config():
    """快速复位：清空数据源、模版、版式、签名、操作审计与查询会话，恢复默认配置。

    不删除已生成的 PDF 报表实体文件（位于用户自选的导出目录之外）。
    """
    try:
        config_store.save_config(CONFIG_FILE, cie.normalize_top_level(dict(DEFAULT_CONFIG)))

        removed = {
            "templates": _clear_dir_json(TEMPLATES_DIR),
            "layout_presets": _clear_dir_json(LAYOUT_PRESETS_DIR),
            "signature_assets": _clear_dir_json(SIGNATURE_ASSETS_DIR),
        }
        # 模版轻量摘要 sidecar 一并清理
        try:
            for p in TEMPLATES_DIR.glob("*.meta.json"):
                p.unlink()
        except OSError:
            pass
        try:
            for p in SIGNATURE_ASSETS_DIR.glob("*"):
                if p.is_file() and p.suffix.lower() != ".json":
                    p.unlink()
        except OSError:
            pass

        try:
            audit_file = DATA_DIR / audit_log.AUDIT_DIR_NAME / audit_log.AUDIT_FILE_NAME
            if audit_file.exists():
                audit_file.unlink()
        except OSError:
            pass

        try:
            if QUERY_SESSION_FILE.exists():
                QUERY_SESSION_FILE.unlink()
        except OSError:
            pass

        try:
            audit_log.append_audit(
                DATA_DIR,
                action="config.reset",
                result="ok",
                summary="快速复位（恢复默认配置）",
                detail={"removed": removed},
            )
        except Exception:
            pass

        return {"ok": True, "removed": removed}
    except Exception as e:
        logger.exception("reset_config")
        raise HTTPException(503, f"复位失败: {e}") from e
