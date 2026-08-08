/**
 * 导出窗分卷取数缓存（030 / 023 / 052c）：
 * 首份 fullSqlFill 一次后，按「份」切片落盘；各并行窗只 hydrate 当前份（约 maxRows），
 * 不再把整包 8 万行灌进每个 BrowserWindow。
 */
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import type { ReportTemplate } from "@/lib/report-template/model";
import type { BindingPreviewStats } from "@/lib/report-template/template-editor-context";
import {
  buildSqlFillSplitReportPlan,
  previewValuesForSplitReport,
} from "@/lib/report-template/table-sql-fill-report-split";

export type PdfExportFillSnapshot = {
  templateId: string;
  values: Record<string, BindingPreviewCell>;
  totalReports: number;
  stats: BindingPreviewStats | null;
  /**
   * 本窗 values 对应的分卷序号。
   * - `null`/缺省：全量快照（旧路径，渲染时再按 part 切片）
   * - 数字：已是该份切片，禁止拿去渲其它份
   */
  partIndex?: number | null;
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
  const partRaw = snap.partIndex;
  const partIndex =
    partRaw == null || !Number.isFinite(Number(partRaw)) ? null : Math.max(0, Math.trunc(Number(partRaw)));
  cache = {
    templateId: id,
    values: snap.values,
    totalReports: Math.max(1, Math.floor(Number(snap.totalReports) || 1)),
    stats: snap.stats,
    partIndex,
  };
}

/** 首份取数完成后：按份切片落盘，并把本窗内存缩成第 0 份 */
export async function publishPdfExportFillCacheToBridge(
  tmpl?: ReportTemplate | null,
): Promise<void> {
  const snap = cache;
  if (!snap) return;
  const api = window.electronAPI;
  if (!api) return;

  const plan = tmpl ? buildSqlFillSplitReportPlan(tmpl, snap.values) : null;
  const total = Math.max(1, Math.floor(Number(snap.totalReports) || 1));
  const reportCount = plan && plan.reportCount > 1 ? plan.reportCount : total;

  try {
    if (plan && plan.reportCount > 1 && api.setPdfExportFillCacheBridgeParts) {
      const parts: Array<{ partIndex: number; values: Record<string, BindingPreviewCell> }> = [];
      for (let i = 0; i < plan.reportCount; i++) {
        parts.push({
          partIndex: i,
          values: previewValuesForSplitReport(snap.values, plan, i) as Record<string, BindingPreviewCell>,
        });
      }
      await api.setPdfExportFillCacheBridgeParts({
        templateId: snap.templateId,
        totalReports: reportCount,
        stats: snap.stats,
        parts,
      });
      // 本窗立刻丢掉全量，只留第 0 份
      setPdfExportFillCache({
        templateId: snap.templateId,
        values: parts[0].values,
        totalReports: reportCount,
        stats: snap.stats,
        partIndex: 0,
      });
      return;
    }

    await api.setPdfExportFillCacheBridge?.(snap);
  } catch {
    /* ignore */
  }
}

/** 从 bridge 灌入「指定份」切片；命中且 part 一致则跳过 */
export async function hydratePdfExportFillCacheFromBridge(
  templateId: string,
  opts?: { reportPartIndex?: number },
): Promise<boolean> {
  const id = String(templateId || "").trim();
  if (!id) return false;
  const wantPart =
    opts?.reportPartIndex != null && Number.isFinite(Number(opts.reportPartIndex))
      ? Math.max(0, Math.trunc(Number(opts.reportPartIndex)))
      : null;

  const existing = getPdfExportFillCache(id);
  if (existing) {
    if (wantPart == null) return true;
    // 全量旧缓存：可复用
    if (existing.partIndex == null) return true;
    if (existing.partIndex === wantPart) return true;
  }

  const api = window.electronAPI;
  if (!api?.getPdfExportFillCacheBridge) return false;
  try {
    const res = await api.getPdfExportFillCacheBridge({
      templateId: id,
      reportPartIndex: wantPart ?? 0,
    });
    if (!res?.ok || !res.snap || res.snap.templateId !== id) return false;
    const partFromSnap =
      res.snap.partIndex != null && Number.isFinite(Number(res.snap.partIndex))
        ? Math.max(0, Math.trunc(Number(res.snap.partIndex)))
        : wantPart;
    setPdfExportFillCache({
      templateId: res.snap.templateId,
      values: res.snap.values || {},
      totalReports: res.snap.totalReports,
      stats: res.snap.stats ?? null,
      partIndex: partFromSnap,
    });
    return true;
  } catch {
    return false;
  }
}

/** 并行路启动略早于 publish 时短暂等待 bridge */
export async function waitPdfExportFillCacheFromBridge(
  templateId: string,
  opts?: { timeoutMs?: number; pollMs?: number; reportPartIndex?: number },
): Promise<boolean> {
  const timeoutMs = Math.max(1000, Math.floor(Number(opts?.timeoutMs) || 120_000));
  const pollMs = Math.max(50, Math.floor(Number(opts?.pollMs) || 200));
  const deadline = Date.now() + timeoutMs;
  const hydrateOpts = { reportPartIndex: opts?.reportPartIndex };
  while (Date.now() < deadline) {
    if (await hydratePdfExportFillCacheFromBridge(templateId, hydrateOpts)) return true;
    await sleepMs(pollMs);
  }
  return hydratePdfExportFillCacheFromBridge(templateId, hydrateOpts);
}

/**
 * partIndex>0 且缓存命中同模版 → 跳过 fullSqlFill。
 * 若缓存已是「某份切片」，则必须与当前 partIndex 一致。
 */
export function shouldReusePdfExportFill(opts: {
  templateId: string;
  reportPartIndex: number | null | undefined;
  cache?: PdfExportFillSnapshot | null;
}): boolean {
  const id = String(opts.templateId || "").trim();
  const part = opts.reportPartIndex;
  if (!id || part == null || !Number.isFinite(part) || Math.trunc(part) <= 0) return false;
  const snap = opts.cache === undefined ? getPdfExportFillCache(id) : opts.cache;
  if (!snap || snap.templateId !== id) return false;
  if (snap.partIndex != null && Number.isFinite(Number(snap.partIndex))) {
    return Math.trunc(Number(snap.partIndex)) === Math.trunc(part);
  }
  return true;
}
