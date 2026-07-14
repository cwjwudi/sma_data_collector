import { describe, expect, it } from 'vitest'
import { extractToolTrace } from '@/api/aiSettings'

describe('extractToolTrace (006)', () => {
  it('reads report_editor_tool_trace steps', () => {
    const steps = extractToolTrace({
      report_editor_tool_trace: [
        {
          round: 1,
          name: 'update_connection_probe_settings',
          args_summary: { enabled: true },
          ok: true,
          message: '已开启',
        },
        { name: '', ok: false },
      ],
    })
    expect(steps).toHaveLength(1)
    expect(steps[0].name).toBe('update_connection_probe_settings')
    expect(steps[0].ok).toBe(true)
    expect(steps[0].args_summary?.enabled).toBe(true)
  })

  it('returns empty for missing/invalid', () => {
    expect(extractToolTrace(null)).toEqual([])
    expect(extractToolTrace({})).toEqual([])
    expect(extractToolTrace({ report_editor_tool_trace: 'x' })).toEqual([])
  })
})
