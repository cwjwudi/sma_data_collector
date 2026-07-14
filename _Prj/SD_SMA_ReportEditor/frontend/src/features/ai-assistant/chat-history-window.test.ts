import { describe, expect, it } from 'vitest'
import { sliceRecentChatMessages } from './chat-history-window'

describe('chat-history-window', () => {
  it('keeps only recent messages', () => {
    const msgs = [
      { role: 'user' as const, content: '1' },
      { role: 'assistant' as const, content: 'a1' },
      { role: 'user' as const, content: '2' },
      { role: 'assistant' as const, content: 'a2' },
      { role: 'user' as const, content: '3' },
      { role: 'assistant' as const, content: 'a3' },
    ]
    expect(sliceRecentChatMessages(msgs, 4)).toEqual([
      { role: 'user', content: '2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: 'a3' },
    ])
  })

  it('drops leading assistant after slice', () => {
    const msgs = [
      { role: 'user' as const, content: '1' },
      { role: 'assistant' as const, content: 'a1' },
      { role: 'user' as const, content: '2' },
    ]
    // max=2 → [a1, user2] → drop a1 → [user2]
    expect(sliceRecentChatMessages(msgs, 2)).toEqual([{ role: 'user', content: '2' }])
  })

  it('returns all when short', () => {
    const msgs = [{ role: 'user' as const, content: 'hi' }]
    expect(sliceRecentChatMessages(msgs, 8)).toEqual(msgs)
  })
})
