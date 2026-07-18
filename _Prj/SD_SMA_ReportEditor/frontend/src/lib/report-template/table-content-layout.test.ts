import { describe, expect, it } from "vitest";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  clampTableElementOuterSize,
  createTemplate,
  ensureBodyPages,
  ensureTableGrid,
  hydrateTemplateElement,
  intrinsicOuterHeightForTemplateTable,
} from "@/lib/report-template/model";
import {
  buildLogicalRowSlicesForOverflow,
  computeTemplateTableContentRowHeightsPx,
  makeStaticTableSplitRow,
  outerHeightFromTableRowHeightsPx,
  rowsFitInAvailWithHeights,
  templateTableExceedsPageRemaining,
} from "@/lib/report-template/table-content-layout";
import {
  resolveStaticTableCellDisplayText,
  shortBindingKindLabel,
} from "@/lib/report-template/binding-preview-utils";
import { estimateWrappedTextHeightUncappedPx } from "@/lib/report-template/table-cell-metrics";
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

  it("OPC binding NodeId does not inflate row height; preview value does", () => {
    const tb = hydrateTemplateElement({
      id: "t-opc",
      type: "table",
      tableRows: 1,
      tableCols: 1,
      tableRowHeightPx: 20,
      w: 100,
      fontSize: 12,
    });
    const cell = tb.tableCells?.[0]?.[0];
    if (cell) {
      cell.bindingKind = "opcua";
      cell.opcuaNodeId =
        "ns=2;s=Program.Very.Long.OpcUa.Node.Path.That.Would.Wrap.Many.Times.If.Used.For.Layout";
    }
    const byNodeId = computeTemplateTableContentRowHeightsPx(tb);
    expect(byNodeId[0]).toBe(20);

    const byValue = computeTemplateTableContentRowHeightsPx(tb, () => "OK");
    expect(byValue[0]).toBe(20);

    const longValue =
      "这是一段很长很长很长很长很长很长很长很长很长很长很长很长很长很长的变量内容用于触发换行";
    const byLongValue = computeTemplateTableContentRowHeightsPx(tb, () => longValue);
    expect(byLongValue[0]).toBeGreaterThan(20);
  });

  it("unbound OPC display short label does not wrap like NodeId", () => {
    const cell = {
      bindingKind: "opcua" as const,
      opcuaNodeId:
        "ns=6;s=::AsGlobalPV:gDataReportName.TabletMoldZ.Extra.Long.Path.That.Would.Wrap",
      text: "",
    };
    const display = resolveStaticTableCellDisplayText({
      cell,
      previewCell: undefined,
      loading: false,
    });
    expect(display).toBe("⟨UA⟩");
    expect(display).toBe(shortBindingKindLabel("opcua"));
    expect(display.length).toBeLessThan(10);
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

  it("rowsFitInAvailWithHeights returns 0 when first row exceeds usable (no force-clip)", () => {
    // chrome≈9 → usable≈21 < 80 → 整行放不下，交由行内拆分/换页
    expect(rowsFitInAvailWithHeights(30, [80, 80], 28)).toBe(0);
  });

  it("buildLogicalRowSlicesForOverflow splits a single ultra-tall row by text lines", () => {
    const tall = 900;
    const nextPage = 220;
    const slices = buildLogicalRowSlicesForOverflow({
      rowHeights: [tall],
      firstPageAvailOuterPx: nextPage,
      nextPageAvailOuterPx: nextPage,
      fallbackRowH: 28,
      splitRow: (_ri, availInner, lineStart) => {
        // 模拟：每页约吃 5 行视觉文本，总 20 行
        const totalLines = 20;
        const lineH = 40;
        const take = Math.max(0, Math.floor(availInner / lineH));
        if (take <= 0 || lineStart >= totalLines) return null;
        const lineEnd = Math.min(totalLines, lineStart + take);
        return { lineEnd, heightPx: (lineEnd - lineStart) * lineH, totalLines };
      },
    });
    expect(slices.length).toBeGreaterThan(1);
    let lineCovered = 0;
    for (const s of slices) {
      expect(s.dataRowStart).toBe(0);
      expect(s.dataRowCount).toBe(1);
      expect(s.rowTextLineStart).toBe(lineCovered);
      expect(s.rowTextLineEnd).toBeGreaterThan(lineCovered);
      lineCovered = s.rowTextLineEnd!;
    }
    expect(lineCovered).toBe(20);
  });

  it("first-page leftover takes a fragment prefix then continues on next page", () => {
    const slices = buildLogicalRowSlicesForOverflow({
      rowHeights: [400, 40],
      firstPageAvailOuterPx: 100,
      nextPageAvailOuterPx: 500,
      fallbackRowH: 28,
      splitRow: (_ri, availInner, lineStart) => {
        const totalLines = 10;
        const take = Math.max(0, Math.floor(availInner / 36));
        if (take <= 0 || lineStart >= totalLines) return null;
        const lineEnd = Math.min(totalLines, lineStart + take);
        return { lineEnd, heightPx: (lineEnd - lineStart) * 36, totalLines };
      },
    });
    expect(slices[0]?.dataRowStart).toBe(0);
    expect(slices[0]?.rowFragment).toBe(true);
    expect(slices[0]?.rowTextLineStart).toBe(0);
    // 后续应续完第 0 行再放第 1 行
    const last = slices[slices.length - 1];
    expect(last.dataRowStart + last.dataRowCount).toBe(2);
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

  it("static ultra-tall cell produces fragment slices covering all text lines", () => {
    const longText = "报警描述".repeat(120);
    const tb = hydrateTemplateElement({
      id: "static-tall",
      type: "table",
      tableRows: 1,
      tableCols: 1,
      tableRowHeightPx: 28,
      x: 10,
      y: 40,
      w: 120,
      fontSize: 12,
    });
    ensureTableGrid(tb);
    tb.tableCells![0]![0]!.text = longText;
    clampTableElementOuterSize(tb, 800, 20000);
    const uncapped = estimateWrappedTextHeightUncappedPx({
      text: longText,
      widthPx: 100,
      fontSizePx: Math.max(10, 12 * 0.85),
      minHeightPx: 28,
    });
    expect(uncapped).toBeGreaterThan(400);
    const heights = computeTemplateTableContentRowHeightsPx(tb, undefined, { uncapped: true });
    const slices = buildLogicalRowSlicesForOverflow({
      rowHeights: heights,
      firstPageAvailOuterPx: 300,
      nextPageAvailOuterPx: 300,
      fallbackRowH: 28,
      splitRow: makeStaticTableSplitRow(tb),
    });
    expect(slices.length).toBeGreaterThan(1);
    let lineCovered = 0;
    for (const s of slices) {
      expect(s.dataRowCount).toBe(1);
      expect(s.rowTextLineStart ?? 0).toBe(lineCovered);
      lineCovered = s.rowTextLineEnd ?? lineCovered;
    }
    expect(lineCovered).toBeGreaterThan(0);
  });
});
