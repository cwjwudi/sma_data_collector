/**
 * 主机负载采样（039d）：系统 CPU%（逻辑核合计）与内存用量。
 * 供导出全屏遮罩右下角曲线使用；纯计算可单测。
 */
'use strict'

/**
 * @param {Array<{ times?: { user?: number, nice?: number, sys?: number, idle?: number, irq?: number } }>} cpus
 * @returns {{ idle: number, total: number, cores: number }}
 */
function snapshotCpu(cpus) {
  const list = Array.isArray(cpus) ? cpus : []
  let idle = 0
  let total = 0
  for (const c of list) {
    const t = (c && c.times) || {}
    const user = Number(t.user) || 0
    const nice = Number(t.nice) || 0
    const sys = Number(t.sys) || 0
    const idleT = Number(t.idle) || 0
    const irq = Number(t.irq) || 0
    idle += idleT
    total += user + nice + sys + idleT + irq
  }
  return { idle, total, cores: list.length }
}

/**
 * 两次 os.cpus() 快照之间的整机 CPU 占用（0–100）。
 * @param {{ idle: number, total: number } | null | undefined} prev
 * @param {{ idle: number, total: number }} next
 */
function cpuPercentBetween(prev, next) {
  if (!prev || !next) return 0
  const idleDelta = next.idle - prev.idle
  const totalDelta = next.total - prev.total
  if (!(totalDelta > 0)) return 0
  const busy = 1 - idleDelta / totalDelta
  if (!Number.isFinite(busy)) return 0
  return Math.max(0, Math.min(100, busy * 100))
}

/**
 * @param {number} totalBytes
 * @param {number} freeBytes
 */
function memorySample(totalBytes, freeBytes) {
  const total = Math.max(0, Number(totalBytes) || 0)
  const free = Math.max(0, Math.min(total, Number(freeBytes) || 0))
  const used = Math.max(0, total - free)
  const percent = total > 0 ? (used / total) * 100 : 0
  return {
    memTotalBytes: total,
    memUsedBytes: used,
    memFreeBytes: free,
    memPercent: Math.max(0, Math.min(100, percent)),
  }
}

/**
 * @param {number[]} history
 * @param {number} value
 * @param {number} maxLen
 */
function pushRing(history, value, maxLen) {
  const arr = Array.isArray(history) ? history.slice() : []
  const v = Number(value)
  arr.push(Number.isFinite(v) ? v : 0)
  const max = Math.max(2, Math.floor(Number(maxLen) || 60))
  if (arr.length > max) arr.splice(0, arr.length - max)
  return arr
}

function formatBytesShort(n) {
  const v = Math.max(0, Number(n) || 0)
  if (v >= 1024 ** 3) return (v / 1024 ** 3).toFixed(1) + ' GB'
  if (v >= 1024 ** 2) return (v / 1024 ** 2).toFixed(0) + ' MB'
  return (v / 1024).toFixed(0) + ' KB'
}

module.exports = {
  snapshotCpu,
  cpuPercentBetween,
  memorySample,
  pushRing,
  formatBytesShort,
}
