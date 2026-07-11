"""完整配置包：数据源、模版、版式、签名库及客户端偏好字段。"""
from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.settings import DATA_DIR, LAYOUT_PRESETS_DIR, QUERY_SESSION_FILE, SIGNATURE_ASSETS_DIR, TEMPLATES_DIR
from modules import audit_log
from modules import config_import_export as cie
from modules import layout_preset_store, signature_asset_store, template_store

BUNDLE_VERSION = 3
MAX_BUNDLE_JSON_BYTES = 64 * 1024 * 1024
MAX_TEMPLATES = 500
MAX_LAYOUT_PRESETS = 200
MAX_SIGNATURE_ASSETS = 200
MAX_AUDIT_ENTRIES = 5000


def _is_template_summary_sidecar_name(path: Path) -> bool:
    """模版目录下的 `{id}.meta.json` 仅为列表摘要，不得进入备份包。"""
    return path.name.endswith(".meta.json")


def _looks_like_template_summary_payload(item: dict[str, Any]) -> bool:
    """
    识别误入备份的摘要对象（仅含 id/name/updatedAt/paperKind/orientation）。
    旧版导出曾把 *.meta.json 打进 templates[]，导入时会按同 id 覆盖完整模版，
    导致 layoutPresetId / 封面封尾引用全部丢失。
    """
    if not isinstance(item, dict):
        return False
    # 完整模版必有 schema / 画布 / 版式快照等字段
    full_markers = (
        "schemaVersion",
        "bodyPages",
        "elements",
        "layoutSnapshot",
        "coverLayoutSnapshot",
        "backLayoutSnapshot",
        "headerElements",
        "footerElements",
        "coverElements",
        "backElements",
        "layoutPresetId",
        "coverLayoutPresetId",
        "backLayoutPresetId",
    )
    if any(k in item for k in full_markers):
        return False
    keys = set(item.keys())
    summary_keys = {"id", "name", "updatedAt", "paperKind", "orientation"}
    return bool(keys) and keys.issubset(summary_keys)


def _load_json_files(directory: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not directory.exists():
        return out
    for path in sorted(directory.glob("*.json")):
        if _is_template_summary_sidecar_name(path):
            continue
        try:
            raw = path.read_text(encoding="utf-8")
            data = json.loads(raw)
            if isinstance(data, dict):
                out.append(data)
        except Exception:
            continue
    return out


def _dedupe_templates_prefer_full(templates: list[Any]) -> list[dict[str, Any]]:
    """
    同 id 多份时保留完整模版；跳过摘要 sidecar 误入项。
    兼容已流出的损坏备份（templates 中同时含完整 JSON 与 meta 摘要）。
    """
    by_id: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for item in templates:
        if not isinstance(item, dict):
            continue
        if _looks_like_template_summary_payload(item):
            continue
        tid = item.get("id")
        if not isinstance(tid, str) or not tid.strip():
            continue
        tid = tid.strip()
        prev = by_id.get(tid)
        if prev is None:
            by_id[tid] = item
            order.append(tid)
            continue
        # 已有一份时：若新项更「完整」（字段更多），则替换
        if len(item.keys()) >= len(prev.keys()):
            by_id[tid] = item
    return [by_id[i] for i in order]


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
    if int(data.get("bundle_version") or 0) >= 2:
        return True
    return any(
        isinstance(data.get(key), list)
        for key in ("templates", "layout_presets", "signature_assets", "audit_entries", "client_prefs")
    )


def extract_config_slice(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": data.get("schema_version"),
        "app_preferences": data.get("app_preferences"),
        "db_connections": data.get("db_connections"),
        "opcua_servers": data.get("opcua_servers"),
        "ai_settings": data.get("ai_settings"),
    }


def bundle_content_counts(bundle: dict[str, Any]) -> dict[str, Any]:
    """导出/导入清单用的内容计数。"""
    qs = bundle.get("query_sessions") if isinstance(bundle.get("query_sessions"), dict) else {}
    fav = qs.get("favorites") if isinstance(qs.get("favorites"), list) else []
    hist = qs.get("history") if isinstance(qs.get("history"), list) else []
    ai = bundle.get("ai_settings")
    return {
        "db_connections": len(bundle.get("db_connections") or [])
        if isinstance(bundle.get("db_connections"), list)
        else 0,
        "opcua_servers": len(bundle.get("opcua_servers") or [])
        if isinstance(bundle.get("opcua_servers"), list)
        else 0,
        "templates": len(bundle.get("templates") or []) if isinstance(bundle.get("templates"), list) else 0,
        "layout_presets": len(bundle.get("layout_presets") or [])
        if isinstance(bundle.get("layout_presets"), list)
        else 0,
        "signature_assets": len(bundle.get("signature_assets") or [])
        if isinstance(bundle.get("signature_assets"), list)
        else 0,
        "audit_entries": len(bundle.get("audit_entries") or [])
        if isinstance(bundle.get("audit_entries"), list)
        else 0,
        "query_session_favorites": len(fav),
        "query_session_history": len(hist),
        "has_ai_settings": isinstance(ai, dict) and bool(ai),
        "has_client_prefs": bool(bundle.get("client_prefs")),
    }


def _query_sessions_path(data_dir: Path | None) -> Path:
    if data_dir is not None:
        return Path(data_dir) / "query_sessions.json"
    return QUERY_SESSION_FILE


def _load_query_sessions(data_dir: Path | None) -> dict[str, Any]:
    path = _query_sessions_path(data_dir)
    empty = {"favorites": [], "history": []}
    if not path.exists():
        return empty
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return empty
        fav = raw.get("favorites") if isinstance(raw.get("favorites"), list) else []
        hist = raw.get("history") if isinstance(raw.get("history"), list) else []
        return {
            "favorites": [str(x) for x in fav if isinstance(x, str)][:200],
            "history": [str(x) for x in hist if isinstance(x, str)][:500],
        }
    except Exception:
        return empty


def _save_query_sessions(
    data_dir: Path | None,
    incoming: dict[str, Any] | None,
    *,
    replace: bool,
) -> dict[str, int]:
    path = _query_sessions_path(data_dir)
    empty = {"favorites": [], "history": []}
    if not isinstance(incoming, dict):
        if replace:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(empty, ensure_ascii=False, indent=2), encoding="utf-8")
            return {"favorites": 0, "history": 0}
        return {"favorites": 0, "history": 0}

    fav_in = incoming.get("favorites") if isinstance(incoming.get("favorites"), list) else []
    hist_in = incoming.get("history") if isinstance(incoming.get("history"), list) else []
    fav_in = [str(x) for x in fav_in if isinstance(x, str)]
    hist_in = [str(x) for x in hist_in if isinstance(x, str)]

    if replace:
        data = {"favorites": fav_in[:200], "history": hist_in[:500]}
    else:
        cur = _load_query_sessions(data_dir)
        # 去重保序：导入项优先靠前
        fav = list(dict.fromkeys([*fav_in, *cur["favorites"]]))[:200]
        hist = list(dict.fromkeys([*hist_in, *cur["history"]]))[:500]
        data = {"favorites": fav, "history": hist}

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"favorites": len(data["favorites"]), "history": len(data["history"])}


def build_export_bundle(
    cfg: dict[str, Any],
    *,
    mask_conn,
    mask_opcua,
    mode: str,
    data_dir: Path | None = None,
    decrypt_db=None,
    decrypt_opcua=None,
    client_prefs: dict[str, Any] | None = None,
    include_audit: bool | None = None,
) -> dict[str, Any]:
    share = mode == "share"
    # 分享包默认不含审计与本机口令；本机备份包默认含审计。
    want_audit = (not share) if include_audit is None else bool(include_audit)
    if share:
        base = cie.export_share_shape(cfg, mask_conn, mask_opcua)
        ai_settings: dict[str, Any] = {}
        query_sessions: dict[str, Any] = {"favorites": [], "history": []}
    else:
        base = cie.normalize_top_level(copy.deepcopy(cfg))
        dbs = []
        for c in base.get("db_connections") or []:
            if isinstance(c, dict):
                if data_dir is not None and decrypt_db is not None:
                    dbs.append(cie.export_credential_row_for_bundle(data_dir, c, decrypt_db))
                else:
                    row = dict(c)
                    row.pop("has_password", None)
                    dbs.append(row)
        opcs = []
        for s in base.get("opcua_servers") or []:
            if isinstance(s, dict):
                if data_dir is not None and decrypt_opcua is not None:
                    opcs.append(cie.export_credential_row_for_bundle(data_dir, s, decrypt_opcua))
                else:
                    row = dict(s)
                    row.pop("has_password", None)
                    opcs.append(row)
        base["db_connections"] = dbs
        base["opcua_servers"] = opcs
        if data_dir is not None:
            ai_settings = cie.export_ai_settings_for_bundle(data_dir, base.get("ai_settings"))
        else:
            ai_settings = copy.deepcopy(base.get("ai_settings") or {})
            if isinstance(ai_settings, dict):
                ai_settings.pop("llm_api_key_enc", None)
                ai_settings.pop("agent_token_enc", None)
        query_sessions = _load_query_sessions(data_dir)

    audit_entries: list[dict[str, Any]] = []
    if want_audit:
        try:
            audit_entries = audit_log.export_audit(data_dir or DATA_DIR)
        except Exception:
            audit_entries = []

    return {
        "bundle_version": BUNDLE_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "export_mode": mode,
        "schema_version": base.get("schema_version", cie.CURRENT_SCHEMA_VERSION),
        "app_preferences": copy.deepcopy(base.get("app_preferences") or {}),
        "db_connections": copy.deepcopy(base.get("db_connections") or []),
        "opcua_servers": copy.deepcopy(base.get("opcua_servers") or []),
        "ai_settings": copy.deepcopy(ai_settings) if isinstance(ai_settings, dict) else {},
        "query_sessions": copy.deepcopy(query_sessions),
        "templates": _load_json_files(TEMPLATES_DIR),
        "layout_presets": _load_json_files(LAYOUT_PRESETS_DIR),
        "signature_assets": _load_json_files(SIGNATURE_ASSETS_DIR),
        "audit_entries": audit_entries,
        "client_prefs": copy.deepcopy(client_prefs) if isinstance(client_prefs, dict) else {},
    }


def validate_bundle_payload(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("配置须为 JSON 对象")
    slice_cfg = extract_config_slice(data)
    cie.validate_import_payload(slice_cfg)

    templates = data.get("templates")
    layouts = data.get("layout_presets")
    signatures = data.get("signature_assets")
    audit_entries = data.get("audit_entries")
    client_prefs = data.get("client_prefs")

    if templates is None:
        templates = []
    if layouts is None:
        layouts = []
    if signatures is None:
        signatures = []
    if audit_entries is None:
        audit_entries = []
    if not isinstance(templates, list):
        raise ValueError("templates 须为数组")
    if not isinstance(layouts, list):
        raise ValueError("layout_presets 须为数组")
    if not isinstance(signatures, list):
        raise ValueError("signature_assets 须为数组")
    if not isinstance(audit_entries, list):
        raise ValueError("audit_entries 须为数组")
    if client_prefs is not None and not isinstance(client_prefs, dict):
        raise ValueError("client_prefs 须为对象")

    if len(templates) > MAX_TEMPLATES:
        raise ValueError("模版数量超过上限")
    if len(layouts) > MAX_LAYOUT_PRESETS:
        raise ValueError("版式数量超过上限")
    if len(signatures) > MAX_SIGNATURE_ASSETS:
        raise ValueError("签名库数量超过上限")
    if len(audit_entries) > MAX_AUDIT_ENTRIES:
        audit_entries = audit_entries[-MAX_AUDIT_ENTRIES:]

    # 过滤误入的摘要 sidecar，避免后续导入覆盖完整模版
    if isinstance(templates, list):
        templates = _dedupe_templates_prefer_full(templates)

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
    out["audit_entries"] = audit_entries
    out["client_prefs"] = client_prefs if isinstance(client_prefs, dict) else {}
    return out


def _import_asset_lists(
    incoming: dict[str, Any],
    *,
    replace_assets: bool,
    data_dir: Path | None = None,
) -> dict[str, int]:
    templates_raw = incoming.get("templates") or []
    layouts = incoming.get("layout_presets") or []
    signatures = incoming.get("signature_assets") or []
    audit_entries = incoming.get("audit_entries") or []
    # 先导入版式再导入模版，便于模版引用的版式 ID 已落盘
    templates = _dedupe_templates_prefer_full(templates_raw if isinstance(templates_raw, list) else [])

    if replace_assets:
        _clear_json_directory(TEMPLATES_DIR)
        _clear_json_directory(LAYOUT_PRESETS_DIR)
        _clear_json_directory(SIGNATURE_ASSETS_DIR)

    audit_count = 0
    try:
        audit_count = audit_log.import_audit_entries(
            data_dir or DATA_DIR,
            audit_entries,
            replace=replace_assets,
        )
    except Exception:
        audit_count = 0

    layout_n = layout_preset_store.import_presets_bulk(layouts if isinstance(layouts, list) else [])
    template_n = template_store.migrate_from_payload_list(templates)
    return {
        "templates": template_n,
        "layout_presets": layout_n,
        "signature_assets": _import_signatures_bulk(signatures),
        "audit_entries": audit_count,
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
    *,
    data_dir: Path | None = None,
    **credential_kwargs: Any,
) -> tuple[dict[str, Any], dict[str, Any]]:
    bundle = validate_bundle_payload(incoming)
    replace_assets = mode == "replace"
    cfg_slice = extract_config_slice(bundle)
    # import_credential_kwargs 会把 data_dir 一并塞进 **kwargs；本函数已用命名参数
    # 收下 data_dir，须再显式传给 apply_import_*，否则口令无法重新加密（password 被丢弃）。
    cred = credential_kwargs if data_dir is not None else {}

    import_warnings: list[str] = []
    if mode == "replace":
        merged_cfg, import_warnings = cie.apply_import_replace(
            cfg_slice, data_dir=data_dir, **cred
        )
    else:
        merged_cfg, import_warnings = cie.apply_import_merge(
            current, cfg_slice, data_dir=data_dir, **cred
        )

    counts = _import_asset_lists(bundle, replace_assets=replace_assets, data_dir=data_dir)
    qs_counts = _save_query_sessions(
        data_dir,
        bundle.get("query_sessions") if isinstance(bundle.get("query_sessions"), dict) else None,
        replace=replace_assets,
    )
    client_prefs = copy.deepcopy(bundle.get("client_prefs") or {})

    layout_ids = {
        str(x.get("id")).strip()
        for x in (bundle.get("layout_presets") or [])
        if isinstance(x, dict) and isinstance(x.get("id"), str) and str(x.get("id")).strip()
    }
    for t in bundle.get("templates") or []:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name") or t.get("id") or "未命名模版")
        for label, key in (
            ("正文版式", "layoutPresetId"),
            ("封面版式", "coverLayoutPresetId"),
            ("封尾版式", "backLayoutPresetId"),
        ):
            rid = t.get(key)
            if isinstance(rid, str) and rid.strip() and rid.strip() not in layout_ids:
                import_warnings.append(f"模版「{name}」的{label}引用缺失：{rid.strip()[:8]}…")

    stats = {
        "db_connections": len(merged_cfg.get("db_connections") or []),
        "opcua_servers": len(merged_cfg.get("opcua_servers") or []),
        "templates": counts["templates"],
        "layout_presets": counts["layout_presets"],
        "signature_assets": counts["signature_assets"],
        "audit_entries": counts.get("audit_entries", 0),
        "query_session_favorites": qs_counts.get("favorites", 0),
        "query_session_history": qs_counts.get("history", 0),
        "has_ai_settings": bool(merged_cfg.get("ai_settings")),
        "has_client_prefs": bool(client_prefs),
    }
    return merged_cfg, {
        "client_prefs": client_prefs,
        "imported": stats,
        "warnings": cie.format_import_warnings(import_warnings),
    }
