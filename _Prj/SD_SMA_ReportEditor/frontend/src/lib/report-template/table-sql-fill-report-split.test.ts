import { describe, expect, it } from "vitest";
import { createTemplate, ensureBodyPages, makeElement } from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  buildSqlFillSplitReportPlan,
  previewValuesForSplitReport,
} from "@/lib/report-template/table-sql-fill-report-split";
import { defaultTableSqlFillConfig } from "@/lib/report-template/table-sql-fill";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";

function blankTmpl(name: string) {
  const zones = blankZonesSnapshot();
  return createTemplate({
    name,
    paperKind: "A4",
    orientation: "portrait",
    layoutPresetId: null,
    layoutSnapshot: zones.layoutSnapshot,
    headerText: "",
    footerText: "",
    headerElements: [],
    footerElements: [],
    coverLayoutPresetId: null,
    coverLayoutSnapshot: zones.layoutSnapshot,
    coverHeaderText: "",
    coverFooterText: "",
    coverHeaderElements: [],
    coverFooterElements: [],
    coverBodyZoneElements: [],
    backLayoutPresetId: null,
    backLayoutSnapshot: zones.layoutSnapshot,
    backHeaderText: "",
    backFooterText: "",
    backHeaderElements: [],
    backFooterElements: [],
    backBodyZoneElements: [],
  });
}

describe("table sql fill report split", () => {
  it("splits full sql fill rows by configured maxRows", () => {
    const tmpl = blankTmpl("split");
    const table = makeElement("table");
    table.id = "tbl";
    table.tableCols = 2;
    table.tableSqlFill = {
      ...defaultTableSqlFillConfig(),
      enabled: true,
      maxRows: 2000,
      splitReportsOnMaxRows: true,
    };
    ensureBodyPages(tmpl)[0].push(table);

    const key = templateTableSqlFillPreviewKey(table.id);
    const rows = Array.from({ length: 3000 }, (_x, i) => [`r${i}`, String(i)]);
    const previewValues = {
      [key]: {
        text: "3000x2",
        tableSqlFill: { dataRows: rows },
      },
    };

    const plan = buildSqlFillSplitReportPlan(tmpl, previewValues);

    expect(plan?.reportCount).toBe(2);
    expect(plan?.tables).toHaveLength(1);
    expect(plan?.tables[0].chunks[0]).toHaveLength(2000);
    expect(plan?.tables[0].chunks[1]).toHaveLength(1000);
    expect(
      previewValuesForSplitReport(previewValues, plan!, 1)[key]?.tableSqlFill?.dataRows,
    ).toHaveLength(1000);
  });

  it("aligns multiple split tables by report part index", () => {
    const tmpl = blankTmpl("multi-split");
    const a = makeElement("table");
    a.id = "a";
    a.tableCols = 2;
    a.tableSqlFill = {
      ...defaultTableSqlFillConfig(),
      enabled: true,
      maxRows: 1000,
      splitReportsOnMaxRows: true,
    };
    const b = makeElement("table");
    b.id = "b";
    b.tableCols = 2;
    b.tableSqlFill = {
      ...defaultTableSqlFillConfig(),
      enabled: true,
      maxRows: 2000,
      splitReportsOnMaxRows: true,
    };
    ensureBodyPages(tmpl)[0].push(a, b);

    const keyA = templateTableSqlFillPreviewKey(a.id);
    const keyB = templateTableSqlFillPreviewKey(b.id);
    const previewValues = {
      [keyA]: {
        text: "2500x2",
        tableSqlFill: {
          dataRows: Array.from({ length: 2500 }, (_x, i) => [`a${i}`, String(i)]),
        },
      },
      [keyB]: {
        text: "4500x2",
        tableSqlFill: {
          dataRows: Array.from({ length: 4500 }, (_x, i) => [`b${i}`, String(i)]),
        },
      },
    };

    const plan = buildSqlFillSplitReportPlan(tmpl, previewValues);
    // A: 1000+1000+500 → 3; B: 2000+2000+500 → 3
    expect(plan?.reportCount).toBe(3);
    expect(plan?.tables).toHaveLength(2);

    const part2 = previewValuesForSplitReport(previewValues, plan!, 2);
    expect(part2[keyA]?.tableSqlFill?.dataRows).toHaveLength(500);
    expect(part2[keyB]?.tableSqlFill?.dataRows).toHaveLength(500);

    const part0 = previewValuesForSplitReport(previewValues, plan!, 0);
    expect(part0[keyA]?.tableSqlFill?.dataRows).toHaveLength(1000);
    expect(part0[keyB]?.tableSqlFill?.dataRows).toHaveLength(2000);
  });

  it("pads shorter split table with empty rows on later parts", () => {
    const tmpl = blankTmpl("pad");
    const a = makeElement("table");
    a.id = "short";
    a.tableCols = 1;
    a.tableSqlFill = {
      ...defaultTableSqlFillConfig(),
      enabled: true,
      maxRows: 100,
      splitReportsOnMaxRows: true,
    };
    const b = makeElement("table");
    b.id = "long";
    b.tableCols = 1;
    b.tableSqlFill = {
      ...defaultTableSqlFillConfig(),
      enabled: true,
      maxRows: 100,
      splitReportsOnMaxRows: true,
    };
    ensureBodyPages(tmpl)[0].push(a, b);

    const keyA = templateTableSqlFillPreviewKey(a.id);
    const keyB = templateTableSqlFillPreviewKey(b.id);
    const previewValues = {
      [keyA]: {
        text: "150x1",
        tableSqlFill: { dataRows: Array.from({ length: 150 }, (_x, i) => [`a${i}`]) },
      },
      [keyB]: {
        text: "250x1",
        tableSqlFill: { dataRows: Array.from({ length: 250 }, (_x, i) => [`b${i}`]) },
      },
    };

    const plan = buildSqlFillSplitReportPlan(tmpl, previewValues);
    expect(plan?.reportCount).toBe(3);
    const part2 = previewValuesForSplitReport(previewValues, plan!, 2);
    expect(part2[keyA]?.tableSqlFill?.dataRows).toHaveLength(0);
    expect(part2[keyB]?.tableSqlFill?.dataRows).toHaveLength(50);
  });
});
