import { isNotNullWithoutDefaultRisk } from './ddlColumnLineHtml.js'

/** 从 DDL 中提取 CREATE TABLE 后的表名（反引号 / 双引号 / 裸标识）。 */
export function extractCreateTableIdent(ddl) {
  const m = ddl.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|(\w+))\s*\(/im)
  if (!m) return null
  return m[1] || m[2] || m[3] || null
}

/** 解析 MySQL/PG 近似风格的列定义行：`name` rest…（去掉末尾逗号）。 */
export function parseMysqlStyleColumnLine(line) {
  const t = line.trim().replace(/,\s*$/, '')
  const bm = t.match(/^`([^`]+)`\s+(.+)$/s)
  if (bm) return { quote: '`', name: bm[1], rest: bm[2].trim() }
  const dm = t.match(/^"([^"]+)"\s+(.+)$/s)
  if (dm) return { quote: '"', name: dm[1], rest: dm[2].trim() }
  const wm = t.match(/^(\w+)\s+(.+)$/s)
  if (wm) return { quote: '', name: wm[1], rest: wm[2].trim() }
  return null
}

/** 与生成修复 SQL 使用同一套规则收集风险列行（含 raw 分段回退）。 */
export function listRiskColumnLines(segments) {
  const colSeg = segments.find((s) => s.kind === 'columns')
  const rawSeg = segments.find((s) => s.kind === 'raw')
  const out = []
  if (colSeg) {
    for (const ln of colSeg.lines) {
      if (ln.trim() && isNotNullWithoutDefaultRisk(ln)) out.push(ln)
    }
  }
  if (!out.length && rawSeg) {
    for (const ln of rawSeg.lines) {
      const tr = ln.trim()
      if (!tr || !isNotNullWithoutDefaultRisk(ln)) continue
      if (/^\s*`[^`]+`\s+/m.test(tr) || /^\s*"\w+"\s+/m.test(tr) || /^\s*\w+\s+\w+/m.test(tr)) out.push(ln)
    }
  }
  return out
}

/**
 * 根据列类型片段推断 DEFAULT（表达式字符串）；无法安全推断时返回 null。
 */
export function inferDefaultSqlExpression(columnRest, engineLower) {
  const r = columnRest.toUpperCase()
  if (/\b(JSON|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|BLOB|TINYBLOB|MEDIUMBLOB|LONGBLOB)\b/.test(r)) {
    return {
      expr: null,
      hint: 'TEXT/BLOB/JSON 等在 MySQL 5.x 可能不支持默认值；可考虑改为允许 NULL 或由应用层写入。',
    }
  }
  if (/\bDATETIME\b|\bTIMESTAMP\b/.test(r)) {
    return { expr: 'CURRENT_TIMESTAMP', hint: null }
  }
  if (/\bDATE\b/.test(r) && !/\bDATETIME\b/.test(r)) {
    return { expr: "'1970-01-01'", hint: null }
  }
  if (/\bTIME\b/.test(r) && !/\bDATETIME\b/.test(r) && !/\bTIMESTAMP\b/.test(r)) {
    return { expr: "'00:00:00'", hint: null }
  }
  if (/\b(BOOL|BOOLEAN|TINYINT\(1\))\b/.test(r) || (/\bTINYINT\b/.test(r) && /\(\s*1\s*\)/.test(r))) {
    const mysql = engineLower === 'mysql' || engineLower === 'mariadb'
    return { expr: mysql ? '0' : 'FALSE', hint: null }
  }
  if (/\b(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)\b/.test(r)) {
    return { expr: '0', hint: null }
  }
  if (/\b(DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL)\b/.test(r)) {
    return { expr: '0', hint: null }
  }
  if (/\b(CHAR|VARCHAR)\b/.test(r)) {
    return { expr: "''", hint: null }
  }
  return { expr: null, hint: '无法自动推断默认值类型，请手写 DEFAULT。' }
}

function quoteIdentMysql(name) {
  return '`' + String(name).replace(/`/g, '``') + '`'
}

function quoteIdentPg(name) {
  return '"' + String(name).replace(/"/g, '""') + '"'
}

/** 在列定义的 NOT NULL 前插入 DEFAULT expr。 */
export function injectDefaultBeforeNotNull(columnRest, defaultExpr) {
  const replaced = columnRest.replace(/\bNOT\s+NULL\b/i, `DEFAULT ${defaultExpr} NOT NULL`)
  if (replaced === columnRest) return `${columnRest} DEFAULT ${defaultExpr}`
  return replaced
}

/**
 * 生成「NOT NULL 无默认值」的可复制修复 SQL（启发式，执行前请在测试库验证）。
 * @returns {{ sql: string, warnings: string[], unsupported: boolean }}
 */
export function generateNotNullDefaultFixSql(engine, ddlText, segments) {
  const eng = String(engine || '').toLowerCase()
  const warnings = []
  const lines = listRiskColumnLines(segments)
  const table = extractCreateTableIdent(ddlText || '')

  if (!lines.length) {
    return { sql: '', warnings: [], unsupported: false }
  }

  if (!table) {
    warnings.push('未能从 DDL 解析表名，请手动替换 ALTER 中的表名。')
  }

  const tblMysql = table ? quoteIdentMysql(table) : '`your_table`'
  const tblPg = table ? quoteIdentPg(table) : '"your_table"'

  if (eng === 'postgres') {
    const stmts = []
    for (const line of lines) {
      const parsed = parseMysqlStyleColumnLine(line)
      if (!parsed) {
        warnings.push(`跳过无法解析的行：${line.trim().slice(0, 80)}`)
        continue
      }
      const { expr, hint } = inferDefaultSqlExpression(parsed.rest, eng)
      if (hint) warnings.push(`${parsed.name}: ${hint}`)
      if (!expr) {
        warnings.push(`列 ${parsed.name}：未生成语句，请手写 ALTER。`)
        continue
      }
      const qcol = quoteIdentPg(parsed.name)
      stmts.push(`ALTER TABLE ${tblPg} ALTER COLUMN ${qcol} SET DEFAULT ${expr};`)
    }
    return {
      sql: stmts.join('\n'),
      warnings,
      unsupported: false,
    }
  }

  if (eng === 'mysql' || eng === 'mariadb' || eng === '') {
    const modifies = []
    for (const line of lines) {
      const parsed = parseMysqlStyleColumnLine(line)
      if (!parsed) {
        warnings.push(`跳过无法解析的行：${line.trim().slice(0, 80)}`)
        continue
      }
      const { expr, hint } = inferDefaultSqlExpression(parsed.rest, eng || 'mysql')
      if (hint) warnings.push(`${parsed.name}: ${hint}`)
      if (!expr) continue
      const newRest = injectDefaultBeforeNotNull(parsed.rest, expr)
      const qcol = quoteIdentMysql(parsed.name)
      modifies.push(`MODIFY COLUMN ${qcol} ${newRest}`)
    }
    if (!modifies.length) {
      return {
        sql: '-- 未能生成 MODIFY：请检查列定义或为 TEXT/BLOB 等手写迁移。',
        warnings,
        unsupported: false,
      }
    }
    const sql = `ALTER TABLE ${tblMysql}\n  ${modifies.join(',\n  ')};`
    return { sql, warnings, unsupported: false }
  }

  if (eng === 'sqlite') {
    warnings.push(
      'SQLite 不支持直接 MODIFY 列；需建新表迁移数据后替换表名，以下为备忘注释（勿直接当作可执行修复）。',
    )
    return {
      sql:
        '-- SQLite：请使用「新建兼容表 → INSERT SELECT → DROP/RENAME」迁移。\n' +
        '-- 下列仅为风险列备忘：\n' +
        lines.map((l) => '-- ' + l.trim()).join('\n'),
      warnings,
      unsupported: true,
    }
  }

  warnings.push(`引擎「${engine || '?'}」暂按 MySQL 语法生成 MODIFY；若为其它方言请自行改写。`)
  const modifies = []
  for (const line of lines) {
    const parsed = parseMysqlStyleColumnLine(line)
    if (!parsed) continue
    const { expr, hint } = inferDefaultSqlExpression(parsed.rest, 'mysql')
    if (hint) warnings.push(`${parsed.name}: ${hint}`)
    if (!expr) continue
    const newRest = injectDefaultBeforeNotNull(parsed.rest, expr)
    modifies.push(`MODIFY COLUMN ${quoteIdentMysql(parsed.name)} ${newRest}`)
  }
  const sql = modifies.length ? `ALTER TABLE ${tblMysql}\n  ${modifies.join(',\n  ')};` : ''
  return { sql, warnings, unsupported: false }
}
