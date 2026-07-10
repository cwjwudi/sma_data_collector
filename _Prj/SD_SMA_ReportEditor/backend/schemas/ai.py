from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AiSettingsPatch(BaseModel):
    enabled: bool | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    allow_lan_access: bool | None = None
    write_tools_enabled: bool | None = None


class AiChatRequest(BaseModel):
    messages: list[dict[str, Any]] = Field(default_factory=list)
    model: str | None = None
    stream: bool | None = False
    report_editor_page_context: dict[str, Any] | None = None


class OpenAiChatCompletionRequest(BaseModel):
    model: str | None = None
    messages: list[dict[str, Any]] = Field(default_factory=list)
    tools: list[dict[str, Any]] | None = None
    tool_choice: Any | None = None
    stream: bool | None = False
    temperature: float | None = None
    max_tokens: int | None = None
    report_editor_page_context: dict[str, Any] | None = None
