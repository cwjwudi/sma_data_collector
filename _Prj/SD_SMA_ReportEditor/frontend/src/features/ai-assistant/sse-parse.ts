/** SSE 客户端解析（AiDrawer 流式）。 */

export type AiStreamEvent =
  | { event: 'status'; phase?: string }
  | { event: 'tool'; step: Record<string, unknown> }
  | { event: 'delta'; text: string }
  | { event: 'replace'; text: string }
  | { event: 'done'; tool_trace?: unknown; finish_reason?: string }
  | { event: 'error'; message: string }

/**
 * 增量喂入 SSE 文本，解析完整事件。粘包安全：保留未完成尾部。
 */
export function createSseParser(onEvent: (ev: AiStreamEvent) => void) {
  let buffer = ''

  function feed(chunk: string) {
    buffer += chunk
    // 按空行分帧（\n\n）
    while (true) {
      const sep = buffer.indexOf('\n\n')
      if (sep < 0) break
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const ev = parseSseFrame(frame)
      if (ev) onEvent(ev)
    }
  }

  function flush() {
    if (!buffer.trim()) return
    const ev = parseSseFrame(buffer)
    buffer = ''
    if (ev) onEvent(ev)
  }

  return { feed, flush }
}

export function parseSseFrame(frame: string): AiStreamEvent | null {
  const lines = frame.split(/\r?\n/)
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (!dataLines.length) return null
  const raw = dataLines.join('\n')
  let data: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
  } catch {
    return null
  }
  switch (eventName) {
    case 'status':
      return { event: 'status', phase: typeof data.phase === 'string' ? data.phase : undefined }
    case 'tool':
      return { event: 'tool', step: data }
    case 'delta':
      return { event: 'delta', text: typeof data.text === 'string' ? data.text : '' }
    case 'replace':
      return { event: 'replace', text: typeof data.text === 'string' ? data.text : '' }
    case 'done':
      return {
        event: 'done',
        tool_trace: data.tool_trace,
        finish_reason: typeof data.finish_reason === 'string' ? data.finish_reason : undefined,
      }
    case 'error':
      return {
        event: 'error',
        message: typeof data.message === 'string' ? data.message : '流式错误',
      }
    default:
      return null
  }
}
