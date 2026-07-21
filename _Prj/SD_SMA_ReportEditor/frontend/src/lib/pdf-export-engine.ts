/**
 * PDF 导出引擎偏好（030 / 0.3.115）：chromium = 现网 printToPDF；pdf-lib = 无第二 Chromium。
 * 默认 chromium，实现完成前开关切到 pdf-lib 可能仅部分能力。
 */
export type PdfExportEngineId = "chromium" | "pdf-lib";

export const PDF_EXPORT_ENGINE_PREF_KEY = "pdfExportEngine";

export function normalizePdfExportEngine(raw: unknown): PdfExportEngineId {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "pdf-lib" || s === "pdflib" || s === "vector") return "pdf-lib";
  return "chromium";
}

export function readPdfExportEngineFromPrefs(prefs: Record<string, unknown> | null | undefined): PdfExportEngineId {
  return normalizePdfExportEngine(prefs?.[PDF_EXPORT_ENGINE_PREF_KEY]);
}
