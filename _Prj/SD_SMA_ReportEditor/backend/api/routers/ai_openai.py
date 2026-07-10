"""OpenAI 兼容 /v1 网关与应用内 AI 设置 API。"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from modules import ai_config, ai_datasource_ops, ai_pending_prompts, ai_tools
from schemas.ai import AiChatRequest, AiPendingConfirmSubmit, AiPendingCredentialSubmit, AiSettingsPatch, OpenAiChatCompletionRequest

logger = logging.getLogger(__name__)

openai_router = APIRouter(tags=["ai-openai"])
settings_router = APIRouter(tags=["ai-settings"])

MAX_TOOL_ROUNDS = 8
SYSTEM_PROMPT = (
    "你是 SD_SMA_ReportEditor（报表编辑器）的 AI 助手，帮助用户诊断数据库/OPC UA 连接、"
    "导出/结批失败与模版配置。优先调用工具获取事实，不要编造连接状态或审计内容。"
    "开发/排障时优先 get_dev_runtime_snapshot 或 diagnose_work_chain；改数据源相关代码前先跑链路对齐现场。"
    "禁止向用户索要或输出数据库/OPC 密码明文；密码与删除确认仅在报表软件 UI 弹框完成。"
    "收到 awaiting_user_credentials 或 awaiting_user_confirm 时，提示用户到本机报表软件内操作。"
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
            "Agent API 默认仅允许本机访问。若需局域网接入 Cursor，请在设置中开启「允许局域网访问 Agent API」。",
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
        detail = resp.text[:2000]
        raise HTTPException(resp.status_code, f"LLM 上游错误：{detail}")
    try:
        return resp.json()
    except json.JSONDecodeError as e:
        raise HTTPException(502, "LLM 返回非 JSON 响应") from e


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
    tools = body.tools if body.tools is not None else ai_tools.TOOL_DEFINITIONS

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
        raise HTTPException(400, "0.3.0 暂不支持 stream=true，请使用非流式请求。")

    for _ in range(MAX_TOOL_ROUNDS):
        data = await _forward_llm(settings=settings, api_key=api_key, payload=upstream_payload)
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        tool_calls = message.get("tool_calls")
        if not tool_calls:
            return data

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
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.get("id") or str(uuid.uuid4()),
                    "content": json.dumps(tool_result, ensure_ascii=False),
                }
            )
        upstream_payload["messages"] = messages

    raise HTTPException(504, f"工具调用超过 {MAX_TOOL_ROUNDS} 轮上限")


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
    return await run_chat_completion(body, request=request)


@settings_router.get("/settings/ai")
def get_ai_settings():
    port = ai_config.resolve_backend_port()
    return ai_config.public_ai_settings(port=port)


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
    """应用内助手：仅本机，无需 Bearer。"""
    client_host = request.client.host if request.client else None
    if not ai_config.is_loopback_host(client_host):
        raise HTTPException(403, "应用内 AI 聊天仅允许本机访问。")
    req = OpenAiChatCompletionRequest(
        model=body.model,
        messages=body.messages,
        stream=body.stream,
        report_editor_page_context=body.report_editor_page_context,
    )
    return await run_chat_completion(req, skip_agent_auth=True)


@settings_router.get("/settings/ai/status")
def ai_status():
    port = ai_config.resolve_backend_port()
    pub = ai_config.public_ai_settings(port=port)
    return JSONResponse(pub)


def _require_loopback(request: Request) -> None:
    client_host = request.client.host if request.client else None
    if not ai_config.is_loopback_host(client_host):
        raise HTTPException(403, "此 API 仅允许本机访问。")


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
    result = await ai_datasource_ops.apply_confirm_delete(body.prompt_id, body.confirmed)
    if not result.get("ok"):
        raise HTTPException(400, result.get("error") or "提交失败")
    return result


@settings_router.post("/settings/ai/pending_prompts/cancel")
def cancel_pending_prompt(request: Request, body: dict[str, Any]):
    _require_loopback(request)
    pid = str(body.get("prompt_id") or "").strip()
    if not pid:
        raise HTTPException(400, "缺少 prompt_id")
    return ai_pending_prompts.cancel_prompt(pid)
