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

from modules import ai_config, ai_datasource_ops, ai_pending_actions, ai_pending_prompts, ai_tools
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
    "——能力域与必调工具——"
    "定时探活开/关：必须 update_connection_probe_settings（开启传 enabled=true）。"
    "配置 DB/OPC：upsert_db_connection / upsert_opc_server；密码用 request_connection_credentials；删除用 delete_*（确认流）。"
    "模版/版式：copy_* / create_blank_* / delete_*（确认）/ set_template_display_order；打开编辑用 request_open_*。"
    "备份/导入/复位：request_config_backup_export / request_config_import_merge / request_config_reset；"
    "加密 .rebak 含口令，不得把备份内容或口令返回给 LLM。"
    "演示库/冒烟模版：ensure_user_demo_database / create_binding_smoke_template / apply_template_sheet_layouts。"
    "导出目录：set_export_dir 或 request_pick_export_dir。"
    "预检/模拟结批：preflight_export / request_manual_export（仅排队，需本机确认后导出）。"
    "结批写回/并行：set_export_result_feedback / set_max_parallel_exports；触发检查用 check_auto_trigger_bindings。"
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
        raise HTTPException(resp.status_code, format_llm_upstream_error(resp.status_code, resp.text[:2000]))
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

    merged = dict(body) if isinstance(body, dict) else {}
    incoming_sets_pending = isinstance(body, dict) and "pending_apply" in body
    if path.is_file() and not incoming_sets_pending:
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(existing, dict) and existing.get("pending_apply"):
                # 保留 AI 写入的 pending 补丁，避免被前端常规镜像冲掉
                merged = {**merged, **existing}
        except (OSError, json.JSONDecodeError):
            pass
    if merged.get("pending_apply") is False:
        merged["pending_apply"] = False
    path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


@settings_router.post("/settings/ai/pending_prompts/cancel")
def cancel_pending_prompt(request: Request, body: dict[str, Any]):
    _require_loopback(request)
    pid = str(body.get("prompt_id") or "").strip()
    if not pid:
        raise HTTPException(400, "缺少 prompt_id")
    return ai_pending_prompts.cancel_prompt(pid)
