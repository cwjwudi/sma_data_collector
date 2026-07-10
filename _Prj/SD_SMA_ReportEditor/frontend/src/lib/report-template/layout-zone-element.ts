/** 页眉/页脚区可视化控件 */

import {
  clampTableRowHeightPx,
  distributeTableColumnInnerWidthsPx,
  hydratePersistedTableColWidthsPx,
  REPORT_ZONE_TABLE_NODE_PADDING_PX,
  TABLE_ROW_HEIGHT_DEFAULT_PX,
  TEMPLATE_TABLE_MAX_COLS,
  TEMPLATE_TABLE_MAX_ROWS,
  uniformTableCellBoxPx,
} from "@/lib/report-template/table-cell-metrics";

import type { TableSqlFillConfig, TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";
import {
  hydrateScalarSqlVisual,
  normalizeScalarSqlFillMode,
  type ScalarSqlFillMode,
  type ScalarSqlVisualConfig,
} from "@/lib/report-template/scalar-sql-visual";
import {
  clampSqlFillParamColumnRefs,
  defaultTableSqlFillConfig,
  ensureTableSqlResultColumnNames,
  ensureTwoTableSqlParamSlots,
  ensureVisualOutputColumnSlots,
  hydrateSqlParamBindings,
  hydrateTableSqlFill,
} from "@/lib/report-template/table-sql-fill";

export type LayoutZoneKind = "header" | "footer";

export type LayoutControlType =
  | "text"
  | "box"
  | "image"
  | "pageNumber"
  | "date"
  | "table"
  | "parameter";

/** 与模版正文控件一致的绑定枚举（版式区 / 页眉页脚） */
export type ZoneBindingKind = "none" | "opcua" | "sql";

/** 版式区内表格单元格（结构与 TemplateTableCell 一致） */
export interface LayoutZoneTableCell {
  text: string;
  bindingKind: ZoneBindingKind;
  opcuaNodeId: string;
  sqlText: string;
  sqlParams: TableSqlParamBinding[];
  /** 单元格标量 SQL：手写 / 点选生成（与数据参数控件一致） */
  scalarSqlFillMode?: ScalarSqlFillMode;
  scalarSqlVisual?: ScalarSqlVisualConfig | null;
  /** 单元格填充色；transparent 或未设则继承列/表格默认 */
  bgColor?: string;
}

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
  /** 数据参数（parameter）或预留；其它类型多为 none */
  bindingKind: ZoneBindingKind;
  opcuaNodeId: string;
  sqlText: string;
  sqlParams: TableSqlParamBinding[];
  scalarSqlFillMode?: ScalarSqlFillMode;
  scalarSqlVisual?: ScalarSqlVisualConfig | null;
  /** 仅 type==="table" 时使用 */
  tableRows?: number;
  tableCols?: number;
  /** 表格行高（px），仅 type===table */
  tableRowHeightPx?: number;
  /** 表格列宽权重（长度与 tableCols 一致），语义与正文表格 TemplateElement.tableColWidthsPx 相同 */
  tableColWidthsPx?: number[];
  /** 表格各列填充色（长度与 tableCols 一致）；transparent 表示继承表格默认底色 */
  tableColBgColors?: string[];
  tableCells?: LayoutZoneTableCell[][];
  /** schema≥4：版式区内表格整表 SQL 动态填充（语义与正文 tableSqlFill 相同） */
  tableSqlFill?: TableSqlFillConfig;
}

export function normalizeZIndex(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.round(n)));
}

/** 与 layout-zone-render、版式画布 nodeStyle 一致：控件填充（含文本背后的底色） */
export function zoneFillBackgroundCss(bgColor: unknown): string {
  const v = typeof bgColor === "string" ? bgColor.trim() : "";
  if (v === "" || v === "transparent") return "transparent";
  return v;
}

/** 表格默认内侧背景（bgColor 为 transparent 时） */
export const ZONE_TABLE_DEFAULT_INNER_BG = "rgb(255 255 255 / 0.96)";

/** 表格单元格区域背景：填充色作用于表格内侧，transparent 时使用默认近白 */
export function zoneTableInnerBackgroundCss(bgColor: unknown): string {
  const v = zoneFillBackgroundCss(bgColor);
  if (v === "transparent") return ZONE_TABLE_DEFAULT_INNER_BG;
  return v;
}

export interface TableFillResolveContext {
  tableBgColor: unknown;
  tableColBgColors?: string[];
}

/** 单元格 > 列 > 表格默认；transparent 或未设则向下一级继承 */
export function resolveTableCellBackgroundCss(
  ctx: TableFillResolveContext,
  colIndex: number,
  cell: { bgColor?: string } | undefined,
): string {
  const cellRaw = cell?.bgColor;
  if (typeof cellRaw === "string" && cellRaw.trim() !== "" && cellRaw !== "transparent") {
    return zoneFillBackgroundCss(cellRaw);
  }
  const colRaw = ctx.tableColBgColors?.[colIndex];
  if (typeof colRaw === "string" && colRaw.trim() !== "" && colRaw !== "transparent") {
    return zoneFillBackgroundCss(colRaw);
  }
  return zoneTableInnerBackgroundCss(ctx.tableBgColor);
}

export function hydrateTableColBgColors(raw: unknown, cols: number): string[] {
  const arr = Array.isArray(raw)
    ? raw.map((v) => (typeof v === "string" ? v : "transparent"))
    : [];
  while (arr.length < cols) arr.push("transparent");
  arr.length = cols;
  return arr;
}

export function ensureTableColBgColors(el: {
  type?: string;
  tableCols?: number;
  tableColBgColors?: string[];
}): void {
  if (el.type !== "table") return;
  const cols = el.tableCols ?? 4;
  if (!Array.isArray(el.tableColBgColors)) {
    el.tableColBgColors = Array.from({ length: cols }, () => "transparent");
    return;
  }
  const arr = el.tableColBgColors;
  while (arr.length < cols) arr.push("transparent");
  if (arr.length > cols) arr.length = cols;
  for (let i = 0; i < cols; i++) {
    if (typeof arr[i] !== "string") arr[i] = "transparent";
  }
}

/** 表格控件外框背景：填充色不作用于 padding 环，仅表格内侧生效 */
export function zoneTableNodeShellBackgroundCss(): string {
  return "transparent";
}

export function normalizeTextAutoWrap(v: unknown, fallback: boolean): boolean {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

/** 文本 / 色块 / 日期 / 数据参数在画布与导出 DOM 上的 white-space 等（其它类型返回 null） */
export function getZoneTextWrapStyle(el: {
  type: string;
  textAutoWrap: boolean;
}): Record<string, string> | null {
  if (el.type !== "text" && el.type !== "box" && el.type !== "date" && el.type !== "parameter") return null;
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
  { value: "HH:mm:ss", label: "14:30:00（当日 · 含秒）" },
  { value: "HH:mm", label: "14:30（当日 · 时分）" },
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

function normalizeZoneBindingKind(v: unknown): ZoneBindingKind {
  if (v === "opcua" || v === "sql") return v;
  return "none";
}

function clampZoneTableDim(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(TEMPLATE_TABLE_MAX_ROWS, Math.max(1, n));
}

function clampZoneTableColDim(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(TEMPLATE_TABLE_MAX_COLS, Math.max(1, n));
}

export function defaultZoneTableCell(): LayoutZoneTableCell {
  return { text: "", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" };
}

export function hydrateZoneTableCell(raw: Partial<LayoutZoneTableCell> | undefined): LayoutZoneTableCell {
  const d = defaultZoneTableCell();
  if (!raw || typeof raw !== "object") return { ...d };
  const sqlText = typeof raw.sqlText === "string" ? raw.sqlText : d.sqlText;
  const rawMode = (raw as { scalarSqlFillMode?: unknown }).scalarSqlFillMode;
  const rawVisual = (raw as { scalarSqlVisual?: unknown }).scalarSqlVisual;
  return {
    text: typeof raw.text === "string" ? raw.text : d.text,
    bindingKind: normalizeZoneBindingKind(raw.bindingKind),
    opcuaNodeId: typeof raw.opcuaNodeId === "string" ? raw.opcuaNodeId : d.opcuaNodeId,
    sqlText,
    sqlParams: hydrateSqlParamBindings((raw as { sqlParams?: unknown }).sqlParams, 0),
    // 仅在旧数据已有配置时水合，避免为整表每格写入默认对象
    scalarSqlFillMode: rawMode != null ? normalizeScalarSqlFillMode(rawMode, sqlText) : undefined,
    scalarSqlVisual: rawVisual != null ? hydrateScalarSqlVisual(rawVisual) : undefined,
    bgColor: typeof raw.bgColor === "string" ? raw.bgColor : d.bgColor,
  };
}

/** 按 tableRows/tableCols 重塑 tableCells，就地写回（仅 type===table） */
export function ensureZoneTableGrid(el: LayoutZoneElement): LayoutZoneTableCell[][] {
  if (el.type !== "table") return [];
  const rows = clampZoneTableDim(el.tableRows, 3);
  const cols = clampZoneTableColDim(el.tableCols, 4);
  el.tableRows = rows;
  el.tableCols = cols;
  const prev = Array.isArray(el.tableCells) ? el.tableCells : [];
  if (
    prev.length === rows &&
    prev.every((row) => Array.isArray(row) && row.length === cols)
  ) {
    ensureZoneTableColWidthsPx(el);
    ensureTableColBgColors(el);
  } else {
    const grid: LayoutZoneTableCell[][] = [];
    for (let r = 0; r < rows; r++) {
      const pr = Array.isArray(prev[r]) ? prev[r] : [];
      const row: LayoutZoneTableCell[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(hydrateZoneTableCell(pr[c]));
      }
      grid.push(row);
    }
    el.tableCells = grid;
    ensureZoneTableColWidthsPx(el);
    ensureTableColBgColors(el);
  }
  if (el.tableSqlFill) {
    ensureTwoTableSqlParamSlots(el.tableSqlFill);
    ensureTableSqlResultColumnNames(el.tableSqlFill, cols);
    if (el.tableSqlFill.visualSource) ensureVisualOutputColumnSlots(el.tableSqlFill, cols);
    clampSqlFillParamColumnRefs(el.tableSqlFill, cols);
  }
  return el.tableCells as LayoutZoneTableCell[][];
}

/** 维持 zone 表格 tableColWidthsPx 与列数一致 */
export function ensureZoneTableColWidthsPx(el: LayoutZoneElement): void {
  if (el.type !== "table") return;
  const cols = el.tableCols ?? 4;
  if (!Array.isArray(el.tableColWidthsPx)) el.tableColWidthsPx = [];
  const arr = el.tableColWidthsPx;
  while (arr.length < cols) arr.push(0);
  arr.length = cols;
}

/** 版式区表格当前内侧各列像素宽 */
export function zoneTableColumnInnerWidthsPx(el: LayoutZoneElement): number[] {
  if (el.type !== "table") return [];
  ensureZoneTableGrid(el);
  ensureZoneTableColWidthsPx(el);
  const cols = el.tableCols ?? 4;
  const rows = el.tableRows ?? 3;
  const u = uniformTableCellBoxPx({
    outerW: el.w,
    outerH: el.h,
    rowCount: rows,
    colCount: cols,
    nodePadding: REPORT_ZONE_TABLE_NODE_PADDING_PX,
  });
  return distributeTableColumnInnerWidthsPx(u.innerW, cols, el.tableColWidthsPx);
}

/**
 * 版式区 / 页眉页脚表格外框的贴合高度：`.lppc-node` / `.hz-node` padding + 各行固定行高 + 表壳底 1px。
 */
export function intrinsicOuterHeightForZoneTable(el: LayoutZoneElement): number {
  if (el.type !== "table") return 20;
  ensureZoneTableGrid(el);
  const rows = el.tableRows ?? 3;
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const p = REPORT_ZONE_TABLE_NODE_PADDING_PX;
  const shellBottomPadPx = 1;
  return p.top + p.bottom + rows * rowH + shellBottomPadPx;
}

export function minOuterSizeForZoneTable(el: LayoutZoneElement): { w: number; h: number } {
  if (el.type !== "table") return { w: 20, h: 20 };
  ensureZoneTableGrid(el);
  const cols = el.tableCols ?? 4;
  const MIN_CELL_W = 26;
  const CHROME = 8;
  const ih = intrinsicOuterHeightForZoneTable(el);
  return {
    w: Math.max(64, cols * MIN_CELL_W + CHROME),
    h: Math.max(20, ih),
  };
}

export function clampZoneTableOuterSize(
  el: LayoutZoneElement,
  maxW = Number.POSITIVE_INFINITY,
  maxH = Number.POSITIVE_INFINITY,
): void {
  if (el.type !== "table") return;
  const ih = intrinsicOuterHeightForZoneTable(el);
  const capH = Math.min(ih, maxH);
  const { w: mw, h: mh } = minOuterSizeForZoneTable(el);
  const loW = Math.max(20, Math.min(mw, maxW));
  const loH = Math.max(20, Math.min(mh, maxH));
  if (el.w < loW) el.w = loW;
  if (el.h < loH) el.h = loH;
  if (el.h > capH) el.h = capH;
}

export function defaultLayoutZoneElement(type: LayoutControlType): Omit<LayoutZoneElement, "id"> {
  const axStart = { alignX: "start" as const, alignY: "center" as const };
  const axCenter = { alignX: "center" as const, alignY: "center" as const };
  const bindNone = {
    bindingKind: "none" as ZoneBindingKind,
    opcuaNodeId: "",
    sqlText: "",
    sqlParams: [],
  };
  const baseText = {
    ...bindNone,
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
  if (type === "parameter") {
    return {
      type: "parameter",
      x: 8,
      y: 8,
      w: 160,
      h: 28,
      ...baseText,
      text: "{{value}}",
      bindingKind: "opcua",
      opcuaNodeId: "",
      sqlText: "",
      ...axStart,
    };
  }
  if (type === "table") {
    const row: Omit<LayoutZoneElement, "id"> = {
      type: "table",
      x: 8,
      y: 8,
      w: 400,
      h: 200,
      ...baseText,
      text: "",
      tableRows: 3,
      tableCols: 4,
      tableRowHeightPx: TABLE_ROW_HEIGHT_DEFAULT_PX,
      tableCells: [],
      tableSqlFill: defaultTableSqlFillConfig(),
      ...axStart,
    };
    return row;
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
  const el: LayoutZoneElement = { ...b, id: newId() };
  if (type === "table") ensureZoneTableGrid(el);
  return el;
}

export function hydrateLayoutZoneElement(raw: Partial<LayoutZoneElement>): LayoutZoneElement {
  const type = normalizeControlType(raw.type);
  const d = defaultLayoutZoneElement(type);
  const merged: LayoutZoneElement = {
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
    bindingKind: normalizeZoneBindingKind(raw.bindingKind ?? d.bindingKind),
    opcuaNodeId: typeof raw.opcuaNodeId === "string" ? raw.opcuaNodeId : d.opcuaNodeId,
    sqlText: typeof raw.sqlText === "string" ? raw.sqlText : d.sqlText,
    sqlParams: hydrateSqlParamBindings((raw as { sqlParams?: unknown }).sqlParams, 0),
    scalarSqlFillMode: normalizeScalarSqlFillMode(
      (raw as { scalarSqlFillMode?: unknown }).scalarSqlFillMode,
      typeof raw.sqlText === "string" ? raw.sqlText : d.sqlText,
    ),
    scalarSqlVisual: hydrateScalarSqlVisual((raw as { scalarSqlVisual?: unknown }).scalarSqlVisual),
  };
  if (type === "table") {
    merged.tableRows = clampZoneTableDim(raw.tableRows ?? d.tableRows ?? 3, 3);
    merged.tableCols = clampZoneTableColDim(raw.tableCols ?? d.tableCols ?? 4, 4);
    merged.tableRowHeightPx = clampTableRowHeightPx(
      raw.tableRowHeightPx ?? merged.tableRowHeightPx ?? d.tableRowHeightPx,
    );
    merged.tableColWidthsPx = hydratePersistedTableColWidthsPx(
      raw.tableColWidthsPx,
      merged.tableCols ?? 4,
    );
    merged.tableColBgColors = hydrateTableColBgColors(raw.tableColBgColors, merged.tableCols ?? 4);
    merged.tableSqlFill = hydrateTableSqlFill(raw.tableSqlFill ?? merged.tableSqlFill);
    ensureZoneTableGrid(merged);
  } else {
    merged.tableRows = undefined;
    merged.tableCols = undefined;
    merged.tableRowHeightPx = undefined;
    merged.tableColWidthsPx = undefined;
    merged.tableColBgColors = undefined;
    merged.tableCells = undefined;
    merged.tableSqlFill = undefined;
  }
  return merged;
}

export function normalizeControlType(v: unknown): LayoutControlType {
  if (
    v === "box" ||
    v === "image" ||
    v === "pageNumber" ||
    v === "date" ||
    v === "table" ||
    v === "parameter"
  )
    return v;
  return "text";
}

export function clampZoneElement(el: LayoutZoneElement, zw: number, zh: number): void {
  if (el.type === "table") {
    clampZoneTableOuterSize(el, zw, zh);
    const minW = minOuterSizeForZoneTable(el).w;
    const minH = minOuterSizeForZoneTable(el).h;
    el.w = Math.max(minW, Math.min(el.w, zw));
    el.h = Math.max(minH, Math.min(el.h, zh));
  } else {
    el.w = Math.max(16, Math.min(el.w, zw));
    el.h = Math.max(16, Math.min(el.h, zh));
  }
  el.x = Math.max(0, Math.min(el.x, zw - el.w));
  el.y = Math.max(0, Math.min(el.y, zh - el.h));
}

export function previewZoneElementDisplay(
  el: LayoutZoneElement,
  pageNum = 1,
  totalPages = PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
): string {
  if (el.type === "pageNumber") {
    return formatPageNumberDisplay(el.pageNumberMode, pageNum, totalPages);
  }
  if (el.type === "date") return formatLayoutDate(new Date(), el.dateFormat || "yyyy-MM-dd");
  if (el.type === "image") {
    const cap = String(el.text || "").trim();
    if (cap) return cap.length > 24 ? `${cap.slice(0, 21)}…` : cap;
    return el.imageSrc ? "配图" : "图片";
  }
  if (el.type === "parameter") {
    const bk = el.bindingKind ?? "none";
    if (bk === "opcua") {
      const id = (el.opcuaNodeId || "").trim();
      return id ? `[参·UA] ${id.length > 36 ? `${id.slice(0, 33)}…` : id}` : "[参·UA]";
    }
    if (bk === "sql") {
      const q = (el.sqlText || "").trim();
      return q ? `[参·SQL] ${q.length > 28 ? `${q.slice(0, 25)}…` : q}` : "[参·SQL]";
    }
    const t = (el.text || "").trim();
    return t || "[参数]";
  }
  if (el.type === "table") {
    ensureZoneTableGrid(el);
    return `[表 ${el.tableRows ?? "?"}×${el.tableCols ?? "?"}]`;
  }
  return el.text;
}
