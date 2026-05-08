/** 报表模板 · 数据模型与持久化 */

import type { LayoutSnapshot } from "./layout-model";
import { defaultBlankLayoutSnapshot } from "./layout-model";
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
  /** 页眉页脚占位文案（创建时从版式预设带入或留空），导出时渲染 */
  headerText: string;
  footerText: string;
}

export interface NewTemplateOptions {
  name: string;
  paperKind: PaperKind;
  orientation: "portrait" | "landscape";
  layoutPresetId: string | null;
  layoutSnapshot: LayoutSnapshot;
  headerText: string;
  footerText: string;
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
    headerText: opts.headerText,
    footerText: opts.footerText,
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
  return {
    ...o,
    paperKind,
    orientation,
    layoutPresetId: typeof o.layoutPresetId === "string" ? o.layoutPresetId : null,
    layoutSnapshot,
    headerText: typeof o.headerText === "string" ? o.headerText : "",
    footerText: typeof o.footerText === "string" ? o.footerText : "",
  };
}

function isReportTemplate(v: unknown): v is ReportTemplate {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string" || !Array.isArray(o.elements)) return false;
  if (!o.layoutSnapshot || typeof o.layoutSnapshot !== "object") return false;
  if (typeof o.headerText !== "string") return false;
  if (typeof o.footerText !== "string") return false;
  return true;
}

export function makeElement(type: TemplateControlType): TemplateElement {
  const base = defaultElement(type);
  return { ...base, id: newId() };
}
