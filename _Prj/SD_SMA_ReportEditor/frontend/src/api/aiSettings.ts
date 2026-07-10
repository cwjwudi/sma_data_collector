import { apiFetch } from './client.js'

export type AiSettingsPublic = {
  enabled: boolean
  llm_base_url: string
  llm_model: string
  has_llm_api_key: boolean
  has_agent_token: boolean
  agent_token_hint: string
  allow_lan_access: boolean
  write_tools_enabled: boolean
  agent_chat_url_loopback: string
  agent_chat_url_lan: string | null
  ready: boolean
}

export type AiSettingsPatch = {
  enabled?: boolean
  llm_base_url?: string
  llm_model?: string
  llm_api_key?: string
  allow_lan_access?: boolean
  write_tools_enabled?: boolean
}

export type AiChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type AiPageContext = {
  route?: string
  routeName?: string
  templateId?: string | null
  recentError?: string | null
}

export async function fetchAiSettings(): Promise<AiSettingsPublic> {
  return apiFetch('/settings/ai')
}

export async function patchAiSettings(patch: AiSettingsPatch): Promise<AiSettingsPublic> {
  return apiFetch('/settings/ai', { method: 'PATCH', body: patch })
}

export async function regenerateAgentToken(): Promise<AiSettingsPublic & { agent_token?: string; note?: string }> {
  return apiFetch('/settings/ai/regenerate_agent_token', { method: 'POST' })
}

export async function sendAiChat(opts: {
  messages: AiChatMessage[]
  pageContext?: AiPageContext | null
}): Promise<{ choices?: { message?: { content?: string } }[] }> {
  return apiFetch('/settings/ai/chat', {
    method: 'POST',
    body: {
      messages: opts.messages,
      report_editor_page_context: opts.pageContext || undefined,
    },
  })
}

export function extractAssistantText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const choices = (data as { choices?: unknown[] }).choices
  if (!Array.isArray(choices) || !choices.length) return ''
  const msg = (choices[0] as { message?: { content?: unknown } })?.message
  const content = msg?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === 'object' && p && 'text' in p ? String((p as { text?: unknown }).text || '') : ''))
      .join('')
      .trim()
  }
  return ''
}
