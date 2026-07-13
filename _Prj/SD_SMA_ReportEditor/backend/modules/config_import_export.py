"""配置导出形态、导入校验与合并（与 config_store 配合）。"""
from __future__ import annotations

import copy
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

MAX_DB_CONNECTIONS = 500
MAX_OPCUA_SERVERS = 200
MAX_IMPORT_JSON_BYTES = 2 * 1024 * 1024
CURRENT_SCHEMA_VERSION = 1

# 与 AppPreferencesPatch / DEFAULT_CONFIG 对齐的可迁移偏好键
# 注：demo_preferred_channel / demo_remote_* 已退役，不再导入导出；旧 config 残留键读取不炸即可
APP_PREFERENCE_KEYS: tuple[str, ...] = (
    "auto_select_last_connection",
    "default_connection_id",
    "last_connection_id",
    "auto_select_last_opcua_server",
    "default_opcua_server_id",
    "last_opcua_server_id",
    "connection_probe_enabled",
    "connection_probe_interval_sec",
    "datasource_locked",
)


def merge_app_preferences(
    current: dict[str, Any] | None,
    incoming: dict[str, Any] | None,
    *,
    replace: bool = False,
) -> dict[str, Any]:
    """合并 app_preferences：仅迁移白名单字段。"""
    base: dict[str, Any] = {} if replace else dict(current or {})
    if not isinstance(incoming, dict):
        return base
    for k in APP_PREFERENCE_KEYS:
        if k in incoming:
            base[k] = incoming[k]
    return base


def export_ai_settings_for_bundle(data_dir: Path, ai_raw: dict[str, Any] | None) -> dict[str, Any]:
    """本机备份：AI 密钥解成明文临时字段，便于跨机重加密。"""
    from modules import secrets as secrets_mod
    from modules.ai_config import normalize_ai_settings

    out = normalize_ai_settings(ai_raw if isinstance(ai_raw, dict) else {})
    enc_key = out.pop("llm_api_key_enc", None)
    if enc_key:
        try:
            plain = secrets_mod.decrypt_secret(data_dir, enc_key)
            if plain:
                out["llm_api_key"] = plain
        except ValueError:
            pass
    enc_token = out.pop("agent_token_enc", None)
    if enc_token:
        try:
            plain = secrets_mod.decrypt_secret(data_dir, enc_token)
            if plain:
                out["agent_token"] = plain
                if not out.get("agent_token_hint") and len(plain) >= 4:
                    out["agent_token_hint"] = plain[-4:]
        except ValueError:
            pass
    return out


def import_ai_settings(
    data_dir: Path | None,
    incoming: dict[str, Any] | None,
    old: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], str | None]:
    """导入 AI 设置；明文密钥用当前 data_dir 重加密。"""
    from modules import secrets as secrets_mod
    from modules.ai_config import DEFAULT_AI_SETTINGS, normalize_ai_settings

    base = normalize_ai_settings(old if isinstance(old, dict) else {})
    if not isinstance(incoming, dict):
        return base, None

    warn: str | None = None
    merged = dict(base)
    for k in DEFAULT_AI_SETTINGS:
        if k in ("llm_api_key_enc", "agent_token_enc"):
            continue
        if k in incoming:
            merged[k] = incoming[k]

    def _import_secret(plain_key: str, enc_key: str) -> None:
        nonlocal warn
        if plain_key in incoming:
            plain = incoming.get(plain_key)
            if plain is None:
                return
            if plain == "" or data_dir is None:
                merged[enc_key] = None
            else:
                merged[enc_key] = secrets_mod.encrypt_secret(data_dir, str(plain))
            return
        enc = incoming.get(enc_key)
        if not enc:
            return
        if data_dir is None:
            merged[enc_key] = enc
            return
        try:
            secrets_mod.decrypt_secret(data_dir, enc)
            merged[enc_key] = enc
        except ValueError:
            if old and old.get(enc_key):
                try:
                    secrets_mod.decrypt_secret(data_dir, old[enc_key])
                    merged[enc_key] = old[enc_key]
                    warn = "ai:kept_local_secrets"
                    return
                except ValueError:
                    pass
            merged[enc_key] = None
            warn = "ai:foreign_secrets"

    _import_secret("llm_api_key", "llm_api_key_enc")
    _import_secret("agent_token", "agent_token_enc")
    if merged.get("agent_token_enc") and not merged.get("agent_token_hint"):
        # hint 仅展示用；无明文时保留导入值
        pass
    merged.pop("llm_api_key", None)
    merged.pop("agent_token", None)
    return normalize_ai_settings(merged), warn


def normalize_top_level(cfg: dict[str, Any]) -> dict[str, Any]:
    """保证顶层键存在（就地修改副本）。"""
    out = dict(cfg)
    out.setdefault("schema_version", CURRENT_SCHEMA_VERSION)
    out.setdefault("db_connections", [])
    out.setdefault("opcua_servers", [])
    prefs = out.get("app_preferences")
    if not isinstance(prefs, dict):
        prefs = {}
    for k in (
        "auto_select_last_connection",
        "default_connection_id",
        "last_connection_id",
        "auto_select_last_opcua_server",
        "default_opcua_server_id",
        "last_opcua_server_id",
    ):
        if k.startswith("auto_"):
            prefs.setdefault(k, True)
        else:
            prefs.setdefault(k, None)
    prefs.setdefault("connection_probe_enabled", False)
    prefs.setdefault("connection_probe_interval_sec", 30)
    prefs.setdefault("datasource_locked", False)
    out["app_preferences"] = prefs
    ai = out.get("ai_settings")
    if not isinstance(ai, dict):
        ai = {}
    ai.setdefault("enabled", False)
    ai.setdefault("llm_base_url", "https://api.openai.com/v1")
    ai.setdefault("llm_model", "gpt-4o-mini")
    ai.setdefault("allow_lan_access", False)
    ai.setdefault("write_tools_enabled", False)
    out["ai_settings"] = ai
    return out


def export_share_shape(cfg: dict[str, Any], mask_conn, mask_opcua) -> dict[str, Any]:
    """脱敏导出：与前端列表一致的掩码字段。"""
    base = normalize_top_level(copy.deepcopy(cfg))
    dbs = []
    for c in base.get("db_connections") or []:
        if isinstance(c, dict):
            dbs.append(mask_conn(c))
    opcs = []
    for s in base.get("opcua_servers") or []:
        if isinstance(s, dict):
            opcs.append(mask_opcua(s))
    return {
        "schema_version": base.get("schema_version", CURRENT_SCHEMA_VERSION),
        "app_preferences": copy.deepcopy(base.get("app_preferences") or {}),
        "db_connections": dbs,
        "opcua_servers": opcs,
    }


def _strip_response_only_keys(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    out.pop("has_password", None)
    out.pop("password", None)
    return out


DecryptFn = Callable[[Path, dict[str, Any]], str]
EncryptFn = Callable[[Path, str | None], str | None]


def export_credential_row_for_bundle(
    data_dir: Path,
    row: dict[str, Any],
    decrypt_fn: DecryptFn,
) -> dict[str, Any]:
    """本机备份导出：写入明文 password，便于在另一台电脑导入后重新加密。"""
    out = _strip_response_only_keys(dict(row))
    enc = out.pop("password_enc", None)
    if enc:
        try:
            plain = decrypt_fn(data_dir, row)
            if plain:
                out["password"] = plain
        except ValueError:
            pass
    return out


def _resolve_import_credentials(
    data_dir: Path,
    imp_raw: dict[str, Any],
    old: dict[str, Any] | None,
    encrypt_fn: EncryptFn,
    decrypt_fn: DecryptFn,
) -> tuple[dict[str, Any], str | None]:
    """
    将导入行中的口令转为当前 data_dir 的 password_enc。
    返回 {password_enc?, clear_password?} 与可选告警码。
    """
    if "password" in imp_raw:
        plain = imp_raw.get("password")
        if plain is None:
            return {}, None
        if plain == "":
            return {"clear_password": True}, None
        return {"password_enc": encrypt_fn(data_dir, str(plain))}, None

    incoming_enc = imp_raw.get("password_enc")
    if incoming_enc:
        try:
            decrypt_fn(data_dir, {"password_enc": incoming_enc})
            return {"password_enc": incoming_enc}, None
        except ValueError:
            if old and old.get("password_enc"):
                try:
                    decrypt_fn(data_dir, old)
                    return {"password_enc": old["password_enc"]}, "kept_local_password"
                except ValueError:
                    pass
            return {"clear_password": True}, "foreign_password_enc"

    if imp_raw.get("has_password") is False:
        return {"clear_password": True}, None

    return {}, None


def _merge_row(
    old: dict[str, Any],
    imp_raw: dict[str, Any],
    *,
    data_dir: Path | None = None,
    encrypt_fn: EncryptFn | None = None,
    decrypt_fn: DecryptFn | None = None,
) -> tuple[dict[str, Any], str | None]:
    """合并单条连接/OPC UA：支持跨机导入的明文 password 与本机 password_enc。"""
    warn: str | None = None
    cred: dict[str, Any] = {}
    if data_dir is not None and encrypt_fn is not None and decrypt_fn is not None:
        cred, warn = _resolve_import_credentials(data_dir, imp_raw, old, encrypt_fn, decrypt_fn)

    imp = _strip_response_only_keys(dict(imp_raw))
    merged = {**old}
    for k, v in imp.items():
        if k == "password_enc":
            continue
        merged[k] = v

    if cred.get("clear_password"):
        merged.pop("password_enc", None)
    elif cred.get("password_enc") is not None:
        merged["password_enc"] = cred["password_enc"]
    elif imp_raw.get("password_enc") is not None and warn != "foreign_password_enc":
        merged["password_enc"] = imp_raw["password_enc"]
    elif imp_raw.get("has_password") is False:
        merged.pop("password_enc", None)
    else:
        if old.get("password_enc") is not None:
            merged["password_enc"] = old["password_enc"]
        else:
            merged.pop("password_enc", None)

    merged.pop("has_password", None)
    merged.pop("password", None)
    return merged, warn


def merge_id_rows(
    existing: list[dict[str, Any]],
    incoming: list[Any],
    *,
    data_dir: Path | None = None,
    encrypt_db: EncryptFn | None = None,
    decrypt_db: DecryptFn | None = None,
    encrypt_opcua: EncryptFn | None = None,
    decrypt_opcua: DecryptFn | None = None,
    row_kind: str = "db",
) -> tuple[list[dict[str, Any]], list[str]]:
    """按 id 更新已有项；未知 id 追加；未出现在导入中的本地项保留。"""
    encrypt_fn = encrypt_db if row_kind == "db" else encrypt_opcua
    decrypt_fn = decrypt_db if row_kind == "db" else decrypt_opcua
    warnings: list[str] = []
    out: list[dict[str, Any]] = [dict(x) for x in existing if isinstance(x, dict)]
    idx_by_id = {str(c.get("id")): i for i, c in enumerate(out) if c.get("id")}

    for imp_raw in incoming:
        if not isinstance(imp_raw, dict):
            continue
        imp_id = imp_raw.get("id")
        if imp_id and str(imp_id) in idx_by_id:
            i = idx_by_id[str(imp_id)]
            merged, w = _merge_row(
                out[i],
                imp_raw,
                data_dir=data_dir,
                encrypt_fn=encrypt_fn,
                decrypt_fn=decrypt_fn,
            )
            out[i] = merged
            if w:
                warnings.append(f"{row_kind}:{imp_id}:{w}")
            continue
        row, w = _merge_row(
            {},
            imp_raw,
            data_dir=data_dir,
            encrypt_fn=encrypt_fn,
            decrypt_fn=decrypt_fn,
        )
        row["id"] = str(row.get("id") or uuid.uuid4())
        if not row.get("password_enc"):
            row.pop("password_enc", None)
        out.append(row)
        idx_by_id[row["id"]] = len(out) - 1
        if w:
            warnings.append(f"{row_kind}:{row['id']}:{w}")
    return out, warnings


def validate_import_payload(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("配置须为 JSON 对象")
    dbs = data.get("db_connections")
    opcs = data.get("opcua_servers")
    if dbs is None:
        dbs = []
    if opcs is None:
        opcs = []
    if not isinstance(dbs, list) or not isinstance(opcs, list):
        raise ValueError("db_connections 与 opcua_servers 须为数组（可省略空数组）")
    if len(dbs) > MAX_DB_CONNECTIONS or len(opcs) > MAX_OPCUA_SERVERS:
        raise ValueError("连接或 OPC UA 数量超过上限")
    for i, c in enumerate(dbs):
        if not isinstance(c, dict):
            raise ValueError(f"db_connections[{i}] 须为对象")
        if not (c.get("engine") or "").strip():
            raise ValueError(f"db_connections[{i}] 缺少 engine")
    for i, s in enumerate(opcs):
        if not isinstance(s, dict):
            raise ValueError(f"opcua_servers[{i}] 须为对象")
    return {**data, "db_connections": dbs, "opcua_servers": opcs}


def apply_import_merge(
    current: dict[str, Any],
    incoming: dict[str, Any],
    *,
    data_dir: Path | None = None,
    encrypt_db: EncryptFn | None = None,
    decrypt_db: DecryptFn | None = None,
    encrypt_opcua: EncryptFn | None = None,
    decrypt_opcua: DecryptFn | None = None,
) -> tuple[dict[str, Any], list[str]]:
    cur = normalize_top_level(copy.deepcopy(current))
    inc = validate_import_payload(incoming)
    warnings: list[str] = []
    dbs, w1 = merge_id_rows(
        cur.get("db_connections") or [],
        inc.get("db_connections") or [],
        data_dir=data_dir,
        encrypt_db=encrypt_db,
        decrypt_db=decrypt_db,
        row_kind="db",
    )
    opcs, w2 = merge_id_rows(
        cur.get("opcua_servers") or [],
        inc.get("opcua_servers") or [],
        data_dir=data_dir,
        encrypt_opcua=encrypt_opcua,
        decrypt_opcua=decrypt_opcua,
        row_kind="opcua",
    )
    cur["db_connections"] = dbs
    cur["opcua_servers"] = opcs
    warnings.extend(w1)
    warnings.extend(w2)
    cur["app_preferences"] = merge_app_preferences(
        cur.get("app_preferences"),
        inc.get("app_preferences") if isinstance(inc.get("app_preferences"), dict) else None,
        replace=False,
    )
    ai_merged, ai_warn = import_ai_settings(
        data_dir,
        inc.get("ai_settings") if isinstance(inc.get("ai_settings"), dict) else None,
        cur.get("ai_settings") if isinstance(cur.get("ai_settings"), dict) else None,
    )
    cur["ai_settings"] = ai_merged
    if ai_warn:
        warnings.append(ai_warn)
    if isinstance(inc.get("schema_version"), int):
        cur["schema_version"] = max(int(cur.get("schema_version") or 1), int(inc["schema_version"]))
    return cur, warnings


def apply_import_replace(
    incoming: dict[str, Any],
    *,
    data_dir: Path | None = None,
    encrypt_db: EncryptFn | None = None,
    decrypt_db: DecryptFn | None = None,
    encrypt_opcua: EncryptFn | None = None,
    decrypt_opcua: DecryptFn | None = None,
) -> tuple[dict[str, Any], list[str]]:
    inc = validate_import_payload(incoming)
    prefs = merge_app_preferences(
        None,
        inc.get("app_preferences") if isinstance(inc.get("app_preferences"), dict) else {},
        replace=True,
    )
    # 核心连接选中字段默认值
    prefs.setdefault("auto_select_last_connection", True)
    prefs.setdefault("auto_select_last_opcua_server", True)
    sv = inc.get("schema_version")
    if not isinstance(sv, int):
        sv = CURRENT_SCHEMA_VERSION
    warnings: list[str] = []
    dbs, w1 = merge_id_rows(
        [],
        inc.get("db_connections") or [],
        data_dir=data_dir,
        encrypt_db=encrypt_db,
        decrypt_db=decrypt_db,
        row_kind="db",
    )
    opcs, w2 = merge_id_rows(
        [],
        inc.get("opcua_servers") or [],
        data_dir=data_dir,
        encrypt_opcua=encrypt_opcua,
        decrypt_opcua=decrypt_opcua,
        row_kind="opcua",
    )
    warnings.extend(w1)
    warnings.extend(w2)
    ai_merged, ai_warn = import_ai_settings(
        data_dir,
        inc.get("ai_settings") if isinstance(inc.get("ai_settings"), dict) else {},
        None,
    )
    if ai_warn:
        warnings.append(ai_warn)
    out: dict[str, Any] = {
        "schema_version": int(sv),
        "app_preferences": prefs,
        "db_connections": dbs,
        "opcua_servers": opcs,
        "ai_settings": ai_merged,
    }
    return normalize_top_level(out), warnings


def import_credential_kwargs(data_dir: Path) -> dict[str, Any]:
    """供 config_bundle / settings 传入 merge 的加解密回调。"""
    from modules import config_store

    return {
        "data_dir": data_dir,
        "encrypt_db": config_store.encrypt_db_password,
        "decrypt_db": config_store.decrypt_db_password,
        "encrypt_opcua": config_store.encrypt_opcua_password,
        "decrypt_opcua": config_store.decrypt_opcua_password,
    }


def format_import_warnings(warnings: list[str]) -> list[str]:
    """将内部告警码转为用户可读说明。"""
    out: list[str] = []
    foreign_db = 0
    foreign_opc = 0
    kept = 0
    ai_foreign = False
    ai_kept = False
    for w in warnings:
        if w.endswith(":foreign_password_enc"):
            if w.startswith("db:"):
                foreign_db += 1
            elif w.startswith("opcua:"):
                foreign_opc += 1
        elif w.endswith(":kept_local_password"):
            kept += 1
        elif w == "ai:foreign_secrets":
            ai_foreign = True
        elif w == "ai:kept_local_secrets":
            ai_kept = True
    if foreign_db:
        out.append(f"{foreign_db} 条数据库连接口令来自其它电脑且无法解密，已清空密文，请在数据源中重新输入密码。")
    if foreign_opc:
        out.append(f"{foreign_opc} 条 OPC UA 口令来自其它电脑且无法解密，已清空密文，请重新输入。")
    if kept:
        out.append(f"{kept} 条连接保留了本机原有口令（导入包中的旧密文无效）。")
    if ai_foreign:
        out.append("AI 助手密钥来自其它电脑且无法解密，已清空，请在设置中重新填写。")
    if ai_kept:
        out.append("AI 助手密钥保留了本机原有密文（导入包中的旧密文无效）。")
    return out
