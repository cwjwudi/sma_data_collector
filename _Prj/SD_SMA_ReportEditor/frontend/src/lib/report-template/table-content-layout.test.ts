import { describe, expect, it } from "vitest";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  clampTableElementOuterSize,
  createTemplate,
  ensureBodyPages,
  hydrateTemplateElement,
  intrinsicOuterHeightForTemplateTable,
} from "@/lib/report-template/model";
import {
  buildLogicalRowSlicesForOverflow,
  computeTemplateTableContentRowHeightsPx,
  outerHeightFromTableRowHeightsPx,
  rowsFitInAvailWithHeights,
  templateTableExceedsPageRemaining,
} from "@/lib/report-template/table-content-layout";
import { computeExpandedBodyPreviewCards } from "@/lib/report-template/table-sql-fill-export-preview-split";

function makeTemplateWithBodyTable(el: ReturnType<typeof hydrateTemplateElement>) {
  const b = blankZonesSnapshot();
  const tmpl = createTemplate({
    name: "overflow",
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

describe("table-content-layout", () => {
  it("computeTemplateTableContentRowHeightsPx raises rows with wrapping text", () => {
    const tb = hydrateTemplateElement({
      id: "t1",
      type: "table",
      tableRows: 2,
      tableCols: 1,
      tableRowHeightPx: 20,
      w: 80,
      fontSize: 12,
    });
    const c0 = tb.tableCells?.[0]?.[0];
    const c1 = tb.tableCells?.[1]?.[0];
    if (c0) c0.text = "短";
    if (c1) c1.text = "这是一段很长很长很长很长很长很长很长很长很长很长很长很长很长很长的文案用于触发换行";
    clampTableElementOuterSize(tb, 800, 5000);
    const heights = computeTemplateTableContentRowHeightsPx(tb);
    expect(heights).toHaveLength(2);
    expect(heights[0]).toBe(20);
    expect(heights[1]).toBeGreaterThan(20);
    expect(tb.h).toBe(intrinsicOuterHeightForTemplateTable(tb));
  });

  it("buildLogicalRowSlicesForOverflow covers all rows without gaps", () => {
    const heights = [40, 40, 40, 40, 40, 40, 40, 40];
    const slices = buildLogicalRowSlicesForOverflow({
      rowHeights: heights,
      firstPageAvailOuterPx: 120,
      nextPageAvailOuterPx: 200,
      fallbackRowH: 40,
    });
    expect(slices.length).toBeGreaterThan(1);
    let covered = 0;
    for (const s of slices) {
      expect(s.dataRowStart).toBe(covered);
      expect(s.includeHeaderRow).toBe(false);
      covered += s.dataRowCount;
    }
    expect(covered).toBe(heights.length);
  });

  it("rowsFitInAvailWithHeights keeps at least one row", () => {
    expect(rowsFitInAvailWithHeights(30, [80, 80], 28)).toBe(1);
  });

  it("templateTableExceedsPageRemaining detects overflow", () => {
    const tb = hydrateTemplateElement({
      id: "ov",
      type: "table",
      tableRows: 20,
      tableCols: 2,
      tableRowHeightPx: 40,
      y: 500,
      w: 400,
    });
    clampTableElementOuterSize(tb, 800, 5000);
    const need = outerHeightFromTableRowHeightsPx(
      computeTemplateTableContentRowHeightsPx(tb),
      tb.tableRowHeightPx,
    );
    expect(need).toBeGreaterThan(100);
    expect(templateTableExceedsPageRemaining(tb, 600)).toBe(true);
  });

  it("static table overflow preview cards do not drop rows", () => {
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
    let covered = 0;
    for (const c of tableCards) {
      const slice = c.sqlFillTableSlices!["static-ov"]!;
      expect(slice.dataRowStart).toBe(covered);
      covered += slice.dataRowCount;
    }
    expect(covered).toBe(40);
  });
});
