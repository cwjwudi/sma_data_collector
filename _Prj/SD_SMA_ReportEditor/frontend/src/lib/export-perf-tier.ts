/**
 * 导出性能档位（035 / 0.3.121）：离散 5 档，默认「预览稳」(2)。
 * 0–1 = pdf-lib；2–4 = chromium 预览级，按抢核程度递增。
 */

export type ExportPerfTier = 0 | 1 | 2 | 3 | 4;

export type ExportPerfCoexistPause = "full" | "basic";

/** draft=仅内容；layout=pdf-lib 坐标版式；preview=chromium 预览级 */
export type ExportPerfPdfQuality = "draft" | "layout" | "preview";

export type ExportPerfLayoutFidelity = "draft-v1" | "layout-v2" | "print-to-pdf";

export type ExportPerfProfile = {
  tier: ExportPerfTier;
  label: string;
  summary: string;
  engine: "pdf-lib" | "chromium";
  layoutFidelity: ExportPerfLayoutFidelity;
  /** 预热窗目标数量；0 = 不养池 */
  prewarmPoolSize: number;
  /** 并行 hint（仍受 CPU 预算封顶） */
  maxParallelHint: number;
  yieldMs: number;
  coexistPause: ExportPerfCoexistPause;
  pdfQuality: ExportPerfPdfQuality;
  isDefault: boolean;
};

/** 默认档：预览质量最终妥协 */
export const DEFAULT_EXPORT_PERF_TIER: ExportPerfTier = 2;

export const EXPORT_PERF_TIER_PREF_KEY = "exportPerfTier";

/** prefs 内标记已按五档刻度存储；缺省则把旧四档 1/2/3 映射到 2/3/4 */
export const EXPORT_PERF_TIER_SCALE = 5;
export const EXPORT_PERF_TIER_SCALE_KEY = "exportPerfTierScale";

const PROFILES: Record<ExportPerfTier, Omit<ExportPerfProfile, "tier" | "isDefault">> = {
  0: {
    label: "仅内容",
    summary: "pdf-lib 流式文本，无坐标版式；最省机，仅救急。",
    engine: "pdf-lib",
    layoutFidelity: "draft-v1",
    prewarmPoolSize: 0,
    maxParallelHint: 1,
    yieldMs: 200,
    coexistPause: "full",
    pdfQuality: "draft",
  },
  1: {
    label: "矢量版式",
    summary: "pdf-lib 按坐标画版式（无 printToPDF）；同机友好，版式接近预览但不保证像素级。",
    engine: "pdf-lib",
    layoutFidelity: "layout-v2",
    prewarmPoolSize: 0,
    maxParallelHint: 1,
    yieldMs: 200,
    coexistPause: "full",
    pdfQuality: "layout",
  },
  2: {
    label: "预览稳",
    summary: "chromium 预览级 PDF；关闭预热、强降载、较长分卷间隔（默认 · 预览质量最终妥协）。",
    engine: "chromium",
    layoutFidelity: "print-to-pdf",
    prewarmPoolSize: 0,
    maxParallelHint: 1,
    yieldMs: 200,
    coexistPause: "full",
    pdfQuality: "preview",
  },
  3: {
    label: "功能折中",
    summary: "chromium 预览级；轻度预热、并行 1、结批降载；质量与后台功能的折中。",
    engine: "chromium",
    layoutFidelity: "print-to-pdf",
    prewarmPoolSize: 1,
    maxParallelHint: 1,
    yieldMs: 80,
    coexistPause: "full",
    pdfQuality: "preview",
  },
  4: {
    label: "不妥协",
    summary: "chromium 预览级；预热开、可提高并行；降载仅基础，功能与质量都要，更吃 CPU。",
    engine: "chromium",
    layoutFidelity: "print-to-pdf",
    prewarmPoolSize: 2,
    maxParallelHint: 2,
    yieldMs: 40,
    coexistPause: "basic",
    pdfQuality: "preview",
  },
};

export function normalizeExportPerfTier(raw: unknown): ExportPerfTier {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 4) {
    return raw as ExportPerfTier;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 4) return n as ExportPerfTier;
  }
  return DEFAULT_EXPORT_PERF_TIER;
}

/** 旧四档（0–3）→ 五档：0 不变；1→2、2→3、3→4 */
export function remapFourTierToFive(oldTier: number): ExportPerfTier {
  if (oldTier === 0) return 0;
  if (oldTier === 1) return 2;
  if (oldTier === 2) return 3;
  if (oldTier === 3) return 4;
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
  return ([0, 1, 2, 3, 4] as ExportPerfTier[]).map((t) => resolveExportPerfProfile(t));
}

/**
 * 旧引擎 / 旧四档 → 五档。
 * - scale===5 且合法 tier → 保留
 * - 无 scale 的旧四档 0–3 → remap
 * - 仅 pdf-lib → 0；仅 chromium / 缺省 → 2
 */
export function migrateExportPerfTierFromLegacy(opts: {
  exportPerfTier?: unknown;
  pdfExportEngine?: unknown;
  exportPerfTierScale?: unknown;
}): { tier: ExportPerfTier; fromLegacy: boolean; scale: typeof EXPORT_PERF_TIER_SCALE } {
  const scaleRaw = opts.exportPerfTierScale;
  const alreadyFive = scaleRaw === 5 || scaleRaw === "5";

  if (opts.exportPerfTier !== undefined && opts.exportPerfTier !== null && opts.exportPerfTier !== "") {
    const n =
      typeof opts.exportPerfTier === "number"
        ? opts.exportPerfTier
        : Number(String(opts.exportPerfTier).trim());
    if (Number.isInteger(n)) {
      if (alreadyFive && n >= 0 && n <= 4) {
        return { tier: n as ExportPerfTier, fromLegacy: false, scale: EXPORT_PERF_TIER_SCALE };
      }
      if (!alreadyFive && n >= 0 && n <= 3) {
        return { tier: remapFourTierToFive(n), fromLegacy: true, scale: EXPORT_PERF_TIER_SCALE };
      }
      if (alreadyFive) {
        return { tier: normalizeExportPerfTier(n), fromLegacy: false, scale: EXPORT_PERF_TIER_SCALE };
      }
    }
  }

  const eng = String(opts.pdfExportEngine || "")
    .trim()
    .toLowerCase();
  if (eng === "pdf-lib" || eng === "pdflib" || eng === "vector") {
    return { tier: 0, fromLegacy: true, scale: EXPORT_PERF_TIER_SCALE };
  }
  return { tier: DEFAULT_EXPORT_PERF_TIER, fromLegacy: true, scale: EXPORT_PERF_TIER_SCALE };
}

/**
 * 结批期是否暂停侧栏探活 / Dashboard / AI pending。
 * full：导出中暂停；basic：不因档位暂停这些任务。
 */
export function shouldPauseCoexistTasks(
  exporting: boolean,
  coexistPause: ExportPerfCoexistPause,
): boolean {
  return Boolean(exporting) && coexistPause === "full";
}
