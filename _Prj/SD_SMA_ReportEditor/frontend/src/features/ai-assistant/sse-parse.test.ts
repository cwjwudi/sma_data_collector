import { describe, expect, it } from 'vitest'
import { createSseParser, parseSseFrame } from './sse-parse'

describe('sse-parse', () => {
  it('parses delta frame', () => {
    const ev = parseSseFrame('event: delta\ndata: {"text":"你好"}')
    expect(ev).toEqual({ event: 'delta', text: '你好' })
  })

  it('feeds sticky chunks across packets', () => {
    const events: unknown[] = []
    const p = createSseParser((e) => events.push(e))
    p.feed('event: delta\ndata: {"text":"a"')
    expect(events).toHaveLength(0)
    p.feed('}\n\nevent: done\ndata: {"finish_reason":"stop"}\n\n')
    expect(events).toEqual([
      { event: 'delta', text: 'a' },
      { event: 'done', tool_trace: undefined, finish_reason: 'stop' },
    ])
  })

  it('parses error', () => {
    expect(parseSseFrame('event: error\ndata: {"message":"额度不足"}')).toEqual({
      event: 'error',
      message: '额度不足',
    })
  })
})
