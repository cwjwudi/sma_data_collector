import { describe, expect, it } from "vitest";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  clampTableElementOuterSize,
  createTemplate,
  ensureBodyPages,
  hydrateTemplateElement,
} from "@/lib/report-template/model";
import { hydrateTableSqlFill } from "@/lib/report-template/table-sql-fill";
import { computeExpandedBodyPreviewCards } from "@/lib/report-template/table-sql-fill-export-preview-split";
import { computeSqlFillLogicalRowHeightsPx } from "@/lib/report-template/table-sql-fill-layout-utils";
import {
  formatSqlFillTableCellPreview,
  templateTableSqlFillPreviewKey,
} from "@/lib/report-template/table-sql-fill-preview";

function makeTemplateWithBodyTable(el: ReturnType<typeof hydrateTemplateElement>) {
  const b = blankZonesSnapshot();
  const tmpl = createTemplate({
    name: "sql-frag",
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

describe("SQL fill row fragment pagination (P1-B)", () => {
  it("ultra-tall single data row splits across preview cards with line coverage", () => {
    const long = "报警描述".repeat(400);
    const tb = hydrateTemplateElement({
      id: "sql-tall",
      type: "table",
      tableRows: 2,
      tableCols: 1,
      tableRowHeightPx: 28,
      x: 10,
      y: 40,
      w: 80,
      fontSize: 12,
      tableSqlFill: hydrateTableSqlFill({
        enabled: true,
        layoutMode: "horizontal",
        maxRows: 2000,
        repeatHeaderOnPageBreak: true,
        resultColumnNames: ["desc"],
        columnRoles: ["field"],
      }),
    });
    clampTableElementOuterSize(tb, 800, 20000);
    const tmpl = makeTemplateWithBodyTable(tb);
    const key = templateTableSqlFillPreviewKey(tb.id);
    const previewValues = {
      [key]: { text: "", tableSqlFill: { dataRows: [[long]] } },
    };
    const cards = computeExpandedBodyPreviewCards(tmpl, previewValues);
    const tableCards = cards.filter((c) => c.sqlFillTableSlices?.["sql-tall"]);
    expect(tableCards.length).toBeGreaterThan(1);
    let lineCovered = 0;
    for (const c of tableCards) {
      const s = c.sqlFillTableSlices!["sql-tall"]!;
      expect(s.dataRowStart).toBe(0);
      expect(s.dataRowCount).toBe(1);
      expect(s.includeHeaderRow).toBe(true);
      expect(s.rowTextLineStart ?? 0).toBe(lineCovered);
      lineCovered = s.rowTextLineEnd ?? lineCovered;
    }
    expect(lineCovered).toBeGreaterThan(1);

    // 续页仍带表头；文案片段拼接还原
    const joined = tableCards
      .map((c) => {
        const s = c.sqlFillTableSlices!["sql-tall"]!;
        return formatSqlFillTableCellPreview({
          fill: tb.tableSqlFill!,
          rowIndex: 1,
          colIndex: 0,
          preview: previewValues[key].tableSqlFill,
          previewSlice: s,
          colWidthsPx: [80],
          fontSizePx: Math.max(10, 12 * 0.85),
        });
      })
      .join("");
    expect(joined).toBe(long);
  });

  it("fragment slice heights are smaller than full-row uncapped height", () => {
    const long = "报警描述".repeat(80);
    const tb = hydrateTemplateElement({
      id: "sql-h",
      type: "table",
      tableRows: 2,
      tableCols: 1,
      tableRowHeightPx: 28,
      w: 100,
      fontSize: 12,
      tableSqlFill: hydrateTableSqlFill({
        enabled: true,
        layoutMode: "horizontal",
        resultColumnNames: ["desc"],
        columnRoles: ["field"],
      }),
    });
    const preview = { dataRows: [[long]] };
    const full = computeSqlFillLogicalRowHeightsPx(tb, preview, 1, null, { uncapped: true });
    const fragH = computeSqlFillLogicalRowHeightsPx(
      tb,
      preview,
      1,
      {
        dataRowStart: 0,
        dataRowCount: 1,
        includeHeaderRow: true,
        rowTextLineStart: 0,
        rowTextLineEnd: 3,
        rowFragment: true,
      },
      { uncapped: true },
    );
    // full: [header, data]; frag: [header, truncated data]
    expect(full[1]).toBeGreaterThan(fragH[1]!);
  });

  it("format without fragment fields equals full cell text", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      layoutMode: "horizontal",
      resultColumnNames: ["a"],
      columnRoles: ["field"],
    });
    const pv = { dataRows: [["完整内容"]] };
    const full = formatSqlFillTableCellPreview({
      fill,
      rowIndex: 1,
      colIndex: 0,
      preview: pv,
    });
    const withSlice = formatSqlFillTableCellPreview({
      fill,
      rowIndex: 1,
      colIndex: 0,
      preview: pv,
      previewSlice: { dataRowStart: 0, dataRowCount: 1, includeHeaderRow: true },
      colWidthsPx: [200],
      fontSizePx: 12,
    });
    expect(withSlice).toBe(full);
  });
});
