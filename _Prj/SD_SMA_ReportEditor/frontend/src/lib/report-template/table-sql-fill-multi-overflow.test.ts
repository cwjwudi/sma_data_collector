import { describe, expect, it } from "vitest";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  createTemplate,
  ensureBodyPages,
  hydrateTemplateElement,
} from "@/lib/report-template/model";
import { metricsForSheet } from "@/lib/report-template/editor-sheet";
import {
  computeExpandedBodyPreviewCards,
  sqlFillTableNeedsPreviewPagination,
} from "@/lib/report-template/table-sql-fill-export-preview-split";
import {
  computeSqlFillLogicalRowHeightsPx,
  estimatedSqlFillTableBottomY,
} from "@/lib/report-template/table-sql-fill-layout-utils";
import {
  sqlFillDisplayDataRowCount,
  templateTableSqlFillPreviewKey,
} from "@/lib/report-template/table-sql-fill-preview";
import { sumTableRowHeightsPx } from "@/lib/report-template/table-cell-metrics";

describe("002 同页纵表页底截断未续页", () => {
  it("sumTableRowHeightsPx respects rowCount (does not sum past slice)", () => {
    expect(sumTableRowHeightsPx([10, 20, 30, 40], 20, 2)).toBe(30);
    expect(sumTableRowHeightsPx([10, 20], 20, 4)).toBe(10 + 20 + 20 + 20);
    expect(sumTableRowHeightsPx([], 20, 3)).toBe(60);
  });

  it("live smoke portrait vertical table at y=540 needs multi bodyCards", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { migrateReportTemplate } = await import("@/lib/report-template/model");
    const tplPath = path.join(
      process.env.APPDATA || "",
      "sd-sma-report-editor-ai/backend-data/templates/fbbf8a05-ae98-4e12-9f86-a77eed4a67d3.json",
    );
    if (!fs.existsSync(tplPath)) return;
    const tmpl = migrateReportTemplate(JSON.parse(fs.readFileSync(tplPath, "utf8")));
    const contentH = metricsForSheet(tmpl, "body").contentH;
    const page = ensureBodyPages(tmpl)[0];
    const vert = page.find(
      (e) => e.type === "table" && e.tableSqlFill?.enabled && e.tableSqlFill.layoutMode === "vertical",
    );
    expect(vert).toBeTruthy();
    const dataRows = [
      ["temp", "23.5", "C"],
      ["pressure", "1.02", "bar"],
      ["speed", "1200", "rpm"],
      ["count", "42", "pcs"],
    ];
    const previewValues: Record<string, { text: string; tableSqlFill: { dataRows: string[][] } }> = {};
    for (const el of page) {
      if (el.type === "table" && el.tableSqlFill?.enabled) {
        previewValues[templateTableSqlFillPreviewKey(el.id)] = {
          text: "",
          tableSqlFill: { dataRows },
        };
      }
    }
    const displayN = sqlFillDisplayDataRowCount(vert!.tableSqlFill!, dataRows.length);
    const heights = computeSqlFillLogicalRowHeightsPx(
      vert!,
      previewValues[templateTableSqlFillPreviewKey(vert!.id)].tableSqlFill,
      displayN,
      null,
      { uncapped: true },
    );
    const need = sqlFillTableNeedsPreviewPagination(
      vert!,
      displayN,
      contentH,
      dataRows.length,
      heights,
    );
    const cards = computeExpandedBodyPreviewCards(tmpl, previewValues);
    const diag = {
      need,
      displayN,
      y: vert!.y,
      contentH,
      bottom: estimatedSqlFillTableBottomY(vert!, displayN, heights),
      cards: cards.length,
      heightsSum: heights.reduce((a, b) => a + b, 0),
      availFirst: contentH - vert!.y,
      slices: cards.map((c) => c.sqlFillTableSlices[vert!.id]),
      hideFirst: cards[0]?.hideOverflowSqlFillTable,
    };
    expect(diag.need, JSON.stringify(diag)).toBe(true);
    expect(diag.cards, JSON.stringify(diag)).toBeGreaterThan(1);
    expect(cards.filter((c) => c.sqlFillTableSlices[vert!.id]).length, JSON.stringify(diag)).toBeGreaterThan(
      1,
    );
  });

  it("when first-page anchor cannot fit header, defer table to fresh-page cards", () => {
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "defer-anchor",
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
    const contentH = metricsForSheet(tmpl, "body").contentH;
    // 锚点几乎贴底：首屏放不下表头
    const y = contentH - 20;
    const vert = hydrateTemplateElement({
      id: "vert-deferred",
      type: "table",
      x: 40,
      y,
      w: 320,
      h: 80,
      tableRows: 4,
      tableCols: 2,
      tableRowHeightPx: 28,
      tableSqlFill: {
        enabled: true,
        fillMode: "visual",
        layoutMode: "vertical",
        verticalMultiRecordMode: "continue",
        querySql: "SELECT a,b,c FROM t",
        resultColumnNames: ["a", "b", "c"],
        columnRoles: ["field", "field", "field"],
        visualSource: {
          columns: ["a", "b", "c"],
          fieldLabels: ["A", "B", "C"],
        },
        repeatHeaderOnPageBreak: true,
      },
    });
    ensureBodyPages(tmpl)[0].splice(0, ensureBodyPages(tmpl)[0].length, vert);
    const dataRows = [
      ["1", "2", "3"],
      ["4", "5", "6"],
    ];
    const key = templateTableSqlFillPreviewKey(vert.id);
    const previewValues = { [key]: { text: "", tableSqlFill: { dataRows } } };
    const cards = computeExpandedBodyPreviewCards(tmpl, previewValues);
    expect(cards.length).toBeGreaterThan(1);
    expect(cards[0]?.hideOverflowSqlFillTable).toBe(true);
    expect(cards[0]?.sqlFillTableSlices?.[vert.id]).toBeUndefined();
    expect(cards.some((c) => c.sqlFillTableSlices[vert.id] && c.continuationHideOtherBodyElements)).toBe(
      true,
    );
  });

  it("vertical continue table near page bottom expands to multiple bodyCards", () => {
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "vert-overflow",
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
    const contentH = metricsForSheet(tmpl, "body").contentH;
    // 贴近页底，多条纵表记录必然超页
    const y = Math.max(40, contentH - 140);
    const vert = hydrateTemplateElement({
      id: "vert-near-bottom",
      type: "table",
      x: 40,
      y,
      w: 320,
      h: 140,
      tableRows: 4,
      tableCols: 2,
      tableRowHeightPx: 28,
      tableSqlFill: {
        enabled: true,
        fillMode: "visual",
        layoutMode: "vertical",
        verticalMultiRecordMode: "continue",
        querySql: "SELECT metric_name, metric_value, unit FROM t",
        resultColumnNames: ["metric_name", "metric_value", "unit"],
        columnRoles: ["field", "field", "field"],
        visualSource: {
          columns: ["metric_name", "metric_value", "unit"],
          fieldLabels: ["指标名", "数值", "单位"],
        },
        repeatHeaderOnPageBreak: true,
      },
    });
    // 同页上方另有一张横表 SQL 填充（不溢出），模拟冒烟「多表」
    const horiz = hydrateTemplateElement({
      id: "horiz-ok",
      type: "table",
      x: 40,
      y: 80,
      w: 520,
      h: 120,
      tableRows: 3,
      tableCols: 4,
      tableRowHeightPx: 24,
      tableSqlFill: {
        enabled: true,
        fillMode: "visual",
        layoutMode: "horizontal",
        querySql: "SELECT a,b,c,d FROM t",
        resultColumnNames: ["a", "b", "c", "d"],
        columnRoles: ["field", "field", "field", "field"],
      },
    });
    ensureBodyPages(tmpl)[0].splice(0, ensureBodyPages(tmpl)[0].length, horiz, vert);

    const dataRows = [
      ["temp", "23.5", "C"],
      ["pressure", "1.02", "bar"],
      ["speed", "1200", "rpm"],
      ["count", "42", "pcs"],
    ];
    const previewValues = {
      [templateTableSqlFillPreviewKey(horiz.id)]: {
        text: "",
        tableSqlFill: { dataRows },
      },
      [templateTableSqlFillPreviewKey(vert.id)]: {
        text: "",
        tableSqlFill: { dataRows },
      },
    };

    const displayN = sqlFillDisplayDataRowCount(vert.tableSqlFill!, dataRows.length);
    const heights = computeSqlFillLogicalRowHeightsPx(
      vert,
      previewValues[templateTableSqlFillPreviewKey(vert.id)].tableSqlFill,
      displayN,
      null,
      { uncapped: true },
    );
    const need = sqlFillTableNeedsPreviewPagination(
      vert,
      displayN,
      contentH,
      dataRows.length,
      heights,
    );
    const bottom = estimatedSqlFillTableBottomY(vert, displayN, heights);
    expect(need).toBe(true);
    expect(bottom).toBeGreaterThan(contentH);

    const cards = computeExpandedBodyPreviewCards(tmpl, previewValues);
    expect(cards.length).toBeGreaterThan(1);
    const withSlices = cards.filter((c) => c.sqlFillTableSlices[vert.id]);
    expect(withSlices.length).toBeGreaterThan(1);
    // 续页卡应隐藏其它正文控件，避免叠页脚
    expect(cards.some((c) => c.continuationIndex > 0 && c.continuationHideOtherBodyElements)).toBe(
      true,
    );
  });
});
