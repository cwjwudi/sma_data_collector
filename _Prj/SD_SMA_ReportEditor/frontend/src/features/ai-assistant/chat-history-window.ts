/**
 * 发给 LLM 的对话窗口：抽屉可保留长历史，请求只带最近若干条，减轻复述啰嗦。
 */

export const AI_CHAT_REQUEST_MAX_MESSAGES = 8

export type ChatRoleMessage = {
  role: 'user' | 'assistant'
  content: string
}

/** 取末尾最多 max 条；若截断后首条是 assistant，再丢掉，避免半轮开场。 */
export function sliceRecentChatMessages<T extends ChatRoleMessage>(
  messages: readonly T[],
  max = AI_CHAT_REQUEST_MAX_MESSAGES,
): T[] {
  if (max <= 0) return []
  let sliced = messages.length > max ? messages.slice(-max) : [...messages]
  while (sliced.length && sliced[0]!.role === 'assistant') {
    sliced = sliced.slice(1)
  }
  return sliced
}
