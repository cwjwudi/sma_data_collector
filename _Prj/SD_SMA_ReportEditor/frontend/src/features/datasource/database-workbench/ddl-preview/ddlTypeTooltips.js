/** 从 SHOW CREATE TABLE 等 DDL 尾部提取默认字符集（MySQL/MariaDB）。 */
export function extractCharsetFromDdl(ddl) {
  const m = ddl.match(/DEFAULT\s+CHARSET\s*=\s*(\w+)/i)
  if (!m) return null
  const c = m[1].toLowerCase()
  if (c === 'utf8mb4') return 'utf8mb4'
  if (c === 'utf8mb3' || c === 'utf8') return 'utf8mb3'
  return null
}

/** 固定/变长字符串类型的悬停说明（字节与字符集）。 */
export function varcharCharByteTooltip(fullMatch, length, charset) {
  const isChar = /\bCHAR\s*\(/i.test(fullMatch) && !/\bVAR/i.test(fullMatch)
  const kind = isChar ? 'CHAR' : 'VARCHAR'
  const mb3 = length * 3
  const mb4 = length * 4

  if (charset === 'utf8mb4') {
    return `${kind}(${length})：当前表 DEFAULT CHARSET=utf8mb4；单字符最多 4 字节，理论最大约 ${mb4} 字节（受行格式、索引前缀等限制）。`
  }
  if (charset === 'utf8mb3') {
    if (kind === 'VARCHAR') {
      return `${kind}(${length})：实际占用：字符集 utf8mb3 下单列最多约 ${mb3} 字节（${length}×3）；索引前缀等因素可能进一步限制。`
    }
    return `${kind}(${length})：utf8mb3 下单列最多约 ${mb3} 字节（${length}×3）。`
  }
  if (kind === 'VARCHAR') {
    return `VARCHAR(${length})：utf8mb3 下单列最多约 ${mb3} 字节（${length}×3）；utf8mb4 下单字符最多 4 字节（理论最大约 ${mb4} 字节）。取决于表字符集与 InnoDB 行格式。`
  }
  return `CHAR(${length})：定长字符类型；utf8mb3 下单字符最多 3 字节，utf8mb4 最多 4 字节，存储与填充规则相关。`
}
