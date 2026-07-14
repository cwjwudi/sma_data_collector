/** AiDrawer 会话本机持久化。 */

export const AI_CHAT_STORAGE_KEY = 'report-editor-ai-chat-v1'
export const AI_CHAT_MAX_MESSAGES = 50
export const AI_CHAT_MAX_CHARS = 200_000

export type PersistedAiMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'queued' | 'streaming' | 'done' | 'cancelled' | 'error'
  toolTrace?: Array<{
    round?: number
    name: string
    args_summary?: Record<string, unknown>
    ok: boolean
    message?: string
  }>
}

export type AiChatPersistState = {
  messages: PersistedAiMessage[]
  drawerWidthPx: number
  /** 近全屏展开（016 Q1=C） */
  expanded: boolean
}

export function clampDrawerWidth(px: number, min = 320, max = 720): number {
  if (!Number.isFinite(px)) return min
  return Math.min(max, Math.max(min, Math.round(px)))
}

export function sanitizeMessagesForPersist(messages: PersistedAiMessage[]): PersistedAiMessage[] {
  const cleaned = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .filter((m) => m.status !== 'queued')
    .map((m) => ({
      id: String(m.id || ''),
      role: m.role,
      content: String(m.content || ''),
      status: m.status === 'streaming' || m.status === 'cancelled' || m.status === 'error' ? m.status : 'done',
      toolTrace: Array.isArray(m.toolTrace) ? m.toolTrace : undefined,
    }))
    .filter((m) => m.id)
  let sliced = cleaned.slice(-AI_CHAT_MAX_MESSAGES)
  let total = sliced.reduce((n, m) => n + m.content.length, 0)
  while (sliced.length > 1 && total > AI_CHAT_MAX_CHARS) {
    const removed = sliced.shift()
    total -= removed?.content.length || 0
  }
  return sliced
}

export function loadAiChatPersist(storage: Storage = localStorage): AiChatPersistState | null {
  try {
    const raw = storage.getItem(AI_CHAT_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<AiChatPersistState>
    if (!data || !Array.isArray(data.messages)) return null
    return {
      messages: sanitizeMessagesForPersist(data.messages as PersistedAiMessage[]),
      drawerWidthPx: clampDrawerWidth(Number(data.drawerWidthPx) || 420),
      expanded: Boolean(data.expanded),
    }
  } catch {
    return null
  }
}

export function saveAiChatPersist(
  state: AiChatPersistState,
  storage: Storage = localStorage,
): void {
  const payload: AiChatPersistState = {
    messages: sanitizeMessagesForPersist(state.messages),
    drawerWidthPx: clampDrawerWidth(state.drawerWidthPx),
    expanded: Boolean(state.expanded),
  }
  storage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(payload))
}

export function clearAiChatPersist(storage: Storage = localStorage): void {
  storage.removeItem(AI_CHAT_STORAGE_KEY)
}
