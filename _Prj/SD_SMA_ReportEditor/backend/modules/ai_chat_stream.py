"""AI 聊天 SSE 事件格式与上游流式 chunk 解析（可单测）。"""
from __future__ import annotations

import json
from typing import Any, Iterator


def format_sse(event: str, data: dict[str, Any]) -> str:
    """编码一条 SSE：event + data(JSON) + 空行。"""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


def parse_openai_sse_line(line: str) -> dict[str, Any] | None:
    """解析上游 OpenAI 兼容 SSE 单行；`[DONE]` 返回 ``{"done": True}``。"""
    s = (line or "").strip()
    if not s:
        return None
    if s.startswith(":"):
        return None  # comment / keepalive
    if not s.startswith("data:"):
        return None
    raw = s[5:].strip()
    if raw == "[DONE]":
        return {"done": True}
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(obj, dict):
        return obj
    return None


def merge_tool_call_deltas(
    acc: dict[int, dict[str, Any]],
    deltas: list[dict[str, Any]],
) -> None:
    """把流式 ``delta.tool_calls`` 增量合并进 acc（按 index）。"""
    for d in deltas:
        if not isinstance(d, dict):
            continue
        idx = d.get("index")
        if not isinstance(idx, int):
            idx = 0
        slot = acc.setdefault(
            idx,
            {"id": "", "type": "function", "function": {"name": "", "arguments": ""}},
        )
        if d.get("id"):
            slot["id"] = str(d["id"])
        if d.get("type"):
            slot["type"] = str(d["type"])
        fn = d.get("function") if isinstance(d.get("function"), dict) else {}
        if fn.get("name"):
            slot["function"]["name"] = str(fn["name"])
        if fn.get("arguments"):
            slot["function"]["arguments"] = str(slot["function"].get("arguments") or "") + str(
                fn["arguments"]
            )


def finalized_tool_calls(acc: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    if not acc:
        return []
    return [acc[i] for i in sorted(acc.keys())]


def iter_content_and_tools_from_upstream_chunk(
    obj: dict[str, Any],
) -> Iterator[tuple[str, Any]]:
    """
    从上游 chat/completions 流式 chunk 抽出内容。
    产出 ``("content", str)`` 或 ``("tool_delta", list)``。
    """
    choices = obj.get("choices")
    if not isinstance(choices, list) or not choices:
        return
    choice0 = choices[0] if isinstance(choices[0], dict) else {}
    delta = choice0.get("delta") if isinstance(choice0.get("delta"), dict) else {}
    content = delta.get("content")
    if isinstance(content, str) and content:
        yield ("content", content)
    tool_calls = delta.get("tool_calls")
    if isinstance(tool_calls, list) and tool_calls:
        yield ("tool_delta", tool_calls)


def chunk_text_for_simulated_stream(text: str, size: int = 24) -> list[str]:
    """非流式正文拆成小段，便于 UI 增量展示（兜底；默认路径应真转发上游 delta）。"""
    if not text:
        return []
    if size <= 0:
        return [text]
    return [text[i : i + size] for i in range(0, len(text), size)]


def should_hold_content_for_tools(has_tool_calls: bool) -> bool:
    """
    同轮若有 tool_calls，缓冲正文、先跑工具，不把「已完成」类文案提前流给用户。
    结论由工具成功后的下一轮助手消息再流式输出。
    """
    return bool(has_tool_calls)


def plan_live_content_sse(
    upstream_events: list[tuple[str, Any]],
) -> list[tuple[str, dict[str, Any]]]:
    """
    将一轮上游 ``(kind, val)`` 序列规划为对客户端的 SSE 动作（不含工具执行本身）。

    - 每个 ``content`` → 即时 ``delta``（首次前插 ``status/writing``）
    - 若最终有 ``tool_calls`` → 必要时 ``replace`` 清空已流出正文，再 ``status/tools``
    """
    plan: list[tuple[str, dict[str, Any]]] = []
    writing_started = False
    streamed_live = False
    collected_tools: list[dict[str, Any]] | None = None

    for kind, val in upstream_events:
        if kind == "content":
            piece = str(val)
            if not piece:
                continue
            if not writing_started:
                plan.append(("status", {"phase": "writing"}))
                writing_started = True
            plan.append(("delta", {"text": piece}))
            streamed_live = True
        elif kind == "tool_calls":
            collected_tools = val if isinstance(val, list) else []

    if collected_tools and should_hold_content_for_tools(True):
        if streamed_live:
            plan.append(("replace", {"text": ""}))
        plan.append(("status", {"phase": "tools"}))

    return plan
