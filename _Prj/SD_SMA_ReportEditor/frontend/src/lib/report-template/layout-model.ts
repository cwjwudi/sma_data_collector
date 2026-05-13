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

export interface LayoutSnapshot {
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headerBandMm: number;
  footerBandMm: number;
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
  pageRole: LayoutPageRole;
  headerText: string;
  footerText: string;
  headerElements: LayoutZoneElement[];
  footerElements: LayoutZoneElement[];
  bodyElements: LayoutZoneElement[];
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
