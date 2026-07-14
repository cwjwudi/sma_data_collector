import { describe, expect, it } from 'vitest'
import {
  clampDrawerWidth,
  clampExpandedHeight,
  clampExpandedWidth,
  defaultExpandedSize,
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

  it('defaults expanded near full viewport', () => {
    const d = defaultExpandedSize(1600, 1000)
    expect(d.width).toBeGreaterThanOrEqual(1400)
    expect(d.height).toBeGreaterThanOrEqual(900)
  })

  it('clamps expanded size to viewport', () => {
    expect(clampExpandedWidth(100, 1200)).toBe(520)
    expect(clampExpandedWidth(9999, 1200)).toBe(1200 - 24)
    expect(clampExpandedHeight(100, 800)).toBe(420)
    expect(clampExpandedHeight(9999, 800)).toBe(800 - 24)
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
    const w = clampExpandedWidth(900)
    const h = clampExpandedHeight(700)
    saveAiChatPersist(
      {
        messages: [{ id: 'u1', role: 'user', content: 'q', status: 'done' }],
        drawerWidthPx: 500,
        expanded: true,
        expandedWidthPx: w,
        expandedHeightPx: h,
      },
      storage,
    )
    const loaded = loadAiChatPersist(storage)
    expect(loaded?.drawerWidthPx).toBe(500)
    expect(loaded?.expanded).toBe(true)
    expect(loaded?.expandedWidthPx).toBe(w)
    expect(loaded?.expandedHeightPx).toBe(h)
    expect(loaded?.messages[0].content).toBe('q')
  })
})
