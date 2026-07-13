/** AI 设置：上游模型列表与当前模型名一致性。 */

const EMBEDDING_OR_NON_CHAT = /embed|bge|rerank|clip|speech|tts|whisper/i

export function isModelInUpstreamList(model: string, models: string[]): boolean {
  const m = model.trim()
  if (!m) return false
  return models.some((x) => x.trim() === m)
}

/** 优先选非 embedding/rerank 类；否则退回列表第一项。 */
export function pickPreferredChatModel(models: string[]): string | null {
  const cleaned = models.map((x) => x.trim()).filter(Boolean)
  if (!cleaned.length) return null
  const chat = cleaned.find((m) => !EMBEDDING_OR_NON_CHAT.test(m))
  return chat || cleaned[0] || null
}
