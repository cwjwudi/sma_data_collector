/** 助手气泡轻量 Markdown（禁原始 HTML）。 */
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

/** 未闭合 fence：整段当纯文本转义，避免半成品崩布局。 */
export function renderAssistantMarkdown(source: string): string {
  const text = source ?? ''
  if (hasUnclosedFence(text)) {
    return escapeHtml(text).replace(/\n/g, '<br>')
  }
  return md.render(text)
}

export function hasUnclosedFence(text: string): boolean {
  const matches = text.match(/^```/gm)
  return Boolean(matches && matches.length % 2 === 1)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
