"""format_llm_upstream_error 单测。"""
from __future__ import annotations

import json

from modules.llm_upstream_errors import format_llm_upstream_error


def test_insufficient_quota_json():
    body = json.dumps(
        {
            "error": {
                "message": "You exceeded your current quota, please check your plan and billing details.",
                "type": "insufficient_quota",
                "code": "insufficient_quota",
            }
        }
    )
    msg = format_llm_upstream_error(429, body)
    assert "额度" in msg or "账单" in msg
    assert "{" not in msg
    assert "ChatGPT" in msg


def test_invalid_api_key():
    body = json.dumps({"error": {"message": "Incorrect API key provided", "code": "invalid_api_key", "type": "invalid_request_error"}})
    msg = format_llm_upstream_error(401, body)
    assert "Key" in msg
    assert "{" not in msg


def test_rate_limit():
    body = json.dumps({"error": {"message": "Rate limit reached", "type": "rate_limit_exceeded", "code": "rate_limit_exceeded"}})
    msg = format_llm_upstream_error(429, body)
    assert "频繁" in msg or "限流" in msg


def test_model_not_found():
    body = json.dumps({"error": {"message": "The model `gpt-4.1` does not exist", "code": "model_not_found"}})
    msg = format_llm_upstream_error(404, body)
    assert "模型" in msg
    assert "刷新" in msg or "设置" in msg
    assert "{" not in msg


def test_unknown_keeps_short_summary_not_full_json():
    long = "x" * 500
    body = json.dumps({"error": {"message": long, "code": "weird_code"}})
    msg = format_llm_upstream_error(400, body)
    assert "LLM 上游错误" in msg
    assert len(msg) < 400
    assert '"weird_code"' not in msg
