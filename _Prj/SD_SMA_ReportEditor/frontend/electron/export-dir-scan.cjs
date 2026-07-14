/**
 * 导出目录单层扫描（历史报表 010）：文件夹 + PDF，可分页；禁止递归平铺。
 * 供 Electron main 与 vitest 共用（CommonJS）。
 */
'use strict'

const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * @param {string} rootDir
 * @param {string | undefined} cwd
 * @returns {{ ok: true, root: string, cwd: string } | { ok: false, error: string }}
 */
function resolveExportCwd(rootDir, cwd) {
  if (!rootDir || typeof rootDir !== 'string') {
    return { ok: false, error: '缺少导出根目录' }
  }
  let root
  let cur
  try {
    root = path.resolve(rootDir.trim())
    cur = path.resolve((cwd && String(cwd).trim()) || root)
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
  const rel = path.relative(root, cur)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: '路径超出导出根目录' }
  }
  return { ok: true, root, cwd: cur }
}

/**
 * @param {{ kind: 'dir' | 'pdf', name: string, modifiedAt?: string }} a
 * @param {{ kind: 'dir' | 'pdf', name: string, modifiedAt?: string }} b
 * @param {'mtime_desc' | 'name_asc'} sort
 */
function compareExportEntries(a, b, sort) {
  if (a.kind !== b.kind) {
    return a.kind === 'dir' ? -1 : 1
  }
  if (sort === 'name_asc') {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  }
  const ta = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0
  const tb = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0
  if (tb !== ta) return tb - ta
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/**
 * 对已收集的条目排序并切页（纯函数，便于单测）。
 * @param {Array<object>} all
 * @param {{ offset?: number, limit?: number, sort?: 'mtime_desc' | 'name_asc', unlimited?: boolean }} opts
 */
function pageExportEntries(all, opts = {}) {
  const sort = opts.sort === 'name_asc' ? 'name_asc' : 'mtime_desc'
  let offset = Number(opts.offset)
  if (!Number.isFinite(offset) || offset < 0) offset = 0
  offset = Math.floor(offset)
  const sorted = [...all].sort((a, b) => compareExportEntries(a, b, sort))
  const total = sorted.length

  if (opts.unlimited) {
    const entries = sorted.slice(offset)
    return {
      entries,
      total,
      offset,
      limit: entries.length,
      hasMore: false,
    }
  }

  let limit = Number(opts.limit)
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
  limit = Math.min(MAX_LIMIT, Math.floor(limit))

  const entries = sorted.slice(offset, offset + limit)
  return {
    entries,
    total,
    offset,
    limit,
    hasMore: offset + entries.length < total,
  }
}

/**
 * @param {object} opts
 * @param {string} opts.rootDir
 * @param {string} [opts.cwd]
 * @param {number} [opts.offset]
 * @param {number} [opts.limit]
 * @param {'mtime_desc' | 'name_asc'} [opts.sort]
 * @param {'all' | 'pdf_only'} [opts.kinds] 仪表盘浅扫用 pdf_only
 * @param {typeof fs} [opts.fsModule]
 * @param {typeof path} [opts.pathModule]
 */
function scanExportEntries(opts = {}) {
  const fsMod = opts.fsModule || fs
  const pathMod = opts.pathModule || path
  const kinds = opts.kinds === 'pdf_only' ? 'pdf_only' : 'all'

  const resolved = resolveExportCwd(opts.rootDir, opts.cwd)
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, entries: [], total: 0, offset: 0, limit: DEFAULT_LIMIT }
  }
  const { root, cwd } = resolved

  if (!fsMod.existsSync(cwd)) {
    return {
      ok: false,
      error: '目录不存在',
      rootDir: root,
      cwd,
      entries: [],
      total: 0,
      offset: 0,
      limit: DEFAULT_LIMIT,
    }
  }
  let st
  try {
    st = fsMod.statSync(cwd)
  } catch (e) {
    return {
      ok: false,
      error: String(e.message || e),
      rootDir: root,
      cwd,
      entries: [],
      total: 0,
      offset: 0,
      limit: DEFAULT_LIMIT,
    }
  }
  if (!st.isDirectory()) {
    return {
      ok: false,
      error: '路径不是文件夹',
      rootDir: root,
      cwd,
      entries: [],
      total: 0,
      offset: 0,
      limit: DEFAULT_LIMIT,
    }
  }

  let dirents
  try {
    dirents = fsMod.readdirSync(cwd, { withFileTypes: true })
  } catch (e) {
    return {
      ok: false,
      error: `无法读取目录：${e.message || e}`,
      rootDir: root,
      cwd,
      entries: [],
      total: 0,
      offset: 0,
      limit: DEFAULT_LIMIT,
    }
  }

  /** @type {Array<object>} */
  const collected = []
  for (const ent of dirents) {
    const name = ent.name
    if (!name || name === '.' || name === '..') continue
    if (name.startsWith('.')) continue

    const full = pathMod.join(cwd, name)
    let isDir = false
    let isFile = false
    try {
      if (typeof ent.isDirectory === 'function' && ent.isDirectory()) isDir = true
      else if (typeof ent.isFile === 'function' && ent.isFile()) isFile = true
      else if (typeof ent.isSymbolicLink === 'function' && ent.isSymbolicLink()) {
        const lst = fsMod.statSync(full)
        isDir = lst.isDirectory()
        isFile = lst.isFile()
      }
    } catch {
      continue
    }

    if (isDir) {
      if (kinds === 'pdf_only') continue
      let modifiedAt = ''
      try {
        modifiedAt = fsMod.statSync(full).mtime.toISOString()
      } catch {
        /* keep empty mtime */
      }
      collected.push({
        kind: 'dir',
        name,
        path: full,
        modifiedAt,
      })
      continue
    }

    if (!isFile) continue
    if (!name.toLowerCase().endsWith('.pdf')) continue
    try {
      const fst = fsMod.statSync(full)
      collected.push({
        kind: 'pdf',
        name,
        filePath: full,
        fileUrl: pathToFileURL(full).href,
        sizeBytes: fst.size,
        modifiedAt: fst.mtime.toISOString(),
      })
    } catch {
      /* skip unreadable */
    }
  }

  const page = pageExportEntries(collected, {
    offset: opts.offset,
    limit: opts.limit,
    sort: opts.sort,
    unlimited: opts.unlimited === true,
  })

  return {
    ok: true,
    rootDir: root,
    cwd,
    relSegments: pathMod.relative(root, cwd).split(/[/\\]/).filter(Boolean),
    entries: page.entries,
    total: page.total,
    offset: page.offset,
    limit: page.limit,
    hasMore: page.hasMore,
  }
}

/**
 * 兼容旧 IPC：仅当前层 PDF。未传 limit 时返回本层全部（与历史行为一致）；传 limit 则截断。
 */
function scanExportPdfsCompat(opts = {}) {
  const hasLimit = opts.limit != null && Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0
  const res = scanExportEntries({
    rootDir: opts.dir,
    cwd: opts.dir,
    offset: 0,
    limit: hasLimit ? Number(opts.limit) : undefined,
    unlimited: !hasLimit,
    sort: 'mtime_desc',
    kinds: 'pdf_only',
    fsModule: opts.fsModule,
    pathModule: opts.pathModule,
  })
  if (!res.ok) {
    return { ok: false, error: res.error, files: [], dir: res.cwd || opts.dir }
  }
  const files = res.entries.map((e) => ({
    name: e.name,
    filePath: e.filePath,
    fileUrl: e.fileUrl,
    sizeBytes: e.sizeBytes,
    modifiedAt: e.modifiedAt,
  }))
  return { ok: true, files, dir: res.cwd, total: res.total, truncated: res.total > files.length }
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  resolveExportCwd,
  compareExportEntries,
  pageExportEntries,
  scanExportEntries,
  scanExportPdfsCompat,
}
