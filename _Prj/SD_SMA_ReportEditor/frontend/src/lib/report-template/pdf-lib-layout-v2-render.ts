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
  formatLayoutDate,
  formatPageNumberDisplay,
  normalizeAlignAxis,
  normalizePageNumberMode,
  zoneTableColumnInnerWidthsPx,
  type LayoutAlignAxis,
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
  tableSqlFillVerticalChromePx,
  tplElementsHorizontallyOverlap,
} from "@/lib/report-template/table-sql-fill-layout-utils";
import {
  computeExpandedBodyPreviewCards,
  type ExpandedBodyPreviewCard,
} from "@/lib/report-template/table-sql-fill-export-preview-split";
import {
  formatSqlFillTableCellPreview,
  sqlFillDisplayDataRowCount,
  templateTableSqlFillPreviewKey,
  zoneTableSqlFillPreviewKey,
} from "@/lib/report-template/table-sql-fill-preview";

const PX_TO_PT = 72 / 96;

/** 与 TemplateMiniPage 正文控件 `fontSize * 0.8` 对齐 */
const BODY_FONT_SCALE = 0.8;
/** 与 TemplateMiniPage / ZoneImageCompose zone 字号 `* 0.85` 对齐 */
const ZONE_FONT_SCALE = 0.85;

/** 与 Mini `.mini-body { background: rgb(249 249 251) }` 对齐（D1） */
const MINI_BODY_BG = rgb(249 / 255, 249 / 255, 251 / 255);
/** 与 Mini 眉/脚带 `rgb(239 239 246 / 0.52)` 叠白近似 */
const MINI_BAND_BG = rgb(
  (0.52 * 239 + 0.48 * 255) / 255,
  (0.52 * 239 + 0.48 * 255) / 255,
  (0.52 * 246 + 0.48 * 255) / 255,
);

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

function scaledFontSize(raw: unknown, scale: number, fallback: number, min = 6): number {
  const n = Number(raw);
  const base = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.max(min, base * scale);
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

function measureTextWidthPt(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return [...text].length * size * 0.55;
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
  alignX: LayoutAlignAxis = "start",
  alignY: LayoutAlignAxis = "start",
): void {
  if (!(maxHeight > 2) || !(maxWidth > 2)) return;
  // 窄框（眉栏 ~18px）时字号必须压进盒高，否则 cy < floorY 会整段不画
  const fitSize = Math.min(size, Math.max(5, maxHeight - 1));
  const lineHeight = fitSize * 1.2;
  const raw = useWinAnsi ? sanitizeForWinAnsi(text) : text;
  if (!raw) return;
  const ax = normalizeAlignAxis(alignX, "start");
  const ay = normalizeAlignAxis(alignY, "start");
  const lines: string[] = [];
  let line = "";
  const pushLine = () => {
    if (!line) return;
    lines.push(line);
    line = "";
  };
  for (const ch of [...raw]) {
    if (ch === "\n") {
      pushLine();
      continue;
    }
    const trial = line + ch;
    const width = measureTextWidthPt(font, trial, fitSize);
    if (width > maxWidth && line) {
      pushLine();
      line = ch;
    } else {
      line = trial;
    }
  }
  pushLine();
  if (!lines.length) return;

  // 基线排版下中文视觉中心偏上；居中/底对齐时按墨水高度估算，避免格内「贴顶」
  const inkH = ay === "start" ? fitSize : fitSize * 0.82;
  const contentH = inkH + Math.max(0, lines.length - 1) * lineHeight;
  let yOffset = 0;
  if (ay === "center") yOffset = Math.max(0, (maxHeight - contentH) / 2);
  else if (ay === "end") yOffset = Math.max(0, maxHeight - contentH);

  const floorY = topY - maxHeight;
  let cy = topY - fitSize - yOffset;
  for (const ln of lines) {
    if (cy < floorY - 0.5) break;
    const lw = measureTextWidthPt(font, ln, fitSize);
    let drawX = x;
    if (ax === "center") drawX = x + Math.max(0, (maxWidth - lw) / 2);
    else if (ax === "end") drawX = x + Math.max(0, maxWidth - lw);
    safeDrawText(page, font, ln, drawX, cy, fitSize, useWinAnsi, color);
    cy -= lineHeight;
  }
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
  edge?: { skipTop?: boolean; skipBottom?: boolean },
): void {
  const grid = ensureZoneTableGrid(el);
  const rows = Math.max(1, Math.min(el.tableRows || grid.length || 1, 40));
  const cols = Math.max(1, Math.min(el.tableCols || grid[0]?.length || 1, 16));
  const x = geo?.x ?? el.x;
  const y = geo?.y ?? el.y;
  const w = geo?.w ?? el.w;
  const h = geo?.h ?? el.h;
  const box = boxFromPagePx(origin.ox + x, origin.oy + y, w, h, pageH);
  const border = rgb(0.25, 0.25, 0.25);
  const thick = 0.5;
  // 分线绘制：相邻堆叠表跳过共用边，避免矢量双线（预览 HTML 边框折叠看不出来）
  page.drawLine({
    start: { x: box.x, y: box.yBottom },
    end: { x: box.x, y: box.yBottom + box.h },
    thickness: thick,
    color: border,
  });
  page.drawLine({
    start: { x: box.x + box.w, y: box.yBottom },
    end: { x: box.x + box.w, y: box.yBottom + box.h },
    thickness: thick,
    color: border,
  });
  if (!edge?.skipBottom) {
    page.drawLine({
      start: { x: box.x, y: box.yBottom },
      end: { x: box.x + box.w, y: box.yBottom },
      thickness: thick,
      color: border,
    });
  }
  if (!edge?.skipTop) {
    page.drawLine({
      start: { x: box.x, y: box.yBottom + box.h },
      end: { x: box.x + box.w, y: box.yBottom + box.h },
      thickness: thick,
      color: border,
    });
  }
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
  const fontSize = Math.max(
    6,
    Math.min(10, scaledFontSize(el.fontSize, ZONE_FONT_SCALE, rowH * 0.5)),
  );
  const zoneFill = el.tableSqlFill?.enabled ? el.tableSqlFill : null;
  const zoneFillPv = zoneFill
    ? values[zoneTableSqlFillPreviewKey(el.id)]?.tableSqlFill ?? null
    : null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let text = "";
      if (zoneFill) {
        text = formatSqlFillTableCellPreview({
          fill: zoneFill,
          rowIndex: r,
          colIndex: c,
          preview: zoneFillPv,
          errorMaxLen: 48,
          labelPreview: { elId: el.id, zone: true, values },
        });
      } else {
        const bound = cellText(values[zoneCellKey(el.id, r, c)]);
        text = bound || String(grid[r]?.[c]?.text || "");
      }
      if (!text.trim() || text === "\u00a0") continue;
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
        undefined,
        el.alignX ?? "center",
        el.alignY ?? "center",
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
  pageNum: number,
  totalPages: number,
  bandWPx?: number,
): void {
  const sorted = [...els].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  const tableGeos = sorted
    .filter((e) => e.type === "table")
    .map((e) => ({
      id: e.id,
      geo:
        bandWPx != null && bandWPx > 0
          ? clampZoneElToBand(e, bandWPx)
          : { x: e.x, y: e.y, w: e.w, h: e.h },
    }));
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
      // 上方若有表底边贴齐，则本表跳过顶边，由上方表画共用线
      const skipTop = tableGeos.some(
        (o) => o.id !== el.id && Math.abs(o.geo.y + o.geo.h - geo.y) <= 1.5,
      );
      drawZoneTable(page, font, el, pageH, origin, values, useWinAnsi, geo, {
        skipTop,
      });
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
          scaledFontSize(el.fontSize, ZONE_FONT_SCALE, 10, 7),
          useWinAnsi,
          undefined,
          el.alignX ?? "start",
          el.alignY ?? "center",
        );
      }
      continue;
    }
    if (el.type !== "text" && el.type !== "parameter" && el.type !== "date" && el.type !== "pageNumber") {
      continue;
    }
    const ck = zoneParamKey(el.id);
    const bound = cellText(values[ck]);
    let text = "";
    const pageMode = el.type === "pageNumber" ? normalizePageNumberMode(el.pageNumberMode) : "plain";
    if (el.type === "pageNumber") {
      // 与 previewZoneElementDisplay 一致：页码模式优先于绑定占位
      text = formatPageNumberDisplay(pageMode, pageNum, totalPages);
    } else if (el.type === "date") {
      // 与 Mini formatTplDate / previewZoneElementDisplay：按 dateFormat 格式化「现在」
      text = bound.trim() || formatLayoutDate(new Date(), el.dateFormat || "yyyy-MM-dd");
    } else if (bound) {
      // 绑定成功时不回落控件占位文案（如 {{value}} / SQL·温度）
      text = bound;
    } else {
      text = String(el.text || "");
    }
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
    const size = scaledFontSize(el.fontSize, ZONE_FONT_SCALE, 10, 7);
    if (el.type === "pageNumber" && pageMode === "circle") {
      const ink = parseCssColor(el.color, rgb(0.08, 0.08, 0.08));
      const cx = box.x + box.w / 2;
      const cy = box.yBottom + box.h / 2;
      const r = Math.max(4, Math.min(box.w, box.h) / 2 - 0.75);
      try {
        page.drawCircle({
          x: cx,
          y: cy,
          size: r,
          borderColor: ink,
          borderWidth: 1.1,
          color:
            el.bgColor && el.bgColor !== "transparent" && el.bgColor !== "none"
              ? parseCssColor(el.bgColor, rgb(1, 1, 1))
              : undefined,
        });
      } catch {
        /* ignore circle draw errors */
      }
      drawWrappedInBox(
        page,
        font,
        text,
        cx - r + 1,
        cy + r - 1,
        r * 2 - 2,
        r * 2 - 2,
        size,
        useWinAnsi,
        undefined,
        "center",
        "center",
      );
      continue;
    }
    // 不用自定义 color：部分环境下带 color 的 drawText 对 subset TTF 会静默失败
    drawWrappedInBox(
      page,
      font,
      text,
      box.x + 2,
      box.topY - 1,
      box.w - 4,
      box.h - 2,
      size,
      useWinAnsi,
      undefined,
      el.alignX ?? "start",
      el.alignY ?? "center",
    );
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
  // 与 Mini 正文表：控件字号 ×0.8，并受行高约束
  const fontSize = Math.max(
    6,
    Math.min(11, scaledFontSize(el.fontSize, BODY_FONT_SCALE, 12), rowH * 0.55),
  );
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
        undefined,
        el.alignX ?? "center",
        el.alignY ?? "center",
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
    const text =
      el.type === "date"
        ? bound.trim() || formatLayoutDate(new Date(), el.dateFormat || "HH:mm:ss")
        : bound || String(el.text || "");
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
    const size = scaledFontSize(el.fontSize, BODY_FONT_SCALE, 11, 7);
    const color = parseCssColor(el.color, rgb(0.08, 0.08, 0.08));
    drawWrappedInBox(
      page,
      font,
      text,
      box.x + 2,
      box.topY - 1,
      box.w - 4,
      box.h - 2,
      size,
      useWinAnsi,
      color,
      el.alignX ?? "start",
      el.alignY ?? "center",
    );
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
  const fill = el.tableSqlFill?.enabled ? el.tableSqlFill : null;
  const fillPv = fill ? values[templateTableSqlFillPreviewKey(el.id)]?.tableSqlFill ?? null : null;

  const staticCell = (r: number, c: number) =>
    cellText(values[cellKey(el.id, r, c)]) || String(grid[r]?.[c]?.text || "");

  const sqlCell = (vr: number, c: number, previewSlice?: TablePreviewRowSlice) => {
    if (!fill) return staticCell(vr, c);
    const t = formatSqlFillTableCellPreview({
      fill,
      rowIndex: vr,
      colIndex: c,
      preview: fillPv,
      previewSlice,
      errorMaxLen: 48,
      labelPreview: { elId: el.id, values },
    });
    return t === "\u00a0" ? "" : t;
  };

  if (fill) {
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
          for (let c = 0; c < cols; c++) out.push(sqlCell(vr, c, slice));
          return out;
        },
      });
      return;
    }
    const dataN = fillPv?.dataRows?.length ?? 0;
    const displayData = sqlFillDisplayDataRowCount(fill, dataN);
    const visualRows = Math.min(80, Math.max(1, 1 + displayData));
    const fillH = tableSqlFillVerticalChromePx() + visualRows * rowHFallback;
    drawTableGrid(page, font, el, pageH, useWinAnsi, {
      xPx,
      yPx,
      hPx: Math.max(hPx, fillH),
      visualRows,
      rowTexts: (vr) => {
        const out: string[] = [];
        for (let c = 0; c < cols; c++) out.push(sqlCell(vr, c));
        return out;
      },
    });
    return;
  }

  const rows = Math.min(el.tableRows || grid.length || 0, 80);
  if (rows < 1 || cols < 1) return;
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

  const cards = opts.bodyCards ?? computeExpandedBodyPreviewCards(tmpl, previewValues);
  const hasCover = Boolean(
    tmpl.coverElements?.length || tmpl.coverHeaderElements?.length || tmpl.coverFooterElements?.length,
  );
  const hasBack = Boolean(
    tmpl.backElements?.length || tmpl.backHeaderElements?.length || tmpl.backFooterElements?.length,
  );
  const bodyPageN = cards.length > 0 ? cards.length : 1;
  // 与下方 paint 顺序一致，供 slashTotal / cnPage 使用
  let plannedTotal = (hasCover ? 1 : 0) + bodyPageN + (hasBack ? 1 : 0);
  if (plannedTotal < 1) plannedTotal = 1;

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
    const pageNum = pageCount;
    const totalPages = Math.max(plannedTotal, pageNum);
    const contentX = metrics.contentLeft * PX_TO_PT;
    const contentW = metrics.contentW * PX_TO_PT;
    const contentH = metrics.contentH * PX_TO_PT;
    const contentY = pageH - (metrics.contentTop + metrics.contentH) * PX_TO_PT;
    // D1：与 Mini 页带底色对齐（替代仅描边内容框）
    if (metrics.hb > 0) {
      const hb = metrics.hb * PX_TO_PT;
      const hy = pageH - (metrics.mt + metrics.hb) * PX_TO_PT;
      page.drawRectangle({
        x: metrics.ml * PX_TO_PT,
        y: hy,
        width: contentW,
        height: hb,
        color: MINI_BAND_BG,
      });
    }
    if (metrics.fb > 0) {
      const fb = metrics.fb * PX_TO_PT;
      const fy = metrics.mb * PX_TO_PT;
      page.drawRectangle({
        x: metrics.ml * PX_TO_PT,
        y: fy,
        width: contentW,
        height: fb,
        color: MINI_BAND_BG,
      });
    }
    page.drawRectangle({
      x: contentX,
      y: contentY,
      width: contentW,
      height: contentH,
      color: MINI_BODY_BG,
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
        pageNum,
        totalPages,
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
        pageNum,
        totalPages,
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
        pageNum,
        totalPages,
        bandW,
      );
    }
  };

  if (hasCover) {
    paintPage(
      "cover",
      tmpl.coverElements || [],
      tmpl.coverHeaderElements || [],
      tmpl.coverFooterElements || [],
      null,
    );
  }

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

  if (hasBack) {
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
