import { describe, expect, it } from "vitest";
import { createTemplate, ensureBodyPages, makeElement } from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  buildSqlFillSplitReportPlan,
  previewValuesForSplitReport,
} from "@/lib/report-template/table-sql-fill-report-split";
import { defaultTableSqlFillConfig } from "@/lib/report-template/table-sql-fill";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";

describe("table sql fill report split", () => {
  it("splits full sql fill rows by configured maxRows", () => {
    const zones = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "split",
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

    expect(plan?.chunks).toHaveLength(2);
    expect(plan?.chunks[0]).toHaveLength(2000);
    expect(plan?.chunks[1]).toHaveLength(1000);
    expect(previewValuesForSplitReport(previewValues, plan!, 1)[key]?.tableSqlFill?.dataRows).toHaveLength(1000);
  });
});
