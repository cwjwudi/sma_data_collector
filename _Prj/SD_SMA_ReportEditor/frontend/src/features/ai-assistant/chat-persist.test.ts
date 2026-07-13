import { describe, expect, it } from 'vitest'
import {
  clampDrawerWidth,
  loadAiChatPersist,
  sanitizeMessagesForPersist,
  saveAiChatPersist,
} from './chat-persist'

describe('chat-persist', () => {
  it('clamps width', () => {
    expect(clampDrawerWidth(100)).toBe(320)
    expect(clampDrawerWidth(9999)).toBe(720)
    expect(clampDrawerWidth(400)).toBe(400)
  })

  it('drops queued and keeps ids', () => {
    const out = sanitizeMessagesForPersist([
      { id: '1', role: 'user', content: 'hi', status: 'queued' },
      { id: '2', role: 'assistant', content: 'ok', status: 'done' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('2')
  })

  it('roundtrips via memory storage', () => {
    const mem: Record<string, string> = {}
    const storage = {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => {
        mem[k] = v
      },
      removeItem: (k: string) => {
        delete mem[k]
      },
    } as Storage
    saveAiChatPersist(
      {
        messages: [{ id: 'u1', role: 'user', content: 'q', status: 'done' }],
        drawerWidthPx: 500,
      },
      storage,
    )
    const loaded = loadAiChatPersist(storage)
    expect(loaded?.drawerWidthPx).toBe(500)
    expect(loaded?.messages[0].content).toBe('q')
  })
})
