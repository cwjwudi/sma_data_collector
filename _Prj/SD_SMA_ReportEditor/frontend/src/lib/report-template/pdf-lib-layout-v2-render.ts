/**
 * 035 档 1：pdf-lib 坐标版式导出（layout-v2）。
 * 按编辑器 CSS px（96dpi）映射到 PDF pt（72dpi）；控件坐标相对各带原点（与画布一致）。
 */
import {
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type PDFDocument,
  type RGB,
} from "pdf-lib";
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import {
  cellKey,
  paramKey,
  zoneCellKey,
  zoneParamKey,
} from "@/lib/report-template/binding-preview-utils";
import {
  bodyElementsRef,
  metricsForSheet,
  zoneBodyDecorRef,
  type EditorSheet,
} from "@/lib/report-template/editor-sheet";
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import {
  ensureZoneTableGrid,
  zoneTableColumnInnerWidthsPx,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import {
  ensureBodyPages,
  ensureTableGrid,
  templateTableColumnInnerWidthsPx,
} from "@/lib/report-template/model";
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

function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseCssColor(raw: string | undefined | null, fallback: RGB): RGB {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s || s === "transparent" || s === "none") return fallback;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = Number.parseInt(h, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    return rgb(Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255);
  }
  return fallback;
}

function boxFromPagePx(
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  pageHPt: number,
) {
  const x = xPx * PX_TO_PT;
  const h = Math.max(4, hPx * PX_TO_PT);
  const w = Math.max(4, wPx * PX_TO_PT);
  const yBottom = pageHPt - yPx * PX_TO_PT - h;
  return { x, yBottom, w, h, topY: yBottom + h };
}

function contentOrigin(m: PaperLayoutMetrics) {
  return { ox: m.contentLeft, oy: m.contentTop };
}

function headerOrigin(m: PaperLayoutMetrics) {
  return { ox: m.ml, oy: m.mt };
}

function footerOrigin(m: PaperLayoutMetrics) {
  return { ox: m.ml, oy: m.pageH - m.mb - m.fb };
}

function safeDrawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  useWinAnsi: boolean,
  color: RGB = rgb(0.08, 0.08, 0.08),
): void {
  const raw = useWinAnsi ? sanitizeForWinAnsi(text) : text;
  if (!raw) return;
  try {
    page.drawText(raw, { x, y, size, font, color });
  } catch {
    const fallback = sanitizeForWinAnsi(raw);
    if (!fallback) return;
    try {
      page.drawText(fallback, { x, y, size, font, color });
    } catch {
      /* ignore undrawable glyphs */
    }
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
  color?: RGB,
): void {
  if (!(maxHeight > 2) || !(maxWidth > 2)) return;
  // 窄框（眉栏 ~18px）时字号必须压进盒高，否则 cy < floorY 会整段不画
  const fitSize = Math.min(size, Math.max(5, maxHeight - 1));
  const lineHeight = fitSize * 1.2;
  const raw = useWinAnsi ? sanitizeForWinAnsi(text) : text;
  if (!raw) return;
  const chars = [...raw];
  let line = "";
  let cy = topY - fitSize;
  const floorY = topY - maxHeight;
  const flush = () => {
    if (!line) return;
    if (cy < floorY - 0.5) return;
    safeDrawText(page, font, line, x, cy, fitSize, useWinAnsi, color);
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

async function embedDataUrlImage(doc: PDFDocument, src: string): Promise<PDFImage | null> {
  const s = String(src || "").trim();
  const m = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i.exec(s);
  if (!m) return null;
  try {
    const bytes = decodeBase64ToBytes(m[2].replace(/\s+/g, ""));
    if (bytes.byteLength < 32) return null;
    if (/^png$/i.test(m[1])) return await doc.embedPng(bytes);
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

function collectImageSrcs(tmpl: ReportTemplate): string[] {
  const out: string[] = [];
  const pushEl = (el: { type?: string; imageSrc?: string } | null | undefined) => {
    if (!el) return;
    const t = String(el.type || "");
    if (t !== "image" && t !== "signature") return;
    const src = String(el.imageSrc || "").trim();
    if (src.startsWith("data:image/")) out.push(src);
  };
  for (const el of tmpl.coverElements || []) pushEl(el);
  for (const el of tmpl.backElements || []) pushEl(el);
  for (const page of ensureBodyPages(tmpl)) {
    for (const el of page) pushEl(el);
  }
  for (const el of [
    ...(tmpl.headerElements || []),
    ...(tmpl.footerElements || []),
    ...(tmpl.coverHeaderElements || []),
    ...(tmpl.coverFooterElements || []),
    ...(tmpl.coverBodyZoneElements || []),
    ...(tmpl.backHeaderElements || []),
    ...(tmpl.backFooterElements || []),
    ...(tmpl.backBodyZoneElements || []),
  ]) {
    pushEl(el);
  }
  return out;
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

function drawImageInBox(
  page: PDFPage,
  img: PDFImage,
  box: { x: number; yBottom: number; w: number; h: number },
): void {
  const iw = img.width;
  const ih = img.height;
  if (iw <= 0 || ih <= 0) return;
  const scale = Math.min(box.w / iw, box.h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const x = box.x + (box.w - dw) / 2;
  const y = box.yBottom + (box.h - dh) / 2;
  page.drawImage(img, { x, y, width: dw, height: dh });
}

function drawZoneTable(
  page: PDFPage,
  font: PDFFont,
  el: LayoutZoneElement,
  pageH: number,
  origin: { ox: number; oy: number },
  values: Record<string, BindingPreviewCell | undefined>,
  useWinAnsi: boolean,
  geo?: { x: number; y: number; w: number; h: number },
): void {
  const grid = ensureZoneTableGrid(el);
  const rows = Math.max(1, Math.min(el.tableRows || grid.length || 1, 40));
  const cols = Math.max(1, Math.min(el.tableCols || grid[0]?.length || 1, 16));
  const x = geo?.x ?? el.x;
  const y = geo?.y ?? el.y;
  const w = geo?.w ?? el.w;
  const h = geo?.h ?? el.h;
  const box = boxFromPagePx(origin.ox + x, origin.oy + y, w, h, pageH);
  page.drawRectangle({
    x: box.x,
    y: box.yBottom,
    width: box.w,
    height: box.h,
    borderColor: rgb(0.25, 0.25, 0.25),
    borderWidth: 0.5,
  });
  let widthsPx: number[] = [];
  try {
    widthsPx = zoneTableColumnInnerWidthsPx(el);
  } catch {
    widthsPx = [];
  }
  const widthsPt =
    widthsPx.length === cols && widthsPx.some((w) => w > 0)
      ? (() => {
          const sum = widthsPx.reduce((a, b) => a + Math.max(1, b), 0);
          const scale = w / sum;
          return widthsPx.map((cw) => Math.max(4, cw * scale) * PX_TO_PT);
        })()
      : Array.from({ length: cols }, () => box.w / cols);
  const rowH = box.h / rows;
  const colXs: number[] = [box.x];
  let acc = box.x;
  for (let c = 0; c < cols; c++) {
    acc += widthsPt[c] || box.w / cols;
    colXs.push(acc);
  }
  for (let r = 1; r < rows; r++) {
    const y = box.yBottom + box.h - r * rowH;
    page.drawLine({
      start: { x: box.x, y },
      end: { x: box.x + box.w, y },
      thickness: 0.35,
      color: rgb(0.55, 0.55, 0.55),
    });
  }
  for (let c = 1; c < cols; c++) {
    const x = colXs[c];
    page.drawLine({
      start: { x, y: box.yBottom },
      end: { x, y: box.yBottom + box.h },
      thickness: 0.35,
      color: rgb(0.55, 0.55, 0.55),
    });
  }
  const fontSize = Math.max(6, Math.min(10, Number(el.fontSize) || rowH * 0.5));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bound = cellText(values[zoneCellKey(el.id, r, c)]);
      const text = bound || String(grid[r]?.[c]?.text || "");
      if (!text.trim()) continue;
      const cellX = colXs[c];
      const cellW = (colXs[c + 1] || box.x + box.w) - cellX;
      const cellTop = box.yBottom + box.h - r * rowH;
      drawWrappedInBox(
        page,
        font,
        text,
        cellX + 2,
        cellTop - 1,
        cellW - 4,
        rowH - 2,
        fontSize,
        useWinAnsi,
      );
    }
  }
}

function clampZoneElToBand(
  el: LayoutZoneElement,
  bandW: number,
): { x: number; y: number; w: number; h: number } {
  const maxW = Math.max(20, bandW - 1);
  let x = Math.max(0, Number(el.x) || 0);
  let w = Math.max(4, Number(el.w) || 4);
  const y = Number(el.y) || 0;
  const h = Math.max(4, Number(el.h) || 4);
  if (x + w > maxW) w = Math.max(4, maxW - x);
  if (x + w > maxW) {
    x = Math.max(0, maxW - w);
    w = Math.max(4, maxW - x);
  }
  return { x, y, w, h };
}

function drawZoneElements(
  page: PDFPage,
  font: PDFFont,
  els: LayoutZoneElement[],
  pageH: number,
  origin: { ox: number; oy: number },
  values: Record<string, BindingPreviewCell | undefined>,
  useWinAnsi: boolean,
  images: Map<string, PDFImage>,
  pageLabel: string,
  bandWPx?: number,
): void {
  const sorted = [...els].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  for (const el of sorted) {
    const geo =
      bandWPx != null && bandWPx > 0
        ? clampZoneElToBand(el, bandWPx)
        : { x: el.x, y: el.y, w: el.w, h: el.h };
    const box = boxFromPagePx(origin.ox + geo.x, origin.oy + geo.y, geo.w, geo.h, pageH);
    if (el.type === "image") {
      const src = String(el.imageSrc || "").trim();
      const img = src ? images.get(src) : undefined;
      if (img) drawImageInBox(page, img, box);
      continue;
    }
    if (el.type === "table") {
      drawZoneTable(page, font, el, pageH, origin, values, useWinAnsi, geo);
      continue;
    }
    if (el.type === "box") {
      page.drawRectangle({
        x: box.x,
        y: box.yBottom,
        width: box.w,
        height: box.h,
        color: parseCssColor(el.bgColor, rgb(0.95, 0.95, 0.95)),
        borderColor: rgb(0.55, 0.55, 0.55),
        borderWidth: 0.4,
      });
      const label = String(el.text || "").trim();
      if (label) {
        drawWrappedInBox(
          page,
          font,
          label,
          box.x + 2,
          box.topY - 1,
          box.w - 4,
          box.h - 2,
          Math.max(7, Number(el.fontSize) || 10),
          useWinAnsi,
        );
      }
      continue;
    }
    if (el.type !== "text" && el.type !== "parameter" && el.type !== "date" && el.type !== "pageNumber") {
      continue;
    }
    const ck = zoneParamKey(el.id);
    const bound = cellText(values[ck]);
    let text = bound || String(el.text || "");
    if (el.type === "pageNumber" && !bound) text = pageLabel || text || "1";
    // 绑定成功时不回落控件占位文案（如 {{value}} / SQL·温度）
    if (bound) text = bound;
    if (!text.trim()) continue;
    if (el.showBorder || (el.bgColor && el.bgColor !== "transparent" && el.bgColor !== "none")) {
      try {
        const fill = parseCssColor(
          el.bgColor && el.bgColor !== "transparent" && el.bgColor !== "none" ? el.bgColor : "",
          rgb(1, 1, 1),
        );
        const hasFill = Boolean(el.bgColor && el.bgColor !== "transparent" && el.bgColor !== "none");
        page.drawRectangle({
          x: box.x,
          y: box.yBottom,
          width: box.w,
          height: box.h,
          color: hasFill ? fill : undefined,
          borderColor: el.showBorder ? rgb(0.55, 0.55, 0.55) : undefined,
          borderWidth: el.showBorder ? 0.4 : undefined,
        });
      } catch {
        /* ignore chrome draw errors */
      }
    }
    const size = Math.max(7, Number(el.fontSize) || 10);
    // 不用自定义 color：部分环境下带 color 的 drawText 对 subset TTF 会静默失败
    drawWrappedInBox(page, font, text, box.x + 2, box.topY - 1, box.w - 4, box.h - 2, size, useWinAnsi);
  }
}

function colWidthsPt(el: TemplateElement, boxW: number, cols: number): number[] {
  let px: number[] = [];
  try {
    px = templateTableColumnInnerWidthsPx(el);
  } catch {
    px = [];
  }
  if (px.length !== cols || px.every((w) => !(w > 0))) {
    const each = boxW / cols;
    return Array.from({ length: cols }, () => each);
  }
  const sum = px.reduce((a, b) => a + Math.max(1, b), 0);
  const scale = (boxW / PX_TO_PT) / sum;
  return px.map((w) => Math.max(4, w * scale) * PX_TO_PT);
}

function drawTableGrid(
  page: PDFPage,
  font: PDFFont,
  el: TemplateElement,
  pageH: number,
  useWinAnsi: boolean,
  opts: {
    xPx: number;
    yPx: number;
    hPx: number;
    visualRows: number;
    rowTexts: (visualRow: number) => string[];
  },
): void {
  const box = boxFromPagePx(opts.xPx, opts.yPx, el.w, opts.hPx, pageH);
  const rows = Math.max(1, opts.visualRows);
  const grid = ensureTableGrid(el);
  const cols = Math.min(el.tableCols || grid[0]?.length || 1, 16);
  const bg = parseCssColor(el.bgColor, rgb(1, 1, 1));
  page.drawRectangle({
    x: box.x,
    y: box.yBottom,
    width: box.w,
    height: box.h,
    color: bg.red === 1 && bg.green === 1 && bg.blue === 1 ? undefined : bg,
    borderColor: rgb(0.25, 0.25, 0.25),
    borderWidth: 0.6,
  });
  const rowH = box.h / rows;
  const widths = colWidthsPt(el, box.w, cols);
  let accX = box.x;
  const colXs: number[] = [box.x];
  for (let c = 0; c < cols; c++) {
    accX += widths[c] || box.w / cols;
    colXs.push(accX);
  }
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
    const x = colXs[c];
    page.drawLine({
      start: { x, y: box.yBottom },
      end: { x, y: box.yBottom + box.h },
      thickness: 0.4,
      color: rgb(0.55, 0.55, 0.55),
    });
  }
  const pad = 2;
  const fontSize = Math.max(6, Math.min(11, rowH * 0.55));
  for (let r = 0; r < rows; r++) {
    const texts = opts.rowTexts(r);
    for (let c = 0; c < cols; c++) {
      const text = texts[c] || "";
      if (!text) continue;
      const cellTop = box.yBottom + box.h - r * rowH;
      const cellX = colXs[c];
      const cellW = (colXs[c + 1] || box.x + box.w) - cellX;
      drawWrappedInBox(
        page,
        font,
        text,
        cellX + pad,
        cellTop - pad,
        cellW - pad * 2,
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
  origin: { ox: number; oy: number },
  values: Record<string, BindingPreviewCell | undefined>,
  useWinAnsi: boolean,
  card: ExpandedBodyPreviewCard,
  images: Map<string, PDFImage>,
): void {
  let xPx = origin.ox + el.x;
  let yPx = origin.oy + el.y;
  if (card.tailOnlyBelowBaseline && card.tailBaselineY != null) {
    yPx = origin.oy + (el.y - card.tailBaselineY);
  }

  if (el.type === "image" || el.type === "signature") {
    const src = String(el.imageSrc || "").trim();
    const img = src ? images.get(src) : undefined;
    if (!img) return;
    const box = boxFromPagePx(xPx, yPx, el.w, el.h, pageH);
    drawImageInBox(page, img, box);
    return;
  }

  if (el.type === "text" || el.type === "parameter" || el.type === "date") {
    const box = boxFromPagePx(xPx, yPx, el.w, el.h, pageH);
    const ck = paramKey(el.id);
    const bound = cellText(values[ck]);
    const text = bound || String(el.text || "");
    if (!text.trim()) return;
    if (el.showBorder || (el.bgColor && el.bgColor !== "transparent")) {
      page.drawRectangle({
        x: box.x,
        y: box.yBottom,
        width: box.w,
        height: box.h,
        color: parseCssColor(el.bgColor, rgb(1, 1, 1)),
        borderColor: el.showBorder ? rgb(0.55, 0.55, 0.55) : undefined,
        borderWidth: el.showBorder ? 0.4 : undefined,
      });
    }
    const size = Math.max(7, Number(el.fontSize) || 11);
    const color = parseCssColor(el.color, rgb(0.08, 0.08, 0.08));
    drawWrappedInBox(page, font, text, box.x + 2, box.topY - 1, box.w - 4, box.h - 2, size, useWinAnsi, color);
    return;
  }
  if (el.type !== "table") return;

  const slice: TablePreviewRowSlice | undefined = card.sqlFillTableSlices?.[el.id];
  const rowHFallback = clampTableRowHeightPx(el.tableRowHeightPx);
  let hPx = el.h;
  if (slice) {
    const h2 = sqlFillSliceTableOuterHeightPx(el, slice, null);
    if (h2 != null) hPx = h2;
    if (card.continuationIndex > 0) yPx = origin.oy;
  }

  const grid = ensureTableGrid(el);
  const cols = Math.min(el.tableCols || grid[0]?.length || 1, 16);
  const sqlKey = templateTableSqlFillPreviewKey(el.id);
  const sqlPayload = values[sqlKey] as
    | { ok?: boolean; columns?: string[]; rows?: Record<string, unknown>[] }
    | undefined;

  const staticCell = (r: number, c: number) =>
    cellText(values[cellKey(el.id, r, c)]) || String(grid[r]?.[c]?.text || "");

  if (slice) {
    const visualRows = (slice.includeHeaderRow ? 1 : 0) + Math.max(0, slice.dataRowCount);
    if (visualRows < 1) return;
    drawTableGrid(page, font, el, pageH, useWinAnsi, {
      xPx,
      yPx,
      hPx: Math.max(hPx, visualRows * Math.max(12, rowHFallback * 0.5)),
      visualRows,
      rowTexts: (vr) => {
        const out: string[] = [];
        if (slice.includeHeaderRow && vr === 0) {
          if (sqlPayload?.ok && Array.isArray(sqlPayload.columns)) {
            for (let c = 0; c < cols; c++) out.push(String(sqlPayload.columns[c] ?? ""));
          } else {
            for (let c = 0; c < cols; c++) out.push(staticCell(0, c));
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
        const gridRow = slice.includeHeaderRow ? absRow + 1 : absRow;
        for (let c = 0; c < cols; c++) out.push(staticCell(gridRow, c));
        return out;
      },
    });
    return;
  }

  const rows = Math.min(el.tableRows || grid.length || 0, 80);
  if (rows < 1 || cols < 1) return;
  if (sqlPayload?.ok && Array.isArray(sqlPayload.rows) && sqlPayload.rows.length) {
    const colsNames = (sqlPayload.columns || Object.keys(sqlPayload.rows[0] || {})).slice(0, cols);
    const visualRows = Math.min(rows, sqlPayload.rows.length + 1);
    drawTableGrid(page, font, el, pageH, useWinAnsi, {
      xPx,
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
    xPx,
    yPx,
    hPx,
    visualRows: rows,
    rowTexts: (vr) => {
      const out: string[] = [];
      for (let c = 0; c < cols; c++) out.push(staticCell(vr, c));
      return out;
    },
  });
}

/**
 * 在已创建的 PDFDocument 上写入 layout-v2 页面，返回页数。
 */
export async function appendPdfLibLayoutV2Pages(
  doc: PDFDocument,
  opts: {
    tmpl: ReportTemplate;
    previewValues: Record<string, BindingPreviewCell | undefined>;
    font: PDFFont;
    useWinAnsi: boolean;
    /** 缺省则现场计算；导出路径应传入当前分卷的 bodyCards */
    bodyCards?: ExpandedBodyPreviewCard[];
  },
): Promise<number> {
  const { tmpl, previewValues, font, useWinAnsi } = opts;
  const { w: pageW, h: pageH } = paperSizePt(tmpl);
  let pageCount = 0;

  const images = new Map<string, PDFImage>();
  for (const src of collectImageSrcs(tmpl)) {
    if (images.has(src)) continue;
    const img = await embedDataUrlImage(doc, src);
    if (img) images.set(src, img);
  }

  const paintPage = (
    sheet: EditorSheet,
    bodyEls: TemplateElement[],
    headerEls: LayoutZoneElement[],
    footerEls: LayoutZoneElement[],
    card: ExpandedBodyPreviewCard | null,
  ) => {
    const metrics = metricsForSheet(tmpl, sheet);
    const page = doc.addPage([pageW, pageH]);
    pageCount += 1;
    const pageLabel = String(pageCount);
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
    const bodyOrigin = contentOrigin(metrics);
    const bandW = metrics.contentW;
    if (showChrome) {
      drawZoneElements(
        page,
        font,
        headerEls,
        pageH,
        headerOrigin(metrics),
        previewValues,
        useWinAnsi,
        images,
        pageLabel,
        bandW,
      );
    }
    const effectiveCard: ExpandedBodyPreviewCard = card || {
      bodyPageIndex: 0,
      continuationIndex: 0,
      sqlFillTableSlices: {},
      continuationHideOtherBodyElements: false,
    };
    const decor = zoneBodyDecorRef(tmpl, sheet);
    if (decor?.length && showChrome) {
      drawZoneElements(
        page,
        font,
        decor,
        pageH,
        bodyOrigin,
        previewValues,
        useWinAnsi,
        images,
        pageLabel,
        bandW,
      );
    }
    const sortedBody = [...bodyEls].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    for (const el of sortedBody) {
      drawTemplateElement(
        page,
        font,
        el,
        pageH,
        bodyOrigin,
        previewValues,
        useWinAnsi,
        effectiveCard,
        images,
      );
    }
    if (showChrome) {
      drawZoneElements(
        page,
        font,
        footerEls,
        pageH,
        footerOrigin(metrics),
        previewValues,
        useWinAnsi,
        images,
        pageLabel,
        bandW,
      );
    }
  };

  if (tmpl.coverElements?.length || tmpl.coverHeaderElements?.length || tmpl.coverFooterElements?.length) {
    paintPage(
      "cover",
      tmpl.coverElements || [],
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
      paintPage("body", visible, tmpl.headerElements || [], tmpl.footerElements || [], card);
    }
  } else {
    const pageEls = bodyElementsRef(tmpl, "body", 0);
    paintPage("body", pageEls, tmpl.headerElements || [], tmpl.footerElements || [], null);
  }

  if (tmpl.backElements?.length || tmpl.backHeaderElements?.length || tmpl.backFooterElements?.length) {
    paintPage(
      "back",
      tmpl.backElements || [],
      tmpl.backHeaderElements || [],
      tmpl.backFooterElements || [],
      null,
    );
  }

  if (pageCount === 0) {
    paintPage("body", [], tmpl.headerElements || [], tmpl.footerElements || [], null);
  }
  return pageCount;
}
