/**
 * 035 档 1：pdf-lib 坐标版式导出（layout-v2）。
 * 按编辑器 CSS px（96dpi）映射到 PDF pt（72dpi）；画文本框/表格线，不走 printToPDF。
 */
import { rgb, type PDFFont, type PDFPage, type PDFDocument } from "pdf-lib";
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import { cellKey } from "@/lib/report-template/binding-preview-utils";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureBodyPages, ensureTableGrid } from "@/lib/report-template/model";
import { PAPER_PRESETS, type PaperKind } from "@/lib/report-template/paper";
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

/** 编辑器坐标：原点左上；PDF：原点左下 */
function elBoxPt(el: { x: number; y: number; w: number; h: number }, pageH: number) {
  const x = el.x * PX_TO_PT;
  const h = Math.max(4, el.h * PX_TO_PT);
  const w = Math.max(4, el.w * PX_TO_PT);
  const yBottom = pageH - el.y * PX_TO_PT - h;
  return { x, yBottom, w, h, topY: yBottom + h };
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

function drawTemplateElement(
  page: PDFPage,
  font: PDFFont,
  el: TemplateElement,
  pageH: number,
  values: Record<string, BindingPreviewCell | undefined>,
  useWinAnsi: boolean,
): void {
  const box = elBoxPt(el, pageH);
  if (el.type === "text" || el.type === "parameter" || el.type === "date") {
    const ck = cellKey(el.id, 0, 0);
    const bound = cellText(values[ck]);
    const text = bound || String(el.text || "");
    if (!text.trim()) return;
    const size = Math.max(7, Number(el.fontSize) || 11);
    drawWrappedInBox(page, font, text, box.x, box.topY, box.w, box.h, size, useWinAnsi);
    return;
  }
  if (el.type === "table") {
    const grid = ensureTableGrid(el);
    const rows = Math.min(grid.rows || 0, 80);
    const cols = Math.min(grid.cols || 0, 16);
    if (rows < 1 || cols < 1) return;
    page.drawRectangle({
      x: box.x,
      y: box.yBottom,
      width: box.w,
      height: box.h,
      borderColor: rgb(0.25, 0.25, 0.25),
      borderWidth: 0.6,
    });
    const sqlKey = templateTableSqlFillPreviewKey(el.id);
    const sqlPayload = values[sqlKey] as
      | { ok?: boolean; columns?: string[]; rows?: Record<string, unknown>[] }
      | undefined;
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
    if (sqlPayload?.ok && Array.isArray(sqlPayload.rows) && sqlPayload.rows.length) {
      const colsNames = (sqlPayload.columns || Object.keys(sqlPayload.rows[0] || {})).slice(0, cols);
      for (let r = 0; r < Math.min(rows, sqlPayload.rows.length + 1); r++) {
        for (let c = 0; c < colsNames.length; c++) {
          const name = colsNames[c]!;
          let text = "";
          if (r === 0) text = name;
          else {
            const v = sqlPayload.rows[r - 1]?.[name];
            text = v == null ? "" : String(v);
          }
          const cellTop = box.yBottom + box.h - r * rowH;
          drawWrappedInBox(
            page,
            font,
            text,
            box.x + c * colW + pad,
            cellTop - pad,
            colW - pad * 2,
            rowH - pad * 2,
            Math.max(6, Math.min(10, rowH * 0.55)),
            useWinAnsi,
          );
        }
      }
      return;
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ck = cellKey(el.id, r, c);
        const text = cellText(values[ck]) || "";
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
          Math.max(6, Math.min(10, rowH * 0.55)),
          useWinAnsi,
        );
      }
    }
  }
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

  const paintPage = (bodyEls: TemplateElement[], headerEls: LayoutZoneElement[], footerEls: LayoutZoneElement[]) => {
    const page = doc.addPage([pageW, pageH]);
    pageCount += 1;
    // 内容区淡线（便于对照，低对比）
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
    drawZoneElements(page, font, headerEls, pageH, previewValues, useWinAnsi);
    for (const el of bodyEls) {
      drawTemplateElement(page, font, el, pageH, previewValues, useWinAnsi);
    }
    drawZoneElements(page, font, footerEls, pageH, previewValues, useWinAnsi);
  };

  if (tmpl.coverElements?.length) {
    paintPage(tmpl.coverElements, tmpl.coverHeaderElements || [], tmpl.coverFooterElements || []);
  }

  for (const pageEls of ensureBodyPages(tmpl)) {
    paintPage(pageEls || [], tmpl.headerElements || [], tmpl.footerElements || []);
  }

  if (tmpl.backElements?.length) {
    paintPage(tmpl.backElements, tmpl.backHeaderElements || [], tmpl.backFooterElements || []);
  }

  if (pageCount === 0) {
    paintPage([], tmpl.headerElements || [], tmpl.footerElements || []);
  }
  return pageCount;
}
