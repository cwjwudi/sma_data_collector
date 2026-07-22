/**
 * 035 档 1：pdf-lib 坐标版式导出（layout-v2）。
 * 按编辑器 CSS px（96dpi）映射到 PDF pt（72dpi）；支持 bodyCards SQL/静态表续页。
 */
import { rgb, type PDFFont, type PDFPage, type PDFDocument } from "pdf-lib";
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import { cellKey } from "@/lib/report-template/binding-preview-utils";
import { bodyElementsRef } from "@/lib/report-template/editor-sheet";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureTableGrid } from "@/lib/report-template/model";
import { PAPER_PRESETS, type PaperKind } from "@/lib/report-template/paper";
import { clampTableRowHeightPx } from "@/lib/report-template/table-cell-metrics";
import type { TablePreviewRowSlice } from "@/lib/report-template/table-preview-row-slice";
import {
  sqlFillSliceTableOuterHeightPx,
  tplElementsHorizontallyOverlap,
} from "@/lib/report-template/table-sql-fill-layout-utils";
import {
  computeExpandedBodyPreviewCards,
  type ExpandedBodyPreviewCard,
} from "@/lib/report-template/table-sql-fill-export-preview-split";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";

const PX_TO_PT = 72 / 96;

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

function paperSizePt(tmpl: ReportTemplate): { w: number; h: number } {
  const d = PAPER_PRESETS[(tmpl.paperKind as PaperKind) || "A4"] || PAPER_PRESETS.A4;
  const portrait = tmpl.orientation !== "landscape";
  const wmm = portrait ? d.widthMm : d.heightMm;
  const hmm = portrait ? d.heightMm : d.widthMm;
  return { w: mmToPt(wmm), h: mmToPt(hmm) };
}

function cellText(v: BindingPreviewCell | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "text" in v) return String((v as { text?: unknown }).text ?? "");
  return String(v);
}

function sanitizeForWinAnsi(s: string): string {
  return s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function safeDrawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  useWinAnsi: boolean,
): void {
  const raw = useWinAnsi ? sanitizeForWinAnsi(text) : text;
  if (!raw) return;
  try {
    page.drawText(raw, { x, y, size, font, color: rgb(0.08, 0.08, 0.08) });
  } catch {
    page.drawText(sanitizeForWinAnsi(raw), {
      x,
      y,
      size,
      font,
      color: rgb(0.08, 0.08, 0.08),
    });
  }
}

function drawWrappedInBox(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  topY: number,
  maxWidth: number,
  maxHeight: number,
  size: number,
  useWinAnsi: boolean,
): void {
  const lineHeight = size * 1.25;
  const raw = useWinAnsi ? sanitizeForWinAnsi(text) : text;
  if (!raw) return;
  const chars = [...raw];
  let line = "";
  let cy = topY - size;
  const floorY = topY - maxHeight + 2;
  const flush = () => {
    if (!line || cy < floorY) return;
    safeDrawText(page, font, line, x, cy, size, useWinAnsi);
    cy -= lineHeight;
    line = "";
  };
  for (const ch of chars) {
    if (ch === "\n") {
      flush();
      continue;
    }
    const trial = line + ch;
    let width = 0;
    try {
      width = font.widthOfTextAtSize(trial, size);
    } catch {
      width = trial.length * size * 0.55;
    }
    if (width > maxWidth && line) {
      flush();
      line = ch;
      if (cy < floorY) return;
    } else {
      line = trial;
    }
  }
  flush();
}

function elBoxPt(
  el: { x: number; y: number; w: number; h: number },
  pageH: number,
  override?: { yPx?: number; hPx?: number },
) {
  const yPx = override?.yPx ?? el.y;
  const hPx = override?.hPx ?? el.h;
  const x = el.x * PX_TO_PT;
  const h = Math.max(4, hPx * PX_TO_PT);
  const w = Math.max(4, el.w * PX_TO_PT);
  const yBottom = pageH - yPx * PX_TO_PT - h;
  return { x, yBottom, w, h, topY: yBottom + h };
}

function showBodyTplEl(
  el: TemplateElement,
  card: ExpandedBodyPreviewCard,
  pageEls: TemplateElement[],
): boolean {
  if (card.tailOnlyBelowBaseline && card.tailBaselineY != null) {
    if (card.overflowSqlFillTableId && el.id === card.overflowSqlFillTableId) return false;
    return el.y >= card.tailBaselineY - 0.5;
  }
  if (card.continuationHideOtherBodyElements) {
    if (el.type !== "table") return false;
    return !!card.sqlFillTableSlices?.[el.id];
  }
  const hb = card.sqlFillHideBelow;
  if (hb) {
    const tbl = pageEls.find((x) => x.id === hb.tableId && x.type === "table");
    if (
      tbl &&
      el.id !== hb.tableId &&
      tplElementsHorizontallyOverlap(el, tbl) &&
      el.y >= hb.baselineY - 0.25
    ) {
      return false;
    }
  }
  return true;
}

function drawZoneElements(
  page: PDFPage,
  font: PDFFont,
  els: LayoutZoneElement[],
  pageH: number,
  values: Record<string, BindingPreviewCell | undefined>,
  useWinAnsi: boolean,
): void {
  for (const el of els) {
    if (el.type !== "text" && el.type !== "parameter" && el.type !== "date" && el.type !== "pageNumber") {
      continue;
    }
    const box = elBoxPt(el, pageH);
    const ck = cellKey(el.id, 0, 0);
    const bound = cellText(values[ck]);
    const text = bound || String(el.text || "");
    if (!text.trim()) continue;
    const size = Math.max(7, Number(el.fontSize) || 10);
    drawWrappedInBox(page, font, text, box.x, box.topY, box.w, box.h, size, useWinAnsi);
  }
}

function drawTableGrid(
  page: PDFPage,
  font: PDFFont,
  el: TemplateElement,
  pageH: number,
  useWinAnsi: boolean,
  opts: {
    yPx: number;
    hPx: number;
    visualRows: number;
    /** 每行取数：visualRowIndex → 文案数组（按列） */
    rowTexts: (visualRow: number) => string[];
  },
): void {
  const box = elBoxPt(el, pageH, { yPx: opts.yPx, hPx: opts.hPx });
  const rows = Math.max(1, opts.visualRows);
  const grid = ensureTableGrid(el);
  const cols = Math.min(grid.cols || 1, 16);
  page.drawRectangle({
    x: box.x,
    y: box.yBottom,
    width: box.w,
    height: box.h,
    borderColor: rgb(0.25, 0.25, 0.25),
    borderWidth: 0.6,
  });
  const rowH = box.h / rows;
  const colW = box.w / cols;
  for (let r = 1; r < rows; r++) {
    const y = box.yBottom + box.h - r * rowH;
    page.drawLine({
      start: { x: box.x, y },
      end: { x: box.x + box.w, y },
      thickness: 0.4,
      color: rgb(0.55, 0.55, 0.55),
    });
  }
  for (let c = 1; c < cols; c++) {
    const x = box.x + c * colW;
    page.drawLine({
      start: { x, y: box.yBottom },
      end: { x, y: box.yBottom + box.h },
      thickness: 0.4,
      color: rgb(0.55, 0.55, 0.55),
    });
  }
  const pad = 2;
  const fontSize = Math.max(6, Math.min(10, rowH * 0.55));
  for (let r = 0; r < rows; r++) {
    const texts = opts.rowTexts(r);
    for (let c = 0; c < cols; c++) {
      const text = texts[c] || "";
      if (!text) continue;
      const cellTop = box.yBottom + box.h - r * rowH;
      drawWrappedInBox(
        page,
        font,
        text,
        box.x + c * colW + pad,
        cellTop - pad,
        colW - pad * 2,
        rowH - pad * 2,
        fontSize,
        useWinAnsi,
      );
    }
  }
}

function drawTemplateElement(
  page: PDFPage,
  font: PDFFont,
  el: TemplateElement,
  pageH: number,
  values: Record<string, BindingPreviewCell | undefined>,
  useWinAnsi: boolean,
  card: ExpandedBodyPreviewCard,
  contentTopPx: number,
): void {
  if (el.type === "text" || el.type === "parameter" || el.type === "date") {
    let yPx = el.y;
    if (card.tailOnlyBelowBaseline && card.tailBaselineY != null) {
      yPx = el.y - card.tailBaselineY + contentTopPx;
    }
    const box = elBoxPt(el, pageH, { yPx });
    const ck = cellKey(el.id, 0, 0);
    const bound = cellText(values[ck]);
    const text = bound || String(el.text || "");
    if (!text.trim()) return;
    const size = Math.max(7, Number(el.fontSize) || 11);
    drawWrappedInBox(page, font, text, box.x, box.topY, box.w, box.h, size, useWinAnsi);
    return;
  }
  if (el.type !== "table") return;

  const slice: TablePreviewRowSlice | undefined = card.sqlFillTableSlices?.[el.id];
  const rowHFallback = clampTableRowHeightPx(el.tableRowHeightPx);
  let yPx = el.y;
  let hPx = el.h;
  if (card.tailOnlyBelowBaseline && card.tailBaselineY != null) {
    yPx = el.y - card.tailBaselineY + contentTopPx;
  }
  if (slice) {
    const h2 = sqlFillSliceTableOuterHeightPx(el, slice, null);
    if (h2 != null) hPx = h2;
    if (card.continuationIndex > 0) yPx = contentTopPx;
  }

  const grid = ensureTableGrid(el);
  const cols = Math.min(grid.cols || 1, 16);
  const sqlKey = templateTableSqlFillPreviewKey(el.id);
  const sqlPayload = values[sqlKey] as
    | { ok?: boolean; columns?: string[]; rows?: Record<string, unknown>[] }
    | undefined;

  if (slice) {
    const visualRows = (slice.includeHeaderRow ? 1 : 0) + Math.max(0, slice.dataRowCount);
    if (visualRows < 1) return;
    drawTableGrid(page, font, el, pageH, useWinAnsi, {
      yPx,
      hPx: Math.max(hPx, visualRows * Math.max(12, rowHFallback * 0.5)),
      visualRows,
      rowTexts: (vr) => {
        const out: string[] = [];
        if (slice.includeHeaderRow && vr === 0) {
          if (sqlPayload?.ok && Array.isArray(sqlPayload.columns)) {
            for (let c = 0; c < cols; c++) out.push(String(sqlPayload.columns[c] ?? ""));
          } else {
            for (let c = 0; c < cols; c++) out.push(cellText(values[cellKey(el.id, 0, c)]) || "");
          }
          return out;
        }
        const dataIdx = vr - (slice.includeHeaderRow ? 1 : 0);
        const absRow = slice.dataRowStart + dataIdx;
        if (sqlPayload?.ok && Array.isArray(sqlPayload.rows)) {
          const colsNames = (sqlPayload.columns || Object.keys(sqlPayload.rows[0] || {})).slice(0, cols);
          const row = sqlPayload.rows[absRow];
          for (let c = 0; c < cols; c++) {
            const name = colsNames[c];
            const v = name && row ? row[name] : undefined;
            out.push(v == null ? "" : String(v));
          }
          return out;
        }
        // 静态表：dataRowStart 相对数据行（通常表头占第 0 视觉行）
        const gridRow = slice.includeHeaderRow ? absRow + 1 : absRow;
        for (let c = 0; c < cols; c++) {
          out.push(cellText(values[cellKey(el.id, gridRow, c)]) || grid[gridRow]?.[c]?.text || "");
        }
        return out;
      },
    });
    return;
  }

  // 无切片：整表（兼容简单模版）
  const rows = Math.min(grid.rows || 0, 80);
  if (rows < 1 || cols < 1) return;
  if (sqlPayload?.ok && Array.isArray(sqlPayload.rows) && sqlPayload.rows.length) {
    const colsNames = (sqlPayload.columns || Object.keys(sqlPayload.rows[0] || {})).slice(0, cols);
    const visualRows = Math.min(rows, sqlPayload.rows.length + 1);
    drawTableGrid(page, font, el, pageH, useWinAnsi, {
      yPx,
      hPx,
      visualRows,
      rowTexts: (vr) => {
        if (vr === 0) return colsNames.map((n) => n);
        const row = sqlPayload.rows![vr - 1];
        return colsNames.map((n) => {
          const v = row?.[n];
          return v == null ? "" : String(v);
        });
      },
    });
    return;
  }
  drawTableGrid(page, font, el, pageH, useWinAnsi, {
    yPx,
    hPx,
    visualRows: rows,
    rowTexts: (vr) => {
      const out: string[] = [];
      for (let c = 0; c < cols; c++) {
        out.push(cellText(values[cellKey(el.id, vr, c)]) || "");
      }
      return out;
    },
  });
}

/**
 * 在已创建的 PDFDocument 上写入 layout-v2 页面，返回页数。
 */
export function appendPdfLibLayoutV2Pages(
  doc: PDFDocument,
  opts: {
    tmpl: ReportTemplate;
    previewValues: Record<string, BindingPreviewCell | undefined>;
    font: PDFFont;
    useWinAnsi: boolean;
    /** 缺省则现场计算；导出路径应传入当前分卷的 bodyCards */
    bodyCards?: ExpandedBodyPreviewCard[];
  },
): number {
  const { tmpl, previewValues, font, useWinAnsi } = opts;
  const { w: pageW, h: pageH } = paperSizePt(tmpl);
  const metrics = computePaperLayout(
    (tmpl.paperKind as PaperKind) || "A4",
    tmpl.orientation === "landscape" ? "landscape" : "portrait",
    tmpl.layoutSnapshot,
  );
  let pageCount = 0;

  const paintPage = (
    bodyEls: TemplateElement[],
    headerEls: LayoutZoneElement[],
    footerEls: LayoutZoneElement[],
    card: ExpandedBodyPreviewCard | null,
  ) => {
    const page = doc.addPage([pageW, pageH]);
    pageCount += 1;
    const contentX = metrics.contentLeft * PX_TO_PT;
    const contentH = metrics.contentH * PX_TO_PT;
    const contentY = pageH - (metrics.contentTop + metrics.contentH) * PX_TO_PT;
    page.drawRectangle({
      x: contentX,
      y: contentY,
      width: metrics.contentW * PX_TO_PT,
      height: contentH,
      borderColor: rgb(0.85, 0.85, 0.9),
      borderWidth: 0.3,
    });
    const showChrome = !card?.continuationHideOtherBodyElements && !card?.tailOnlyBelowBaseline;
    if (showChrome) {
      drawZoneElements(page, font, headerEls, pageH, previewValues, useWinAnsi);
    }
    const effectiveCard: ExpandedBodyPreviewCard = card || {
      bodyPageIndex: 0,
      continuationIndex: 0,
      sqlFillTableSlices: {},
      continuationHideOtherBodyElements: false,
    };
    for (const el of bodyEls) {
      drawTemplateElement(
        page,
        font,
        el,
        pageH,
        previewValues,
        useWinAnsi,
        effectiveCard,
        metrics.contentTop,
      );
    }
    if (showChrome) {
      drawZoneElements(page, font, footerEls, pageH, previewValues, useWinAnsi);
    }
  };

  if (tmpl.coverElements?.length) {
    paintPage(
      tmpl.coverElements,
      tmpl.coverHeaderElements || [],
      tmpl.coverFooterElements || [],
      null,
    );
  }

  const cards = opts.bodyCards ?? computeExpandedBodyPreviewCards(tmpl, previewValues);
  if (cards.length) {
    for (const card of cards) {
      const pageEls = bodyElementsRef(tmpl, "body", card.bodyPageIndex);
      const visible = pageEls.filter((el) => showBodyTplEl(el, card, pageEls));
      paintPage(visible, tmpl.headerElements || [], tmpl.footerElements || [], card);
    }
  } else {
    const pageEls = bodyElementsRef(tmpl, "body", 0);
    paintPage(pageEls, tmpl.headerElements || [], tmpl.footerElements || [], null);
  }

  if (tmpl.backElements?.length) {
    paintPage(tmpl.backElements, tmpl.backHeaderElements || [], tmpl.backFooterElements || [], null);
  }

  if (pageCount === 0) {
    paintPage([], tmpl.headerElements || [], tmpl.footerElements || [], null);
  }
  return pageCount;
}
