"""OpenAI 兼容 /v1 网关与应用内 AI 设置 API。"""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from modules import ai_config, ai_datasource_ops, ai_pending_actions, ai_pending_prompts, ai_tools
from modules.ai_chat_stream import (
    chunk_text_for_simulated_stream,
    finalized_tool_calls,
    format_sse,
    iter_content_and_tools_from_upstream_chunk,
    merge_tool_call_deltas,
    parse_openai_sse_line,
    should_hold_content_for_tools,
)
from modules.ai_claim_guard import (
    detect_probe_claim,
    extract_assistant_text_from_response,
    needs_probe_claim_retry,
    probe_claim_correction_message,
    rewrite_probe_claim_failure,
    set_assistant_text_on_response,
)
from modules.ai_tool_trace import attach_tool_trace, build_tool_trace_step
from modules.llm_upstream_errors import format_llm_upstream_error
from schemas.ai import (
    AiChatRequest,
    AiPendingConfirmSubmit,
    AiPendingCredentialSubmit,
    AiSettingsPatch,
    AiToolTogglePatch,
    OpenAiChatCompletionRequest,
)

logger = logging.getLogger(__name__)

openai_router = APIRouter(tags=["ai-openai"])
settings_router = APIRouter(tags=["ai-settings"])

MAX_TOOL_ROUNDS = 8
SYSTEM_PROMPT = (
    "你是 SD_SMA_ReportEditor（报表编辑器）的 AI 助手，帮助用户诊断数据库/OPC UA 连接、"
    "导出/结批失败与模版配置。优先调用工具获取事实，不要编造连接状态、审计、版本或导出结果。"
    "开发/排障时优先 get_dev_runtime_snapshot 或 diagnose_work_chain。"
    "禁止向用户索要或输出数据库/OPC 密码明文；密码与删除/复位/导入/结批确认仅在报表软件 UI 弹框完成。"
    "收到 awaiting_user_credentials 或 awaiting_user_confirm 时，提示用户到本机报表软件内操作。"
    "suggest_config_change 只生成建议、不落库，不得冒充已修改。"
    "若工具返回 ok=false（如未启用「允许 AI 写入工具」、工具被禁用、数据源锁定），必须如实告知，禁止空口答应「已完成/正在开启」。"
    "写入总闸关闭时：任何 write/confirm 工具都会失败；须明确提示用户去设置开启「允许 AI 写入工具」，并确认系统状态未变。"
    "写入类（探活开/关、复制/删除资产、改配置等）：须先发出 tool_calls；"
    "同一轮若调用工具，勿在工具结果返回前输出「已开启/已关闭/已完成」等完成态结论；成功后再总结。"
    "回答默认简洁：只针对用户最新问题；勿复述已完成操作或前文长摘要，除非用户明确要求回顾。"
    "——能力域与必调工具——"
    "定时探活开/关：必须 update_connection_probe_settings（开启传 enabled=true）。"
    "配置 DB/OPC：upsert_db_connection / upsert_opc_server；密码用 request_connection_credentials；删除用 delete_*（确认流）。"
    "模版/版式：复制必须 copy_template / copy_layout_preset（先 list_* 取 id）；"
    "新建空白必须 create_blank_template / create_blank_layout；"
    "删除必须 delete_template / delete_layout_preset（确认流）；"
    "若返回 awaiting_user_confirm，须提示用户在本机弹框确认，禁止声称已删除；取消则资产仍在；"
    "排序必须 set_template_display_order（传 ordered_ids 或 move={from_id,to_id}；先 get_template_display_order / list_templates 取 id）；"
    "打开编辑必须 request_open_template / request_open_layout；"
    "返回 awaiting_user_confirm 时须提示本机确认后跳转，禁止声称已打开编辑器；取消则不跳转。"
    "备份/导入/复位：导出备份必须 request_config_backup_export（返回 awaiting_user_action，"
    "提示用户在本机弹框另存 .rebak；禁止声称已生成文件内容或口令）；"
    "merge 导入必须 request_config_import_merge；复位必须 request_config_reset；"
    "二者返回 awaiting_user_confirm 时须提示本机确认，禁止声称已导入/已复位；取消则状态不变；"
    "加密 .rebak 含口令，不得把备份内容、密文或口令返回给 LLM / 出现在聊天。"
    "绑定冒烟模版：必须 create_binding_smoke_template（需已有 DB 与 OPC 连接；无连接须如实失败）；"
    "勿再承诺「一键建演示库」（ensure_user_demo_database 已下线）；可用 ensure_schema=true 在已有连接上建冒烟表。"
    "套用封面封尾：apply_template_sheet_layouts。"
    "导出目录：已知路径用 set_export_dir；需本机选目录用 request_pick_export_dir（awaiting_user_action）；"
    "禁止声称已改路径，除非工具成功或用户已在弹框完成选择。"
    "预检/模拟结批：先 preflight_export 据实汇报 ready/issues；模拟结批只用 request_manual_export（awaiting_user_confirm）；"
    "禁止声称已导出 PDF，除非用户已在本机确认弹框完成导出。"
    "结批写回/并行：set_export_result_feedback 后用 get_export_result_feedback 读回核对；"
    "并行上限用 set_max_parallel_exports（1–16）后可用 check_auto_trigger_bindings 看 max_parallel；"
    "禁止声称已改写回/并行，除非工具成功且读回一致。"
    "检查更新：request_check_app_update 只检查、不自动安装。"
)


def _extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def _require_agent_auth(request: Request) -> None:
    settings = ai_config.load_ai_settings()
    if not settings.get("enabled"):
        raise HTTPException(503, "AI 助手未启用，请先在设置中开启。")
    client_host = request.client.host if request.client else None
    if not ai_config.client_may_access_agent_api(client_host, settings):
        raise HTTPException(
            403,
            "Agent API 默认仅允许本机访问。若需局域网接入，请在设置中开启「允许局域网访问 Agent API 与应用内 AI」。",
        )
    # 本机（loopback）对齐 LM Studio：无需 Agent Token，任意/空 Bearer 均可
    if ai_config.is_loopback_host(client_host):
        return
    token = _extract_bearer(request)
    if not ai_config.verify_agent_token(token, settings):
        raise HTTPException(
            401,
            "局域网访问需要有效的 Agent Token。请在设置中生成令牌，或改用本机 http://127.0.0.1:8000/v1。",
        )


def _ensure_llm_ready() -> tuple[dict[str, Any], str]:
    settings = ai_config.load_ai_settings()
    if not settings.get("enabled"):
        raise HTTPException(503, "AI 助手未启用。")
    api_key = ai_config.decrypt_llm_api_key(settings)
    if not api_key:
        raise HTTPException(503, "未配置 LLM API Key，请在设置中填写。")
    return settings, api_key


def _build_system_messages(page_context: dict[str, Any] | None) -> list[dict[str, str]]:
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    if page_context:
        try:
            ctx_json = json.dumps(page_context, ensure_ascii=False)
        except (TypeError, ValueError):
            ctx_json = str(page_context)
        msgs.append(
            {
                "role": "system",
                "content": f"当前页面上下文（report_editor_page_context）：{ctx_json}",
            }
        )
    return msgs


async def _forward_llm(
    *,
    settings: dict[str, Any],
    api_key: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    base = str(settings.get("llm_base_url") or "").rstrip("/")
    url = f"{base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(120.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
        except httpx.RequestError as e:
            logger.exception("LLM 请求失败")
            raise HTTPException(502, f"无法连接 LLM 服务 ({base})：{e}") from e
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, format_llm_upstream_error(resp.status_code, resp.text[:2000]))
    try:
        return resp.json()
    except json.JSONDecodeError as e:
        raise HTTPException(502, "LLM 返回非 JSON 响应") from e


async def _iter_upstream_stream(
    *,
    settings: dict[str, Any],
    api_key: str,
    payload: dict[str, Any],
) -> AsyncIterator[tuple[str, Any]]:
    """
    上游 stream=true：产出 ``("content", str)`` / ``("tool_calls", list)``。
    出错抛 HTTPException。
    """
    base = str(settings.get("llm_base_url") or "").rstrip("/")
    url = f"{base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    body = {**payload, "stream": True}
    timeout = httpx.Timeout(120.0, connect=30.0)
    tool_acc: dict[int, dict[str, Any]] = {}
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    err_body = (await resp.aread()).decode("utf-8", errors="replace")[:2000]
                    raise HTTPException(
                        resp.status_code,
                        format_llm_upstream_error(resp.status_code, err_body),
                    )
                async for line in resp.aiter_lines():
                    parsed = parse_openai_sse_line(line)
                    if not parsed:
                        continue
                    if parsed.get("done"):
                        break
                    for kind, val in iter_content_and_tools_from_upstream_chunk(parsed):
                        if kind == "content":
                            yield ("content", val)
                        elif kind == "tool_delta":
                            merge_tool_call_deltas(tool_acc, val)
        except httpx.RequestError as e:
            logger.exception("LLM 流式请求失败")
            raise HTTPException(502, f"无法连接 LLM 服务 ({base})：{e}") from e
    tools = finalized_tool_calls(tool_acc)
    if tools:
        yield ("tool_calls", tools)


async def iter_chat_stream_sse(
    body: OpenAiChatCompletionRequest,
    *,
    skip_agent_auth: bool = False,
    request: Request | None = None,
) -> AsyncIterator[str]:
    """应用内 / OpenAI 兼容流式：产出 SSE 字符串。"""
    try:
        if not skip_agent_auth:
            if request is None:
                raise HTTPException(500, "缺少 request")
            _require_agent_auth(request)

        settings, api_key = _ensure_llm_ready()
        page_context = body.report_editor_page_context
        user_messages = [m for m in (body.messages or []) if isinstance(m, dict)]
        messages: list[dict[str, Any]] = _build_system_messages(page_context) + user_messages
        model = (body.model or settings.get("llm_model") or "gpt-4o-mini").strip()
        tools = body.tools if body.tools is not None else ai_tools.filtered_tool_definitions()

        upstream_payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "tools": tools,
            "tool_choice": body.tool_choice or "auto",
        }
        if body.temperature is not None:
            upstream_payload["temperature"] = body.temperature
        if body.max_tokens is not None:
            upstream_payload["max_tokens"] = body.max_tokens

        tool_trace: list[dict[str, Any]] = []
        claim_retry_used = False
        yield format_sse("status", {"phase": "thinking"})

        for round_index in range(1, MAX_TOOL_ROUNDS + 1):
            if request is not None and await request.is_disconnected():
                return

            content_parts: list[str] = []
            collected_tools: list[dict[str, Any]] | None = None
            async for kind, val in _iter_upstream_stream(
                settings=settings, api_key=api_key, payload=upstream_payload
            ):
                if request is not None and await request.is_disconnected():
                    return
                if kind == "content":
                    # 缓冲至本轮上游结束：若有 tool_calls 则不提前流式「已完成」文案
                    content_parts.append(str(val))
                elif kind == "tool_calls":
                    collected_tools = val if isinstance(val, list) else []

            if collected_tools and should_hold_content_for_tools(True):
                yield format_sse("status", {"phase": "tools"})
                assistant_msg: dict[str, Any] = {
                    "role": "assistant",
                    "content": "".join(content_parts) or None,
                    "tool_calls": collected_tools,
                }
                messages.append(assistant_msg)
                for tc in collected_tools:
                    fn = (tc.get("function") or {}) if isinstance(tc, dict) else {}
                    name = fn.get("name") or ""
                    raw_args = fn.get("arguments") or "{}"
                    try:
                        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    except json.JSONDecodeError:
                        args = {}
                    if not isinstance(args, dict):
                        args = {}
                    tool_result = await ai_tools.execute_tool(name, args, page_context=page_context)
                    step = build_tool_trace_step(
                        round_index=round_index,
                        name=name,
                        args=args,
                        result=tool_result,
                    )
                    tool_trace.append(step)
                    yield format_sse("tool", step)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.get("id") or str(uuid.uuid4()),
                            "content": json.dumps(tool_result, ensure_ascii=False),
                        }
                    )
                upstream_payload["messages"] = messages
                continue

            # 无 tool_calls：本轮结束后再放出正文（可分段，避免整块卡住）
            assistant_text = "".join(content_parts)
            if assistant_text:
                yield format_sse("status", {"phase": "writing"})
                for piece in chunk_text_for_simulated_stream(assistant_text):
                    if request is not None and await request.is_disconnected():
                        return
                    yield format_sse("delta", {"text": piece})

            if needs_probe_claim_retry(assistant_text, tool_trace) and not claim_retry_used:
                claim = detect_probe_claim(assistant_text)
                claim_retry_used = True
                # 清掉已放出的假完成文案，再进纠错轮
                yield format_sse("replace", {"text": ""})
                messages.append({"role": "assistant", "content": assistant_text})
                messages.append({"role": "system", "content": probe_claim_correction_message(claim)})
                upstream_payload["messages"] = messages
                upstream_payload["tool_choice"] = "auto"
                yield format_sse("status", {"phase": "thinking"})
                continue

            if needs_probe_claim_retry(assistant_text, tool_trace):
                rewritten = rewrite_probe_claim_failure(assistant_text, tool_trace)
                yield format_sse("replace", {"text": rewritten})
                yield format_sse("done", {"tool_trace": tool_trace, "finish_reason": "stop"})
                return

            yield format_sse("done", {"tool_trace": tool_trace, "finish_reason": "stop"})
            return

        exhausted_text = f"工具调用超过 {MAX_TOOL_ROUNDS} 轮上限，请简化请求后重试。"
        if needs_probe_claim_retry("已经开启定时探活", tool_trace):
            exhausted_text = rewrite_probe_claim_failure("已经开启定时探活", tool_trace)
        yield format_sse("replace", {"text": exhausted_text})
        yield format_sse("done", {"tool_trace": tool_trace, "finish_reason": "stop"})
    except HTTPException as e:
        detail = e.detail
        msg = detail if isinstance(detail, str) else str(detail)
        yield format_sse("error", {"message": msg})
    except Exception as e:
        logger.exception("AI 流式聊天失败")
        yield format_sse("error", {"message": f"流式聊天失败：{e}"})


def _sse_response(gen: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def run_chat_completion(
    body: OpenAiChatCompletionRequest,
    *,
    skip_agent_auth: bool = False,
    request: Request | None = None,
) -> dict[str, Any]:
    if not skip_agent_auth:
        if request is None:
            raise HTTPException(500, "缺少 request")
        _require_agent_auth(request)

    settings, api_key = _ensure_llm_ready()
    page_context = body.report_editor_page_context

    user_messages = [m for m in (body.messages or []) if isinstance(m, dict)]
    messages: list[dict[str, Any]] = _build_system_messages(page_context) + user_messages

    model = (body.model or settings.get("llm_model") or "gpt-4o-mini").strip()
    tools = body.tools if body.tools is not None else ai_tools.filtered_tool_definitions()

    upstream_payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "tools": tools,
        "tool_choice": body.tool_choice or "auto",
    }
    if body.temperature is not None:
        upstream_payload["temperature"] = body.temperature
    if body.max_tokens is not None:
        upstream_payload["max_tokens"] = body.max_tokens
    if body.stream:
        raise HTTPException(
            400,
            "请使用流式端点 POST /settings/ai/chat/stream 或 POST /v1/chat/completions/stream；"
            "本接口仅支持非流式。",
        )

    tool_trace: list[dict[str, Any]] = []
    claim_retry_used = False

    for round_index in range(1, MAX_TOOL_ROUNDS + 1):
        data = await _forward_llm(settings=settings, api_key=api_key, payload=upstream_payload)
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        tool_calls = message.get("tool_calls")
        if not tool_calls:
            assistant_text = extract_assistant_text_from_response(data)
            if needs_probe_claim_retry(assistant_text, tool_trace) and not claim_retry_used:
                claim = detect_probe_claim(assistant_text)
                # 强制再调：纠错进 messages，占用后续轮次
                claim_retry_used = True
                messages.append(message if isinstance(message, dict) else {"role": "assistant", "content": assistant_text})
                messages.append({"role": "system", "content": probe_claim_correction_message(claim)})
                upstream_payload["messages"] = messages
                upstream_payload["tool_choice"] = "auto"
                continue

            if needs_probe_claim_retry(assistant_text, tool_trace):
                rewritten = rewrite_probe_claim_failure(assistant_text, tool_trace)
                data = set_assistant_text_on_response(data, rewritten)

            return attach_tool_trace(data, tool_trace)

        messages.append(message)
        for tc in tool_calls:
            fn = (tc.get("function") or {}) if isinstance(tc, dict) else {}
            name = fn.get("name") or ""
            raw_args = fn.get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except json.JSONDecodeError:
                args = {}
            if not isinstance(args, dict):
                args = {}
            tool_result = await ai_tools.execute_tool(name, args, page_context=page_context)
            tool_trace.append(
                build_tool_trace_step(
                    round_index=round_index,
                    name=name,
                    args=args,
                    result=tool_result,
                )
            )
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.get("id") or str(uuid.uuid4()),
                    "content": json.dumps(tool_result, ensure_ascii=False),
                }
            )
        upstream_payload["messages"] = messages

    # 轮次耗尽：带轨迹返回明确说明；若仍像「假开探活」则改写为失败说明
    exhausted_text = f"工具调用超过 {MAX_TOOL_ROUNDS} 轮上限，请简化请求后重试。"
    if needs_probe_claim_retry("已经开启定时探活", tool_trace):
        exhausted_text = rewrite_probe_claim_failure("已经开启定时探活", tool_trace)
    exhausted = {
        "choices": [
            {
                "message": {"role": "assistant", "content": exhausted_text},
                "finish_reason": "stop",
            }
        ]
    }
    return attach_tool_trace(exhausted, tool_trace)

@openai_router.get("/v1/models")
async def list_models(request: Request):
    _require_agent_auth(request)
    settings, _ = _ensure_llm_ready()
    model_id = str(settings.get("llm_model") or "gpt-4o-mini")
    now = int(time.time())
    return {
        "object": "list",
        "data": [
            {
                "id": model_id,
                "object": "model",
                "created": now,
                "owned_by": "report-editor",
            }
        ],
    }


@openai_router.post("/v1/chat/completions")
async def chat_completions(request: Request, body: OpenAiChatCompletionRequest):
    if body.stream:
        return _sse_response(iter_chat_stream_sse(body, request=request))
    return await run_chat_completion(body, request=request)


@openai_router.post("/v1/chat/completions/stream")
async def chat_completions_stream(request: Request, body: OpenAiChatCompletionRequest):
    return _sse_response(iter_chat_stream_sse(body, request=request))


@settings_router.get("/settings/ai")
def get_ai_settings():
    port = ai_config.resolve_backend_port()
    return ai_config.public_ai_settings(port=port)


@settings_router.get("/settings/ai/models")
async def list_upstream_llm_models(request: Request):
    """本机拉取上游 OpenAI 兼容 /models，供设置页下拉。"""
    _require_loopback(request)
    settings = ai_config.load_ai_settings()
    api_key = ai_config.try_decrypt_llm_api_key(ai_config.DATA_DIR, settings)
    base = str(settings.get("llm_base_url") or "").rstrip("/")
    fallback = ai_config.list_fallback_llm_models()
    current = str(settings.get("llm_model") or "").strip()
    if not api_key:
        models = list(fallback)
        if current and current not in models:
            models.insert(0, current)
        return {
            "ok": False,
            "source": "fallback",
            "error": "尚未配置 LLM API Key，已返回常用模型名",
            "models": models,
            "current": current,
        }
    url = f"{base}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    timeout = httpx.Timeout(30.0, connect=15.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
    except httpx.RequestError as e:
        models = list(fallback)
        if current and current not in models:
            models.insert(0, current)
        return {
            "ok": False,
            "source": "fallback",
            "error": f"无法连接上游模型列表 ({base})：{e}",
            "models": models,
            "current": current,
        }
    if resp.status_code >= 400:
        models = list(fallback)
        if current and current not in models:
            models.insert(0, current)
        return {
            "ok": False,
            "source": "fallback",
            "error": f"上游 /models 错误 {resp.status_code}",
            "models": models,
            "current": current,
        }
    try:
        payload = resp.json()
    except json.JSONDecodeError:
        models = list(fallback)
        if current and current not in models:
            models.insert(0, current)
        return {
            "ok": False,
            "source": "fallback",
            "error": "上游 /models 返回非 JSON",
            "models": models,
            "current": current,
        }
    ids: list[str] = []
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                mid = str(item.get("id") or "").strip()
                if mid and mid not in ids:
                    ids.append(mid)
    ids.sort(key=lambda x: x.lower())
    if current and current not in ids:
        ids.insert(0, current)
    if not ids:
        ids = list(fallback)
        if current and current not in ids:
            ids.insert(0, current)
        return {
            "ok": False,
            "source": "fallback",
            "error": "上游未返回模型 id",
            "models": ids,
            "current": current,
        }
    return {"ok": True, "source": "upstream", "error": None, "models": ids, "current": current}


@settings_router.patch("/settings/ai")
def patch_ai_settings(body: AiSettingsPatch):
    patch = body.model_dump(exclude_unset=True)
    ai_config.save_ai_settings(patch)
    port = ai_config.resolve_backend_port()
    return ai_config.public_ai_settings(port=port)


@settings_router.post("/settings/ai/regenerate_agent_token")
def regenerate_agent_token():
    token, _settings = ai_config.generate_agent_token()
    port = ai_config.resolve_backend_port()
    pub = ai_config.public_ai_settings(_settings, port=port)
    return {**pub, "agent_token": token, "note": "Agent Token 仅本次响应返回，请立即复制保存。"}


@settings_router.post("/settings/ai/chat")
async def internal_ai_chat(request: Request, body: AiChatRequest):
    """应用内助手：本机免 Bearer；局域网须 allow_lan_access + Agent Token。"""
    _require_local_or_lan_ai_auth(request)
    req = OpenAiChatCompletionRequest(
        model=body.model,
        messages=body.messages,
        stream=False,
        report_editor_page_context=body.report_editor_page_context,
    )
    if body.stream:
        return _sse_response(iter_chat_stream_sse(req, skip_agent_auth=True, request=request))
    return await run_chat_completion(req, skip_agent_auth=True)


@settings_router.post("/settings/ai/chat/stream")
async def internal_ai_chat_stream(request: Request, body: AiChatRequest):
    """应用内助手流式：本机免 Bearer；局域网须开关 + Token。"""
    _require_local_or_lan_ai_auth(request)
    req = OpenAiChatCompletionRequest(
        model=body.model,
        messages=body.messages,
        stream=True,
        report_editor_page_context=body.report_editor_page_context,
    )
    return _sse_response(iter_chat_stream_sse(req, skip_agent_auth=True, request=request))


@settings_router.get("/settings/ai/status")
def ai_status():
    port = ai_config.resolve_backend_port()
    pub = ai_config.public_ai_settings(port=port)
    return JSONResponse(pub)


def _require_local_or_lan_ai_auth(request: Request) -> None:
    """应用内 AI / Pending / 工具目录等：本机免 Token；局域网须开关 + Agent Token。"""
    client_host = request.client.host if request.client else None
    err = ai_config.local_or_lan_ai_auth_error(client_host, _extract_bearer(request))
    if err:
        # 无 Token 或错 Token 用 401；未开局域网开关用 403（文案已区分）
        code = 401 if "Token" in err or "令牌" in err else 403
        if "需要有效的 Agent Token" in err:
            code = 401
        raise HTTPException(code, err)


def _require_loopback(request: Request) -> None:
    """兼容旧名：现与局域网鉴权守卫相同。"""
    _require_local_or_lan_ai_auth(request)


@settings_router.get("/settings/ai/pending_prompts")
def list_pending_prompts(request: Request):
    _require_loopback(request)
    return {"prompts": ai_pending_prompts.list_pending(), "count": ai_pending_prompts.count_pending()}


@settings_router.post("/settings/ai/pending_prompts/submit_credential")
def submit_pending_credential(request: Request, body: AiPendingCredentialSubmit):
    _require_loopback(request)
    if not body.password:
        raise HTTPException(400, "密码不能为空")
    result = ai_datasource_ops.apply_credential(body.prompt_id, body.password)
    if not result.get("ok"):
        raise HTTPException(400, result.get("error") or "提交失败")
    return result


@settings_router.post("/settings/ai/pending_prompts/submit_confirm")
async def submit_pending_confirm(request: Request, body: AiPendingConfirmSubmit):
    _require_loopback(request)
    result = await ai_pending_actions.apply_confirm(body.prompt_id, body.confirmed)
    if not result.get("ok"):
        raise HTTPException(400, result.get("error") or "提交失败")
    return result


@settings_router.get("/settings/ai/tools")
def list_ai_tools(request: Request):
    _require_loopback(request)
    from modules import ai_tool_catalog

    settings = ai_config.load_ai_settings()
    return {
        "tools": ai_tool_catalog.catalog_entries(settings),
        "write_tools_enabled": bool(settings.get("write_tools_enabled")),
        "categories": ai_tool_catalog.CATEGORY_LABELS,
    }


@settings_router.patch("/settings/ai/tools")
def patch_ai_tool_toggle(request: Request, body: AiToolTogglePatch):
    _require_loopback(request)
    from modules import ai_tool_catalog

    if body.tool:
        result = ai_tool_catalog.set_tool_enabled(body.tool, bool(body.enabled))
        return {"ok": True, **result, "tools": ai_tool_catalog.catalog_entries()}
    if body.disabled_tools is not None:
        ai_config.save_ai_settings({"disabled_tools": body.disabled_tools})
        return {"ok": True, "tools": ai_tool_catalog.catalog_entries()}
    raise HTTPException(400, "需提供 tool+enabled 或 disabled_tools")


@settings_router.get("/settings/client_prefs/mirror")
def get_client_prefs_mirror(request: Request):
    _require_loopback(request)
    from pathlib import Path

    from core.settings import DATA_DIR

    path = Path(DATA_DIR) / "client_prefs_mirror.json"
    if not path.is_file():
        return {"ok": True, "mirror_exists": False}
    import json

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"ok": False, "error": "镜像读取失败"}
    if not isinstance(data, dict):
        return {"ok": True, "mirror_exists": False}
    return {"ok": True, "mirror_exists": True, **data}


@settings_router.post("/settings/client_prefs/mirror")
def mirror_client_prefs(request: Request, body: dict[str, Any]):
    _require_loopback(request)
    from pathlib import Path

    from core.settings import DATA_DIR

    path = Path(DATA_DIR) / "client_prefs_mirror.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    import json

    incoming = dict(body) if isinstance(body, dict) else {}
    existing: dict[str, Any] = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                existing = raw
        except (OSError, json.JSONDecodeError):
            existing = {}

    # 前端常规镜像（不含 pending_apply）：保留 AI 未消费的 pending
    if "pending_apply" not in incoming:
        if existing.get("pending_apply"):
            merged = {**incoming, **{k: existing[k] for k in ("pending_apply", "pending_token", "ui_reload") if k in existing}}
            path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
            return {"ok": True, "preserved_pending": True}
        path.write_text(json.dumps(incoming, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"ok": True}

    # 前端 ack 清除 pending：仅当 token 一致（或旧镜像无 token）才清；否则保留更新的 pending
    if incoming.get("pending_apply") is False:
        ack = incoming.get("ack_pending_token")
        cur_token = existing.get("pending_token")
        if existing.get("pending_apply") and cur_token and ack and cur_token != ack:
            preserved = {
                **{k: v for k, v in incoming.items() if k not in ("pending_apply", "ui_reload", "ack_pending_token", "pending_token")},
                "pending_apply": True,
                "pending_token": cur_token,
                "ui_reload": existing.get("ui_reload") if isinstance(existing.get("ui_reload"), dict) else {},
            }
            path.write_text(json.dumps(preserved, ensure_ascii=False, indent=2), encoding="utf-8")
            return {"ok": True, "preserved_pending": True, "pending_token": cur_token}
        cleared = {k: v for k, v in incoming.items() if k not in ("ack_pending_token", "pending_token")}
        cleared["pending_apply"] = False
        cleared["ui_reload"] = incoming.get("ui_reload") if isinstance(incoming.get("ui_reload"), dict) else {}
        cleared.pop("pending_token", None)
        path.write_text(json.dumps(cleared, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"ok": True, "cleared_pending": True}

    # 显式写入 pending（少见）；直接落盘
    path.write_text(json.dumps(incoming, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


@settings_router.post("/settings/ai/pending_prompts/cancel")
def cancel_pending_prompt(request: Request, body: dict[str, Any]):
    _require_loopback(request)
    pid = str(body.get("prompt_id") or "").strip()
    if not pid:
        raise HTTPException(400, "缺少 prompt_id")
    return ai_pending_prompts.cancel_prompt(pid)
