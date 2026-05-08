/** 报表模板 · 数据模型与持久化 */

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
  elements: TemplateElement[];
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

export function createTemplate(name: string): ReportTemplate {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: name.trim() || "未命名模版",
    updatedAt: now,
    elements: [],
  };
}

export function loadTemplates(): ReportTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReportTemplate);
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

function isReportTemplate(v: unknown): v is ReportTemplate {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && Array.isArray(o.elements);
}

export function makeElement(type: TemplateControlType): TemplateElement {
  const base = defaultElement(type);
  return { ...base, id: newId() };
}
