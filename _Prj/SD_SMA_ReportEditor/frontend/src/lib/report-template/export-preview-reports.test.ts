import { describe, expect, it, vi } from "vitest";
import { createTemplate, ensureBodyPages, makeElement } from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import { defaultTableSqlFillConfig } from "@/lib/report-template/table-sql-fill";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";
import { buildExportPreviewReports } from "@/lib/report-template/export-preview-reports";

vi.mock("@/lib/report-template/table-sql-fill-export-preview-split", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/report-template/table-sql-fill-export-preview-split")>();
  return {
    ...mod,
    computeExpandedBodyPreviewCards: vi.fn((_tmpl, _values) => []),
  };
});

import { computeExpandedBodyPreviewCards } from "@/lib/report-template/table-sql-fill-export-preview-split";

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

describe("buildExportPreviewReports (030)", () => {
  it("U1: with reportPartIndex only computes that part once", () => {
    const tmpl = blankTmpl("lazy");
    const table = makeElement("table");
    table.id = "tbl";
    table.tableCols = 2;
    table.tableSqlFill = {
      ...defaultTableSqlFillConfig(),
      enabled: true,
      maxRows: 100,
      splitReportsOnMaxRows: true,
    };
    ensureBodyPages(tmpl)[0].push(table);
    const key = templateTableSqlFillPreviewKey(table.id);
    const rows = Array.from({ length: 250 }, (_x, i) => [`r${i}`, String(i)]);
    const previewValues = { [key]: { text: "250x2", tableSqlFill: { dataRows: rows } } };

    vi.mocked(computeExpandedBodyPreviewCards).mockClear();
    const only = buildExportPreviewReports(tmpl, previewValues, 1);
    expect(only).toHaveLength(1);
    expect(only[0]?.reportIndex).toBe(1);
    expect(only[0]?.totalReports).toBe(3);
    expect(vi.mocked(computeExpandedBodyPreviewCards).mock.calls).toHaveLength(1);

    vi.mocked(computeExpandedBodyPreviewCards).mockClear();
    const all = buildExportPreviewReports(tmpl, previewValues, null);
    expect(all).toHaveLength(3);
    expect(vi.mocked(computeExpandedBodyPreviewCards).mock.calls).toHaveLength(3);
  });
});
