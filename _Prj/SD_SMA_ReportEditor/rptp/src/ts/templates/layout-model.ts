import type { PaperKind } from "./paper";
import {
  hydrateLayoutZoneElement,
  makeLayoutZoneElement,
  type LayoutZoneElement,
} from "./layout-zone-element";

/** 版式预设的页面用途（新建模版时可分别选用封面 / 正文 / 末页版式） */
export type LayoutPageRole = "normal" | "cover" | "back";

export const LAYOUT_PAGE_ROLE_LABEL: Record<LayoutPageRole, string> = {
  normal: "正文页",
  cover: "封面",
  back: "末页",
};

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

/** 可复用的版式 + 页眉页脚可视化控件（先于模版编辑维护） */
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
  /** 页面用途：正文页 / 封面 / 末页（新建模版时按用途筛选可选版式） */
  pageRole: LayoutPageRole;
  /** @deprecated 仅兼容旧数据；新界面写入 headerElements */
  headerText: string;
  /** @deprecated 仅兼容旧数据 */
  footerText: string;
  headerElements: LayoutZoneElement[];
  footerElements: LayoutZoneElement[];
  /** 封面 / 末页：正文区装饰控件；正文页通常为空 */
  bodyElements: LayoutZoneElement[];
}

export type { LayoutZoneElement };

/** 版式名称规范化（去首尾空白） */
export function normalizeLayoutPresetName(s: string): string {
  return s.trim();
}

/** 是否与列表中其他预设同名（excludeId 为当前编辑项 id 时排除自身） */
export function isLayoutPresetNameTaken(
  list: LayoutPreset[],
  name: string,
  excludeId?: string | null,
): boolean {
  const n = normalizeLayoutPresetName(name);
  if (!n) return false;
  return list.some(
    (x) => x.id !== excludeId && normalizeLayoutPresetName(x.name) === n,
  );
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

/** 页眉页脚区与几何快照（新建模版从预设复制或空白） */
export interface ZonesSnapshot {
  layoutSnapshot: LayoutSnapshot;
  headerText: string;
  footerText: string;
  headerElements: LayoutZoneElement[];
  footerElements: LayoutZoneElement[];
  bodyElements: LayoutZoneElement[];
}

export function presetZonesSnapshot(preset: LayoutPreset): ZonesSnapshot {
  return {
    layoutSnapshot: presetToSnapshot(preset),
    headerText: preset.headerText,
    footerText: preset.footerText,
    headerElements: preset.headerElements.map((e) => ({ ...e })),
    footerElements: preset.footerElements.map((e) => ({ ...e })),
    bodyElements: preset.bodyElements.map((e) => ({ ...e })),
  };
}

export function blankZonesSnapshot(): ZonesSnapshot {
  return {
    layoutSnapshot: defaultBlankLayoutSnapshot(),
    headerText: "",
    footerText: "",
    headerElements: [],
    footerElements: [],
    bodyElements: [],
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
    headerBandMm: 22,
    footerBandMm: 18,
    pageRole: "normal",
    headerText: "",
    footerText: "",
    headerElements: [],
    footerElements: [],
    bodyElements: [],
  };
}

export function loadLayoutPresets(): LayoutPreset[] {
  try {
    const raw = localStorage.getItem(LAYOUT_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLayoutPreset).map((p) => hydrateLayoutPreset(p as Partial<LayoutPreset>));
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

function normalizeZoneArray(raw: unknown): LayoutZoneElement[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => hydrateLayoutZoneElement(x as Partial<LayoutZoneElement>));
}

function normalizePageRole(v: unknown): LayoutPageRole {
  if (v === "cover" || v === "back") return v;
  return "normal";
}

export function hydrateLayoutPreset(raw: Partial<LayoutPreset>): LayoutPreset {
  const d = createEmptyLayoutPreset();
  const merged: LayoutPreset = {
    ...d,
    ...raw,
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : d.id,
    paperKind: (raw.paperKind as PaperKind) || d.paperKind,
    orientation: raw.orientation === "landscape" ? "landscape" : "portrait",
    pageRole: normalizePageRole(raw.pageRole),
    headerText: typeof raw.headerText === "string" ? raw.headerText : d.headerText,
    footerText: typeof raw.footerText === "string" ? raw.footerText : d.footerText,
    headerElements: normalizeZoneArray(raw.headerElements),
    footerElements: normalizeZoneArray(raw.footerElements),
    bodyElements: normalizeZoneArray(raw.bodyElements),
  };

  if (merged.headerElements.length === 0 && merged.headerText.trim()) {
    const el = makeLayoutZoneElement("text");
    el.text = merged.headerText;
    el.x = 8;
    el.y = 6;
    el.w = 280;
    el.h = 26;
    merged.headerElements = [el];
  }
  if (merged.footerElements.length === 0 && merged.footerText.trim()) {
    const el = makeLayoutZoneElement("text");
    el.text = merged.footerText;
    el.x = 8;
    el.y = 6;
    el.w = 320;
    el.h = 22;
    el.fontSize = 12;
    merged.footerElements = [el];
  }

  return merged;
}
