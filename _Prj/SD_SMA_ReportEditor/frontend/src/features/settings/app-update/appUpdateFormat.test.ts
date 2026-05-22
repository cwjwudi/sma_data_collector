import { describe, expect, it } from 'vitest'
import {
  formatUpdateBytes,
  formatUpdateDuration,
  formatUpdateSpeed,
} from './appUpdateFormat'

describe('appUpdateFormat', () => {
  it('formatUpdateBytes', () => {
    expect(formatUpdateBytes(512)).toBe('512 B')
    expect(formatUpdateBytes(1536)).toBe('1.5 KB')
    expect(formatUpdateBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formatUpdateSpeed', () => {
    expect(formatUpdateSpeed(null)).toBe('—')
    expect(formatUpdateSpeed(2048)).toBe('2.0 KB/s')
    expect(formatUpdateSpeed(3 * 1024 * 1024)).toBe('3.0 MB/s')
  })

  it('formatUpdateDuration', () => {
    expect(formatUpdateDuration(45)).toBe('45 秒')
    expect(formatUpdateDuration(125)).toBe('2 分 5 秒')
  })
})
