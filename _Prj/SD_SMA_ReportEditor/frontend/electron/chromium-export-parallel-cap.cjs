/**
 * Chromium printToPDF 分卷并行内存安全上限。
 * 「不妥协」可关掉 CPU 预算到 16，但每窗冷启 + 大 SQL 快照仍会把 Win 首次结批打崩。
 * pdf-lib 不走 printToPDF，仍可用满用户设置。
 */

function chromiumPartParallelCap(totalMemBytes) {
  // 052c：各窗只持当前份切片后，可显著提高并发；仍保留余量防 Chromium 进程本身爆内存
  const gb = Number(totalMemBytes) / (1024 * 1024 * 1024)
  if (!Number.isFinite(gb) || gb < 8) return 4
  if (gb < 16) return 8
  if (gb < 24) return 12
  return 16
}

/**
 * @param {number} planned 用户/预算生效后的并行路数
 * @param {number} totalReports 总分卷数
 * @param {string} exportEngine 'chromium' | 'pdf-lib' | …
 * @param {number} [totalMemBytes] 默认 os.totalmem()
 */
function resolvePartExportConcurrency(planned, totalReports, exportEngine, totalMemBytes) {
  const want = Math.min(
    Math.max(1, Math.floor(Number(planned) || 1)),
    Math.max(1, Math.floor(Number(totalReports) || 1)),
  )
  const eng = String(exportEngine || '')
    .trim()
    .toLowerCase()
  if (eng === 'pdf-lib') return want
  const mem =
    typeof totalMemBytes === 'number' && Number.isFinite(totalMemBytes)
      ? totalMemBytes
      : require('os').totalmem()
  return Math.min(want, chromiumPartParallelCap(mem))
}

module.exports = {
  chromiumPartParallelCap,
  resolvePartExportConcurrency,
}
