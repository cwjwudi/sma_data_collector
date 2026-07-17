import { describe, expect, it } from 'vitest'
import {
  AI_DRAWER_POS_KEY,
  AI_FAB_POS_KEY,
  AI_FAB_SIZE,
  clearAiFloatingPositions,
  clampFloatingPos,
  defaultFabPos,
  isDragNotClick,
  loadFloatingPos,
  saveFloatingPos,
} from './floating-pos'

function memoryStorage(): Storage {
  const mem: Record<string, string> = {}
  return {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => {
      mem[k] = v
    },
    removeItem: (k: string) => {
      delete mem[k]
    },
    clear: () => {
      for (const k of Object.keys(mem)) delete mem[k]
    },
    key: () => null,
    length: 0,
  }
}

describe('floating-pos', () => {
  it('U1: displacement <=5px is click', () => {
    expect(isDragNotClick(0, 0)).toBe(false)
    expect(isDragNotClick(3, 4)).toBe(false) // hypot=5
    expect(isDragNotClick(5, 0)).toBe(false)
  })

  it('U2: displacement >5px is drag', () => {
    expect(isDragNotClick(6, 0)).toBe(true)
    expect(isDragNotClick(4, 4)).toBe(true) // hypot≈5.66
  })

  it('U3/U4: clamp to pad and viewport edges', () => {
    const size = { width: 100, height: 80 }
    const vp = { width: 400, height: 300 }
    expect(clampFloatingPos({ left: -50, top: -20 }, size, vp)).toEqual({ left: 8, top: 8 })
    expect(clampFloatingPos({ left: 999, top: 999 }, size, vp)).toEqual({
      left: 400 - 100 - 8,
      top: 300 - 80 - 8,
    })
  })

  it('U5/U6: loadFloatingPos roundtrip and invalid', () => {
    const s = memoryStorage()
    expect(loadFloatingPos(AI_FAB_POS_KEY, s)).toBeNull()
    saveFloatingPos(AI_FAB_POS_KEY, { left: 12.6, top: 34.2 }, s)
    expect(loadFloatingPos(AI_FAB_POS_KEY, s)).toEqual({ left: 13, top: 34 })
    s.setItem(AI_FAB_POS_KEY, '{')
    expect(loadFloatingPos(AI_FAB_POS_KEY, s)).toBeNull()
    s.setItem(AI_FAB_POS_KEY, JSON.stringify({ left: 'x', top: 1 }))
    expect(loadFloatingPos(AI_FAB_POS_KEY, s)).toBeNull()
  })

  it('U7: clearAiFloatingPositions removes both keys', () => {
    const s = memoryStorage()
    saveFloatingPos(AI_FAB_POS_KEY, { left: 1, top: 2 }, s)
    saveFloatingPos(AI_DRAWER_POS_KEY, { left: 3, top: 4 }, s)
    clearAiFloatingPositions(s)
    expect(loadFloatingPos(AI_FAB_POS_KEY, s)).toBeNull()
    expect(loadFloatingPos(AI_DRAWER_POS_KEY, s)).toBeNull()
  })

  it('U8: defaultFabPos near bottom-right and clamped', () => {
    const vp = { width: 1280, height: 800 }
    const p = defaultFabPos(vp)
    expect(p.left).toBe(1280 - AI_FAB_SIZE.width - 28)
    expect(p.top).toBe(800 - AI_FAB_SIZE.height - 20)
    const tiny = defaultFabPos({ width: 50, height: 40 })
    expect(tiny.left).toBe(8)
    expect(tiny.top).toBe(8)
  })
})
