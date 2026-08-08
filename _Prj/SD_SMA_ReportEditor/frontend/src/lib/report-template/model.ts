/**
 * Schema version for persisted template JSON (API + generator).
 * Bump when incompatible field changes occur.
 */
export const TEMPLATE_SCHEMA_VERSION = 4;

/** 模版正文画布控件类型（扩展后与生成器约定见 _Doc） */
export type TemplateControlType =
  | "text"
  | "box"
  | "image"
  | "date"
  | "table"
  | "chart"
  | "parameter"
  | "signature";

export type { NullDisplayMode } from "./layout-zone-element";

/** 控件/单元格数据绑定方式 */
export type BindingKind = "none" | "opcua" | "sql" | "mongo";

/** 表格单个单元格：静态文字或按绑定拉取展示（生成器按 _Doc 解析） */
export interface TemplateTableCell {
  text: string;
  bindingKind: BindingKind;
  opcuaNodeId: string;
  /** 单元格级 SQL：预览占位或单行标量查询等，由生成器约定 */
  sqlText: string;
  sqlParams: TableSqlParamBinding[];
  /** 单元格标量 SQL：手写 / 点选生成（与数据参数控件一致） */
  scalarSqlFillMode?: ScalarSqlFillMode;
  scalarSqlVisual?: ScalarSqlVisualConfig | null;
  /** 单元格 MongoDB 查询（bindingKind === mongo） */
  mongoQuery?: MongoQueryConfig | null;
  /** 单元格填充色；transparent 或未设则继承列/表格默认 */
  bgColor?: string;
  /** REAL/浮点显示小数位数；未设则保持原样 */
  decimalPlaces?: number;
}

import type { LayoutSnapshot } from "./layout-model";
import { defaultBlankLayoutSnapshot, hydrateLayoutSnapshot } from "./layout-model";
import type { PaperKind } from "./paper";
import type { LayoutAlignAxis, ImageCaptionPosition, NullDisplayMode } from "./layout-zone-element";
import type { TableSqlFillConfig, TableSqlParamBinding } from "./table-sql-fill";
import {
  hydrateScalarSqlVisual,
  normalizeScalarSqlFillMode,
  type ScalarSqlFillMode,
  type ScalarSqlVisualConfig,
} from "./scalar-sql-visual";
import {
  hydrateLayoutZoneElement,
  normalizeAlignAxis,
  normalizeImageCaptionPosition,
  normalizeImageRotationDeg,
  normalizeTextAutoWrap,
  normalizeShowBorder,
  normalizeZIndex,
  hydrateTableColBgColors,
  normalizeNullDisplayMode,
  normalizeDecimalPlaces,
  type LayoutZoneElement,
} from "./layout-zone-element";
import {
  clampTableColsDim,
  clampTableRowsDim,
  ensureTableColWidthsPxCore,
  ensureTableGridCore,
  tableColumnInnerWidthsPxReadonly,
  tableVerticalChromePxFor,
} from "./table-grid-core";
import {
  clampTableRowHeightPx,
  computeContentAwareTableRowHeightsPx,
  hydratePersistedTableColWidthsPx,
  REPORT_TEMPLATE_TABLE_NODE_PADDING_PX,
  sumTableRowHeightsPx,
  TABLE_ROW_HEIGHT_DEFAULT_PX,
  TABLE_ROW_HEIGHT_MIN_PX,
} from "./table-cell-metrics";
import {
  defaultTableSqlFillConfig,
  hydrateSqlParamBindings,
  hydrateTableSqlFill,
  isVerticalSqlFill,
} from "./table-sql-fill";
import { syncTableRowsForVerticalSqlSlots } from "./table-sql-visual-compile";
import { hydrateMongoQueryOptional, type MongoQueryConfig } from "./mongo-query";

/** 电子签名阅览：水印描摹 / 手写图 / 二者叠加 */
export type SignatureDisplayMode = "watermark" | "handwriting" | "both";

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
  /** 字体族，如 "Microsoft YaHei"；空字符串则跟随画布默认 */
  fontFamily: string;
  /** 同页叠放顺序，越大越靠前（与版式编辑器一致） */
  zIndex: number;
  /** 文本/色块/日期：在框宽内自动换行 */
  textAutoWrap: boolean;
  /**
   * 预览与导出是否绘制控件外框（编辑选中描边不受影响）。
   * 新建默认 false（表格除外仍为 true）；JSON 缺字段加载时按 true 兼容旧稿。
   */
  showBorder: boolean;
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
  sqlParams: TableSqlParamBinding[];
  /** 数据参数 SQL：手写 / 点选生成 */
  scalarSqlFillMode?: ScalarSqlFillMode;
  scalarSqlVisual?: ScalarSqlVisualConfig | null;
  /** MongoDB 查询（bindingKind === mongo） */
  mongoQuery?: MongoQueryConfig | null;
  /** 绑定为空时：空白 / 「空值」/ 手填默认文案 */
  nullDisplayMode?: NullDisplayMode;
  /** REAL/浮点显示小数位数；未设则保持原样 */
  decimalPlaces?: number;
  /** 简易图表类型预览 */
  chartKind: "line" | "bar";
  /** 电子签名：签署人显示名 */
  signerLabel: string;
  /** 引用签名库条目 id（可与 imageSrc 手写图并存，生成器优先语义以 _Doc 为准） */
  signatureAssetId: string;
  /** 仅 type===signature：画布/预览显示水印、手写图或同时显示 */
  signatureDisplayMode?: SignatureDisplayMode;
  /** 表格：行数（≥1，仅 type===table） */
  tableRows?: number;
  /** 表格：列数（≥1，仅 type===table） */
  tableCols?: number;
  /** 表格：单元格矩阵 [行][列]（仅 type===table；持久化由 ensureTableGrid 维护形状） */
  tableCells?: TemplateTableCell[][];
  /** 表格：每行行高（px），仅 type===table；画布与导出预览按此行高渲染 */
  tableRowHeightPx?: number;
  /**
   * 表格：列宽权重（长度与 tableCols 一致），仅 type===table。
   * ≤0 与其它 ≤0 列均分剩余内侧宽度；>0 时按比例分配（画布上等比例缩放填充满内侧宽）。
   */
  tableColWidthsPx?: number[];
  /** 表格各列填充色（长度与 tableCols 一致）；transparent 表示继承表格默认底色 */
  tableColBgColors?: string[];
  /**
   * 表格整表 SQL 结果动态填充（schema≥4；仅 type===table）。
   * 导出时由生成器执行 query、扩展行数并处理跨页表头；见 _Doc。
   */
  tableSqlFill?: TableSqlFillConfig;
  /** 仅 type===date：导出时间与画布预览格式（与版式 date 控件相同占位规则） */
  dateFormat?: string;
}

/** 046：批次（按批号建子目录，现网默认）/ 非批次（写入模版指定绝对路径） */
export type ReportKind = "batch" | "nonBatch";

export function normalizeReportKind(v: unknown): ReportKind {
  return v === "nonBatch" ? "nonBatch" : "batch";
}

export interface ReportTemplate {
  schemaVersion?: number;
  id: string;
  name: string;
  updatedAt: string;
  /** 报表类型（046）：缺省视为 batch（保持现网批次语义） */
  reportKind?: ReportKind;
  /** 仅 reportKind=nonBatch：目标文件夹（本机绝对路径，如 D:\Reports\Daily） */
  nonBatchOutputDir?: string;
  /** 正文第 1 页画布（与 bodyPages[0] 同一引用；兼容 schema≤2 仅含 elements 的旧 JSON） */
  elements: TemplateElement[];
  /** schema≥3：正文分页，每项为一页独立画布（顺序即导出正文页序） */
  bodyPages?: TemplateElement[][];
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
  if (v === "opcua" || v === "sql" || v === "mongo") return v;
  return "none";
}

/** 正文/版式表格行数上限（含表头）；纵表字段槽可达 MAX_ROWS-1 */
export { TEMPLATE_TABLE_MAX_ROWS, TEMPLATE_TABLE_MAX_COLS } from "./table-cell-metrics";

export function defaultTableCell(): TemplateTableCell {
  return { text: "", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" };
}

export function hydrateTableCell(raw: Partial<TemplateTableCell> | undefined): TemplateTableCell {
  const d = defaultTableCell();
  if (!raw || typeof raw !== "object") return { ...d };
  const sqlText = typeof raw.sqlText === "string" ? raw.sqlText : d.sqlText;
  const rawMode = (raw as { scalarSqlFillMode?: unknown }).scalarSqlFillMode;
  const rawVisual = (raw as { scalarSqlVisual?: unknown }).scalarSqlVisual;
  const mongoQuery = hydrateMongoQueryOptional((raw as { mongoQuery?: unknown }).mongoQuery);
  return {
    text: typeof raw.text === "string" ? raw.text : d.text,
    bindingKind: normalizeBindingKind(raw.bindingKind),
    opcuaNodeId: typeof raw.opcuaNodeId === "string" ? raw.opcuaNodeId : d.opcuaNodeId,
    sqlText,
    sqlParams: hydrateSqlParamBindings((raw as { sqlParams?: unknown }).sqlParams, 0),
    // 仅在旧数据已有配置时水合，避免为整表每格写入默认对象
    scalarSqlFillMode: rawMode != null ? normalizeScalarSqlFillMode(rawMode, sqlText) : undefined,
    scalarSqlVisual: rawVisual != null ? hydrateScalarSqlVisual(rawVisual) : undefined,
    mongoQuery,
    bgColor: typeof raw.bgColor === "string" ? raw.bgColor : d.bgColor,
    decimalPlaces: normalizeDecimalPlaces((raw as { decimalPlaces?: unknown }).decimalPlaces),
  };
}

/** 按 tableRows/tableCols 重塑 tableCells，就地写回 el（委托共享核心） */
export function ensureTableGrid(el: TemplateElement): TemplateTableCell[][] {
  return ensureTableGridCore<TemplateTableCell>(el, hydrateTableCell);
}

/** 维持 tableColWidthsPx 与 tableCols 同长度；新增列默认权重 0（表示均分） */
export function ensureTableColWidthsPx(el: TemplateElement): void {
  ensureTableColWidthsPxCore(el);
}

/** 正文表格当前内侧各列像素宽（与画布 colgroup 一致）；只读，不写回 el */
export function templateTableColumnInnerWidthsPx(el: TemplateElement): number[] {
  return tableColumnInnerWidthsPxReadonly(el, REPORT_TEMPLATE_TABLE_NODE_PADDING_PX);
}

/** 正文表格外框纵向 chrome（节点 padding + 表壳底 1px，与 `.cv-table-shell` 一致） */
export function templateTableVerticalChromePx(): number {
  return tableVerticalChromePxFor(REPORT_TEMPLATE_TABLE_NODE_PADDING_PX);
}

/**
 * 正文画布表格外框贴合高度：chrome + 各行内容换行感知高度（下限为 tableRowHeightPx）。
 * 可选 cellTextAt 注入绑定预览实值；缺省用网格配置文案（含 OPC/SQL 标签）。
 */
export function intrinsicOuterHeightForTemplateTable(
  el: TemplateElement,
  cellTextAt?: (ri: number, ci: number) => string,
): number {
  if (el.type !== "table") return 20;
  // 只读：不 ensure、不写回 el（渲染/computed 安全）；用钳制值取代 ensure 归一
  const rows = clampTableRowsDim(el.tableRows, 3);
  const minH = clampTableRowHeightPx(el.tableRowHeightPx);
  let colWidths: number[] = [];
  try {
    colWidths = templateTableColumnInnerWidthsPx(el);
  } catch {
    colWidths = [];
  }
  if (!colWidths.length) {
    const cols = el.tableCols ?? 4;
    const inner = Math.max(40, (el.w || 200) - 8);
    colWidths = Array.from({ length: cols }, () => Math.floor(inner / cols));
  }
  const grid = el.tableCells || [];
  const heights = computeContentAwareTableRowHeightsPx({
    rowCount: rows,
    colWidthsPx: colWidths,
    fontSizePx: Math.max(10, (el.fontSize || 12) * 0.85),
    minRowHeightPx: minH,
    lineHeight: 1.3,
    paddingX: 10,
    paddingY: 6,
    cellTextAt: (ri, ci) => {
      if (cellTextAt) return cellTextAt(ri, ci);
      const cell = grid[ri]?.[ci];
      if (!cell) return "";
      // 绑定格无注入实值时不按 NodeId/SQL 估高，避免编辑态跟绑定语句换行
      if (cell.bindingKind === "opcua" || cell.bindingKind === "sql" || cell.bindingKind === "mongo") {
        return "";
      }
      return (cell.text || "").trim();
    },
  });
  return templateTableVerticalChromePx() + sumTableRowHeightsPx(heights, minH, rows);
}

/** @deprecated 纵向拖外框已禁用；保留供测试兼容。只读，不写回 el */
export function minOuterHeightForTemplateTableResizePx(el: TemplateElement): number {
  if (el.type !== "table") return 20;
  const rows = clampTableRowsDim(el.tableRows, 3);
  return Math.max(20, templateTableVerticalChromePx() + rows * TABLE_ROW_HEIGHT_MIN_PX);
}

/**
 * @deprecated 表格不再通过纵向拖外框反推行高；请改 tableRowHeightPx 后 clamp。
 */
export function applyTemplateTableOuterHeight(
  el: TemplateElement,
  outerH: number,
  maxH = Number.POSITIVE_INFINITY,
): void {
  if (el.type !== "table") return;
  ensureTableGrid(el);
  const rows = Math.max(1, el.tableRows ?? 3);
  const chrome = templateTableVerticalChromePx();
  const capped = Math.max(chrome + rows * TABLE_ROW_HEIGHT_MIN_PX, Math.min(Number(outerH) || 0, maxH));
  const rowH = clampTableRowHeightPx((capped - chrome) / rows);
  el.tableRowHeightPx = rowH;
  el.h = intrinsicOuterHeightForTemplateTable(el);
}

/**
 * SQL 整表填充：编辑器外框最小高度。
 * - 纵表：贴合「表头 + 全部字段槽/逻辑行」，配置字段后画布完整显示
 * - 横表：允许矮于全部数据行（按 el.h 裁剪预览），最小保留表头 + 一行内容区
 */
export function minOuterHeightSqlFillTableEditorPx(el: TemplateElement): number {
  if (el.type !== "table") return 20;
  if (el.tableSqlFill && isVerticalSqlFill(el.tableSqlFill)) {
    return Math.max(20, intrinsicOuterHeightForTemplateTable(el));
  }
  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  const p = REPORT_TEMPLATE_TABLE_NODE_PADDING_PX;
  const shellBottomPadPx = 1;
  const chrome = p.top + p.bottom + shellBottomPadPx;
  return Math.max(20, chrome + 2 * rowH);
}

/** 表格控件外框在画布上的最小宽高（像素），随行列数增长，避免缩太小无法点格子 */
export function minOuterSizeForTable(
  el: TemplateElement,
  cellTextAt?: (ri: number, ci: number) => string,
): { w: number; h: number } {
  if (el.type !== "table") return { w: 20, h: 20 };
  // 只读：不 ensure、不写回 el
  const cols = clampTableColsDim(el.tableCols, 4);
  const MIN_CELL_W = 26;
  const CHROME = 8;
  const ih = intrinsicOuterHeightForTemplateTable(el, cellTextAt);
  if (el.tableSqlFill?.enabled) {
    return {
      w: Math.max(64, cols * MIN_CELL_W + CHROME),
      h: Math.max(20, minOuterHeightSqlFillTableEditorPx(el)),
    };
  }
  return {
    w: Math.max(64, cols * MIN_CELL_W + CHROME),
    h: Math.max(20, ih),
  };
}

/**
 * 保证表格宽度不小于最小列宽推算值；
 * 静态表/纵表高度贴合「内容换行行高之和」（编辑态可被 maxH 限制画布壳，导出另走跨页）。
 * `cellTextAt` 应注入绑定预览实值，避免按 NodeId 估高。
 */
export function clampTableElementOuterSize(
  el: TemplateElement,
  maxW = Number.POSITIVE_INFINITY,
  maxH = Number.POSITIVE_INFINITY,
  cellTextAt?: (ri: number, ci: number) => string,
): void {
  if (el.type !== "table") return;
  const { w: mw } = minOuterSizeForTable(el, cellTextAt);
  const loW = Math.max(20, Math.min(mw, maxW));
  if (el.w < loW) el.w = loW;

  if (el.tableSqlFill?.enabled) {
    if (isVerticalSqlFill(el.tableSqlFill)) {
      syncTableRowsForVerticalSqlSlots(el, () => ensureTableGrid(el));
      const ih = intrinsicOuterHeightForTemplateTable(el, cellTextAt);
      const nextH = Math.max(20, Math.min(ih, maxH));
      el.h = nextH;
      return;
    }
    // 横表 SQL：外框为可视窗口；至少表头+1 行，允许矮于全部数据行（导出跨页）
    const loH = Math.max(20, Math.min(minOuterHeightSqlFillTableEditorPx(el), maxH));
    if (el.h < loH) el.h = loH;
    if (el.h > maxH) el.h = maxH;
    return;
  }

  // 静态表：贴合内容换行行高；maxH 仅限制编辑画布壳
  const ih = intrinsicOuterHeightForTemplateTable(el, cellTextAt);
  const nextH = Math.max(20, Math.min(ih, maxH));
  el.h = nextH;
}

function normalizeChartKind(v: unknown): "line" | "bar" {
  return v === "bar" ? "bar" : "line";
}

export function normalizeSignatureDisplayMode(v: unknown): SignatureDisplayMode {
  if (v === "watermark" || v === "handwriting") return v;
  return "both";
}

/** 按阅览模式判断是否显示签署说明水印（不校验控件类型） */
export function signatureDisplayModeShowsWatermark(mode: unknown): boolean {
  const m = normalizeSignatureDisplayMode(mode);
  return m === "watermark" || m === "both";
}

/** 按阅览模式判断是否显示手写图（不校验控件类型） */
export function signatureDisplayModeShowsHandwriting(mode: unknown): boolean {
  const m = normalizeSignatureDisplayMode(mode);
  return m === "handwriting" || m === "both";
}

/** 签名控件是否显示浅色水印文案 */
export function signatureShowsWatermark(el: TemplateElement): boolean {
  if (el.type !== "signature") return false;
  return signatureDisplayModeShowsWatermark(el.signatureDisplayMode);
}

/** 签名控件是否显示手写图（imageSrc） */
export function signatureShowsHandwriting(el: TemplateElement): boolean {
  if (el.type !== "signature") return false;
  return signatureDisplayModeShowsHandwriting(el.signatureDisplayMode);
}

/** 水印用文案（签署说明） */
export function signatureWatermarkText(el: TemplateElement): string {
  if (el.type !== "signature") return "";
  return (el.signerLabel || "").trim() || "签字";
}

function normalizeTemplateControlType(v: unknown): TemplateControlType {
  if (
    v === "box" ||
    v === "image" ||
    v === "date" ||
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
    fontFamily: "",
    zIndex: 0,
    textAutoWrap: false,
    showBorder: false,
    imageSrc: "",
    alignX: "start" as LayoutAlignAxis,
    alignY: "center" as LayoutAlignAxis,
    imageRotationDeg: 0,
    imageCaptionPosition: "none" as ImageCaptionPosition,
    bindingKind: "none" as BindingKind,
    opcuaNodeId: "",
    sqlText: "",
    sqlParams: [],
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
      textAutoWrap: true,
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
  if (type === "date") {
    return {
      type: "date",
      x: 40,
      y: 40,
      w: 140,
      h: 36,
      text: "",
      dateFormat: "HH:mm:ss",
      ...base,
    };
  }
  if (type === "table") {
    const te: TemplateElement = {
      type: "table",
      x: 40,
      y: 80,
      w: 400,
      h: 200,
      text: "",
      sqlText: "",
      ...base,
      /** 表格不参与「默认隐藏外框」；保持显示以不动网格语义 */
      showBorder: true,
      /** 与历史画布单元格居中一致；属性面板「水平/垂直位置」可改 */
      alignX: "center",
      alignY: "center",
      tableRows: 3,
      tableCols: 4,
      tableCells: [],
      tableRowHeightPx: TABLE_ROW_HEIGHT_DEFAULT_PX,
      tableSqlFill: defaultTableSqlFillConfig(),
    };
    ensureTableGrid(te);
    return te;
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
      text: "",
      ...base,
      /** 与历史预览迷你页默认居中一致；属性面板可改左/右 */
      alignX: "center",
      /** 数据参数以 OPC UA 为主路径，与表格单元格绑定一致 */
      bindingKind: "opcua",
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
    signatureDisplayMode: "both",
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
  const merged: TemplateElement = {
    ...d,
    ...raw,
    id,
    type,
    bindingKind: normalizeBindingKind(raw.bindingKind),
    opcuaNodeId: typeof raw.opcuaNodeId === "string" ? raw.opcuaNodeId : d.opcuaNodeId,
    sqlText: typeof raw.sqlText === "string" ? raw.sqlText : d.sqlText,
    sqlParams: hydrateSqlParamBindings((raw as { sqlParams?: unknown }).sqlParams, 0),
    scalarSqlFillMode: normalizeScalarSqlFillMode(
      (raw as { scalarSqlFillMode?: unknown }).scalarSqlFillMode,
      typeof raw.sqlText === "string" ? raw.sqlText : d.sqlText,
    ),
    scalarSqlVisual: hydrateScalarSqlVisual((raw as { scalarSqlVisual?: unknown }).scalarSqlVisual),
    mongoQuery: hydrateMongoQueryOptional((raw as { mongoQuery?: unknown }).mongoQuery),
    nullDisplayMode:
      type === "parameter"
        ? normalizeNullDisplayMode((raw as { nullDisplayMode?: unknown }).nullDisplayMode)
        : undefined,
    decimalPlaces:
      type === "parameter"
        ? normalizeDecimalPlaces((raw as { decimalPlaces?: unknown }).decimalPlaces)
        : undefined,
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
    fontFamily:
      typeof raw.fontFamily === "string" ? raw.fontFamily.trim().slice(0, 240) : d.fontFamily,
    zIndex: normalizeZIndex(raw.zIndex ?? d.zIndex),
    textAutoWrap: normalizeTextAutoWrap(raw.textAutoWrap, d.textAutoWrap),
    // 缺字段固定兼容为 true，勿用新建默认 false 作 fallback
    showBorder: normalizeShowBorder(raw.showBorder, true),
  };
  if (type === "table") {
    const missingCells = raw.tableCells == null || !Array.isArray(raw.tableCells);
    if (missingCells && merged.sqlText.trim()) {
      merged.tableRows = 1;
      merged.tableCols = 1;
      const bk = merged.bindingKind === "opcua" ? "opcua" : "sql";
      merged.tableCells = [
        [
          hydrateTableCell({
            bindingKind: bk,
            opcuaNodeId: bk === "opcua" ? merged.opcuaNodeId : "",
            sqlText: bk === "sql" ? merged.sqlText : "",
          }),
        ],
      ];
    } else {
      merged.tableRows = clampTableRowsDim(raw.tableRows ?? merged.tableRows, 3);
      merged.tableCols = clampTableColsDim(raw.tableCols ?? merged.tableCols, 4);
    }
    merged.tableRowHeightPx = clampTableRowHeightPx(
      raw.tableRowHeightPx ?? merged.tableRowHeightPx ?? d.tableRowHeightPx,
    );
    merged.tableColWidthsPx = hydratePersistedTableColWidthsPx(
      raw.tableColWidthsPx,
      merged.tableCols ?? 4,
    );
    merged.tableColBgColors = hydrateTableColBgColors(raw.tableColBgColors, merged.tableCols ?? 4);
    merged.tableSqlFill = hydrateTableSqlFill(raw.tableSqlFill ?? merged.tableSqlFill);
    ensureTableGrid(merged);
    // 打开/迁移时收齐纵表物理行数与外框高度（避免旧 tableRows 撑出空白底）
    syncTableRowsForVerticalSqlSlots(merged, () => ensureTableGrid(merged));
  } else {
    delete merged.tableRowHeightPx;
    delete merged.tableColWidthsPx;
    delete merged.tableColBgColors;
    delete merged.tableSqlFill;
  }
  if (type === "date") {
    merged.dateFormat =
      typeof raw.dateFormat === "string" && raw.dateFormat.trim()
        ? raw.dateFormat.trim()
        : typeof merged.dateFormat === "string" && merged.dateFormat.trim()
          ? merged.dateFormat.trim()
          : "HH:mm:ss";
  } else {
    delete merged.dateFormat;
  }
  if (type !== "parameter") {
    delete merged.nullDisplayMode;
    delete merged.decimalPlaces;
  }
  if (type === "signature") {
    merged.signatureDisplayMode = normalizeSignatureDisplayMode(
      raw.signatureDisplayMode ?? merged.signatureDisplayMode,
    );
  } else {
    delete merged.signatureDisplayMode;
  }
  return merged;
}

/** 保证正文分页数组存在且至少一页；并维持 elements 与 bodyPages[0] 引用一致 */
export function ensureBodyPages(t: ReportTemplate): TemplateElement[][] {
  if (!Array.isArray(t.bodyPages)) {
    t.bodyPages = [];
  }
  if (t.bodyPages.length === 0) {
    const legacy = Array.isArray(t.elements) ? t.elements : [];
    t.bodyPages = [legacy];
  }
  syncLegacyElementsAlias(t);
  return t.bodyPages;
}

/** elements 始终指向正文第一页（供旧逻辑与生成器兼容字段对齐） */
export function syncLegacyElementsAlias(t: ReportTemplate): void {
  const pages = t.bodyPages;
  if (!pages || pages.length === 0) {
    t.bodyPages = [[]];
    t.elements = t.bodyPages[0];
    return;
  }
  t.elements = pages[0];
}

export function createTemplate(opts: NewTemplateOptions): ReportTemplate {
  const now = new Date().toISOString();
  const page0: TemplateElement[] = [];
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: newId(),
    name: opts.name.trim() || "未命名模版",
    updatedAt: now,
    reportKind: "batch",
    nonBatchOutputDir: "",
    elements: page0,
    bodyPages: [page0],
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

function normalizeBodyPagesRaw(raw: unknown, legacyPage: TemplateElement[]): TemplateElement[][] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [legacyPage];
  }
  const out: TemplateElement[][] = [];
  for (const row of raw) {
    if (Array.isArray(row)) {
      out.push(normalizeTplBodyElements(row));
    }
  }
  return out.length > 0 ? out : [legacyPage];
}

export function migrateReportTemplate(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const paperKind: PaperKind =
    o.paperKind === "A3" || o.paperKind === "A4" || o.paperKind === "A5" || o.paperKind === "Letter"
      ? o.paperKind
      : "A4";
  const orientation = o.orientation === "landscape" ? "landscape" : "portrait";
  const layoutSnapshot = hydrateLayoutSnapshot(
    o.layoutSnapshot && typeof o.layoutSnapshot === "object"
      ? (o.layoutSnapshot as Partial<LayoutSnapshot>)
      : null,
  );
  const covSnap = hydrateLayoutSnapshot(
    o.coverLayoutSnapshot && typeof o.coverLayoutSnapshot === "object"
      ? (o.coverLayoutSnapshot as Partial<LayoutSnapshot>)
      : null,
  );
  const backSnap = hydrateLayoutSnapshot(
    o.backLayoutSnapshot && typeof o.backLayoutSnapshot === "object"
      ? (o.backLayoutSnapshot as Partial<LayoutSnapshot>)
      : null,
  );

  const legacyElements = normalizeTplBodyElements(o.elements);
  const bodyPages = normalizeBodyPagesRaw(o.bodyPages, legacyElements);

  return {
    ...o,
    schemaVersion: typeof o.schemaVersion === "number" ? o.schemaVersion : 1,
    reportKind: normalizeReportKind(o.reportKind),
    nonBatchOutputDir: typeof o.nonBatchOutputDir === "string" ? o.nonBatchOutputDir : "",
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
    bodyPages,
    elements: bodyPages[0],
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
  if (!Array.isArray(o.bodyPages) || o.bodyPages.length < 1) return false;
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

/** 深拷贝整份模版并分配新 id、名称与更新时间（模版管理「复制」）。 */
export function duplicateReportTemplate(source: ReportTemplate, newName: string): ReportTemplate {
  const raw = JSON.parse(JSON.stringify(source)) as unknown;
  const migrated = migrateReportTemplate(raw) as ReportTemplate;
  migrated.id = newId();
  migrated.name = newName.trim() || `${source.name}（副本）`;
  migrated.updatedAt = new Date().toISOString();
  syncLegacyElementsAlias(migrated);
  if (!isReportTemplate(migrated)) {
    throw new Error("模版复制后校验失败");
  }
  return migrated;
}
