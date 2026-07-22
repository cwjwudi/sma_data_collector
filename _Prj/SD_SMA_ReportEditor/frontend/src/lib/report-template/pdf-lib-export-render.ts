/**
 * 030 / 035：无 printToPDF 的 pdf-lib 导出。
 * - draft-v1：流式仅内容（档 0）
 * - layout-v2：坐标版式（档 1）
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import {
  cellKey,
  forEachTemplateCanvasElement,
  forEachZoneLayoutElement,
  paramKey,
  zoneParamKey,
} from "@/lib/report-template/binding-preview-utils";
import { buildExportPreviewReports } from "@/lib/report-template/export-preview-reports";
import type { ReportTemplate, TemplateElement } from "@/lib/report-template/model";
import { ensureTableGrid } from "@/lib/report-template/model";
import { PAPER_PRESETS, type PaperKind } from "@/lib/report-template/paper";
import {
  BUNDLED_CJK_FAMILY,
  bundledFamilyLabel,
  type BundledFontId,
} from "@/lib/report-template/font-availability";
import {
  formatSqlFillTableCellPreview,
  sqlFillDisplayDataRowCount,
  templateTableSqlFillPreviewKey,
} from "@/lib/report-template/table-sql-fill-preview";
import { appendPdfLibLayoutV2Pages } from "@/lib/report-template/pdf-lib-layout-v2-render";

export type PdfLibLayoutFidelity = "draft-v1" | "layout-v2";

const BUNDLED_FONT_URLS: Record<BundledFontId, string[]> = {
  "noto-sans-sc": [
    "/resources/fonts/NotoSansSC-Regular.ttf",
    "./resources/fonts/NotoSansSC-Regular.ttf",
    "/resources/fonts/NotoSansSC-Regular.otf",
    "./resources/fonts/NotoSansSC-Regular.otf",
  ],
  fangsong: [
    "/resources/fonts/ZhuqueFangsong-Regular.ttf",
    "./resources/fonts/ZhuqueFangsong-Regular.ttf",
  ],
};

export type PdfLibExportMeta = {
  engine: "pdf-lib";
  layoutFidelity: PdfLibLayoutFidelity;
  fontFamily: string;
  fontEmbedded: boolean;
  pageCount: number;
  pdfLibMs: number;
  printToPDFSkipped: true;
};

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

/** CFF/OTTO（如 NotoSansSC.otf）：pdf-lib fontkit subset 会把 CJK 映成乱码字形 */
function isOttoCffFont(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x4f
  );
}

async function loadBundledFontBytes(
  fontBytesBase64?: string | null,
  fontId: BundledFontId = "noto-sans-sc",
): Promise<Uint8Array | null> {
  if (fontBytesBase64 && fontBytesBase64.length > 1000) {
    try {
      return decodeBase64ToBytes(fontBytesBase64);
    } catch {
      /* fall through */
    }
  }
  const candidates = [...(BUNDLED_FONT_URLS[fontId] || BUNDLED_FONT_URLS["noto-sans-sc"])];
  const custom = (window as unknown as { __SD_SMA_BUNDLED_FONT_URL__?: string }).__SD_SMA_BUNDLED_FONT_URL__;
  if (custom) candidates.unshift(custom);

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 1000) return new Uint8Array(buf);
    } catch {
      /* try next */
    }
  }
  return null;
}

function drawWrapped(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  lineHeight: number,
  useWinAnsi: boolean,
): number {
  const raw = useWinAnsi ? sanitizeForWinAnsi(text) : text;
  const words = raw.split(/(\s+)/);
  let line = "";
  let cy = y;
  const drawLine = (s: string) => {
    if (!s) return;
    try {
      page.drawText(s, { x, y: cy, size, font, color: rgb(0.1, 0.1, 0.1) });
    } catch {
      page.drawText(sanitizeForWinAnsi(s), { x, y: cy, size, font, color: rgb(0.1, 0.1, 0.1) });
    }
    cy -= lineHeight;
  };
  for (const w of words) {
    const trial = line + w;
    let width = 0;
    try {
      width = font.widthOfTextAtSize(trial, size);
    } catch {
      width = trial.length * size * 0.5;
    }
    if (width > maxWidth && line) {
      drawLine(line);
      line = w.trimStart();
    } else {
      line = trial;
    }
  }
  if (line) drawLine(line);
  return cy;
}

/**
 * 渲染当前分卷 PDF（Uint8Array）。
 */
export async function renderPdfLibExportPart(opts: {
  tmpl: ReportTemplate;
  previewValues: Record<string, BindingPreviewCell | undefined>;
  reportPartIndex: number | null;
  /** 主进程 IPC 读入的随包字体 base64；缺省则尝试 fetch / Helvetica */
  fontBytesBase64?: string | null;
  /** 随包字体 id；默认 Noto Sans SC */
  bundledFontId?: BundledFontId | null;
  /** 缺省 draft-v1；档 1 传 layout-v2 */
  layoutFidelity?: PdfLibLayoutFidelity | string | null;
}): Promise<{ bytes: Uint8Array; meta: PdfLibExportMeta }> {
  const t0 = Date.now();
  const fidelity: PdfLibLayoutFidelity =
    String(opts.layoutFidelity || "").toLowerCase() === "layout-v2" ? "layout-v2" : "draft-v1";
  const reports = buildExportPreviewReports(opts.tmpl, opts.previewValues, opts.reportPartIndex);
  const report = reports[0];
  if (!report) throw new Error("pdf-lib：无预览分卷");

  const doc = await PDFDocument.create();
  // pdf-lib 嵌入自定义字体（OTF/TTF + subset）必须先注册 fontkit（033）
  doc.registerFontkit(fontkit);
  // Noto OTF=OTTO 乱码；Noto TTF/VF + fontkit subset 在 Preview 缺字乱距 → 矢量默认朱雀仿宋
  let fontId: BundledFontId = "fangsong";
  let fontBytes = await loadBundledFontBytes(
    opts.bundledFontId === "fangsong" || !opts.bundledFontId ? opts.fontBytesBase64 : null,
    "fangsong",
  );
  if (!fontBytes || isOttoCffFont(fontBytes)) {
    fontBytes = await loadBundledFontBytes(null, "fangsong");
    if (fontBytes && isOttoCffFont(fontBytes)) fontBytes = null;
    if (!fontBytes) {
      try {
        const api = (
          window as unknown as {
            electronAPI?: {
              getBundledCjkFont?: (o: { key: string }) => Promise<{ ok?: boolean; base64?: string }>;
            };
          }
        ).electronAPI;
        const res = await api?.getBundledCjkFont?.({ key: "fangsong" });
        if (res?.ok && res.base64 && res.base64.length > 1000) {
          const b = decodeBase64ToBytes(res.base64);
          if (!isOttoCffFont(b)) fontBytes = b;
        }
      } catch {
        /* ignore */
      }
    }
  }
  let font: PDFFont;
  let fontEmbedded = false;
  let fontFamily = bundledFamilyLabel(fontId) || BUNDLED_CJK_FAMILY;
  if (fontBytes && !isOttoCffFont(fontBytes)) {
    try {
      font = await doc.embedFont(fontBytes, { subset: true });
      fontEmbedded = true;
    } catch {
      font = await doc.embedFont(StandardFonts.Helvetica);
      fontFamily = "Helvetica (fallback)";
    }
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
    fontFamily = "Helvetica (fallback)";
  }

  /** D15：目前仅安全嵌入朱雀仿宋；Noto subset 不可用，一律回落默认 font */
  const fontById = new Map<BundledFontId, PDFFont>();
  if (fontEmbedded) fontById.set("fangsong", font);
  if (fidelity === "layout-v2") {
    const pickFont = (_family?: string | null): PDFFont => fontById.get("fangsong") || font;
    const pageCount = await appendPdfLibLayoutV2Pages(doc, {
      tmpl: opts.tmpl,
      previewValues: report.previewValues,
      font,
      pickFont,
      useWinAnsi: !fontEmbedded,
      bodyCards: report.bodyCards,
    });
    const bytes = await doc.save();
    return {
      bytes,
      meta: {
        engine: "pdf-lib",
        layoutFidelity: "layout-v2",
        fontFamily,
        fontEmbedded,
        pageCount,
        pdfLibMs: Date.now() - t0,
        printToPDFSkipped: true,
      },
    };
  }
  const useWinAnsi = !fontEmbedded;
  const { w: pageW, h: pageH } = paperSizePt(opts.tmpl);
  const margin = 36;
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const title = String(opts.tmpl.name || "Report").trim() || "Report";
  page.drawText(useWinAnsi ? sanitizeForWinAnsi(title) : title, {
    x: margin,
    y,
    size: 14,
    font,
    color: rgb(0.05, 0.05, 0.05),
  });
  y -= 22;
  const partLabel = `part ${report.reportIndex + 1}/${report.totalReports} · engine=pdf-lib · fidelity=draft-v1`;
  page.drawText(partLabel, {
    x: margin,
    y,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 18;

  const values = report.previewValues;
  const zoneLines: string[] = [];
  forEachZoneLayoutElement(opts.tmpl, (el) => {
    if (el.type !== "text" && el.type !== "parameter" && el.type !== "date" && el.type !== "pageNumber") return;
    const bound = cellText(values[zoneParamKey(el.id)]);
    const raw = (bound || String(el.text || "")).trim();
    if (raw) zoneLines.push(raw);
  });
  for (const line of zoneLines.slice(0, 8)) {
    if (y < margin + 40) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
    y = drawWrapped(page, font, line, margin, y, 10, pageW - margin * 2, 12, useWinAnsi);
    y -= 4;
  }

  forEachTemplateCanvasElement(opts.tmpl, (el: TemplateElement) => {
    if (y < margin + 60) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
    if (el.type === "text" || el.type === "parameter" || el.type === "date") {
      const ck = paramKey(el.id);
      const bound = cellText(values[ck]);
      const text = bound || String(el.text || "");
      if (!text.trim()) return;
      y = drawWrapped(
        page,
        font,
        text,
        margin,
        y,
        Math.max(8, Number(el.fontSize) || 11),
        pageW - margin * 2,
        13,
        useWinAnsi,
      );
      y -= 6;
      return;
    }
    if (el.type === "table") {
      const grid = ensureTableGrid(el);
      const cols = Math.min(el.tableCols || grid[0]?.length || 1, 12);
      const sqlKey = templateTableSqlFillPreviewKey(el.id);
      const fill = el.tableSqlFill?.enabled ? el.tableSqlFill : null;
      const fillPv = fill ? values[sqlKey]?.tableSqlFill ?? null : null;
      const label = `[table ${el.id.slice(0, 8)}]`;
      page.drawText(useWinAnsi ? sanitizeForWinAnsi(label) : label, {
        x: margin,
        y,
        size: 9,
        font,
        color: rgb(0.2, 0.2, 0.5),
      });
      y -= 14;

      const drawTableLine = (parts: string[]) => {
        if (y < margin + 40) {
          page = doc.addPage([pageW, pageH]);
          y = pageH - margin;
        }
        const line = parts
          .map((t) => (t === "\u00a0" ? "" : t))
          .join(" | ");
        if (!line.replace(/\s|\|/g, "").trim()) return;
        y = drawWrapped(page, font, line, margin, y, 8, pageW - margin * 2, 10, useWinAnsi);
      };

      if (fill && fillPv?.dataRows?.length) {
        const dataN = fillPv.dataRows.length;
        const displayData = sqlFillDisplayDataRowCount(fill, dataN);
        const visualRows = Math.min(61, Math.max(1, 1 + displayData));
        for (let vr = 0; vr < visualRows; vr++) {
          const parts: string[] = [];
          for (let c = 0; c < cols; c++) {
            const t = formatSqlFillTableCellPreview({
              fill,
              rowIndex: vr,
              colIndex: c,
              preview: fillPv,
              errorMaxLen: 48,
              labelPreview: { elId: el.id, values },
            });
            parts.push(t);
          }
          drawTableLine(parts);
        }
        y -= 8;
        return;
      }

      const rows = Math.min(el.tableRows || grid.length || 0, 40);
      for (let r = 0; r < rows; r++) {
        const parts: string[] = [];
        for (let c = 0; c < cols; c++) {
          const ck = cellKey(el.id, r, c);
          parts.push(cellText(values[ck]) || String(grid[r]?.[c]?.text || ""));
        }
        drawTableLine(parts);
      }
      y -= 8;
    }
  });

  const bytes = await doc.save();
  return {
    bytes,
    meta: {
      engine: "pdf-lib",
      layoutFidelity: "draft-v1",
      fontFamily,
      fontEmbedded,
      pageCount: doc.getPageCount(),
      pdfLibMs: Date.now() - t0,
      printToPDFSkipped: true,
    },
  };
}

/** IPC 友好：base64 */
export async function renderPdfLibExportPartBase64(opts: {
  tmpl: ReportTemplate;
  previewValues: Record<string, BindingPreviewCell | undefined>;
  reportPartIndex: number | null;
  fontBytesBase64?: string | null;
  bundledFontId?: BundledFontId | null;
  layoutFidelity?: PdfLibLayoutFidelity | string | null;
}): Promise<{ pdfBase64: string; meta: PdfLibExportMeta }> {
  const { bytes, meta } = await renderPdfLibExportPart(opts);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { pdfBase64: btoa(binary), meta };
}
