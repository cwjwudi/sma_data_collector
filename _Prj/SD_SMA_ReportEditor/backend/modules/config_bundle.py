"""完整配置包：数据源、模版、版式、签名库及客户端偏好字段。"""
from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.settings import LAYOUT_PRESETS_DIR, SIGNATURE_ASSETS_DIR, TEMPLATES_DIR
from modules import config_import_export as cie
from modules import layout_preset_store, signature_asset_store, template_store

BUNDLE_VERSION = 2
MAX_BUNDLE_JSON_BYTES = 64 * 1024 * 1024
MAX_TEMPLATES = 500
MAX_LAYOUT_PRESETS = 200
MAX_SIGNATURE_ASSETS = 200


def _load_json_files(directory: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not directory.exists():
        return out
    for path in sorted(directory.glob("*.json")):
        try:
            raw = path.read_text(encoding="utf-8")
            data = json.loads(raw)
            if isinstance(data, dict):
                out.append(data)
        except Exception:
            continue
    return out


def _clear_json_directory(directory: Path) -> None:
    if not directory.exists():
        directory.mkdir(parents=True, exist_ok=True)
        return
    for path in directory.glob("*.json"):
        try:
            path.unlink()
        except OSError:
            pass


def is_bundle_payload(data: dict[str, Any]) -> bool:
    if int(data.get("bundle_version") or 0) >= BUNDLE_VERSION:
        return True
    return any(
        isinstance(data.get(key), list)
        for key in ("templates", "layout_presets", "signature_assets", "client_prefs")
    )


def extract_config_slice(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": data.get("schema_version"),
        "app_preferences": data.get("app_preferences"),
        "db_connections": data.get("db_connections"),
        "opcua_servers": data.get("opcua_servers"),
    }


def build_export_bundle(
    cfg: dict[str, Any],
    *,
    mask_conn,
    mask_opcua,
    mode: str,
) -> dict[str, Any]:
    share = mode == "share"
    if share:
        base = cie.export_share_shape(cfg, mask_conn, mask_opcua)
    else:
        base = cie.normalize_top_level(copy.deepcopy(cfg))
        dbs = []
        for c in base.get("db_connections") or []:
            if isinstance(c, dict):
                row = dict(c)
                row.pop("has_password", None)
                dbs.append(row)
        opcs = []
        for s in base.get("opcua_servers") or []:
            if isinstance(s, dict):
                row = dict(s)
                row.pop("has_password", None)
                opcs.append(row)
        base["db_connections"] = dbs
        base["opcua_servers"] = opcs

    return {
        "bundle_version": BUNDLE_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "export_mode": mode,
        "schema_version": base.get("schema_version", cie.CURRENT_SCHEMA_VERSION),
        "app_preferences": copy.deepcopy(base.get("app_preferences") or {}),
        "db_connections": copy.deepcopy(base.get("db_connections") or []),
        "opcua_servers": copy.deepcopy(base.get("opcua_servers") or []),
        "templates": _load_json_files(TEMPLATES_DIR),
        "layout_presets": _load_json_files(LAYOUT_PRESETS_DIR),
        "signature_assets": _load_json_files(SIGNATURE_ASSETS_DIR),
        "client_prefs": {},
    }


def validate_bundle_payload(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("配置须为 JSON 对象")
    slice_cfg = extract_config_slice(data)
    cie.validate_import_payload(slice_cfg)

    templates = data.get("templates")
    layouts = data.get("layout_presets")
    signatures = data.get("signature_assets")
    client_prefs = data.get("client_prefs")

    if templates is None:
        templates = []
    if layouts is None:
        layouts = []
    if signatures is None:
        signatures = []
    if not isinstance(templates, list):
        raise ValueError("templates 须为数组")
    if not isinstance(layouts, list):
        raise ValueError("layout_presets 须为数组")
    if not isinstance(signatures, list):
        raise ValueError("signature_assets 须为数组")
    if client_prefs is not None and not isinstance(client_prefs, dict):
        raise ValueError("client_prefs 须为对象")

    if len(templates) > MAX_TEMPLATES:
        raise ValueError("模版数量超过上限")
    if len(layouts) > MAX_LAYOUT_PRESETS:
        raise ValueError("版式数量超过上限")
    if len(signatures) > MAX_SIGNATURE_ASSETS:
        raise ValueError("签名库数量超过上限")

    for i, item in enumerate(templates):
        if not isinstance(item, dict):
            raise ValueError(f"templates[{i}] 须为对象")
    for i, item in enumerate(layouts):
        if not isinstance(item, dict):
            raise ValueError(f"layout_presets[{i}] 须为对象")
    for i, item in enumerate(signatures):
        if not isinstance(item, dict):
            raise ValueError(f"signature_assets[{i}] 须为对象")

    out = dict(data)
    out["templates"] = templates
    out["layout_presets"] = layouts
    out["signature_assets"] = signatures
    out["client_prefs"] = client_prefs if isinstance(client_prefs, dict) else {}
    return out


def _import_asset_lists(
    incoming: dict[str, Any],
    *,
    replace_assets: bool,
) -> dict[str, int]:
    templates = incoming.get("templates") or []
    layouts = incoming.get("layout_presets") or []
    signatures = incoming.get("signature_assets") or []

    if replace_assets:
        _clear_json_directory(TEMPLATES_DIR)
        _clear_json_directory(LAYOUT_PRESETS_DIR)
        _clear_json_directory(SIGNATURE_ASSETS_DIR)

    return {
        "templates": template_store.migrate_from_payload_list(templates),
        "layout_presets": layout_preset_store.import_presets_bulk(layouts),
        "signature_assets": _import_signatures_bulk(signatures),
    }


def _import_signatures_bulk(items: list[Any]) -> int:
    from schemas.signature_asset import SignatureAsset

    n = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            asset = SignatureAsset.model_validate(item)
            signature_asset_store.save_asset(asset)
            n += 1
        except Exception:
            continue
    return n


def apply_bundle_import(
    current: dict[str, Any],
    incoming: dict[str, Any],
    mode: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    bundle = validate_bundle_payload(incoming)
    replace_assets = mode == "replace"
    cfg_slice = extract_config_slice(bundle)

    if mode == "replace":
        merged_cfg = cie.apply_import_replace(cfg_slice)
    else:
        merged_cfg = cie.apply_import_merge(current, cfg_slice)

    counts = _import_asset_lists(bundle, replace_assets=replace_assets)
    client_prefs = copy.deepcopy(bundle.get("client_prefs") or {})
    stats = {
        "templates": counts["templates"],
        "layout_presets": counts["layout_presets"],
        "signature_assets": counts["signature_assets"],
        "has_client_prefs": bool(client_prefs),
    }
    return merged_cfg, {"client_prefs": client_prefs, "imported": stats}
