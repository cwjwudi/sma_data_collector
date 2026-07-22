/**
 * 导出性能档位（035 / 0.3.120）：离散 4 档，默认「均衡」。
 * 引擎只是 knob；主目标 = 预览级 PDF（档 1–3）+ 按设备省 CPU。
 */

export type ExportPerfTier = 0 | 1 | 2 | 3;

export type ExportPerfCoexistPause = "full" | "basic";

export type ExportPerfPdfQuality = "draft" | "preview";

export type ExportPerfProfile = {
  tier: ExportPerfTier;
  label: string;
  summary: string;
  engine: "pdf-lib" | "chromium";
  /** 预热窗目标数量；0 = 不养池 */
  prewarmPoolSize: number;
  /** 并行 hint（仍受 CPU 预算封顶） */
  maxParallelHint: number;
  yieldMs: number;
  coexistPause: ExportPerfCoexistPause;
  pdfQuality: ExportPerfPdfQuality;
  isDefault: boolean;
};

/** 默认档：均衡 */
export const DEFAULT_EXPORT_PERF_TIER: ExportPerfTier = 2;

export const EXPORT_PERF_TIER_PREF_KEY = "exportPerfTier";

const PROFILES: Record<ExportPerfTier, Omit<ExportPerfProfile, "tier" | "isDefault">> = {
  0: {
    label: "最省机",
    summary: "pdf-lib 草稿导出，尽量少抢核；版式非预览级，仅救急。",
    engine: "pdf-lib",
    prewarmPoolSize: 0,
    maxParallelHint: 1,
    yieldMs: 200,
    coexistPause: "full",
    pdfQuality: "draft",
  },
  1: {
    label: "同机稳",
    summary: "预览级 PDF；关闭预热、强降载、较长分卷间隔，适合有 mappView 同机。",
    engine: "chromium",
    prewarmPoolSize: 0,
    maxParallelHint: 1,
    yieldMs: 200,
    coexistPause: "full",
    pdfQuality: "preview",
  },
  2: {
    label: "均衡",
    summary: "预览级 PDF；轻度预热、并行 1、结批降载（默认）。",
    engine: "chromium",
    prewarmPoolSize: 1,
    maxParallelHint: 1,
    yieldMs: 80,
    coexistPause: "full",
    pdfQuality: "preview",
  },
  3: {
    label: "最快出图",
    summary: "预览级 PDF；预热开、可提高并行；降载仅基础，更吃 CPU。",
    engine: "chromium",
    prewarmPoolSize: 2,
    maxParallelHint: 2,
    yieldMs: 40,
    coexistPause: "basic",
    pdfQuality: "preview",
  },
};

export function normalizeExportPerfTier(raw: unknown): ExportPerfTier {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 3) {
    return raw as ExportPerfTier;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 3) return n as ExportPerfTier;
  }
  return DEFAULT_EXPORT_PERF_TIER;
}

export function resolveExportPerfProfile(tierRaw: unknown): ExportPerfProfile {
  const tier = normalizeExportPerfTier(tierRaw);
  const base = PROFILES[tier];
  return {
    tier,
    ...base,
    isDefault: tier === DEFAULT_EXPORT_PERF_TIER,
  };
}

/** 全部档位（UI 刻度） */
export function listExportPerfProfiles(): ExportPerfProfile[] {
  return ([0, 1, 2, 3] as ExportPerfTier[]).map((t) => resolveExportPerfProfile(t));
}

/**
 * 旧二选一引擎 → 档位。
 * - 已有合法 tier → 保留
 * - 仅 pdf-lib → 0
 * - 仅 chromium / 缺省 → 2（均衡）
 */
export function migrateExportPerfTierFromLegacy(opts: {
  exportPerfTier?: unknown;
  pdfExportEngine?: unknown;
}): { tier: ExportPerfTier; fromLegacy: boolean } {
  if (opts.exportPerfTier !== undefined && opts.exportPerfTier !== null && opts.exportPerfTier !== "") {
    const hasExplicit =
      (typeof opts.exportPerfTier === "number" &&
        Number.isInteger(opts.exportPerfTier) &&
        opts.exportPerfTier >= 0 &&
        opts.exportPerfTier <= 3) ||
      (typeof opts.exportPerfTier === "string" &&
        ["0", "1", "2", "3"].includes(opts.exportPerfTier.trim()));
    if (hasExplicit) {
      return { tier: normalizeExportPerfTier(opts.exportPerfTier), fromLegacy: false };
    }
  }
  const eng = String(opts.pdfExportEngine || "")
    .trim()
    .toLowerCase();
  if (eng === "pdf-lib" || eng === "pdflib" || eng === "vector") {
    return { tier: 0, fromLegacy: true };
  }
  // chromium / 空 / 未知 → 默认均衡
  return { tier: DEFAULT_EXPORT_PERF_TIER, fromLegacy: true };
}

/**
 * 结批期是否暂停侧栏探活 / Dashboard / AI pending。
 * full：导出中暂停；basic：不因档位暂停这些任务（仍可走进程低优先级等）。
 */
export function shouldPauseCoexistTasks(
  exporting: boolean,
  coexistPause: ExportPerfCoexistPause,
): boolean {
  return Boolean(exporting) && coexistPause === "full";
}
