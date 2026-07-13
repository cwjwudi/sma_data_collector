"""探活口头结论与工具事实对齐：不匹配则强制再调 / 改写失败文案。"""
from __future__ import annotations

import re
from typing import Any, Literal

ProbeClaim = Literal["enable", "disable", "none"]

PROBE_TOOL = "update_connection_probe_settings"

_ENABLE_CLAIM_RE = re.compile(
    r"(已开启|已经开启|已打开|已经打开|探活已开|定时探活.*(?:已)?(?:开启|打开)|已为你开启|开启成功)",
    re.I,
)
_DISABLE_CLAIM_RE = re.compile(
    r"(已关闭|已经关闭|已关掉|探活已关|定时探活.*(?:已)?关闭|关闭成功)",
    re.I,
)


def detect_probe_claim(assistant_text: str) -> ProbeClaim:
    text = (assistant_text or "").strip()
    if not text:
        return "none"
    # 同时命中时以更靠后的匹配为准（简单：两者都命中则看最后一次）
    en = list(_ENABLE_CLAIM_RE.finditer(text))
    di = list(_DISABLE_CLAIM_RE.finditer(text))
    if not en and not di:
        return "none"
    if en and not di:
        return "enable"
    if di and not en:
        return "disable"
    last_en = en[-1].start()
    last_di = di[-1].start()
    return "enable" if last_en >= last_di else "disable"


def _probe_tool_evidence(trace: list[dict[str, Any]], want_enabled: bool) -> bool:
    for step in reversed(trace or []):
        if str(step.get("name") or "") != PROBE_TOOL:
            continue
        if not step.get("ok"):
            continue
        args = step.get("args_summary") if isinstance(step.get("args_summary"), dict) else {}
        if "enabled" not in args:
            # 仅改 interval 不算开/关证据
            continue
        enabled = args.get("enabled")
        if isinstance(enabled, str):
            enabled_norm = enabled.strip().lower() in ("1", "true", "yes", "on")
        else:
            enabled_norm = bool(enabled)
        if enabled_norm is want_enabled:
            return True
    return False


def probe_claim_has_evidence(claim: ProbeClaim, trace: list[dict[str, Any]]) -> bool:
    if claim == "none":
        return True
    if claim == "enable":
        return _probe_tool_evidence(trace, True)
    if claim == "disable":
        return _probe_tool_evidence(trace, False)
    return True


def needs_probe_claim_retry(assistant_text: str, trace: list[dict[str, Any]]) -> bool:
    claim = detect_probe_claim(assistant_text)
    if claim == "none":
        return False
    return not probe_claim_has_evidence(claim, trace)


def probe_claim_correction_message(claim: ProbeClaim) -> str:
    if claim == "enable":
        return (
            "【系统纠错】你刚才声称定时探活已开启，但本轮没有成功的 "
            f"{PROBE_TOOL}(enabled=true) 工具结果。"
            "请立即调用该工具并传 enabled=true；在工具 ok=true 之前，禁止再说「已开启」。"
            "若工具失败，请如实说明错误原因。"
        )
    if claim == "disable":
        return (
            "【系统纠错】你刚才声称定时探活已关闭，但本轮没有成功的 "
            f"{PROBE_TOOL}(enabled=false) 工具结果。"
            "请立即调用该工具并传 enabled=false；在工具 ok=true 之前，禁止再说「已关闭」。"
            "若工具失败，请如实说明错误原因。"
        )
    return (
        f"【系统纠错】请先成功调用 {PROBE_TOOL}，再根据工具结果回答；禁止空口答应。"
    )


def rewrite_probe_claim_failure(assistant_text: str, trace: list[dict[str, Any]]) -> str:
    """强制再调仍无证据时，改写为如实失败（去掉假成功感）。"""
    claim = detect_probe_claim(assistant_text)
    last_err = ""
    for step in reversed(trace or []):
        if str(step.get("name") or "") == PROBE_TOOL and not step.get("ok"):
            last_err = str(step.get("message") or "").strip()
            break
        if not last_err and step.get("message") and not step.get("ok"):
            last_err = str(step.get("message") or "").strip()

    if claim == "enable":
        base = "未能确认定时探活已开启：本轮没有成功的写入工具结果。"
    elif claim == "disable":
        base = "未能确认定时探活已关闭：本轮没有成功的写入工具结果。"
    else:
        base = "操作未能确认完成：缺少成功的工具结果。"

    if last_err:
        return f"{base} 最近工具反馈：{last_err}"
    return (
        f"{base} 请确认设置中已开启「允许 AI 写入工具」，或在设置页手动切换定时探活。"
    )


def extract_assistant_text_from_response(data: dict[str, Any] | None) -> str:
    if not isinstance(data, dict):
        return ""
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    msg = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(msg, dict):
        return ""
    content = msg.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for p in content:
            if isinstance(p, dict) and isinstance(p.get("text"), str):
                parts.append(p["text"])
        return "".join(parts).strip()
    return ""


def set_assistant_text_on_response(data: dict[str, Any], text: str) -> dict[str, Any]:
    out = dict(data)
    choices = list(out.get("choices") or [])
    if not choices:
        out["choices"] = [{"message": {"role": "assistant", "content": text}, "finish_reason": "stop"}]
        return out
    first = dict(choices[0]) if isinstance(choices[0], dict) else {}
    msg = dict(first.get("message") or {})
    msg["role"] = msg.get("role") or "assistant"
    msg["content"] = text
    # 清掉 tool_calls，避免前端误用
    msg.pop("tool_calls", None)
    first["message"] = msg
    choices[0] = first
    out["choices"] = choices
    return out
