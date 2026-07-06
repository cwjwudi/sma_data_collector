import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { normalizeReleaseNotes, resolveManifestReleaseNotes } = require('../../../../electron/updater.cjs')

describe('release notes helpers', () => {
  it('normalizes string notes', () => {
    expect(normalizeReleaseNotes('  hello\nworld  ')).toBe('hello\nworld')
  })

  it('normalizes array notes from electron-updater', () => {
    expect(
      normalizeReleaseNotes([
        { note: 'line one' },
        { text: 'line two' },
        'line three',
      ]),
    ).toBe('line one\nline two\nline three')
  })

  it('reads notes from manifest object', () => {
    expect(
      resolveManifestReleaseNotes({
        version: '0.1.27',
        notes: 'Report Editor 0.1.27\n\n- item',
      }),
    ).toContain('0.1.27')
  })
})
