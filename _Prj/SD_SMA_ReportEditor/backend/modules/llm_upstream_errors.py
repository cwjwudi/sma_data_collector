"""将 OpenAI 兼容上游错误体格式化为面向用户的中文短文案。"""
from __future__ import annotations

import json
import re
from typing import Any


def _dig_error(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    err = payload.get("error")
    if isinstance(err, dict):
        return err
    return payload if "code" in payload or "type" in payload or "message" in payload else {}


def format_llm_upstream_error(status_code: int, body: str) -> str:
    """
    返回主文案（默认不甩整段 JSON）。
    未知错误时附带简短摘要，仍避免把超长 body 原样甩给用户。
    """
    text = (body or "").strip()
    code = ""
    typ = ""
    message = ""
    parsed: Any = None
    if text:
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
    if isinstance(parsed, dict):
        err = _dig_error(parsed)
        code = str(err.get("code") or "").strip()
        typ = str(err.get("type") or "").strip()
        message = str(err.get("message") or "").strip()

    blob = f"{code} {typ} {message} {text}".lower()

    if status_code in (401, 403) or code in ("invalid_api_key", "invalid_api_key_error") or "incorrect api key" in blob:
        return "LLM Key 无效、未配置或无权访问。请到「设置 → AI 助手」检查 API Key / 上游权限。"

    if (
        code == "insufficient_quota"
        or typ == "insufficient_quota"
        or "insufficient_quota" in blob
        or "exceeded your current quota" in blob
        or "billing" in blob and "quota" in blob
    ):
        return (
            "LLM 额度不足或账单受限。请到「设置 → AI 助手」检查 Key / 套餐，"
            "或更换上游。注意：ChatGPT 网页订阅与 API 额度不互通。"
        )

    if status_code == 429 or "rate_limit" in blob or code.startswith("rate_limit"):
        return "请求过于频繁（上游限流），请稍后再试。"

    if status_code == 404 or "model_not_found" in blob or "does not exist" in blob and "model" in blob:
        return "当前模型在上游不存在或不可用。请到「设置 → AI 助手」刷新模型列表并改选可用模型（换上游后勿沿用旧模型名）。"

    if status_code >= 500:
        return f"LLM 上游服务暂时不可用（HTTP {status_code}）。请稍后重试或检查 Base URL。"

    # 未知：短摘要，不甩满 JSON
    raw = message or text or f"HTTP {status_code}"
    raw = re.sub(r"\s+", " ", raw).strip()
    if len(raw) > 160:
        raw = raw[:160] + "…"
    return f"LLM 上游错误（HTTP {status_code}）：{raw}"
