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

/** 预览占位总页数（编辑器与模版预览） */
export const PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK = 10;

export function normalizePageNumberMode(v: unknown): PageNumberDisplayMode {
  if (v === "slashTotal" || v === "cnPage" || v === "circle") return v;
  return "plain";
}

/** 导出或打印分页时应调用：根据形式输出页码字符串 */
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

/** 内容在控件框内的对齐（flex）：start=左/上，center=中，end=右/下 */
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
  /** 水平：左 / 中 / 右 */
  alignX: LayoutAlignAxis;
  /** 垂直：上 / 中 / 下 */
  alignY: LayoutAlignAxis;
  /** type date：占位格式，导出时用真实日期按此格式化 */
  dateFormat: string;
  /** type image：支持 URL、data URL */
  imageSrc: string;
  /** type pageNumber：展示形式 */
  pageNumberMode: PageNumberDisplayMode;
  /** 同区内叠放顺序，越大越靠近用户 */
  zIndex: number;
  /** 文本 / 色块 / 日期：框内自动换行 */
  textAutoWrap: boolean;
}

export function normalizeZIndex(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.round(n)));
}

export function normalizeTextAutoWrap(v: unknown, fallback: boolean): boolean {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

export function getZoneTextWrapStyle(el: LayoutZoneElement): Record<string, string> | null {
  if (el.type !== "text" && el.type !== "box" && el.type !== "date") return null;
  if (el.textAutoWrap) {
    return {
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      minWidth: "0",
    };
  }
  return {
    whiteSpace: "nowrap",
    overflowWrap: "normal",
    wordBreak: "normal",
  };
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
    zIndex: 0,
    textAutoWrap: false,
  };
  if (type === "text") {
    return { type: "text", x: 8, y: 8, w: 160, h: 28, ...baseText, ...axStart };
  }
  if (type === "box") {
    return { type: "box", x: 8, y: 8, w: 100, h: 36, ...baseText, textAutoWrap: true, ...axCenter };
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
      ...baseText,
      text: "",
      color: "#52525b",
      bgColor: "transparent",
      fontSize: 12,
      dateFormat: "",
      imageSrc: "",
      ...axCenter,
    };
  }
  return {
    type: "date",
    x: 8,
    y: 8,
    w: 180,
    h: 26,
    ...baseText,
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
    zIndex: normalizeZIndex(raw.zIndex ?? d.zIndex),
    textAutoWrap: normalizeTextAutoWrap(raw.textAutoWrap, d.textAutoWrap),
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
