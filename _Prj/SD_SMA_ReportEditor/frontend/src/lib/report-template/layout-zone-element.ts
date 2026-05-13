/** 页眉/页脚区可视化控件 */

export type LayoutZoneKind = "header" | "footer";

export type LayoutControlType = "text" | "box" | "image" | "pageNumber" | "date";

/** 页码在预览/导出时的展示形式（导出时传入真实当前页与总页数） */
export type PageNumberDisplayMode = "plain" | "slashTotal" | "cnPage" | "circle";

export const PAGE_NUMBER_MODE_LABEL: Record<PageNumberDisplayMode, string> = {
  plain: "仅数字",
  slashTotal: "当前页/总页数",
  cnPage: "第N页",
  circle: "圆形框",
};

export const PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK = 10;

export function normalizePageNumberMode(v: unknown): PageNumberDisplayMode {
  if (v === "slashTotal" || v === "cnPage" || v === "circle") return v;
  return "plain";
}

export function formatPageNumberDisplay(
  mode: PageNumberDisplayMode | undefined,
  page: number,
  totalPages: number,
): string {
  const m = normalizePageNumberMode(mode);
  const p = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1));
  const t = Math.max(p, Math.floor(Number.isFinite(totalPages) ? totalPages : p));
  switch (m) {
    case "slashTotal":
      return `${p}/${t}`;
    case "cnPage":
      return `第${p}页`;
    case "circle":
      return String(p);
    default:
      return String(p);
  }
}

export type LayoutAlignAxis = "start" | "center" | "end";

export interface LayoutZoneElement {
  id: string;
  type: LayoutControlType;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  bgColor: string;
  fontSize: number;
  alignX: LayoutAlignAxis;
  alignY: LayoutAlignAxis;
  dateFormat: string;
  imageSrc: string;
  pageNumberMode: PageNumberDisplayMode;
}

export function normalizeAlignAxis(v: unknown, fb: LayoutAlignAxis): LayoutAlignAxis {
  if (v === "center" || v === "end") return v;
  return fb;
}

export function formatLayoutDate(d: Date, pattern: string): string {
  const fmt = pattern.trim() || "yyyy-MM-dd";
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return fmt
    .replace(/yyyy/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/dd/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()));
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `lz_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function defaultLayoutZoneElement(type: LayoutControlType): Omit<LayoutZoneElement, "id"> {
  const axStart = { alignX: "start" as const, alignY: "center" as const };
  const axCenter = { alignX: "center" as const, alignY: "center" as const };
  const baseText = {
    text: type === "text" ? "文本" : "",
    color: "#18181b",
    bgColor: type === "box" ? "#e4e4e7" : "transparent",
    fontSize: 13,
    dateFormat: "yyyy-MM-dd HH:mm",
    imageSrc: "",
    pageNumberMode: "plain" as PageNumberDisplayMode,
  };
  if (type === "text") {
    return { type: "text", x: 8, y: 8, w: 160, h: 28, ...baseText, ...axStart };
  }
  if (type === "box") {
    return { type: "box", x: 8, y: 8, w: 100, h: 36, ...baseText, ...axCenter };
  }
  if (type === "image") {
    return { type: "image", x: 8, y: 8, w: 64, h: 64, ...baseText, text: "", ...axCenter };
  }
  if (type === "pageNumber") {
    return {
      type: "pageNumber",
      x: 8,
      y: 8,
      w: 80,
      h: 26,
      text: "",
      color: "#52525b",
      bgColor: "transparent",
      fontSize: 12,
      dateFormat: "",
      imageSrc: "",
      ...axStart,
    };
  }
  return {
    type: "date",
    x: 8,
    y: 8,
    w: 180,
    h: 26,
    text: "",
    color: "#52525b",
    bgColor: "transparent",
    fontSize: 12,
    dateFormat: "yyyy-MM-dd",
    imageSrc: "",
    ...axStart,
  };
}

export function makeLayoutZoneElement(type: LayoutControlType): LayoutZoneElement {
  const b = defaultLayoutZoneElement(type);
  return { ...b, id: newId() };
}

export function hydrateLayoutZoneElement(raw: Partial<LayoutZoneElement>): LayoutZoneElement {
  const type = normalizeControlType(raw.type);
  const d = defaultLayoutZoneElement(type);
  return {
    ...d,
    ...raw,
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : newId(),
    type,
    alignX: normalizeAlignAxis(raw.alignX, d.alignX),
    alignY: normalizeAlignAxis(raw.alignY, d.alignY),
    dateFormat: typeof raw.dateFormat === "string" ? raw.dateFormat : d.dateFormat,
    imageSrc: typeof raw.imageSrc === "string" ? raw.imageSrc : d.imageSrc,
    pageNumberMode: normalizePageNumberMode(raw.pageNumberMode),
  };
}

export function normalizeControlType(v: unknown): LayoutControlType {
  if (v === "box" || v === "image" || v === "pageNumber" || v === "date") return v;
  return "text";
}

export function clampZoneElement(el: LayoutZoneElement, zw: number, zh: number): void {
  el.w = Math.max(16, Math.min(el.w, zw));
  el.h = Math.max(16, Math.min(el.h, zh));
  el.x = Math.max(0, Math.min(el.x, zw - el.w));
  el.y = Math.max(0, Math.min(el.y, zh - el.h));
}

export function previewZoneElementDisplay(el: LayoutZoneElement): string {
  if (el.type === "pageNumber") {
    return formatPageNumberDisplay(el.pageNumberMode, 1, PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK);
  }
  if (el.type === "date") return formatLayoutDate(new Date(), el.dateFormat || "yyyy-MM-dd");
  return el.text;
}
