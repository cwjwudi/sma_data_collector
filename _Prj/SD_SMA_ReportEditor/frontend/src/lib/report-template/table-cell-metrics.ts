/**
 * 画布表格：控件节点有 padding，表格在内侧均分行列（table-layout: fixed）。
 * 用于属性面板展示「每个单元格大约多宽/多高」，便于多套表格对齐。
 */

/** 画布表格默认行高（px）；可在属性面板修改 */
export const TABLE_ROW_HEIGHT_DEFAULT_PX = 28;
export const TABLE_ROW_HEIGHT_MIN_PX = 16;
export const TABLE_ROW_HEIGHT_MAX_PX = 120;
/**
 * 编辑画布：内容换行后单行允许的最大高度（px）。
 * A4 纵向 ≈ 297mm×96/25.4 ≈ 1123px。导出预览分页另走行内跨页断行（见 splitLogicalRowByAvailPx）。
 */
export const TABLE_CONTENT_ROW_HEIGHT_MAX_PX = 1123;

/** 分页估高：不封顶（单 fragment 高度由页可用高约束） */
export const TABLE_CONTENT_ROW_HEIGHT_UNCAPPED_PX = Number.MAX_SAFE_INTEGER;

/** 正文/版式表格行数上限（含表头）；纵表字段槽可达 MAX_ROWS-1 */
export const TEMPLATE_TABLE_MAX_ROWS = 100;
/** 表格列数上限（横表）；纵表固定 2 列 */
export const TEMPLATE_TABLE_MAX_COLS = 30;

/** 列宽权重下限（px）；参与比例换算时保证单列不小于该值，并与 minOuterSizeForTable 的单元格最小宽约一致 */
export const TABLE_COL_WIDTH_MIN_PX = 26;

export function clampTableRowHeightPx(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return TABLE_ROW_HEIGHT_DEFAULT_PX;
  return Math.min(TABLE_ROW_HEIGHT_MAX_PX, Math.max(TABLE_ROW_HEIGHT_MIN_PX, n));
}

export type VisualLineWrap = {
  /** 各视觉行字符（软折行已切开） */
  lines: string[];
  /** lines[i] 是否紧跟硬换行（段落边界）；lines[0] 恒为 false */
  hardBreakBefore: boolean[];
};

function charWidthPx(ch: string, fontSize: number): number {
  if (/[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch)) return fontSize;
  if (ch === "\t") return fontSize * 2;
  return fontSize * 0.55;
}

/** 与 estimateWrappedTextHeightPx 同源的折行模型 */
export function wrapTextToVisualLines(opts: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  paddingX?: number;
}): VisualLineWrap {
  const fontSize = Math.max(6, Number(opts.fontSizePx) || 12);
  const padX = Number.isFinite(Number(opts.paddingX)) ? Number(opts.paddingX) : 10;
  const availW = Math.max(8, Number(opts.widthPx) - padX);
  const raw = String(opts.text ?? "");
  if (!raw.replace(/\u00a0/g, " ").trim()) {
    return { lines: [], hardBreakBefore: [] };
  }
  const paragraphs = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  const hardBreakBefore: boolean[] = [];
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const p = paragraphs[pi];
    const hard = pi > 0;
    if (!p) {
      lines.push("");
      hardBreakBefore.push(hard);
      continue;
    }
    let w = 0;
    let buf = "";
    let firstInPara = true;
    for (const ch of p) {
      const cw = charWidthPx(ch, fontSize);
      if (w + cw > availW && w > 0) {
        lines.push(buf);
        hardBreakBefore.push(firstInPara ? hard : false);
        firstInPara = false;
        buf = ch;
        w = cw;
      } else {
        buf += ch;
        w += cw;
      }
    }
    lines.push(buf);
    hardBreakBefore.push(firstInPara ? hard : false);
  }
  return { lines, hardBreakBefore };
}

/** 拼接视觉行切片；软折行处无分隔符，硬换行处插入 \\n */
export function joinVisualLinesSlice(
  wrap: VisualLineWrap,
  lineStart: number,
  lineEnd: number,
): string {
  const start = Math.max(0, Math.floor(lineStart));
  const end = Math.min(wrap.lines.length, Math.floor(lineEnd));
  if (end <= start) return "";
  let out = "";
  for (let i = start; i < end; i++) {
    if (i > start && wrap.hardBreakBefore[i]) out += "\n";
    out += wrap.lines[i];
  }
  return out;
}

export function heightForVisualLineCount(opts: {
  lineCount: number;
  fontSizePx: number;
  lineHeight?: number;
  paddingY?: number;
  minHeightPx: number;
  maxHeightPx?: number;
}): number {
  const minH = Math.max(1, Math.round(Number(opts.minHeightPx) || TABLE_ROW_HEIGHT_DEFAULT_PX));
  const maxH = Math.max(
    minH,
    Math.round(Number(opts.maxHeightPx) || TABLE_CONTENT_ROW_HEIGHT_MAX_PX),
  );
  const n = Math.max(0, Math.floor(Number(opts.lineCount) || 0));
  if (n <= 0) return minH;
  const fontSize = Math.max(6, Number(opts.fontSizePx) || 12);
  const lineHeight = Number(opts.lineHeight) > 0 ? Number(opts.lineHeight) : 1.3;
  const lineH = fontSize * lineHeight;
  const padY = Number.isFinite(Number(opts.paddingY)) ? Number(opts.paddingY) : 6;
  const needed = Math.ceil(padY + n * lineH);
  return Math.min(maxH, Math.max(minH, needed));
}

/**
 * 按列宽估算单元格换行后的高度（CJK 约 1em，其它约 0.55em）。
 * 用于预览/导出：固定 `tableRowHeightPx` 作下限，内容折行时抬高该行。
 */
export function estimateWrappedTextHeightPx(opts: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  lineHeight?: number;
  paddingX?: number;
  paddingY?: number;
  minHeightPx: number;
  maxHeightPx?: number;
}): number {
  const minH = Math.max(1, Math.round(Number(opts.minHeightPx) || TABLE_ROW_HEIGHT_DEFAULT_PX));
  const raw = String(opts.text ?? "");
  if (!raw.replace(/\u00a0/g, " ").trim()) return minH;
  const { lines } = wrapTextToVisualLines({
    text: raw,
    widthPx: opts.widthPx,
    fontSizePx: opts.fontSizePx,
    paddingX: opts.paddingX,
  });
  return heightForVisualLineCount({
    lineCount: lines.length,
    fontSizePx: opts.fontSizePx,
    lineHeight: opts.lineHeight,
    paddingY: opts.paddingY,
    minHeightPx: minH,
    maxHeightPx: opts.maxHeightPx,
  });
}

/** 分页用：不封顶的内容行高估算 */
export function estimateWrappedTextHeightUncappedPx(
  opts: Omit<Parameters<typeof estimateWrappedTextHeightPx>[0], "maxHeightPx">,
): number {
  return estimateWrappedTextHeightPx({
    ...opts,
    maxHeightPx: TABLE_CONTENT_ROW_HEIGHT_UNCAPPED_PX,
  });
}

export type LogicalRowSplitFragment = {
  lineStart: number;
  lineEnd: number;
  heightPx: number;
  cellTexts: string[];
  totalLines: number;
};

/**
 * 按可用内高将一逻辑行拆成若干文本行片段（多列以最高列为准对齐切点）。
 * availInnerPx 不足以放下 1 行文本时返回 []（调用方应换页，见 R8）。
 */
export function splitLogicalRowByAvailPx(opts: {
  cellTexts: string[];
  colWidthsPx: number[];
  fontSizePx: number;
  lineHeight?: number;
  paddingX?: number;
  paddingY?: number;
  minHeightPx: number;
  availInnerPx: number;
}): LogicalRowSplitFragment[] {
  const minH = Math.max(1, Math.round(Number(opts.minHeightPx) || TABLE_ROW_HEIGHT_DEFAULT_PX));
  const avail = Math.max(0, Number(opts.availInnerPx) || 0);
  const cols = Math.max(opts.cellTexts.length, opts.colWidthsPx.length);
  const wraps: VisualLineWrap[] = [];
  let totalLines = 0;
  for (let ci = 0; ci < cols; ci++) {
    const w = wrapTextToVisualLines({
      text: opts.cellTexts[ci] ?? "",
      widthPx: opts.colWidthsPx[ci] || 40,
      fontSizePx: opts.fontSizePx,
      paddingX: opts.paddingX,
    });
    wraps.push(w);
    if (w.lines.length > totalLines) totalLines = w.lines.length;
  }
  if (totalLines <= 0) {
    if (avail < minH) return [];
    return [
      {
        lineStart: 0,
        lineEnd: 0,
        heightPx: minH,
        cellTexts: Array.from({ length: cols }, () => ""),
        totalLines: 0,
      },
    ];
  }

  const heightOf = (n: number) =>
    heightForVisualLineCount({
      lineCount: n,
      fontSizePx: opts.fontSizePx,
      lineHeight: opts.lineHeight,
      paddingY: opts.paddingY,
      minHeightPx: minH,
      maxHeightPx: TABLE_CONTENT_ROW_HEIGHT_UNCAPPED_PX,
    });

  const oneLineH = heightOf(1);
  if (avail < oneLineH) return [];

  const fragments: LogicalRowSplitFragment[] = [];
  let lineCursor = 0;
  while (lineCursor < totalLines) {
    let take = 0;
    for (let n = 1; n <= totalLines - lineCursor; n++) {
      if (heightOf(n) <= avail) take = n;
      else break;
    }
    if (take <= 0) break;
    const lineEnd = lineCursor + take;
    const cellTexts = wraps.map((w) => joinVisualLinesSlice(w, lineCursor, lineEnd));
    fragments.push({
      lineStart: lineCursor,
      lineEnd,
      heightPx: heightOf(take),
      cellTexts,
      totalLines,
    });
    lineCursor = lineEnd;
  }
  return fragments;
}

/** 从 lineStart 起，在 availInnerPx 内尽量多取视觉行；放不下则 null */
export function takeLogicalRowLinesForAvail(opts: {
  cellTexts: string[];
  colWidthsPx: number[];
  fontSizePx: number;
  lineHeight?: number;
  paddingX?: number;
  paddingY?: number;
  minHeightPx: number;
  availInnerPx: number;
  lineStart: number;
}): { lineEnd: number; heightPx: number; totalLines: number; cellTexts: string[] } | null {
  const minH = Math.max(1, Math.round(Number(opts.minHeightPx) || TABLE_ROW_HEIGHT_DEFAULT_PX));
  const avail = Math.max(0, Number(opts.availInnerPx) || 0);
  const lineStart = Math.max(0, Math.floor(Number(opts.lineStart) || 0));
  const cols = Math.max(opts.cellTexts.length, opts.colWidthsPx.length);
  const wraps: VisualLineWrap[] = [];
  let totalLines = 0;
  for (let ci = 0; ci < cols; ci++) {
    const w = wrapTextToVisualLines({
      text: opts.cellTexts[ci] ?? "",
      widthPx: opts.colWidthsPx[ci] || 40,
      fontSizePx: opts.fontSizePx,
      paddingX: opts.paddingX,
    });
    wraps.push(w);
    if (w.lines.length > totalLines) totalLines = w.lines.length;
  }
  if (totalLines <= 0) {
    if (avail < minH) return null;
    return {
      lineEnd: lineStart,
      heightPx: minH,
      totalLines: 0,
      cellTexts: Array.from({ length: cols }, () => ""),
    };
  }
  if (lineStart >= totalLines) return null;

  const heightOf = (n: number) =>
    heightForVisualLineCount({
      lineCount: n,
      fontSizePx: opts.fontSizePx,
      lineHeight: opts.lineHeight,
      paddingY: opts.paddingY,
      minHeightPx: minH,
      maxHeightPx: TABLE_CONTENT_ROW_HEIGHT_UNCAPPED_PX,
    });
  if (avail < heightOf(1)) return null;

  let take = 0;
  const maxTake = totalLines - lineStart;
  for (let n = 1; n <= maxTake; n++) {
    if (heightOf(n) <= avail) take = n;
    else break;
  }
  if (take <= 0) return null;
  const lineEnd = lineStart + take;
  return {
    lineEnd,
    heightPx: heightOf(take),
    totalLines,
    cellTexts: wraps.map((w) => joinVisualLinesSlice(w, lineStart, lineEnd)),
  };
}

/** 按 slice 的视觉行区间截断单元格文案（无区间则原样） */
export function applyRowTextLineSliceToCellText(
  text: string,
  opts: {
    widthPx: number;
    fontSizePx: number;
    paddingX?: number;
    rowTextLineStart?: number;
    rowTextLineEnd?: number;
  },
): string {
  const start = opts.rowTextLineStart;
  const end = opts.rowTextLineEnd;
  if (start == null && end == null) return text;
  const wrap = wrapTextToVisualLines({
    text,
    widthPx: opts.widthPx,
    fontSizePx: opts.fontSizePx,
    paddingX: opts.paddingX,
  });
  const ls = start ?? 0;
  const le = end ?? wrap.lines.length;
  return joinVisualLinesSlice(wrap, ls, le);
}

/**
 * 根据各列文本与列宽，计算每一逻辑行的高度（取该行各列估算高度的最大值）。
 */
export function computeContentAwareTableRowHeightsPx(opts: {
  rowCount: number;
  colWidthsPx: number[];
  cellTextAt: (row: number, col: number) => string;
  fontSizePx: number;
  minRowHeightPx: number;
  lineHeight?: number;
  paddingX?: number;
  paddingY?: number;
  maxRowHeightPx?: number;
}): number[] {
  const rows = Math.max(0, Math.floor(Number(opts.rowCount) || 0));
  const cols = opts.colWidthsPx.length;
  const minH = clampTableRowHeightPx(opts.minRowHeightPx);
  if (rows <= 0) return [];
  if (cols <= 0) return Array.from({ length: rows }, () => minH);
  const out: number[] = [];
  for (let ri = 0; ri < rows; ri++) {
    let h = minH;
    for (let ci = 0; ci < cols; ci++) {
      const text = opts.cellTextAt(ri, ci);
      const est = estimateWrappedTextHeightPx({
        text,
        widthPx: opts.colWidthsPx[ci] || 40,
        fontSizePx: opts.fontSizePx,
        lineHeight: opts.lineHeight,
        paddingX: opts.paddingX,
        paddingY: opts.paddingY,
        minHeightPx: minH,
        maxHeightPx: opts.maxRowHeightPx,
      });
      if (est > h) h = est;
    }
    out.push(h);
  }
  return out;
}

export function sumTableRowHeightsPx(heights: number[], fallbackRowH: number, rowCount: number): number {
  const n = Math.max(0, Math.floor(Number(rowCount) || 0));
  const fb = Math.max(1, clampTableRowHeightPx(fallbackRowH));
  if (n <= 0) return 0;
  if (!heights.length) return n * fb;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const h = heights[i];
    sum += Number.isFinite(h) && (h as number) > 0 ? Math.max(1, h as number) : fb;
  }
  return sum;
}

export const REPORT_TEMPLATE_TABLE_NODE_PADDING_PX = {
  top: 4,
  right: 4,
  bottom: 4,
  left: 4,
} as const;

/** 版式画布 / 页眉页脚弹窗 `.lppc-node` / `.hz-node`：padding: 2px 4px */
export const REPORT_ZONE_TABLE_NODE_PADDING_PX = {
  top: 2,
  right: 4,
  bottom: 2,
  left: 4,
} as const;

export type EdgePaddingPx = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export interface UniformTableCellMetric {
  innerW: number;
  innerH: number;
  cellW: number;
  cellH: number;
}

/**
 * 按外框尺寸减去节点 padding 后，将内侧矩形均分为 rows×cols（与编辑画布一致的理想几何）。
 */
export function uniformTableCellBoxPx(params: {
  outerW: number;
  outerH: number;
  rowCount: number;
  colCount: number;
  nodePadding?: EdgePaddingPx;
}): UniformTableCellMetric {
  const pad = params.nodePadding ?? REPORT_TEMPLATE_TABLE_NODE_PADDING_PX;
  const cols = Math.max(1, Math.floor(Number(params.colCount) || 1));
  const rows = Math.max(1, Math.floor(Number(params.rowCount) || 1));
  const innerW = Math.max(0, Number(params.outerW) - pad.left - pad.right);
  const innerH = Math.max(0, Number(params.outerH) - pad.top - pad.bottom);
  return {
    innerW,
    innerH,
    cellW: innerW / cols,
    cellH: innerH / rows,
  };
}

/** 属性面板展示用：保留至多一位小数，整数不写小数点 */
export function formatMetricPx(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const x = Math.round(n * 10) / 10;
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

/** 将持久化的列宽数组规范为长度 cols：非正数视为 0（表示与其它 0 权重列均分） */
export function hydratePersistedTableColWidthsPx(raw: unknown, cols: number): number[] {
  const out: number[] = [];
  const src = Array.isArray(raw) ? raw : [];
  const ncols = Math.max(1, Math.floor(Number(cols)) || 1);
  for (let i = 0; i < ncols; i++) {
    const n = Number(src[i]);
    out.push(Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  }
  return out;
}

/** 属性面板「列宽百分比」编辑下限（每列至少 1%，多列时合计 100%） */
export const TABLE_COLUMN_WIDTH_PERCENT_MIN = 1;

/** 多列时单列可输入的最大整数百分比（保证其余列各至少有 TABLE_COLUMN_WIDTH_PERCENT_MIN） */
export function maxTableColumnPercentForEdit(colCount: number): number {
  const n = Math.max(1, Math.floor(Number(colCount)) || 1);
  if (n <= 1) return 100;
  return 100 - (n - 1) * TABLE_COLUMN_WIDTH_PERCENT_MIN;
}

/**
 * 按当前内侧像素列宽换算为整数百分比（合计 100），与画布 colgroup 舍入规则一致。
 */
export function integerColumnPercentsFromInnerWidthsPx(innerWidthsPx: number[], innerW: number): number[] {
  const cols = innerWidthsPx.length;
  if (cols === 0) return [];
  const iw = Math.max(0, Math.round(Number(innerW)));
  if (iw <= 0) {
    const base = Math.floor(100 / cols);
    let rem = 100 - base * cols;
    const out = Array.from({ length: cols }, () => base);
    for (let i = 0; rem > 0; i++, rem--) out[i % cols]++;
    return out;
  }
  const floats = innerWidthsPx.map((w) => (100 * Math.max(0, Number(w))) / iw);
  const floors = floats.map((f) => Math.floor(f));
  let remainder = 100 - floors.reduce((a, b) => a + b, 0);
  const order = floats.map((f, i) => ({ i, r: f - floors[i] }));
  order.sort((a, b) => b.r - a.r);
  const out = floors.slice();
  for (let k = 0; k < remainder; k++) out[order[k % cols].i]++;
  return out;
}

/**
 * 编辑某一列的整数百分比后，按比例摊薄/补足其余列，得到合计为 100 的整数数组（其余列各 ≥ TABLE_COLUMN_WIDTH_PERCENT_MIN）。
 * 写入模型时可将返回值逐项作为列宽权重（与按比例填满内侧宽度的语义一致）。
 */
export function adjustIntegerColumnPercentsAfterEdit(
  prevPercents: number[],
  editedIndex: number,
  rawNew: unknown,
): number[] {
  const prev = prevPercents;
  const n = prev.length;
  const MIN = TABLE_COLUMN_WIDTH_PERCENT_MIN;
  if (n === 0) return [];
  if (n === 1) return [100];
  let v = Math.round(Number(rawNew));
  if (!Number.isFinite(v)) v = MIN;
  const maxForEdited = maxTableColumnPercentForEdit(n);
  v = Math.min(maxForEdited, Math.max(MIN, v));
  const i = Math.max(0, Math.min(n - 1, Math.floor(editedIndex)));
  const extra = 100 - v - (n - 1) * MIN;
  const next: number[] = Array.from({ length: n }, () => MIN);
  next[i] = v;
  if (extra <= 0) return next;

  const oldSumOthers = Math.max(0, 100 - prev[i]);
  const floats: number[] = new Array(n).fill(0);
  if (oldSumOthers <= 0) {
    const share = extra / (n - 1);
    for (let j = 0; j < n; j++) {
      if (j !== i) floats[j] = share;
    }
  } else {
    for (let j = 0; j < n; j++) {
      if (j !== i) floats[j] = (extra * prev[j]) / oldSumOthers;
    }
  }

  const add = new Array(n).fill(0);
  let floorSum = 0;
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    const f = Math.floor(floats[j]);
    add[j] = f;
    floorSum += f;
  }
  let rem = extra - floorSum;
  const order = floats
    .map((f, j) => ({ j, r: j === i ? -1 : f - add[j] }))
    .filter((x) => x.j !== i)
    .sort((a, b) => b.r - a.r);
  const oc = order.length || 1;
  for (let k = 0; k < rem; k++) add[order[k % oc].j]++;
  for (let j = 0; j < n; j++) {
    if (j !== i) next[j] = MIN + add[j];
  }
  next[i] = v;
  return next;
}

function balancedIntegerColumnWidths(colCount: number, innerW: number): number[] {
  const cols = Math.max(1, Math.floor(colCount));
  const iw = Math.max(0, Math.round(Number(innerW)));
  const base = Math.floor(iw / cols);
  let rem = iw - base * cols;
  const out = Array.from({ length: cols }, () => base);
  for (let i = 0; rem > 0; i++, rem--) out[i % cols]++;
  return out;
}

/**
 * 按内侧总宽将列宽权重换算为整数像素列宽（与 table-layout:fixed + colgroup 配合）。
 * rawWidthsPx[i]≤0 时该列使用「均分列」的理想宽度作为权重；全部≤0 时完全均分。
 */
export function distributeTableColumnInnerWidthsPx(
  innerW: number,
  colCount: number,
  rawWidthsPx?: number[] | null,
): number[] {
  const cols = Math.max(1, Math.floor(colCount));
  const iw = Math.max(0, Math.round(Number(innerW)));
  const equalWeight = iw / cols;
  if (!rawWidthsPx || rawWidthsPx.length !== cols) {
    return balancedIntegerColumnWidths(cols, iw);
  }
  const weights = rawWidthsPx.map((w) => {
    const n = Number(w);
    if (!Number.isFinite(n) || n <= 0) return equalWeight;
    return Math.max(TABLE_COL_WIDTH_MIN_PX, n);
  });
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return balancedIntegerColumnWidths(cols, iw);
  const floats = weights.map((w) => (w / sumW) * iw);
  const floors = floats.map((f) => Math.floor(f));
  let remainder = iw - floors.reduce((a, b) => a + b, 0);
  const order = floats.map((f, i) => ({ i, r: f - floors[i] }));
  order.sort((a, b) => b.r - a.r);
  for (let k = 0; k < remainder; k++) floors[order[k % cols].i]++;
  return floors;
}

/**
 * 在内侧总宽不变前提下拖动列分界线：`boundaryIndex` 为 `i` 表示在第 `i` 列与第 `i+1` 列之间，
 * `deltaPx > 0` 表示分界向右移（左列变宽、右列变窄）。返回可作为 `tableColWidthsPx` 写入的新权重数组；
 * 无法满足最小列宽时返回 `null`。
 */
export function applyTableColumnResizeDeltaPx(
  innerW: number,
  colCount: number,
  rawWidthsPx: number[] | null | undefined,
  boundaryIndex: number,
  deltaPx: number,
): number[] | null {
  const cols = Math.max(1, Math.floor(colCount));
  const i = Math.floor(boundaryIndex);
  if (i < 0 || i >= cols - 1) return null;
  const iw = Math.max(0, Math.round(Number(innerW)));
  const di = Math.round(Number(deltaPx));
  if (!Number.isFinite(di) || di === 0) return null;

  const widths = distributeTableColumnInnerWidthsPx(iw, cols, rawWidthsPx);
  const lo = TABLE_COL_WIDTH_MIN_PX;
  // 可收缩量限非负：某列已 ≤ 下限时该侧不能再压。
  // 旧写法 widths[x]-lo 允许为负 → diMin>diMax 使钳制方向反转；
  // 表格过窄致各列均 ≤ 下限时两侧可收缩量均为 0 → diClamped=0 → 返回 null（拖拽无从满足）。
  const maxLeft = Math.max(0, widths[i] - lo);
  const maxRight = Math.max(0, widths[i + 1] - lo);
  const diClamped = Math.min(maxRight, Math.max(-maxLeft, di));
  if (diClamped === 0) return null;

  const next = widths.slice();
  next[i] = widths[i] + diClamped;
  next[i + 1] = widths[i + 1] - diClamped;

  // 只四舍五入，不对全列强制下限：被拖动的两列已由上面的钳制保证 ≥ 下限，
  // 未触碰的列保持原值（避免旧写法把其它 <下限 的列静默顶到 lo、破坏总宽守恒）。
  return next.map((w) => Math.round(Number(w)));
}
