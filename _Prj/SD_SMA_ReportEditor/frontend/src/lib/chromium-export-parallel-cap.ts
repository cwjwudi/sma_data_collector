/**
 * 与 electron/chromium-export-parallel-cap.cjs 对齐：UI 展示 Chromium 实际生效路数。
 * printToPDF + 大取数快照不能按「不妥协」开满 16 路，否则易闪退。
 */

export function chromiumPartParallelCapFromBytes(totalMemBytes: number): number {
  // 与 electron/chromium-export-parallel-cap.cjs 对齐（052c 按份切片后上调）
  const gb = Number(totalMemBytes) / (1024 * 1024 * 1024);
  if (!Number.isFinite(gb) || gb < 8) return 4;
  if (gb < 16) return 8;
  if (gb < 24) return 12;
  return 16;
}

/** 浏览器侧：用 deviceMemory（GiB，可能偏保守）估算；缺省按 3 */
export function chromiumPartParallelCapInRenderer(): number {
  try {
    const dm = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory);
    if (Number.isFinite(dm) && dm > 0) {
      return chromiumPartParallelCapFromBytes(dm * 1024 * 1024 * 1024);
    }
  } catch {
    /* ignore */
  }
  return 8;
}

export function resolvePartExportConcurrencyForUi(opts: {
  planned: number;
  engine?: string | null;
}): number {
  const want = Math.max(1, Math.floor(Number(opts.planned) || 1));
  const eng = String(opts.engine || "")
    .trim()
    .toLowerCase();
  if (eng === "pdf-lib" || eng === "pdflib" || eng === "vector") return want;
  return Math.min(want, chromiumPartParallelCapInRenderer());
}
