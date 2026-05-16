/**
 * Schema version for persisted template JSON (API + generator).
 * Bump when incompatible field changes occur.
 */
export const TEMPLATE_SCHEMA_VERSION = 2;

/** 模版正文画布控件类型（扩展后与生成器约定见 _Doc） */
export type TemplateControlType =
  | "text"
  | "box"
  | "image"
  | "table"
  | "chart"
  | "parameter"
  | "signature";

export type BindingKind = "none" | "opcua" | "sql";

import type { LayoutSnapshot } from "./layout-model";
import { defaultBlankLayoutSnapshot } from "./layout-model";
import type { PaperKind } from "./paper";
import type { LayoutAlignAxis, ImageCaptionPosition } from "./layout-zone-element";
import {
  hydrateLayoutZoneElement,
  normalizeAlignAxis,
  normalizeImageCaptionPosition,
  normalizeImageRotationDeg,
  type LayoutZoneElement,
} from "./layout-zone-element";

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
  /** 图片控件 / 签名笔迹 base64 data URL */
  imageSrc: string;
  bindingKind: BindingKind;
  /** OPC UA NodeId（仅 bindingKind === opcua 时用于参数类展示） */
  opcuaNodeId: string;
  /** 画布控件水平对齐（图片等九宫格占位） */
  alignX: LayoutAlignAxis;
  /** 画布控件垂直对齐（图片等九宫格占位） */
  alignY: LayoutAlignAxis;
  /** 画布图片旋转角（度） */
  imageRotationDeg: number;
  /** 画布图片配文相对图片的位置 */
  imageCaptionPosition: ImageCaptionPosition;
  /** SQL（表格或图表数据源；可含 {opc.xxx} 占位，由生成器注入） */
  sqlText: string;
  /** 简易图表类型预览 */
  chartKind: "line" | "bar";
  /** 电子签名：签署人显示名 */
  signerLabel: string;
  /** 引用签名库条目 id（可与 imageSrc 手写图并存，生成器优先语义以 _Doc 为准） */
  signatureAssetId: string;
}

export interface ReportTemplate {
  schemaVersion?: number;
  id: string;
  name: string;
  updatedAt: string;
  elements: TemplateElement[];
  paperKind: PaperKind;
  orientation: "portrait" | "landscape";
  layoutPresetId: string | null;
  layoutSnapshot: LayoutSnapshot;
  coverLayoutPresetId: string | null;
  coverLayoutSnapshot: LayoutSnapshot;
  coverHeaderText: string;
  coverFooterText: string;
  coverHeaderElements: LayoutZoneElement[];
  coverFooterElements: LayoutZoneElement[];
  coverBodyZoneElements: LayoutZoneElement[];
  backLayoutPresetId: string | null;
  backLayoutSnapshot: LayoutSnapshot;
  backHeaderText: string;
  backFooterText: string;
  backHeaderElements: LayoutZoneElement[];
  backFooterElements: LayoutZoneElement[];
  backBodyZoneElements: LayoutZoneElement[];
  headerText: string;
  footerText: string;
  headerElements: LayoutZoneElement[];
  footerElements: LayoutZoneElement[];
  coverElements: TemplateElement[];
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
  coverBodyZoneElements: LayoutZoneElement[];
  backLayoutPresetId: string | null;
  backLayoutSnapshot: LayoutSnapshot;
  backHeaderText: string;
  backFooterText: string;
  backHeaderElements: LayoutZoneElement[];
  backFooterElements: LayoutZoneElement[];
  backBodyZoneElements: LayoutZoneElement[];
}

export const TEMPLATE_STORAGE_KEY = "rptp-report-templates";

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `el_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

function normalizeBindingKind(v: unknown): BindingKind {
  if (v === "opcua" || v === "sql") return v;
  return "none";
}

function normalizeChartKind(v: unknown): "line" | "bar" {
  return v === "bar" ? "bar" : "line";
}

function normalizeTemplateControlType(v: unknown): TemplateControlType {
  if (
    v === "box" ||
    v === "image" ||
    v === "table" ||
    v === "chart" ||
    v === "parameter" ||
    v === "signature"
  )
    return v;
  return "text";
}

export function defaultElement(type: TemplateControlType): Omit<TemplateElement, "id"> {
  const base = {
    color: "#18181b",
    bgColor: "transparent",
    fontSize: 14,
    imageSrc: "",
    alignX: "start" as LayoutAlignAxis,
    alignY: "center" as LayoutAlignAxis,
    imageRotationDeg: 0,
    imageCaptionPosition: "none" as ImageCaptionPosition,
    bindingKind: "none" as BindingKind,
    opcuaNodeId: "",
    sqlText: "",
    chartKind: "line" as const,
    signerLabel: "",
    signatureAssetId: "",
  };
  if (type === "text") {
    return {
      type: "text",
      x: 40,
      y: 40,
      w: 200,
      h: 36,
      text: "文本",
      ...base,
    };
  }
  if (type === "box") {
    return {
      type: "box",
      x: 40,
      y: 40,
      w: 120,
      h: 80,
      text: "",
      ...base,
      bgColor: "#e4e4e7",
    };
  }
  if (type === "image") {
    return {
      type: "image",
      x: 40,
      y: 40,
      w: 120,
      h: 80,
      text: "",
      ...base,
      alignX: "center",
      alignY: "center",
      imageCaptionPosition: "bottom",
      imageRotationDeg: 0,
    };
  }
  if (type === "table") {
    return {
      type: "table",
      x: 40,
      y: 80,
      w: 400,
      h: 200,
      text: "",
      sqlText: "SELECT 1 AS col1",
      ...base,
    };
  }
  if (type === "chart") {
    return {
      type: "chart",
      x: 40,
      y: 80,
      w: 360,
      h: 220,
      text: "",
      chartKind: "line",
      sqlText: "",
      ...base,
    };
  }
  if (type === "parameter") {
    return {
      type: "parameter",
      x: 40,
      y: 40,
      w: 160,
      h: 36,
      text: "{{value}}",
      ...base,
    };
  }
  return {
    type: "signature",
    x: 40,
    y: 200,
    w: 200,
    h: 72,
    text: "",
    ...base,
    signerLabel: "签署",
  };
}

export function makeElement(type: TemplateControlType): TemplateElement {
  const b = defaultElement(type);
  return { ...b, id: newId() };
}

export function hydrateTemplateElement(raw: Partial<TemplateElement>): TemplateElement {
  const type = normalizeTemplateControlType(raw.type);
  const d = defaultElement(type);
  const id =
    typeof raw.id === "string" && raw.id.length > 0 ? raw.id : newId();
  return {
    ...d,
    ...raw,
    id,
    type,
    bindingKind: normalizeBindingKind(raw.bindingKind),
    opcuaNodeId: typeof raw.opcuaNodeId === "string" ? raw.opcuaNodeId : d.opcuaNodeId,
    sqlText: typeof raw.sqlText === "string" ? raw.sqlText : d.sqlText,
    chartKind: normalizeChartKind(raw.chartKind),
    signerLabel:
      typeof raw.signerLabel === "string" ? raw.signerLabel : d.signerLabel,
    signatureAssetId:
      typeof raw.signatureAssetId === "string" ? raw.signatureAssetId : d.signatureAssetId,
    imageSrc: typeof raw.imageSrc === "string" ? raw.imageSrc : d.imageSrc,
    alignX: normalizeAlignAxis(raw.alignX, d.alignX),
    alignY: normalizeAlignAxis(raw.alignY, d.alignY),
    imageRotationDeg: normalizeImageRotationDeg(raw.imageRotationDeg ?? d.imageRotationDeg),
    imageCaptionPosition: normalizeImageCaptionPosition(raw.imageCaptionPosition, d.imageCaptionPosition),
  };
}

export function createTemplate(opts: NewTemplateOptions): ReportTemplate {
  const now = new Date().toISOString();
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
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
    coverBodyZoneElements: opts.coverBodyZoneElements.map((e) => ({ ...e })),
    backLayoutPresetId: opts.backLayoutPresetId,
    backLayoutSnapshot: { ...opts.backLayoutSnapshot },
    backHeaderText: opts.backHeaderText,
    backFooterText: opts.backFooterText,
    backHeaderElements: opts.backHeaderElements.map((e) => ({ ...e })),
    backFooterElements: opts.backFooterElements.map((e) => ({ ...e })),
    backBodyZoneElements: opts.backBodyZoneElements.map((e) => ({ ...e })),
    headerText: opts.headerText,
    footerText: opts.footerText,
    headerElements: opts.headerElements.map((e) => ({ ...e })),
    footerElements: opts.footerElements.map((e) => ({ ...e })),
    coverElements: [],
    backElements: [],
  };
}

export function migrateReportTemplate(v: unknown): unknown {
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
    schemaVersion: typeof o.schemaVersion === "number" ? o.schemaVersion : 1,
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
    coverBodyZoneElements: normalizeTplZone(o.coverBodyZoneElements),
    backLayoutPresetId: typeof o.backLayoutPresetId === "string" ? o.backLayoutPresetId : null,
    backLayoutSnapshot: backSnap,
    backHeaderText: typeof o.backHeaderText === "string" ? o.backHeaderText : "",
    backFooterText: typeof o.backFooterText === "string" ? o.backFooterText : "",
    backHeaderElements: normalizeTplZone(o.backHeaderElements),
    backFooterElements: normalizeTplZone(o.backFooterElements),
    backBodyZoneElements: normalizeTplZone(o.backBodyZoneElements),
    headerText: typeof o.headerText === "string" ? o.headerText : "",
    footerText: typeof o.footerText === "string" ? o.footerText : "",
    headerElements: normalizeTplZone(o.headerElements),
    footerElements: normalizeTplZone(o.footerElements),
    coverElements: normalizeTplBodyElements(o.coverElements),
    backElements: normalizeTplBodyElements(o.backElements),
    elements: normalizeTplBodyElements(o.elements),
  };
}

function normalizeTplZone(raw: unknown): LayoutZoneElement[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => hydrateLayoutZoneElement(x as Partial<LayoutZoneElement>));
}

function normalizeTplBodyElements(raw: unknown): TemplateElement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => hydrateTemplateElement(x as Partial<TemplateElement>));
}

export function isReportTemplate(v: unknown): v is ReportTemplate {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string" || !Array.isArray(o.elements)) return false;
  if (!o.layoutSnapshot || typeof o.layoutSnapshot !== "object") return false;
  if (typeof o.headerText !== "string") return false;
  if (typeof o.footerText !== "string") return false;
  if (!Array.isArray(o.headerElements) || !Array.isArray(o.footerElements)) return false;
  if (!Array.isArray(o.coverHeaderElements) || !Array.isArray(o.coverFooterElements)) return false;
  if (!Array.isArray(o.coverBodyZoneElements)) return false;
  if (!Array.isArray(o.backHeaderElements) || !Array.isArray(o.backFooterElements)) return false;
  if (!Array.isArray(o.backBodyZoneElements)) return false;
  if (!Array.isArray(o.coverElements) || !Array.isArray(o.backElements)) return false;
  return true;
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
