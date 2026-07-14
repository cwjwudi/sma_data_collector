/** 聊天队列纯逻辑。 */

export const AI_CHAT_QUEUE_MAX = 5

export type QueuedChatItem = {
  id: string
  content: string
}

export function canEnqueue(queueLength: number, max = AI_CHAT_QUEUE_MAX): boolean {
  return queueLength < max
}

export function enqueue(
  queue: QueuedChatItem[],
  item: QueuedChatItem,
  max = AI_CHAT_QUEUE_MAX,
): { ok: true; queue: QueuedChatItem[] } | { ok: false; reason: string } {
  if (!canEnqueue(queue.length, max)) {
    return { ok: false, reason: `排队已满（最多 ${max} 条）` }
  }
  return { ok: true, queue: [...queue, item] }
}

export function removeQueued(queue: QueuedChatItem[], id: string): QueuedChatItem[] {
  return queue.filter((q) => q.id !== id)
}

export function dequeue(queue: QueuedChatItem[]): {
  next: QueuedChatItem | null
  rest: QueuedChatItem[]
} {
  if (!queue.length) return { next: null, rest: [] }
  const [next, ...rest] = queue
  return { next, rest }
}
