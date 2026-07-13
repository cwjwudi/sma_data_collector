"""run_chat_completion：工具轨迹 + 探活声称强制再调（mock LLM）。"""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from api.routers import ai_openai
from modules.ai_tool_trace import RESPONSE_TOOL_TRACE_KEY
from schemas.ai import OpenAiChatCompletionRequest


@pytest.fixture()
def chat_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        ai_openai,
        "_ensure_llm_ready",
        lambda: ({"llm_model": "test-model", "llm_base_url": "http://x"}, "key"),
    )
    monkeypatch.setattr(ai_openai.ai_tools, "filtered_tool_definitions", lambda: [])
    return monkeypatch


@pytest.mark.asyncio
async def test_chat_attaches_empty_tool_trace(chat_env):
    async def fake_forward(**_kwargs):
        return {"choices": [{"message": {"role": "assistant", "content": "你好"}}]}

    chat_env.setattr(ai_openai, "_forward_llm", fake_forward)
    body = OpenAiChatCompletionRequest(messages=[{"role": "user", "content": "hi"}])
    data = await ai_openai.run_chat_completion(body, skip_agent_auth=True)
    assert data[RESPONSE_TOOL_TRACE_KEY] == []
    assert "你好" in data["choices"][0]["message"]["content"]


@pytest.mark.asyncio
async def test_chat_records_tool_trace_and_force_retry_on_false_claim(chat_env):
    """第一轮空口说已开启 → 纠错强制再调 → 第二轮仍空口 → 改写失败。"""
    calls = {"n": 0}

    async def fake_forward(**_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "定时探活已经开启。",
                        }
                    }
                ]
            }
        # 纠错后再答仍空口
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "好的，探活已打开。",
                    }
                }
            ]
        }

    chat_env.setattr(ai_openai, "_forward_llm", fake_forward)
    body = OpenAiChatCompletionRequest(messages=[{"role": "user", "content": "开启定时探活"}])
    data = await ai_openai.run_chat_completion(body, skip_agent_auth=True)
    assert calls["n"] == 2
    text = data["choices"][0]["message"]["content"]
    assert "未能确认" in text
    assert "已经开启" not in text
    assert data[RESPONSE_TOOL_TRACE_KEY] == []


@pytest.mark.asyncio
async def test_chat_accepts_claim_when_tool_succeeded(chat_env):
    calls = {"n": 0}

    async def fake_forward(**_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "tc1",
                                    "type": "function",
                                    "function": {
                                        "name": "update_connection_probe_settings",
                                        "arguments": '{"enabled": true}',
                                    },
                                }
                            ],
                        }
                    }
                ]
            }
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "定时探活已经开启。",
                    }
                }
            ]
        }

    chat_env.setattr(ai_openai, "_forward_llm", fake_forward)
    chat_env.setattr(
        ai_openai.ai_tools,
        "execute_tool",
        AsyncMock(
            return_value={
                "ok": True,
                "message": "已开启定时探活",
                "applied": {"connection_probe_enabled": True},
            }
        ),
    )
    body = OpenAiChatCompletionRequest(messages=[{"role": "user", "content": "开启定时探活"}])
    data = await ai_openai.run_chat_completion(body, skip_agent_auth=True)
    assert calls["n"] == 2
    assert "已经开启" in data["choices"][0]["message"]["content"]
    trace = data[RESPONSE_TOOL_TRACE_KEY]
    assert len(trace) == 1
    assert trace[0]["name"] == "update_connection_probe_settings"
    assert trace[0]["ok"] is True
    assert trace[0]["args_summary"]["enabled"] is True
