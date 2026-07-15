/**
 * 历史报表分屏：左⇄右 复制 / 移动（022）。
 * 沙箱：源须在 sourceRoot 下，落点与写入路径须在 destRoot 下。
 */
'use strict'

const path = require('node:path')
const fs = require('node:fs')
const { resolveExportCwd } = require('./export-dir-scan.cjs')

/**
 * @param {string} root
 * @param {string} target
 * @param {typeof path} [pathMod]
 */
function isInsideRoot(root, target, pathMod = path) {
  const r = resolveExportCwd(root, target)
  return r.ok
}

/**
 * 重名改名：foo.pdf → foo (1).pdf；folder → folder (1)
 * @param {string} destPath
 * @param {typeof fs} fsMod
 * @param {typeof path} pathMod
 */
function allocateRenamePath(destPath, fsMod = fs, pathMod = path) {
  if (!fsMod.existsSync(destPath)) return destPath
  const dir = pathMod.dirname(destPath)
  const base = pathMod.basename(destPath)
  const ext = pathMod.extname(base)
  const stem = ext ? base.slice(0, -ext.length) : base
  for (let i = 1; i < 10000; i++) {
    const candidate = pathMod.join(dir, `${stem} (${i})${ext}`)
    if (!fsMod.existsSync(candidate)) return candidate
  }
  throw new Error('无法生成可用的改名路径')
}

/**
 * @param {object} opts
 * @param {string[]} opts.sources 绝对路径（文件或目录）
 * @param {string} opts.destDir 对侧当前 cwd
 * @param {string} opts.sourceRoot
 * @param {string} opts.destRoot
 * @param {'copy' | 'move'} opts.mode
 * @param {'skip' | 'overwrite' | 'rename'} [opts.conflict]
 * @param {boolean} [opts.dryRun]
 * @param {typeof fs} [opts.fsModule]
 * @param {typeof path} [opts.pathModule]
 */
function transferHistoryItems(opts = {}) {
  const fsMod = opts.fsModule || fs
  const pathMod = opts.pathModule || path
  const mode = opts.mode === 'move' ? 'move' : 'copy'
  const conflict = opts.conflict === 'overwrite' || opts.conflict === 'rename' || opts.conflict === 'skip'
    ? opts.conflict
    : null
  const dryRun = opts.dryRun === true
  const sources = Array.isArray(opts.sources) ? opts.sources.map(String).filter(Boolean) : []
  const destDirRaw = opts.destDir && String(opts.destDir).trim()
  const sourceRoot = opts.sourceRoot && String(opts.sourceRoot).trim()
  const destRoot = opts.destRoot && String(opts.destRoot).trim()

  if (!sources.length) {
    return { ok: false, error: '未选择要传输的项目', conflicts: [], results: [] }
  }
  if (!destDirRaw || !sourceRoot || !destRoot) {
    return { ok: false, error: '缺少源根、目标根或目标目录', conflicts: [], results: [] }
  }

  const destResolved = resolveExportCwd(destRoot, destDirRaw)
  if (!destResolved.ok) {
    return { ok: false, error: destResolved.error || '目标目录非法', conflicts: [], results: [] }
  }
  const destDir = destResolved.cwd

  if (!fsMod.existsSync(destDir)) {
    return { ok: false, error: '目标目录不存在（可能已拔出）', conflicts: [], results: [] }
  }

  /** @type {Array<{ source: string, dest: string, name: string }>} */
  const conflicts = []
  /** @type {Array<{ source: string, dest: string, name: string, action: string }>} */
  const plan = []

  for (const src of sources) {
    const srcAbs = pathMod.resolve(src)
    if (!isInsideRoot(sourceRoot, srcAbs, pathMod)) {
      return {
        ok: false,
        error: `源路径超出允许根目录：${srcAbs}`,
        conflicts: [],
        results: [],
      }
    }
    if (!fsMod.existsSync(srcAbs)) {
      plan.push({ source: srcAbs, dest: '', name: pathMod.basename(srcAbs), action: 'missing' })
      continue
    }
    const name = pathMod.basename(srcAbs)
    let dest = pathMod.join(destDir, name)
    if (!isInsideRoot(destRoot, dest, pathMod)) {
      return {
        ok: false,
        error: `写入路径超出目标根目录：${dest}`,
        conflicts: [],
        results: [],
      }
    }
    // 禁止把目录移动到自身或其子路径
    if (srcAbs === dest || dest.startsWith(srcAbs + pathMod.sep)) {
      return {
        ok: false,
        error: `不能将「${name}」传输到自身或其子目录`,
        conflicts: [],
        results: [],
      }
    }
    if (fsMod.existsSync(dest)) {
      conflicts.push({ source: srcAbs, dest, name })
      plan.push({ source: srcAbs, dest, name, action: 'conflict' })
    } else {
      plan.push({ source: srcAbs, dest, name, action: 'ok' })
    }
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      mode,
      conflicts,
      needsConflictDecision: conflicts.length > 0 && !conflict,
      planCount: plan.length,
      results: [],
    }
  }

  if (conflicts.length && !conflict) {
    return {
      ok: false,
      error: '存在重名，需先选择冲突策略',
      conflicts,
      needsConflictDecision: true,
      results: [],
    }
  }

  /** @type {Array<{ source: string, dest?: string, status: string, error?: string }>} */
  const results = []
  let copied = 0
  let moved = 0
  let skipped = 0
  let failed = 0

  for (const item of plan) {
    if (item.action === 'missing') {
      failed += 1
      results.push({ source: item.source, status: 'failed', error: '源不存在' })
      continue
    }

    let dest = item.dest
    const exists = fsMod.existsSync(dest)

    if (exists) {
      if (conflict === 'skip') {
        skipped += 1
        results.push({ source: item.source, dest, status: 'skipped' })
        continue
      }
      if (conflict === 'rename') {
        try {
          dest = allocateRenamePath(dest, fsMod, pathMod)
          if (!isInsideRoot(destRoot, dest, pathMod)) {
            failed += 1
            results.push({ source: item.source, status: 'failed', error: '改名路径越界' })
            continue
          }
        } catch (e) {
          failed += 1
          results.push({ source: item.source, status: 'failed', error: String(e.message || e) })
          continue
        }
      }
      // overwrite：继续写同名路径
    }

    try {
      const st = fsMod.statSync(item.source)
      if (st.isDirectory()) {
        if (exists && conflict === 'overwrite') {
          fsMod.rmSync(dest, { recursive: true, force: true })
        }
        fsMod.cpSync(item.source, dest, { recursive: true, force: true })
      } else if (st.isFile()) {
        if (exists && conflict === 'overwrite') {
          fsMod.rmSync(dest, { force: true })
        }
        fsMod.cpSync(item.source, dest, { force: true })
      } else {
        failed += 1
        results.push({ source: item.source, status: 'failed', error: '不支持的文件类型' })
        continue
      }

      if (mode === 'move') {
        fsMod.rmSync(item.source, { recursive: true, force: true })
        moved += 1
        results.push({ source: item.source, dest, status: 'moved' })
      } else {
        copied += 1
        results.push({ source: item.source, dest, status: 'copied' })
      }
    } catch (e) {
      failed += 1
      results.push({
        source: item.source,
        dest,
        status: 'failed',
        error: String(e.message || e),
      })
      // Q15：不回滚已成功项，继续尝试其余
    }
  }

  return {
    ok: failed === 0,
    mode,
    copied,
    moved,
    skipped,
    failed,
    conflicts,
    results,
    error: failed
      ? `完成：成功 ${copied + moved}，跳过 ${skipped}，失败 ${failed}`
      : undefined,
  }
}

module.exports = {
  isInsideRoot,
  allocateRenamePath,
  transferHistoryItems,
}
