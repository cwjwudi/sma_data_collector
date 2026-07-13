"""ai_tool_trace / ai_claim_guard 单元测试。"""
from __future__ import annotations

from modules.ai_claim_guard import (
    detect_probe_claim,
    needs_probe_claim_retry,
    rewrite_probe_claim_failure,
    set_assistant_text_on_response,
)
from modules.ai_tool_trace import (
    RESPONSE_TOOL_TRACE_KEY,
    attach_tool_trace,
    build_tool_trace_step,
    summarize_tool_args,
    tool_result_ok,
)


def test_summarize_strips_password():
    s = summarize_tool_args({"enabled": True, "password": "secret123", "name": "db"})
    assert s["enabled"] is True
    assert s["name"] == "db"
    assert "password" not in s


def test_build_step_ok_and_message():
    step = build_tool_trace_step(
        round_index=1,
        name="update_connection_probe_settings",
        args={"enabled": True},
        result={"ok": True, "message": "已开启定时探活"},
    )
    assert step["ok"] is True
    assert step["round"] == 1
    assert step["args_summary"]["enabled"] is True
    assert "开启" in step["message"]


def test_tool_result_ok_without_explicit_ok_field():
    """读类工具常返回 payloads 而无 ok；不得标红失败（006 轨迹假失败）。"""
    assert tool_result_ok({"templates": [], "count": 0}) is True
    assert tool_result_ok({"db_count": 1, "opc_count": 0}) is True
    assert tool_result_ok({"ok": False, "error": "x"}) is False
    assert tool_result_ok({"error": "boom"}) is False
    assert tool_result_ok({"ok": True}) is True


def test_build_step_list_templates_payload_is_ok():
    step = build_tool_trace_step(
        round_index=2,
        name="list_templates",
        args={},
        result={"templates": [{"id": "t1"}], "count": 1},
    )
    assert step["ok"] is True


def test_attach_tool_trace():
    data = {"choices": [{"message": {"content": "hi"}}]}
    out = attach_tool_trace(data, [{"name": "x", "ok": True}])
    assert out[RESPONSE_TOOL_TRACE_KEY][0]["name"] == "x"
    assert data.get(RESPONSE_TOOL_TRACE_KEY) is None  # 原对象不污染


def test_detect_probe_claim():
    assert detect_probe_claim("定时探活已经开启。") == "enable"
    assert detect_probe_claim("已关闭定时探活。") == "disable"
    assert detect_probe_claim("当前探活状态需要查一下。") == "none"


def test_needs_retry_when_claim_without_tool():
    assert needs_probe_claim_retry("探活已开启", []) is True
    trace_ok = [
        {
            "name": "update_connection_probe_settings",
            "ok": True,
            "args_summary": {"enabled": True},
            "message": "ok",
        }
    ]
    assert needs_probe_claim_retry("探活已开启", trace_ok) is False
    assert needs_probe_claim_retry("探活已开启", [{"name": "list_templates", "ok": True, "args_summary": {}}]) is True


def test_rewrite_removes_false_success():
    text = rewrite_probe_claim_failure(
        "定时探活已经开启。",
        [{"name": "update_connection_probe_settings", "ok": False, "message": "未启用写入工具"}],
    )
    assert "未能确认" in text
    assert "已经开启" not in text
    assert "写入工具" in text


def test_diagnostic_fact_claim_without_tool():
    from modules.ai_claim_guard import (
        detect_diagnostic_fact_claim,
        needs_diagnostic_claim_retry,
        rewrite_diagnostic_claim_failure,
    )

    assert detect_diagnostic_fact_claim("版本是 0.3.90") is True
    assert needs_diagnostic_claim_retry("连接全部正常", []) is True
    assert needs_diagnostic_claim_retry(
        "连接全部正常",
        [{"name": "list_db_connections", "ok": True}],
    ) is False
    assert "诊断工具" in rewrite_diagnostic_claim_failure("共有 2 个数据库连接", [])


def test_set_assistant_text_clears_tool_calls():
    data = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "旧",
                    "tool_calls": [{"id": "1"}],
                }
            }
        ]
    }
    out = set_assistant_text_on_response(data, "新文案")
    assert out["choices"][0]["message"]["content"] == "新文案"
    assert "tool_calls" not in out["choices"][0]["message"]
