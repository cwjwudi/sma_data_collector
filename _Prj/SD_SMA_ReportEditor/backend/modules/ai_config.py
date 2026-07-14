"""AI 助手与 OpenAI 兼容网关配置（config.json → ai_settings）。"""
from __future__ import annotations

import ipaddress
import secrets
import socket
from pathlib import Path
from typing import Any

from core.settings import CONFIG_FILE, DATA_DIR
from modules import config_store, secrets as secrets_mod

DEFAULT_AI_SETTINGS: dict[str, Any] = {
    "enabled": False,
    "llm_base_url": "https://api.openai.com/v1",
    "llm_model": "gpt-4o-mini",
    "llm_api_key_enc": None,
    "agent_token_enc": None,
    "agent_token_hint": "",
    "allow_lan_access": False,
    "write_tools_enabled": False,
    "disabled_tools": [],
}

DEFAULT_BACKEND_PORT = 8000


def normalize_ai_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    out = dict(DEFAULT_AI_SETTINGS)
    if isinstance(raw, dict):
        for k in DEFAULT_AI_SETTINGS:
            if k in raw:
                out[k] = raw[k]
    base = str(out.get("llm_base_url") or "").strip().rstrip("/")
    out["llm_base_url"] = base or DEFAULT_AI_SETTINGS["llm_base_url"]
    model = str(out.get("llm_model") or "").strip()
    out["llm_model"] = model or DEFAULT_AI_SETTINGS["llm_model"]
    out["agent_token_hint"] = str(out.get("agent_token_hint") or "")[:8]
    raw_disabled = out.get("disabled_tools")
    if isinstance(raw_disabled, list):
        out["disabled_tools"] = sorted({str(x).strip() for x in raw_disabled if str(x).strip()})
    else:
        out["disabled_tools"] = []
    return out


def _load_cfg() -> dict[str, Any]:
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _save_cfg(cfg: dict[str, Any]) -> None:
    config_store.save_config(CONFIG_FILE, cfg)


def load_ai_settings() -> dict[str, Any]:
    cfg = _load_cfg()
    return normalize_ai_settings(cfg.get("ai_settings"))


def save_ai_settings(patch: dict[str, Any]) -> dict[str, Any]:
    cfg = _load_cfg()
    cur = normalize_ai_settings(cfg.get("ai_settings"))
    for k, v in patch.items():
        if k in DEFAULT_AI_SETTINGS and k not in ("llm_api_key_enc", "agent_token_enc"):
            cur[k] = v
    if "disabled_tools" in patch and isinstance(patch.get("disabled_tools"), list):
        cur["disabled_tools"] = sorted({str(x).strip() for x in patch["disabled_tools"] if str(x).strip()})
    if "llm_api_key" in patch:
        plain = patch.get("llm_api_key")
        if plain is None:
            pass
        elif plain == "":
            # 已有密钥时忽略空串，避免升级/误保存清空
            if not cur.get("llm_api_key_enc"):
                cur["llm_api_key_enc"] = None
        else:
            cur["llm_api_key_enc"] = secrets_mod.encrypt_secret(DATA_DIR, str(plain))
    cfg["ai_settings"] = cur
    _save_cfg(cfg)
    return cur


def try_decrypt_llm_api_key(data_dir: Path, settings: dict[str, Any] | None) -> str:
    """解密失败时返回空串（迁移/探测用，不抛错）。"""
    enc = (settings or {}).get("llm_api_key_enc")
    if not enc:
        return ""
    try:
        return secrets_mod.decrypt_secret(data_dir, enc)
    except Exception:
        return ""


def decrypt_llm_api_key(settings: dict[str, Any]) -> str:
    return secrets_mod.decrypt_secret(DATA_DIR, settings.get("llm_api_key_enc"))


LEGACY_DATA_DIR_NAMES = ("sd-sma-report-editor",)


def resolve_legacy_backend_data_dirs(current_data_dir: Path | None = None) -> list[Path]:
    """推断旧版（无 -ai 后缀）backend-data 路径。"""
    cur = (current_data_dir or DATA_DIR).resolve()
    out: list[Path] = []
    # …/sd-sma-report-editor-ai/backend-data → …/sd-sma-report-editor/backend-data
    parent = cur.parent  # userData folder
    appdata = parent.parent
    for name in LEGACY_DATA_DIR_NAMES:
        cand = appdata / name / "backend-data"
        if cand.resolve() != cur and cand.is_dir():
            out.append(cand)
        # 开发态：backend/data 旁无 APPDATA 结构时，也试同级 sibling
        cand2 = parent / name / "backend-data"
        if cand2.resolve() != cur and cand2.is_dir() and cand2 not in out:
            out.append(cand2)
    return out


def maybe_migrate_ai_settings_from_legacy(*, data_dir: Path | None = None) -> dict[str, Any]:
    """
    若当前目录无可用 LLM Key，尝试从旧版 backend-data 迁入一次。
    返回 { migrated: bool, reason: str }。
    """
    target = (data_dir or DATA_DIR).resolve()
    cfg_path = target / "config.json"
    cfg = config_store.load_config(cfg_path, target)
    if cfg.get("ai_settings_migrated_from_legacy"):
        return {"migrated": False, "reason": "already_done"}

    cur_ai = normalize_ai_settings(cfg.get("ai_settings"))
    if try_decrypt_llm_api_key(target, cur_ai):
        cfg["ai_settings_migrated_from_legacy"] = True
        config_store.save_config(cfg_path, cfg)
        return {"migrated": False, "reason": "current_has_key"}

    for legacy_dir in resolve_legacy_backend_data_dirs(target):
        legacy_cfg_path = legacy_dir / "config.json"
        if not legacy_cfg_path.is_file():
            continue
        try:
            legacy_cfg = config_store.load_config(legacy_cfg_path, legacy_dir)
        except Exception:
            continue
        legacy_ai = normalize_ai_settings(legacy_cfg.get("ai_settings"))
        plain = try_decrypt_llm_api_key(legacy_dir, legacy_ai)
        if not plain:
            continue

        # 用当前目录 Fernet 重新加密
        cur_ai["llm_api_key_enc"] = secrets_mod.encrypt_secret(target, plain)
        # 仅当当前仍为默认/空时带上 URL/模型/启用
        if cur_ai.get("llm_base_url") in ("", DEFAULT_AI_SETTINGS["llm_base_url"]):
            if legacy_ai.get("llm_base_url"):
                cur_ai["llm_base_url"] = legacy_ai["llm_base_url"]
        if cur_ai.get("llm_model") in ("", DEFAULT_AI_SETTINGS["llm_model"]):
            if legacy_ai.get("llm_model"):
                cur_ai["llm_model"] = legacy_ai["llm_model"]
        if not cur_ai.get("enabled") and legacy_ai.get("enabled"):
            cur_ai["enabled"] = True

        cfg["ai_settings"] = cur_ai
        cfg["ai_settings_migrated_from_legacy"] = True
        config_store.save_config(cfg_path, cfg)
        return {"migrated": True, "reason": f"from:{legacy_dir}"}

    cfg["ai_settings_migrated_from_legacy"] = True
    config_store.save_config(cfg_path, cfg)
    return {"migrated": False, "reason": "no_legacy_key"}


FALLBACK_LLM_MODELS = (
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-4.1",
    "o4-mini",
    "o3-mini",
)


def list_fallback_llm_models() -> list[str]:
    return list(FALLBACK_LLM_MODELS)

def decrypt_agent_token(settings: dict[str, Any]) -> str:
    return secrets_mod.decrypt_secret(DATA_DIR, settings.get("agent_token_enc"))


def generate_agent_token() -> tuple[str, dict[str, Any]]:
    """生成新 Agent Token，返回 (明文一次, 更新后的 settings)。"""
    token = secrets.token_urlsafe(32)
    cfg = _load_cfg()
    cur = normalize_ai_settings(cfg.get("ai_settings"))
    cur["agent_token_enc"] = secrets_mod.encrypt_secret(DATA_DIR, token)
    cur["agent_token_hint"] = token[-4:] if len(token) >= 4 else token
    cfg["ai_settings"] = cur
    _save_cfg(cfg)
    return token, cur


def public_ai_settings(settings: dict[str, Any] | None = None, *, port: int = DEFAULT_BACKEND_PORT) -> dict[str, Any]:
    s = normalize_ai_settings(settings or load_ai_settings())
    loopback = f"http://127.0.0.1:{port}/v1"
    lan_ip = primary_lan_ip()
    lan_url = f"http://{lan_ip}:{port}/v1" if lan_ip else None
    return {
        "enabled": bool(s.get("enabled")),
        "llm_base_url": s.get("llm_base_url"),
        "llm_model": s.get("llm_model"),
        "has_llm_api_key": bool(s.get("llm_api_key_enc")),
        "has_agent_token": bool(s.get("agent_token_enc")),
        "agent_token_hint": s.get("agent_token_hint") or "",
        "allow_lan_access": bool(s.get("allow_lan_access")),
        "write_tools_enabled": bool(s.get("write_tools_enabled")),
        "agent_chat_url_loopback": loopback,
        "agent_chat_url_lan": lan_url,
        "ready": bool(s.get("enabled") and s.get("llm_api_key_enc")),
    }


def verify_agent_token(provided: str | None, settings: dict[str, Any] | None = None) -> bool:
    if not provided or not str(provided).strip():
        return False
    s = normalize_ai_settings(settings or load_ai_settings())
    expected = decrypt_agent_token(s)
    if not expected:
        return False
    return secrets.compare_digest(str(provided).strip(), expected)


def local_or_lan_ai_auth_error(
    client_host: str | None,
    bearer_token: str | None,
    settings: dict[str, Any] | None = None,
) -> str | None:
    """本机免 Token；局域网须 allow_lan_access + 有效 Agent Token。

    返回错误文案；None 表示通过。
    """
    if is_loopback_host(client_host):
        return None
    s = normalize_ai_settings(settings or load_ai_settings())
    if not client_may_access_agent_api(client_host, s):
        return (
            "应用内 AI 默认仅允许本机访问。若需局域网使用，请在设置中开启"
            "「允许局域网访问 Agent API 与应用内 AI」，并携带 Agent Token。"
        )
    if not verify_agent_token(bearer_token, s):
        return (
            "局域网访问应用内 AI 需要有效的 Agent Token。"
            "请在本机设置中生成并粘贴到浏览器，或改用 http://127.0.0.1:8000/。"
        )
    return None


def is_loopback_host(host: str | None) -> bool:
    if not host:
        return False
    h = host.strip().lower()
    if h in ("localhost", "127.0.0.1", "::1", "[::1]"):
        return True
    try:
        addr = ipaddress.ip_address(h.strip("[]"))
        return addr.is_loopback
    except ValueError:
        return False


def client_may_access_agent_api(client_host: str | None, settings: dict[str, Any] | None = None) -> bool:
    if is_loopback_host(client_host):
        return True
    s = normalize_ai_settings(settings or load_ai_settings())
    return bool(s.get("allow_lan_access"))


def primary_lan_ip() -> str | None:
    """与 Electron getServiceEndpoints 类似：取首个非 loopback IPv4。"""
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                return ip
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
        finally:
            s.close()
    except OSError:
        pass
    return None


def resolve_backend_port() -> int:
    raw = __import__("os").environ.get("REPORT_EDITOR_BACKEND_PORT", "").strip()
    if raw.isdigit():
        return int(raw)
    return DEFAULT_BACKEND_PORT
