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


def test_should_hold_content_for_tools():
    from modules.ai_chat_stream import should_hold_content_for_tools

    assert should_hold_content_for_tools(True) is True
    assert should_hold_content_for_tools(False) is False


def test_plan_live_content_sse_forwards_deltas_before_round_end():
    from modules.ai_chat_stream import plan_live_content_sse

    plan = plan_live_content_sse(
        [
            ("content", "你"),
            ("content", "好"),
            ("content", "！"),
        ]
    )
    assert plan[0] == ("status", {"phase": "writing"})
    assert [p for p in plan if p[0] == "delta"] == [
        ("delta", {"text": "你"}),
        ("delta", {"text": "好"}),
        ("delta", {"text": "！"}),
    ]
    assert not any(p[0] == "replace" for p in plan)


def test_plan_live_content_sse_keeps_text_when_tools():
    from modules.ai_chat_stream import plan_live_content_sse

    plan = plan_live_content_sse(
        [
            ("content", "先说一句"),
            ("tool_calls", [{"id": "1", "function": {"name": "list_templates"}}]),
        ]
    )
    assert ("delta", {"text": "先说一句"}) in plan
    assert ("status", {"phase": "tools"}) in plan
    # 工具轮不得清空已流出正文（否则 UI 会「吞掉」上一段）
    assert ("replace", {"text": ""}) not in plan


def test_plan_claim_retry_never_clears_ui():
    from modules.ai_chat_stream import plan_claim_retry_client_events

    plan = plan_claim_retry_client_events()
    assert plan == [("status", {"phase": "thinking"})]
    assert not any(p[0] == "replace" for p in plan)


def test_plan_final_rewrite_appends_when_preserving():
    from modules.ai_chat_stream import plan_final_rewrite_client_events

    assert plan_final_rewrite_client_events("改写", preserve_prior_ui=True) == [
        ("delta", {"text": "\n\n改写"})
    ]
    assert plan_final_rewrite_client_events("改写", preserve_prior_ui=False) == [
        ("replace", {"text": "改写"})
    ]
