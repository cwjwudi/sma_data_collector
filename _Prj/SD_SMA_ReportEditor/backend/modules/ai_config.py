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
    if "llm_api_key" in patch:
        plain = patch.get("llm_api_key")
        if plain is None:
            pass
        elif plain == "":
            cur["llm_api_key_enc"] = None
        else:
            cur["llm_api_key_enc"] = secrets_mod.encrypt_secret(DATA_DIR, str(plain))
    cfg["ai_settings"] = cur
    _save_cfg(cfg)
    return cur


def decrypt_llm_api_key(settings: dict[str, Any]) -> str:
    return secrets_mod.decrypt_secret(DATA_DIR, settings.get("llm_api_key_enc"))


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
