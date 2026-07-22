/**
 * PDF 导出引擎偏好（030 / 034 M11）：
 * - chromium = 版式优先 / 预览级交付（printToPDF，默认）
 * - pdf-lib = 同机优先 / 草稿级（draft-v1，不可作现场交付）
 */
export type PdfExportEngineId = "chromium" | "pdf-lib";

export const PDF_EXPORT_ENGINE_PREF_KEY = "pdfExportEngine";

/** 一次性把旧默认同机优先迁到预览级默认（034 M11） */
export const PDF_EXPORT_PREVIEW_DEFAULT_MIGRATE_KEY = "pdfExportPreviewDefaultMigratedV1";

/** 环境变量 SD_SMA_PDF_EXPORT_ENGINE=chromium|pdf-lib 可覆盖（预留） */
export function normalizePdfExportEngine(raw: unknown): PdfExportEngineId {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "pdf-lib" || s === "pdflib" || s === "vector") return "pdf-lib";
  if (s === "chromium" || s === "printtopdf" || s === "print-to-pdf") return "chromium";
  // 缺省 / 未知 → 预览级交付（版式优先）
  return "chromium";
}

export function readPdfExportEngineFromPrefs(prefs: Record<string, unknown> | null | undefined): PdfExportEngineId {
  return normalizePdfExportEngine(prefs?.[PDF_EXPORT_ENGINE_PREF_KEY]);
}

/** localStorage 快捷读写（报表生成页未写进 prefs 结构时也能切引擎） */
export function readPdfExportEngineFromLocalStorage(): PdfExportEngineId {
  try {
    if (typeof localStorage === "undefined") return "chromium";
    return normalizePdfExportEngine(localStorage.getItem(PDF_EXPORT_ENGINE_PREF_KEY));
  } catch {
    return "chromium";
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

/**
 * 升级后一次性：旧默认 pdf-lib → chromium（预览级）。
 * 用户迁移后再显式选「同机优先」会保留 pdf-lib。
 */
export function applyPreviewLevelPdfDefaultMigration<T extends { pdfExportEngine: PdfExportEngineId }>(
  prefs: T,
): { prefs: T; changed: boolean } {
  try {
    if (typeof localStorage === "undefined") return { prefs, changed: false };
    if (localStorage.getItem(PDF_EXPORT_PREVIEW_DEFAULT_MIGRATE_KEY) === "1") {
      return { prefs, changed: false };
    }
    localStorage.setItem(PDF_EXPORT_PREVIEW_DEFAULT_MIGRATE_KEY, "1");
    if (prefs.pdfExportEngine === "chromium") {
      return { prefs, changed: false };
    }
    return { prefs: { ...prefs, pdfExportEngine: "chromium" }, changed: true };
  } catch {
    return { prefs, changed: false };
  }
}
