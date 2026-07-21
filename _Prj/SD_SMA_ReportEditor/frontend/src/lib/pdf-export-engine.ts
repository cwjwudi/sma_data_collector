/**
 * PDF 导出引擎偏好（030 / 0.3.115）：chromium = 现网 printToPDF；pdf-lib = 无第二 Chromium 尖峰。
 * 默认 pdf-lib（现场验证零闪）；prefs / 环境变量可回滚 chromium。
 */
export type PdfExportEngineId = "chromium" | "pdf-lib";

export const PDF_EXPORT_ENGINE_PREF_KEY = "pdfExportEngine";

/** 环境变量 SD_SMA_PDF_EXPORT_ENGINE=chromium|pdf-lib 可覆盖默认（Electron 主进程 / 预加载可读） */
export function normalizePdfExportEngine(raw: unknown): PdfExportEngineId {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "chromium" || s === "printtopdf" || s === "print-to-pdf") return "chromium";
  if (s === "pdf-lib" || s === "pdflib" || s === "vector") return "pdf-lib";
  return "pdf-lib";
}

export function readPdfExportEngineFromPrefs(prefs: Record<string, unknown> | null | undefined): PdfExportEngineId {
  return normalizePdfExportEngine(prefs?.[PDF_EXPORT_ENGINE_PREF_KEY]);
}

/** localStorage 快捷读写（报表生成页未写进 prefs 结构时也能切引擎） */
export function readPdfExportEngineFromLocalStorage(): PdfExportEngineId {
  try {
    if (typeof localStorage === "undefined") return "pdf-lib";
    return normalizePdfExportEngine(localStorage.getItem(PDF_EXPORT_ENGINE_PREF_KEY));
  } catch {
    return "pdf-lib";
  }
}

export function writePdfExportEngineToLocalStorage(engine: PdfExportEngineId): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PDF_EXPORT_ENGINE_PREF_KEY, engine);
  } catch {
    /* ignore */
  }
}
