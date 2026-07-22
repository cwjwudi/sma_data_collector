import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  clampTableElementOuterSize,
  createTemplate,
  ensureBodyPages,
  hydrateTemplateElement,
} from "@/lib/report-template/model";
import { appendPdfLibLayoutV2Pages } from "@/lib/report-template/pdf-lib-layout-v2-render";
import { computeExpandedBodyPreviewCards } from "@/lib/report-template/table-sql-fill-export-preview-split";

function makeTemplateWithBodyTable(el: ReturnType<typeof hydrateTemplateElement>) {
  const b = blankZonesSnapshot();
  const tmpl = createTemplate({
    name: "layout-v2",
    paperKind: "A4",
    orientation: "portrait",
    layoutPresetId: null,
    layoutSnapshot: b.layoutSnapshot,
    headerText: "",
    footerText: "",
    headerElements: [],
    footerElements: [],
    coverLayoutPresetId: null,
    coverLayoutSnapshot: b.layoutSnapshot,
    coverHeaderText: "",
    coverFooterText: "",
    coverHeaderElements: [],
    coverFooterElements: [],
    coverBodyZoneElements: [],
    backLayoutPresetId: null,
    backLayoutSnapshot: b.layoutSnapshot,
    backHeaderText: "",
    backFooterText: "",
    backHeaderElements: [],
    backFooterElements: [],
    backBodyZoneElements: [],
  });
  ensureBodyPages(tmpl)[0].splice(0, ensureBodyPages(tmpl)[0].length, el);
  return tmpl;
}

describe("pdf-lib-layout-v2-render", () => {
  it("emits one PDF page per bodyCard for overflowing static table", async () => {
    const tb = hydrateTemplateElement({
      id: "static-ov",
      type: "table",
      tableRows: 40,
      tableCols: 2,
      tableRowHeightPx: 36,
      x: 10,
      y: 40,
      w: 500,
    });
    clampTableElementOuterSize(tb, 800, 20000);
    const tmpl = makeTemplateWithBodyTable(tb);
    const cards = computeExpandedBodyPreviewCards(tmpl, {});
    const tableCards = cards.filter((c) => c.sqlFillTableSlices?.["static-ov"]);
    expect(tableCards.length).toBeGreaterThan(1);

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pageCount = appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: true,
      bodyCards: cards,
    });
    expect(pageCount).toBe(cards.length);
    expect(doc.getPageCount()).toBe(cards.length);
  });

  it("single short page still produces one page", async () => {
    const tb = hydrateTemplateElement({
      id: "short",
      type: "table",
      tableRows: 2,
      tableCols: 2,
      tableRowHeightPx: 24,
      x: 10,
      y: 40,
      w: 200,
    });
    const tmpl = makeTemplateWithBodyTable(tb);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pageCount = appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: true,
    });
    expect(pageCount).toBeGreaterThanOrEqual(1);
  });
});
