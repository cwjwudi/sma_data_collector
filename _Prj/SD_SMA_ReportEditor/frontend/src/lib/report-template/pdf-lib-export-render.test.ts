import { describe, expect, it, vi } from "vitest";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  createTemplate,
  ensureBodyPages,
  hydrateTemplateElement,
} from "@/lib/report-template/model";
import {
  clearBundledFontBytesCacheForTest,
  renderPdfLibExportPart,
} from "@/lib/report-template/pdf-lib-export-render";
import { templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";

function makeBlankTemplate(name: string) {
  const b = blankZonesSnapshot();
  return createTemplate({
    name,
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
}

describe("045 R1: bundled font bytes cross-part cache", () => {
  it("second part reuses cached font bytes without re-fetch or base64 input", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    clearBundledFontBytesCacheForTest();
    const fontB64 = fs
      .readFileSync(path.join(process.cwd(), "resources/fonts/ZhuqueFangsong-Regular.ttf"))
      .toString("base64");
    const tmpl = makeBlankTemplate("r1-font-cache");
    ensureBodyPages(tmpl)[0].splice(
      0,
      ensureBodyPages(tmpl)[0].length,
      hydrateTemplateElement({ id: "t1", type: "text", text: "FontCacheProbe", x: 40, y: 40, w: 200, h: 24 }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    try {
      const first = await renderPdfLibExportPart({
        tmpl,
        previewValues: {},
        reportPartIndex: null,
        layoutFidelity: "layout-v2",
        fontBytesBase64: fontB64,
        bundledFontId: "fangsong",
      });
      expect(first.meta.fontEmbedded).toBe(true);
      // 第二份不再传 base64（模拟结批第 2+ 卷）：须命中缓存仍嵌入成功，且不发起任何 fetch
      const second = await renderPdfLibExportPart({
        tmpl,
        previewValues: {},
        reportPartIndex: null,
        layoutFidelity: "layout-v2",
        fontBytesBase64: null,
        bundledFontId: "fangsong",
      });
      expect(second.meta.fontEmbedded).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

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

  it("does not overlap large cover titles / multiline author block (draft stream)", async () => {
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "draft-overlap",
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
    tmpl.coverElements = [
      hydrateTemplateElement({
        id: "author",
        type: "text",
        text: "\n作者：B&R\n版本V0.0.1",
        fontSize: 17,
        x: 40,
        y: 570,
        w: 200,
        h: 80,
      }),
      hydrateTemplateElement({
        id: "title",
        type: "text",
        text: "数据记录报表",
        fontSize: 45,
        x: 40,
        y: 465,
        w: 400,
        h: 60,
      }),
    ];
    ensureBodyPages(tmpl)[0].splice(
      0,
      ensureBodyPages(tmpl)[0].length,
      hydrateTemplateElement({
        id: "body-title",
        type: "text",
        text: "绑定冒烟测试（OPC UA + SQL）",
        fontSize: 18,
        x: 40,
        y: 24,
        w: 400,
        h: 28,
      }),
    );

    const fs = await import("node:fs");
    const path = await import("node:path");
    const fontPath = path.join(process.cwd(), "resources/fonts/ZhuqueFangsong-Regular.ttf");
    const fontBytesBase64 = fs.readFileSync(fontPath).toString("base64");

    const { bytes } = await renderPdfLibExportPart({
      tmpl,
      previewValues: {},
      reportPartIndex: null,
      layoutFidelity: "draft-v1",
      bundledFontId: "fangsong",
      fontBytesBase64,
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await parsed.getPage(1);
    const items = (await page.getTextContent()).items
      .filter((it: { str?: string }) => it.str && String(it.str).trim())
      .map((it: { str: string; transform: number[]; height?: number }) => ({
        str: it.str,
        y: it.transform[5],
        h: Math.abs(it.transform[3]) || Number(it.height) || 0,
      }))
      .sort((a, b) => b.y - a.y);

    expect(items.some((it) => it.str.includes("数据记录报表"))).toBe(true);
    expect(items.some((it) => it.str.includes("作者"))).toBe(true);
    expect(items.some((it) => it.str.includes("版本"))).toBe(true);

    let bad = 0;
    for (let i = 0; i < items.length - 1; i++) {
      const dy = items[i].y - items[i + 1].y;
      if (dy <= 0) continue;
      // 仅内容已 cap 字号≤14，相邻基线应 ≥ 约 0.95×字号高度
      const need = Math.max(items[i].h, 8) * 0.95;
      if (dy < need) bad += 1;
    }
    expect(bad).toBe(0);
  });
});
