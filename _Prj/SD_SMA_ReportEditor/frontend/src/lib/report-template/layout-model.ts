import type { PaperKind } from "./paper";
import {
  hydrateLayoutZoneElement,
  makeLayoutZoneElement,
  type LayoutZoneElement,
} from "./layout-zone-element";

export type LayoutPageRole = "normal" | "cover" | "back";

export const LAYOUT_PAGE_ROLE_LABEL: Record<LayoutPageRole, string> = {
  normal: "正文页",
  cover: "封面",
  back: "末页",
};

/** 与历史 Mini `.mini-body` 硬编码一致；缺省/旧 JSON 回落此值 */
export const DEFAULT_BODY_BACKGROUND_CSS = "rgb(249 249 251)";

export interface LayoutSnapshot {
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headerBandMm: number;
  footerBandMm: number;
  /**
   * 正文区底色（CSS）。空/缺省 → 历史浅灰；`transparent` 不填（纸白）；可自定义色。
   * 封面/正文/末页各持一份 snapshot，可分别配置。
   */
  bodyBackgroundCss: string;
}

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
  /** 与 LayoutSnapshot.bodyBackgroundCss 同语义；套用版式时写入 snapshot */
  bodyBackgroundCss: string;
  pageRole: LayoutPageRole;
  headerText: string;
  footerText: string;
  headerElements: LayoutZoneElement[];
  footerElements: LayoutZoneElement[];
  bodyElements: LayoutZoneElement[];
}

/** 归一正文底色：空/缺省 → 历史灰；保留 transparent / 自定义色 */
export function resolveBodyBackgroundCss(
  snap: Pick<LayoutSnapshot, "bodyBackgroundCss"> | Partial<LayoutSnapshot> | null | undefined,
): string {
  const v = typeof snap?.bodyBackgroundCss === "string" ? snap.bodyBackgroundCss.trim() : "";
  if (!v) return DEFAULT_BODY_BACKGROUND_CSS;
  return v;
}

export function hydrateLayoutSnapshot(
  raw: Partial<LayoutSnapshot> | null | undefined,
): LayoutSnapshot {
  const d = defaultBlankLayoutSnapshot();
  if (!raw || typeof raw !== "object") return d;
  const num = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fb;
  return {
    marginTopMm: num(raw.marginTopMm, d.marginTopMm),
    marginRightMm: num(raw.marginRightMm, d.marginRightMm),
    marginBottomMm: num(raw.marginBottomMm, d.marginBottomMm),
    marginLeftMm: num(raw.marginLeftMm, d.marginLeftMm),
    headerBandMm: num(raw.headerBandMm, d.headerBandMm),
    footerBandMm: num(raw.footerBandMm, d.footerBandMm),
    bodyBackgroundCss: resolveBodyBackgroundCss(raw),
  };
}

export type { LayoutZoneElement };

export function normalizeLayoutPresetName(s: string): string {
  return s.trim();
}

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
    bodyBackgroundCss: DEFAULT_BODY_BACKGROUND_CSS,
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
    bodyBackgroundCss: resolveBodyBackgroundCss(p),
  };
}

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
    bodyBackgroundCss: DEFAULT_BODY_BACKGROUND_CSS,
    pageRole: "normal",
    headerText: "",
    footerText: "",
    headerElements: [],
    footerElements: [],
    bodyElements: [],
  };
}

/** 深拷贝版式并分配新 id、名称与更新时间（列表「复制」）。 */
export function duplicateLayoutPreset(source: LayoutPreset, newName: string): LayoutPreset {
  const clone = JSON.parse(JSON.stringify(source)) as Partial<LayoutPreset>;
  clone.id = newId();
  clone.name = newName.trim();
  clone.updatedAt = new Date().toISOString();
  return hydrateLayoutPreset(clone);
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
    bodyBackgroundCss: resolveBodyBackgroundCss(raw),
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
