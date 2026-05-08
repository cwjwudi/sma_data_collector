/** 报表模板 · 数据模型与持久化 */

import type { LayoutSnapshot } from "./layout-model";
import { defaultBlankLayoutSnapshot } from "./layout-model";
import { hydrateLayoutZoneElement, type LayoutZoneElement } from "./layout-zone-element";
import type { PaperKind } from "./paper";

export type TemplateControlType = "text" | "box";

export interface TemplateElement {
  id: string;
  type: TemplateControlType;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  bgColor: string;
  fontSize: number;
}

export interface ReportTemplate {
  id: string;
  name: string;
  updatedAt: string;
  /** 排版控件所处的画布坐标相对于「正文区域」左上角（不含页眉带 / 页脚带） */
  elements: TemplateElement[];
  paperKind: PaperKind;
  orientation: "portrait" | "landscape";
  layoutPresetId: string | null;
  layoutSnapshot: LayoutSnapshot;
  /** 可选封面版式（与正文独立的页眉页脚快照）；导出首页时使用 */
  coverLayoutPresetId: string | null;
  coverLayoutSnapshot: LayoutSnapshot;
  coverHeaderText: string;
  coverFooterText: string;
  coverHeaderElements: LayoutZoneElement[];
  coverFooterElements: LayoutZoneElement[];
  /** 可选末页版式 */
  backLayoutPresetId: string | null;
  backLayoutSnapshot: LayoutSnapshot;
  backHeaderText: string;
  backFooterText: string;
  backHeaderElements: LayoutZoneElement[];
  backFooterElements: LayoutZoneElement[];
  /** 页眉页脚占位文案（创建时从版式预设带入或留空），导出时渲染 */
  headerText: string;
  footerText: string;
  /** 创建时从版式快照：页眉区控件（导出时按当前页渲染页码/日期） */
  headerElements: LayoutZoneElement[];
  footerElements: LayoutZoneElement[];
  /** 封面页正文区控件（导出首页动态内容；页眉页脚见 coverHeader/Footer） */
  coverElements: TemplateElement[];
  /** 末页正文区控件 */
  backElements: TemplateElement[];
}

export interface NewTemplateOptions {
  name: string;
  paperKind: PaperKind;
  orientation: "portrait" | "landscape";
  layoutPresetId: string | null;
  layoutSnapshot: LayoutSnapshot;
  headerText: string;
  footerText: string;
  headerElements: LayoutZoneElement[];
  footerElements: LayoutZoneElement[];
  coverLayoutPresetId: string | null;
  coverLayoutSnapshot: LayoutSnapshot;
  coverHeaderText: string;
  coverFooterText: string;
  coverHeaderElements: LayoutZoneElement[];
  coverFooterElements: LayoutZoneElement[];
  backLayoutPresetId: string | null;
  backLayoutSnapshot: LayoutSnapshot;
  backHeaderText: string;
  backFooterText: string;
  backHeaderElements: LayoutZoneElement[];
  backFooterElements: LayoutZoneElement[];
}

export const TEMPLATE_STORAGE_KEY = "rptp-report-templates";

export function defaultElement(type: TemplateControlType): Omit<TemplateElement, "id"> {
  if (type === "text") {
    return {
      type: "text",
      x: 40,
      y: 40,
      w: 200,
      h: 36,
      text: "文本",
      color: "#18181b",
      bgColor: "transparent",
      fontSize: 14,
    };
  }
  return {
    type: "box",
    x: 40,
    y: 40,
    w: 120,
    h: 80,
    text: "",
    color: "#18181b",
    bgColor: "#e4e4e7",
    fontSize: 14,
  };
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `el_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function createTemplate(opts: NewTemplateOptions): ReportTemplate {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: opts.name.trim() || "未命名模版",
    updatedAt: now,
    elements: [],
    paperKind: opts.paperKind,
    orientation: opts.orientation,
    layoutPresetId: opts.layoutPresetId,
    layoutSnapshot: { ...opts.layoutSnapshot },
    coverLayoutPresetId: opts.coverLayoutPresetId,
    coverLayoutSnapshot: { ...opts.coverLayoutSnapshot },
    coverHeaderText: opts.coverHeaderText,
    coverFooterText: opts.coverFooterText,
    coverHeaderElements: opts.coverHeaderElements.map((e) => ({ ...e })),
    coverFooterElements: opts.coverFooterElements.map((e) => ({ ...e })),
    backLayoutPresetId: opts.backLayoutPresetId,
    backLayoutSnapshot: { ...opts.backLayoutSnapshot },
    backHeaderText: opts.backHeaderText,
    backFooterText: opts.backFooterText,
    backHeaderElements: opts.backHeaderElements.map((e) => ({ ...e })),
    backFooterElements: opts.backFooterElements.map((e) => ({ ...e })),
    headerText: opts.headerText,
    footerText: opts.footerText,
    headerElements: opts.headerElements.map((e) => ({ ...e })),
    footerElements: opts.footerElements.map((e) => ({ ...e })),
    coverElements: [],
    backElements: [],
  };
}

export function loadTemplates(): ReportTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateReportTemplate).filter(isReportTemplate);
  } catch {
    return [];
  }
}

export function saveTemplates(list: ReportTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function normalizeTplBodyElements(raw: unknown): TemplateElement[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as TemplateElement[];
}

function migrateReportTemplate(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const paperKind: PaperKind =
    o.paperKind === "A3" || o.paperKind === "A4" || o.paperKind === "A5" || o.paperKind === "Letter"
      ? o.paperKind
      : "A4";
  const orientation = o.orientation === "landscape" ? "landscape" : "portrait";
  let layoutSnapshot = o.layoutSnapshot as LayoutSnapshot | undefined;
  if (!layoutSnapshot || typeof layoutSnapshot !== "object") {
    layoutSnapshot = defaultBlankLayoutSnapshot();
  }
  let covSnap = o.coverLayoutSnapshot as LayoutSnapshot | undefined;
  if (!covSnap || typeof covSnap !== "object") covSnap = defaultBlankLayoutSnapshot();
  let backSnap = o.backLayoutSnapshot as LayoutSnapshot | undefined;
  if (!backSnap || typeof backSnap !== "object") backSnap = defaultBlankLayoutSnapshot();

  return {
    ...o,
    paperKind,
    orientation,
    layoutPresetId: typeof o.layoutPresetId === "string" ? o.layoutPresetId : null,
    layoutSnapshot,
    coverLayoutPresetId: typeof o.coverLayoutPresetId === "string" ? o.coverLayoutPresetId : null,
    coverLayoutSnapshot: covSnap,
    coverHeaderText: typeof o.coverHeaderText === "string" ? o.coverHeaderText : "",
    coverFooterText: typeof o.coverFooterText === "string" ? o.coverFooterText : "",
    coverHeaderElements: normalizeTplZone(o.coverHeaderElements),
    coverFooterElements: normalizeTplZone(o.coverFooterElements),
    backLayoutPresetId: typeof o.backLayoutPresetId === "string" ? o.backLayoutPresetId : null,
    backLayoutSnapshot: backSnap,
    backHeaderText: typeof o.backHeaderText === "string" ? o.backHeaderText : "",
    backFooterText: typeof o.backFooterText === "string" ? o.backFooterText : "",
    backHeaderElements: normalizeTplZone(o.backHeaderElements),
    backFooterElements: normalizeTplZone(o.backFooterElements),
    headerText: typeof o.headerText === "string" ? o.headerText : "",
    footerText: typeof o.footerText === "string" ? o.footerText : "",
    headerElements: normalizeTplZone(o.headerElements),
    footerElements: normalizeTplZone(o.footerElements),
    coverElements: normalizeTplBodyElements(o.coverElements),
    backElements: normalizeTplBodyElements(o.backElements),
  };
}

function normalizeTplZone(raw: unknown): LayoutZoneElement[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => hydrateLayoutZoneElement(x as Partial<LayoutZoneElement>));
}

function isReportTemplate(v: unknown): v is ReportTemplate {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string" || !Array.isArray(o.elements)) return false;
  if (!o.layoutSnapshot || typeof o.layoutSnapshot !== "object") return false;
  if (typeof o.headerText !== "string") return false;
  if (typeof o.footerText !== "string") return false;
  if (!Array.isArray(o.headerElements) || !Array.isArray(o.footerElements)) return false;
  if (!Array.isArray(o.coverHeaderElements) || !Array.isArray(o.coverFooterElements)) return false;
  if (!Array.isArray(o.backHeaderElements) || !Array.isArray(o.backFooterElements)) return false;
  if (!Array.isArray(o.coverElements) || !Array.isArray(o.backElements)) return false;
  return true;
}

export function makeElement(type: TemplateControlType): TemplateElement {
  const base = defaultElement(type);
  return { ...base, id: newId() };
}
