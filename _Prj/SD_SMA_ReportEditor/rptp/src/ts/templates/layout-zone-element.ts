/** 页眉/页脚区可视化控件 */

export type LayoutZoneKind = "header" | "footer";

export type LayoutControlType = "text" | "box" | "image" | "pageNumber" | "date";

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
  /** type date：占位格式，导出时用真实日期按此格式化 */
  dateFormat: string;
  /** type image：支持 URL、data URL */
  imageSrc: string;
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
  const baseText = {
    text: type === "text" ? "文本" : "",
    color: "#18181b",
    bgColor: type === "box" ? "#e4e4e7" : "transparent",
    fontSize: 13,
    dateFormat: "yyyy-MM-dd HH:mm",
    imageSrc: "",
  };
  if (type === "text") {
    return { type: "text", x: 8, y: 8, w: 160, h: 28, ...baseText };
  }
  if (type === "box") {
    return { type: "box", x: 8, y: 8, w: 100, h: 36, ...baseText };
  }
  if (type === "image") {
    return { type: "image", x: 8, y: 8, w: 64, h: 64, ...baseText, text: "" };
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
    dateFormat: typeof raw.dateFormat === "string" ? raw.dateFormat : d.dateFormat,
    imageSrc: typeof raw.imageSrc === "string" ? raw.imageSrc : d.imageSrc,
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
  if (el.type === "pageNumber") return "{page}";
  if (el.type === "date") return formatLayoutDate(new Date(), el.dateFormat || "yyyy-MM-dd");
  return el.text;
}
