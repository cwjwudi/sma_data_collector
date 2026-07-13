import { describe, expect, it } from 'vitest'
import { hasUnclosedFence, renderAssistantMarkdown } from './render-md'

describe('render-md', () => {
  it('detects unclosed fence', () => {
    expect(hasUnclosedFence('```js\ncode')).toBe(true)
    expect(hasUnclosedFence('```js\ncode\n```')).toBe(false)
  })

  it('renders list without raw html', () => {
    const html = renderAssistantMarkdown('- a\n- b')
    expect(html).toContain('<li>')
    expect(renderAssistantMarkdown('<script>x</script>')).not.toContain('<script>')
  })
})
