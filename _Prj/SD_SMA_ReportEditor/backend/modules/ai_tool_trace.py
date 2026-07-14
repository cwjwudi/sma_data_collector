"""AI 工具调用轨迹：脱敏摘要，供前端可观测展示。"""
from __future__ import annotations

from typing import Any

# 禁止进入轨迹的参数键（大小写不敏感匹配）
_SECRET_ARG_KEYS = frozenset(
    {
        "password",
        "passwd",
        "secret",
        "api_key",
        "apikey",
        "token",
        "llm_api_key",
        "agent_token",
        "backup_password",
        "import_password",
        "rebak_password",
        "cipher",
        "ciphertext",
    }
)

# 允许出现在 args_summary 的键（其余非密钥键最多保留短字符串）
_PREFERRED_ARG_KEYS = (
    "enabled",
    "interval_sec",
    "connection_id",
    "server_id",
    "template_id",
    "layout_id",
    "preset_id",
    "asset_id",
    "name",
    "path",
    "kind",
    "action",
)


def _is_secret_key(key: str) -> bool:
    k = key.strip().lower().replace("-", "_")
    if k in _SECRET_ARG_KEYS:
        return True
    if "password" in k or "secret" in k or k.endswith("_key") or k.endswith("token"):
        return True
    return False


def summarize_tool_args(args: dict[str, Any] | None, *, max_items: int = 8) -> dict[str, Any]:
    """生成可展示的参数摘要；剥离密钥类字段。"""
    if not isinstance(args, dict):
        return {}
    out: dict[str, Any] = {}
    # 优先白名单顺序
    for key in _PREFERRED_ARG_KEYS:
        if key not in args:
            continue
        if _is_secret_key(key):
            continue
        out[key] = _shorten_value(args[key])
        if len(out) >= max_items:
            return out
    for key, val in args.items():
        if key in out or _is_secret_key(str(key)):
            continue
        out[str(key)] = _shorten_value(val)
        if len(out) >= max_items:
            break
    return out


def _shorten_value(val: Any, *, max_len: int = 80) -> Any:
    if val is None or isinstance(val, (bool, int, float)):
        return val
    if isinstance(val, str):
        s = val.strip()
        if len(s) > max_len:
            return s[: max_len - 1] + "…"
        return s
    if isinstance(val, (list, tuple)):
        return f"[{len(val)} items]"
    if isinstance(val, dict):
        return f"{{{len(val)} keys}}"
    return str(val)[:max_len]


def tool_result_ok(result: Any) -> bool:
    """判断工具结果是否成功（供轨迹 UI）。

    - 显式 ``ok`` 字段：以其布尔值为准。
    - 无 ``ok`` 的读类成功载荷（如 list_templates 返回 templates/count）：
      无 ``error`` 则视为成功。此前误把这类结果标红「含失败」（现场截图 2026-07-13）。
    """
    if not isinstance(result, dict):
        # 非 dict 极少见；不当成功以免掩盖异常字符串
        return False
    if "ok" in result:
        return bool(result.get("ok"))
    err = result.get("error")
    if isinstance(err, str) and err.strip():
        return False
    if err is True:
        return False
    return True


def tool_result_message(result: Any) -> str:
    if not isinstance(result, dict):
        return ""
    for key in ("message", "error", "detail"):
        v = result.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()[:200]
    return ""


def build_tool_trace_step(
    *,
    round_index: int,
    name: str,
    args: dict[str, Any] | None,
    result: Any,
) -> dict[str, Any]:
    return {
        "round": int(round_index),
        "name": str(name or ""),
        "args_summary": summarize_tool_args(args),
        "ok": tool_result_ok(result),
        "message": tool_result_message(result),
    }


RESPONSE_TOOL_TRACE_KEY = "report_editor_tool_trace"


def attach_tool_trace(response: dict[str, Any], trace: list[dict[str, Any]]) -> dict[str, Any]:
    """在 OpenAI 兼容响应上附加轨迹字段（不破坏 choices）。"""
    out = dict(response) if isinstance(response, dict) else {}
    out[RESPONSE_TOOL_TRACE_KEY] = list(trace)
    return out
