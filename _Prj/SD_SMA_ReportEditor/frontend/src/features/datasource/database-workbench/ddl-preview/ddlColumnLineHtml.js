import { varcharCharByteTooltip } from './ddlTypeTooltips.js'

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

const KW_RE =
  /\b(NOT\s+NULL|NULL|DEFAULT|AUTO_INCREMENT|PRIMARY\s+KEY|UNIQUE|REFERENCES|UNSIGNED|ZEROFILL|GENERATED|STORED|VIRTUAL|CONSTRAINT|CHECK|FOREIGN\s+KEY)\b/gi

function highlightKeywords(htmlEscaped) {
  return htmlEscaped.replace(KW_RE, '<span class="ddl-kw">$1</span>')
}

/** 列定义行：关键字淡高亮 + VARCHAR/CHAR(n) 悬停说明。 */
export function columnLineToHtml(line, charset) {
  const re = /(\b(?:VAR)?CHAR\s*\(\s*(\d+)\s*\))/gi
  let last = 0
  let out = ''
  const mAll = [...line.matchAll(re)]
  for (const m of mAll) {
    const idx = m.index ?? 0
    const full = m[1]
    const len = Number(m[2])
    const before = line.slice(last, idx)
    out += highlightKeywords(escapeHtml(before))
    const tip = varcharCharByteTooltip(full, len, charset)
    out += `<span class="ddl-tip" title="${escapeAttr(tip)}">${escapeHtml(full)}</span>`
    last = idx + full.length
  }
  out += highlightKeywords(escapeHtml(line.slice(last)))
  return out
}

/** NOT NULL 且无常见默认值形态时标黄提示风险。 */
export function isNotNullWithoutDefaultRisk(line) {
  const u = line.toUpperCase()
  if (!/\bNOT\s+NULL\b/.test(u)) return false
  if (/\bDEFAULT\b/.test(u)) return false
  if (/\bAUTO_INCREMENT\b/.test(u)) return false
  if (/\bGENERATED\b/.test(u)) return false
  if (/ON\s+UPDATE\s+CURRENT_TIMESTAMP/i.test(line)) return false
  if (/\bSERIAL\b|\bBIGSERIAL\b|\bSMALLSERIAL\b/.test(u)) return false
  return true
}
