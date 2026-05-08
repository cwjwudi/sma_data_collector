import type { PaperKind } from "./paper";

/** 写入模版时的版式几何快照（与版式预设脱钩，避免事后改预设导致旧模版错位） */
export interface LayoutSnapshot {
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  /** 页眉预留带高度（从纸张顶边向内，位于上页边距之下） */
  headerBandMm: number;
  /** 页脚预留带高度 */
  footerBandMm: number;
}

/** 可复用的版式 + 页眉页脚文案占位（先于模版编辑维护） */
export interface LayoutPreset {
  id: string;
  name: string;
  updatedAt: string;
  paperKind: PaperKind;
  orientation: "portrait" | "landscape";
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headerBandMm: number;
  footerBandMm: number;
  headerText: string;
  footerText: string;
}

export const LAYOUT_PRESET_STORAGE_KEY = "rptp-layout-presets";

export function defaultBlankLayoutSnapshot(): LayoutSnapshot {
  return {
    marginTopMm: 12,
    marginRightMm: 12,
    marginBottomMm: 12,
    marginLeftMm: 12,
    headerBandMm: 0,
    footerBandMm: 0,
  };
}

export function presetToSnapshot(p: LayoutPreset): LayoutSnapshot {
  return {
    marginTopMm: p.marginTopMm,
    marginRightMm: p.marginRightMm,
    marginBottomMm: p.marginBottomMm,
    marginLeftMm: p.marginLeftMm,
    headerBandMm: p.headerBandMm,
    footerBandMm: p.footerBandMm,
  };
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `lp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function createEmptyLayoutPreset(): LayoutPreset {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: "新建版式",
    updatedAt: now,
    paperKind: "A4",
    orientation: "portrait",
    marginTopMm: 15,
    marginRightMm: 15,
    marginBottomMm: 15,
    marginLeftMm: 15,
    headerBandMm: 20,
    footerBandMm: 15,
    headerText: "页眉（示意）",
    footerText: "第 {page} 页",
  };
}

export function loadLayoutPresets(): LayoutPreset[] {
  try {
    const raw = localStorage.getItem(LAYOUT_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLayoutPreset);
  } catch {
    return [];
  }
}

export function saveLayoutPresets(list: LayoutPreset[]): void {
  try {
    localStorage.setItem(LAYOUT_PRESET_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function isLayoutPreset(v: unknown): v is LayoutPreset {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string";
}

export function hydrateLayoutPreset(raw: Partial<LayoutPreset>): LayoutPreset {
  const d = createEmptyLayoutPreset();
  return {
    ...d,
    ...raw,
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : d.id,
    paperKind: (raw.paperKind as PaperKind) || d.paperKind,
    orientation: raw.orientation === "landscape" ? "landscape" : "portrait",
  };
}
