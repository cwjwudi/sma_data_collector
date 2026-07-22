import { describe, expect, it } from "vitest";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  createTemplate,
  ensureBodyPages,
  hydrateTemplateElement,
} from "@/lib/report-template/model";
import { renderPdfLibExportPart } from "@/lib/report-template/pdf-lib-export-render";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";

describe("pdf-lib-export-render draft-v1", () => {
  it("fills SQL table from tableSqlFill.dataRows (not ok/rows)", async () => {
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "draft-sql",
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
    const tb = hydrateTemplateElement({
      id: "sql-draft",
      type: "table",
      tableRows: 3,
      tableCols: 2,
      tableRowHeightPx: 24,
      x: 40,
      y: 40,
      w: 320,
      h: 80,
      tableSqlFill: {
        enabled: true,
        fillMode: "visual",
        layoutMode: "horizontal",
        querySql: "SELECT 1",
        resultColumnNames: ["指标", "数值"],
        columnRoles: ["field", "field"],
      },
      tableCells: [
        [
          { text: "指标", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" },
          { text: "数值", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" },
        ],
        [
          { text: "", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" },
          { text: "", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" },
        ],
      ],
    });
    ensureBodyPages(tmpl)[0].splice(0, ensureBodyPages(tmpl)[0].length, tb);
    const key = templateTableSqlFillPreviewKey("sql-draft");
    const previewValues = {
      [key]: { text: "", tableSqlFill: { dataRows: [["temp", "23.5"], ["pressure", "1.02"]] } },
    };

    const { bytes, meta } = await renderPdfLibExportPart({
      tmpl,
      previewValues,
      reportPartIndex: null,
      layoutFidelity: "draft-v1",
    });
    expect(meta.layoutFidelity).toBe("draft-v1");

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await parsed.getPage(1);
    const text = (await page.getTextContent()).items.map((it: { str: string }) => it.str).join(" ");
    expect(text).toContain("temp");
    expect(text).toContain("23.5");
    expect(text).toContain("pressure");
    expect(text).toContain("1.02");
  });
});
