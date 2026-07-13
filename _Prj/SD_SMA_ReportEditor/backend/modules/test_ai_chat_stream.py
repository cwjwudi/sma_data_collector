"""ai_chat_stream 纯函数单测（B 类解析）。"""
from __future__ import annotations

from modules.ai_chat_stream import (
    chunk_text_for_simulated_stream,
    finalized_tool_calls,
    format_sse,
    iter_content_and_tools_from_upstream_chunk,
    merge_tool_call_deltas,
    parse_openai_sse_line,
)


def test_format_sse_roundtrip_shape():
    s = format_sse("delta", {"text": "你好"})
    assert s.startswith("event: delta\n")
    assert 'data: {"text":"你好"}' in s
    assert s.endswith("\n\n")


def test_parse_openai_sse_line_content_and_done():
    assert parse_openai_sse_line("") is None
    assert parse_openai_sse_line(": ping") is None
    assert parse_openai_sse_line("data: [DONE]") == {"done": True}
    obj = parse_openai_sse_line(
        'data: {"choices":[{"delta":{"content":"Hi"}}]}'
    )
    assert obj and obj["choices"][0]["delta"]["content"] == "Hi"


def test_merge_tool_call_deltas():
    acc: dict[int, dict] = {}
    merge_tool_call_deltas(
        acc,
        [{"index": 0, "id": "c1", "function": {"name": "list_templates", "arguments": ""}}],
    )
    merge_tool_call_deltas(acc, [{"index": 0, "function": {"arguments": '{"a":'}}])
    merge_tool_call_deltas(acc, [{"index": 0, "function": {"arguments": "1}"}}])
    tools = finalized_tool_calls(acc)
    assert len(tools) == 1
    assert tools[0]["function"]["name"] == "list_templates"
    assert tools[0]["function"]["arguments"] == '{"a":1}'


def test_iter_content_from_chunk():
    kinds = list(
        iter_content_and_tools_from_upstream_chunk(
            {"choices": [{"delta": {"content": "ab"}}]}
        )
    )
    assert kinds == [("content", "ab")]


def test_chunk_text():
    assert chunk_text_for_simulated_stream("abcdefgh", 3) == ["abc", "def", "gh"]
    assert chunk_text_for_simulated_stream("") == []
