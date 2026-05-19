/** 顶部连接切换条显示：显示名称 · 引擎（如 docker · MariaDB） */
const ENGINE_LABELS: Record<string, string> = {
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  postgres: 'PostgreSQL',
  sqlite: 'SQLite',
  mongodb: 'MongoDB',
}

export function engineDisplayName(engine: string | null | undefined): string {
  const key = String(engine || '').trim().toLowerCase()
  return ENGINE_LABELS[key] || (key ? String(engine) : '数据库')
}

export function connectionTabLabel(conn: { name?: string | null; engine?: string | null }): string {
  const eng = engineDisplayName(conn.engine)
  const name = String(conn.name || '').trim()
  if (name) return `${name} · ${eng}`
  return eng
}
