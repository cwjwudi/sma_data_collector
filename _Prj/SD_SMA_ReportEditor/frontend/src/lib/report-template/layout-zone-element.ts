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

/** 配文相对主体的位置（控件框内排版） */
export type ImageCaptionPosition = "none" | "left" | "right" | "top" | "bottom";

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
  /** 字体族，如 "Microsoft YaHei"；空字符串则跟随画布默认 */
  fontFamily: string;
  alignX: LayoutAlignAxis;
  alignY: LayoutAlignAxis;
  dateFormat: string;
  imageSrc: string;
  /** 逆时针任意角度皆可；导出与画布一致 */
  imageRotationDeg: number;
  /** 配文相对图片主体的位置（需 text 非空时在框内并排/上下布局） */
  imageCaptionPosition: ImageCaptionPosition;
  pageNumberMode: PageNumberDisplayMode;
  /** 同区内叠放顺序，越大越靠近用户（覆盖下层） */
  zIndex: number;
  /** 文本/色块/日期：在框宽内自动换行（长串无空格时也会断行） */
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

/** 文本 / 色块 / 日期在画布与导出 DOM 上的 white-space 等（其它类型返回 null） */
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

export function normalizeImageCaptionPosition(v: unknown, fb: ImageCaptionPosition): ImageCaptionPosition {
  if (v === "left" || v === "right" || v === "top" || v === "bottom") return v;
  if (v === "none") return "none";
  return fb;
}

export function normalizeImageRotationDeg(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-360, Math.min(360, Math.round(n * 100) / 100));
}

/** flex 内对齐：用于图片在「绘区」内九宫格占位 */
export function flexJustifyAlignForAxes(
  ax: LayoutAlignAxis,
  ay: LayoutAlignAxis,
): { justifyContent: string; alignItems: string } {
  const justifyContent =
    ax === "center" ? "center" : ax === "end" ? "flex-end" : "flex-start";
  const alignItems = ay === "center" ? "center" : ay === "end" ? "flex-end" : "flex-start";
  return { justifyContent, alignItems };
}

/** 图文外层：列方向时主轴为竖向，不能把「横向 justify / 纵向 align」直接沿用行布局那套赋值。 */
export function flexComposeOuterRoot(
  ax: LayoutAlignAxis,
  ay: LayoutAlignAxis,
  rowLay: boolean,
): { justifyContent: string; alignItems: string } {
  const m = flexJustifyAlignForAxes(ax, ay);
  if (rowLay) return m;
  return { justifyContent: m.alignItems, alignItems: m.justifyContent };
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

/** 属性面板「日期格式」下拉选项（值与 formatLayoutDate 中 yyyy MM dd 等占位一致） */
export const DATE_FORMAT_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "yyyy-MM-dd", label: "2026-05-17（年-月-日）" },
  { value: "yyyy/MM/dd", label: "2026/05/17（斜杠）" },
  { value: "dd/MM/yyyy", label: "17/05/2026（日/月/年）" },
  { value: "MM/dd/yyyy", label: "05/17/2026（月/日/年）" },
  { value: "yyyy年MM月dd日", label: "2026年05月17日" },
  { value: "yyyy-MM-dd HH:mm", label: "年-月-日 时:分" },
  { value: "yyyy-MM-dd HH:mm:ss", label: "含秒" },
  { value: "yyyyMMdd", label: "20260517（无分隔）" },
];

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
    fontFamily: "",
    dateFormat: "yyyy-MM-dd HH:mm",
    imageSrc: "",
    imageRotationDeg: 0,
    imageCaptionPosition: "none" as ImageCaptionPosition,
    pageNumberMode: "plain" as PageNumberDisplayMode,
    zIndex: 0,
    textAutoWrap: false,
  };
  if (type === "text") {
    return { type: "text", x: 8, y: 8, w: 160, h: 28, ...baseText, ...axStart };
  }
  if (type === "box") {
    /** 色块历来默认多行配文，保持开启换行以兼容旧数据 */
    return { type: "box", x: 8, y: 8, w: 100, h: 36, ...baseText, textAutoWrap: true, ...axCenter };
  }
  if (type === "image") {
    return {
      type: "image",
      x: 8,
      y: 8,
      w: 64,
      h: 64,
      ...baseText,
      text: "",
      ...axCenter,
      imageCaptionPosition: "bottom",
      imageRotationDeg: 0,
    };
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
      fontFamily: "",
      dateFormat: "",
      imageSrc: "",
      imageRotationDeg: 0,
      imageCaptionPosition: "none",
      pageNumberMode: "plain" as PageNumberDisplayMode,
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
    fontFamily: "",
    dateFormat: "yyyy-MM-dd",
    imageSrc: "",
    imageRotationDeg: 0,
    imageCaptionPosition: "none",
    pageNumberMode: "plain" as PageNumberDisplayMode,
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
    imageRotationDeg: normalizeImageRotationDeg(raw.imageRotationDeg ?? d.imageRotationDeg),
    imageCaptionPosition: normalizeImageCaptionPosition(raw.imageCaptionPosition, d.imageCaptionPosition),
    pageNumberMode: normalizePageNumberMode(raw.pageNumberMode),
    fontFamily:
      typeof raw.fontFamily === "string" ? raw.fontFamily.trim().slice(0, 240) : d.fontFamily,
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
  if (el.type === "image") {
    const cap = String(el.text || "").trim();
    if (cap) return cap.length > 24 ? `${cap.slice(0, 21)}…` : cap;
    return el.imageSrc ? "配图" : "图片";
  }
  return el.text;
}
