import { describe, expect, it } from 'vitest'
import { AI_CHAT_QUEUE_MAX, dequeue, enqueue, removeQueued } from './chat-queue'

describe('chat-queue', () => {
  it('enqueues until max', () => {
    let q: { id: string; content: string }[] = []
    for (let i = 0; i < AI_CHAT_QUEUE_MAX; i++) {
      const r = enqueue(q, { id: `i${i}`, content: `c${i}` })
      expect(r.ok).toBe(true)
      if (r.ok) q = r.queue
    }
    const full = enqueue(q, { id: 'x', content: 'y' })
    expect(full.ok).toBe(false)
  })

  it('removes and dequeues', () => {
    const q = [
      { id: 'a', content: '1' },
      { id: 'b', content: '2' },
    ]
    expect(removeQueued(q, 'a')).toEqual([{ id: 'b', content: '2' }])
    expect(dequeue(q)).toEqual({ next: { id: 'a', content: '1' }, rest: [{ id: 'b', content: '2' }] })
  })
})
