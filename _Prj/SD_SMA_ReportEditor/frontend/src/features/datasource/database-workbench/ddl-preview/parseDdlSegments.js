const TITLES = {
  preamble: '表头 / CREATE TABLE',
  columns: '列定义',
  keys: '索引与 KEY',
  constraints: '约束 CONSTRAINT',
  partition: '分区 PARTITION',
  footer: '表选项 / 尾部',
  raw: 'DDL',
}

function classifyLine(trimmed, engine) {
  if (!trimmed) return 'columns'

  if (/\/\*![\d\s]*.*\bPARTITION\s+BY\b/i.test(trimmed)) return 'partition'
  if (/\bPARTITION\s+BY\b/i.test(trimmed)) return 'partition'

  if (
    /^\)\s*(ENGINE|AUTO_INCREMENT|DEFAULT\s+CHARSET|ROW_FORMAT|COMMENT|STATS_PERSISTENT|INSERT_METHOD|DATA\s+DIRECTORY|PACK_KEYS|DELAY_KEY_WRITE|MIN_ROWS|MAX_ROWS)/i.test(
      trimmed,
    )
  ) {
    return 'footer'
  }
  if (/^\)\s*;?\s*$/.test(trimmed)) return 'footer'
  if (/^(DEFAULT\s+CHARSET|COLLATE|ENGINE|COMMENT|AUTO_INCREMENT)\s*=/i.test(trimmed)) return 'footer'
  if (/^\)\s*STRICT\b/i.test(trimmed)) return 'footer'

  if (/^\s*PRIMARY\s+KEY\b/i.test(trimmed)) return 'keys'
  if (/^\s*UNIQUE\s+(KEY|INDEX)\b/i.test(trimmed)) return 'keys'
  if (/^\s*UNIQUE\s*\(/i.test(trimmed)) return 'keys'
  if (/^\s*KEY\b/i.test(trimmed)) return 'keys'
  if (/^\s*(FULLTEXT|SPATIAL)\s+/i.test(trimmed)) return 'keys'
  if (/^\s*INDEX\b/i.test(trimmed)) return 'keys'

  if (/^\s*CONSTRAINT\b/i.test(trimmed)) return 'constraints'
  if (/^\s*FOREIGN\s+KEY\b/i.test(trimmed)) return 'constraints'
  if (/^\s*CHECK\s*\(/i.test(trimmed)) return 'constraints'

  if (/^\s*`/.test(trimmed)) return 'columns'
  if (/^\s*"/.test(trimmed)) return 'columns'

  if (engine === 'sqlite') {
    if (/^\s*[a-zA-Z_]\w*\s+(INTEGER|TEXT|REAL|BLOB|NUMERIC|INT|BIGINT|TINYINT|SMALLINT|MEDIUMINT)\b/i.test(trimmed)) {
      return 'columns'
    }
  }

  if (/^\s+[a-zA-Z_]\w*\s+[a-zA-Z][a-zA-Z0-9_]*\b/i.test(trimmed)) {
    if (!/^\s*(PRIMARY|FOREIGN|CONSTRAINT|CHECK|KEY|INDEX|UNIQUE|FULLTEXT|SPATIAL)\b/i.test(trimmed)) {
      return 'columns'
    }
  }

  return 'footer'
}

/** 启发式拆分 DDL，失败或无明显分段时退回 raw 整块。 */
export function parseDdlSegments(raw, engineRaw) {
  const engine = (engineRaw || '').toLowerCase()
  const text = raw ?? ''
  const lines = text.split(/\r?\n/)

  const buckets = {
    preamble: [],
    columns: [],
    keys: [],
    constraints: [],
    partition: [],
    footer: [],
  }

  let seenCreate = false
  /** @type {'preamble'|'columns'|'keys'|'constraints'|'partition'|'footer'} */
  let lastKind = 'columns'

  for (const line of lines) {
    const trimmed = line.trim()
    if (!seenCreate) {
      buckets.preamble.push(line)
      if (/CREATE\s+TABLE/i.test(trimmed)) seenCreate = true
      continue
    }

    if (!trimmed) {
      buckets[lastKind].push(line)
      continue
    }

    const kind = classifyLine(trimmed, engine)
    buckets[kind].push(line)
    lastKind = kind
  }

  const order = ['preamble', 'columns', 'keys', 'constraints', 'partition', 'footer']
  const filled = order.filter((k) => buckets[k].length > 0)

  if (filled.length <= 1) {
    return [{ kind: 'raw', title: TITLES.raw, lines }]
  }

  return filled.map((k) => ({
    kind: k,
    title: TITLES[k],
    lines: buckets[k],
  }))
}
