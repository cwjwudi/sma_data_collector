/** AiDrawer 会话本机持久化。 */

export const AI_CHAT_STORAGE_KEY = 'report-editor-ai-chat-v1'
export const AI_CHAT_MAX_MESSAGES = 50
export const AI_CHAT_MAX_CHARS = 200_000

/** 展开态默认约占视口（更大主对话区） */
export const EXPANDED_DEFAULT_WIDTH_RATIO = 0.96
export const EXPANDED_DEFAULT_HEIGHT_RATIO = 0.94
export const EXPANDED_MIN_WIDTH = 520
export const EXPANDED_MIN_HEIGHT = 420
export const EXPANDED_VIEWPORT_PAD = 12

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
  expandedWidthPx: number
  expandedHeightPx: number
}

export function clampDrawerWidth(px: number, min = 320, max = 720): number {
  if (!Number.isFinite(px)) return min
  return Math.min(max, Math.max(min, Math.round(px)))
}

export function viewportSize(
  win: { innerWidth: number; innerHeight: number } = typeof window !== 'undefined'
    ? window
    : { innerWidth: 1280, innerHeight: 800 },
): { vw: number; vh: number } {
  return { vw: win.innerWidth || 1280, vh: win.innerHeight || 800 }
}

export function defaultExpandedSize(vw?: number, vh?: number): { width: number; height: number } {
  const size = viewportSize(
    vw != null && vh != null ? { innerWidth: vw, innerHeight: vh } : undefined,
  )
  return {
    width: clampExpandedWidth(Math.round(size.vw * EXPANDED_DEFAULT_WIDTH_RATIO), size.vw),
    height: clampExpandedHeight(Math.round(size.vh * EXPANDED_DEFAULT_HEIGHT_RATIO), size.vh),
  }
}

export function clampExpandedWidth(px: number, vw?: number): number {
  const { vw: viewW } = viewportSize(vw != null ? { innerWidth: vw, innerHeight: 800 } : undefined)
  const max = Math.max(EXPANDED_MIN_WIDTH, viewW - EXPANDED_VIEWPORT_PAD * 2)
  if (!Number.isFinite(px)) return Math.min(max, Math.round(viewW * EXPANDED_DEFAULT_WIDTH_RATIO))
  return Math.min(max, Math.max(EXPANDED_MIN_WIDTH, Math.round(px)))
}

export function clampExpandedHeight(px: number, vh?: number): number {
  const { vh: viewH } = viewportSize(vh != null ? { innerWidth: 1280, innerHeight: vh } : undefined)
  const max = Math.max(EXPANDED_MIN_HEIGHT, viewH - EXPANDED_VIEWPORT_PAD * 2)
  if (!Number.isFinite(px)) return Math.min(max, Math.round(viewH * EXPANDED_DEFAULT_HEIGHT_RATIO))
  return Math.min(max, Math.max(EXPANDED_MIN_HEIGHT, Math.round(px)))
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
    const defs = defaultExpandedSize()
    return {
      messages: sanitizeMessagesForPersist(data.messages as PersistedAiMessage[]),
      drawerWidthPx: clampDrawerWidth(Number(data.drawerWidthPx) || 420),
      expanded: Boolean(data.expanded),
      expandedWidthPx: clampExpandedWidth(Number(data.expandedWidthPx) || defs.width),
      expandedHeightPx: clampExpandedHeight(Number(data.expandedHeightPx) || defs.height),
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
    expandedWidthPx: clampExpandedWidth(state.expandedWidthPx),
    expandedHeightPx: clampExpandedHeight(state.expandedHeightPx),
  }
  storage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(payload))
}

export function clearAiChatPersist(storage: Storage = localStorage): void {
  storage.removeItem(AI_CHAT_STORAGE_KEY)
}
