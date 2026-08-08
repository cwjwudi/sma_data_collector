/**
 * 导出窗分卷取数缓存（030 / 023）：首份 fullSqlFill 后复用，后续 part 不再打全量 SQL。
 * 同窗热切可走内存；多窗并行时经主进程 bridge 共享（035），避免 N 路各打一遍 8 万行。
 */
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import type { BindingPreviewStats } from "@/lib/report-template/template-editor-context";

export type PdfExportFillSnapshot = {
  templateId: string;
  values: Record<string, BindingPreviewCell>;
  totalReports: number;
  stats: BindingPreviewStats | null;
};

let cache: PdfExportFillSnapshot | null = null;

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function clearPdfExportFillCache(): void {
  cache = null;
  try {
    void window.electronAPI?.clearPdfExportFillCacheBridge?.();
  } catch {
    /* ignore */
  }
}

export function peekPdfExportFillCache(): PdfExportFillSnapshot | null {
  return cache;
}

export function getPdfExportFillCache(templateId: string): PdfExportFillSnapshot | null {
  const id = String(templateId || "").trim();
  if (!id || !cache || cache.templateId !== id) return null;
  return cache;
}

export function setPdfExportFillCache(snap: PdfExportFillSnapshot): void {
  const id = String(snap.templateId || "").trim();
  if (!id) {
    cache = null;
    return;
  }
  cache = {
    templateId: id,
    values: snap.values,
    totalReports: Math.max(1, Math.floor(Number(snap.totalReports) || 1)),
    stats: snap.stats,
  };
}

/** 首份取数完成后推到主进程，供其它并行导出窗复用 */
export async function publishPdfExportFillCacheToBridge(): Promise<void> {
  const snap = cache;
  if (!snap) return;
  try {
    await window.electronAPI?.setPdfExportFillCacheBridge?.(snap);
  } catch {
    /* ignore */
  }
}

/** 从主进程 bridge 灌入本窗内存缓存；命中返回 true */
export async function hydratePdfExportFillCacheFromBridge(templateId: string): Promise<boolean> {
  const id = String(templateId || "").trim();
  if (!id) return false;
  if (getPdfExportFillCache(id)) return true;
  const api = window.electronAPI;
  if (!api?.getPdfExportFillCacheBridge) return false;
  try {
    const res = await api.getPdfExportFillCacheBridge({ templateId: id });
    if (!res?.ok || !res.snap || res.snap.templateId !== id) return false;
    setPdfExportFillCache({
      templateId: res.snap.templateId,
      values: res.snap.values || {},
      totalReports: res.snap.totalReports,
      stats: res.snap.stats ?? null,
    });
    return true;
  } catch {
    return false;
  }
}

/** 并行路启动略早于 publish 时短暂等待 bridge */
export async function waitPdfExportFillCacheFromBridge(
  templateId: string,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<boolean> {
  const timeoutMs = Math.max(1000, Math.floor(Number(opts?.timeoutMs) || 120_000));
  const pollMs = Math.max(50, Math.floor(Number(opts?.pollMs) || 200));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hydratePdfExportFillCacheFromBridge(templateId)) return true;
    await sleepMs(pollMs);
  }
  return hydratePdfExportFillCacheFromBridge(templateId);
}

/** partIndex>0 且缓存命中同模版 → 跳过 fullSqlFill */
export function shouldReusePdfExportFill(opts: {
  templateId: string;
  reportPartIndex: number | null | undefined;
  cache?: PdfExportFillSnapshot | null;
}): boolean {
  const id = String(opts.templateId || "").trim();
  const part = opts.reportPartIndex;
  if (!id || part == null || !Number.isFinite(part) || Math.trunc(part) <= 0) return false;
  const snap = opts.cache === undefined ? getPdfExportFillCache(id) : opts.cache;
  return Boolean(snap && snap.templateId === id);
}
