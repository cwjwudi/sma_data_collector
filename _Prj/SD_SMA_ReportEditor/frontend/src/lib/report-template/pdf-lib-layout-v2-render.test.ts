import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  clampTableElementOuterSize,
  createTemplate,
  ensureBodyPages,
  hydrateTemplateElement,
} from "@/lib/report-template/model";
import {
  appendPdfLibLayoutV2Pages,
  imageBytesCacheSizeForTest,
} from "@/lib/report-template/pdf-lib-layout-v2-render";
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
    const pageCount = await appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: true,
      bodyCards: cards,
    });
    expect(pageCount).toBe(cards.length);
    expect(doc.getPageCount()).toBe(cards.length);
  });

  it("041: header/footer are drawn on SQL continuation pages (parity with Mini/Chromium)", async () => {
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    const tb = hydrateTemplateElement({
      id: "ov-041",
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
    tmpl.layoutSnapshot = { ...tmpl.layoutSnapshot, headerBandMm: 18, footerBandMm: 14 };
    const hdr = makeLayoutZoneElement("text");
    hdr.text = "HdrEveryPage";
    hdr.x = 20; hdr.y = 4; hdr.w = 240; hdr.h = 20;
    hdr.fontSize = 11;
    const pn = makeLayoutZoneElement("pageNumber");
    pn.pageNumberMode = "slashTotal";
    pn.x = 20; pn.y = 4; pn.w = 100; pn.h = 18;
    tmpl.headerElements = [hdr];
    tmpl.footerElements = [pn];

    const cards = computeExpandedBodyPreviewCards(tmpl, {});
    expect(cards.length).toBeGreaterThan(1);
    // 前提：第 2+ 张为 SQL/静态表续页卡（旧实现在此类卡上整体跳过眉脚）
    expect(cards.some((c) => c.continuationHideOtherBodyElements || c.tailOnlyBelowBaseline)).toBe(true);

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pageCount = await appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: true,
      bodyCards: cards,
    });
    expect(pageCount).toBe(cards.length);

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: await doc.save() }).promise;
    for (let p = 1; p <= pageCount; p++) {
      const page = await parsed.getPage(p);
      const text = (await page.getTextContent()).items.map((it: { str: string }) => it.str).join("");
      expect(text, `page ${p} missing header`).toContain("HdrEveryPage");
      expect(text, `page ${p} missing footer page number`).toContain(`${p}/${pageCount}`);
    }
  });

  it("042: decimalPlaces applied to bound values (body param / static cell / zone param)", async () => {
    const { paramKey, cellKey, zoneParamKey } = await import(
      "@/lib/report-template/binding-preview-utils"
    );
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    const param = hydrateTemplateElement({
      id: "p42",
      type: "parameter",
      text: "占位",
      bindingKind: "sql",
      decimalPlaces: 2,
      x: 40,
      y: 30,
      w: 160,
      h: 24,
    });
    const tmpl = makeTemplateWithBodyTable(param);
    const tb = hydrateTemplateElement({
      id: "t42",
      type: "table",
      tableRows: 1,
      tableCols: 1,
      tableRowHeightPx: 28,
      x: 40,
      y: 80,
      w: 200,
      h: 28,
      tableCells: [
        [
          {
            text: "",
            bindingKind: "sql",
            opcuaNodeId: "",
            sqlText: "SELECT 1",
            sqlParams: [],
            bgColor: "transparent",
            decimalPlaces: 1,
          },
        ],
      ],
    });
    ensureBodyPages(tmpl)[0].push(tb);
    tmpl.layoutSnapshot = { ...tmpl.layoutSnapshot, headerBandMm: 18 };
    const zp = makeLayoutZoneElement("parameter");
    zp.id = "zp42";
    zp.bindingKind = "sql";
    zp.decimalPlaces = 2;
    zp.text = "zplace";
    zp.x = 20; zp.y = 4; zp.w = 120; zp.h = 18;
    tmpl.headerElements = [zp];

    const previewValues = {
      [paramKey("p42")]: { text: "12" },
      [cellKey("t42", 0, 0)]: { text: "3.14159" },
      [zoneParamKey("zp42")]: { text: "9" },
    };
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues, font, useWinAnsi: true });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: await doc.save() }).promise;
    const page = await parsed.getPage(1);
    const text = (await page.getTextContent()).items.map((it: { str: string }) => it.str).join(" ");
    expect(text).toContain("12.00");
    expect(text).toContain("3.1");
    expect(text).not.toContain("3.14159");
    expect(text).toContain("9.00");
  });

  it("043: empty bound value honors nullDisplayMode instead of falling back to el.text", async () => {
    const { paramKey, cellKey, zoneParamKey } = await import(
      "@/lib/report-template/binding-preview-utils"
    );
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    // blank（缺省）：空 bound → 空白，不得画控件占位 "value"
    const pBlank = hydrateTemplateElement({
      id: "p43a",
      type: "parameter",
      text: "value",
      bindingKind: "sql",
      x: 40,
      y: 30,
      w: 160,
      h: 24,
    });
    // fallbackText：空 bound → 回落控件文案（显式配置时才允许）
    const pFallback = hydrateTemplateElement({
      id: "p43b",
      type: "parameter",
      text: "N/A",
      bindingKind: "sql",
      nullDisplayMode: "fallbackText",
      x: 40,
      y: 70,
      w: 160,
      h: 24,
    });
    const tmpl = makeTemplateWithBodyTable(pBlank);
    ensureBodyPages(tmpl)[0].push(pFallback);
    // 静态表：空 bound 不得回落 grid 文案
    const tb = hydrateTemplateElement({
      id: "t43",
      type: "table",
      tableRows: 1,
      tableCols: 1,
      tableRowHeightPx: 28,
      x: 40,
      y: 120,
      w: 200,
      h: 28,
      tableCells: [
        [
          {
            text: "GridFallback",
            bindingKind: "sql",
            opcuaNodeId: "",
            sqlText: "SELECT 1",
            sqlParams: [],
            bgColor: "transparent",
          },
        ],
      ],
    });
    ensureBodyPages(tmpl)[0].push(tb);
    tmpl.layoutSnapshot = { ...tmpl.layoutSnapshot, headerBandMm: 18 };
    const zp = makeLayoutZoneElement("parameter");
    zp.id = "zp43";
    zp.bindingKind = "sql";
    zp.text = "value";
    zp.x = 20; zp.y = 4; zp.w = 120; zp.h = 18;
    tmpl.headerElements = [zp];

    const previewValues = {
      [paramKey("p43a")]: { text: "" },
      [paramKey("p43b")]: { text: "" },
      [cellKey("t43", 0, 0)]: { text: "" },
      [zoneParamKey("zp43")]: { text: "" },
    };
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues, font, useWinAnsi: true });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: await doc.save() }).promise;
    const page = await parsed.getPage(1);
    const text = (await page.getTextContent()).items.map((it: { str: string }) => it.str).join(" ");
    expect(text).not.toContain("value");
    expect(text).not.toContain("GridFallback");
    expect(text).toContain("N/A");
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
    const pageCount = await appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: true,
    });
    expect(pageCount).toBeGreaterThanOrEqual(1);
  });

  it("places body text at content origin and draws CJK with TTF subset (not OTTO/CFF)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const textEl = hydrateTemplateElement({
      id: "title",
      type: "text",
      text: "绑定冒烟测试",
      fontSize: 18,
      x: 40,
      y: 24,
      w: 400,
      h: 32,
    });
    const tmpl = makeTemplateWithBodyTable(textEl);
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    // Noto OTF subset 会乱码；优先嵌入 Noto TTF（其次朱雀仿宋）
    const noto = path.join(process.cwd(), "resources/fonts/NotoSansSC-Regular.ttf");
    const fang = path.join(process.cwd(), "resources/fonts/ZhuqueFangsong-Regular.ttf");
    const fontPath = fs.existsSync(noto) ? noto : fang;
    const fontBytes = fs.readFileSync(fontPath);
    const font = await doc.embedFont(fontBytes, { subset: true });
    const pageCount = await appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: false,
    });
    expect(pageCount).toBeGreaterThanOrEqual(1);
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(2_500);
  });

  it("045 R2: data-url image bytes cached across parts (same key not re-added)", async () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const tb = hydrateTemplateElement({
      id: "img-r2",
      type: "image",
      x: 20,
      y: 20,
      w: 120,
      h: 80,
      imageSrc: tinyPng,
    });
    const tmpl = makeTemplateWithBodyTable(tb);
    async function renderOnce(): Promise<void> {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
    }
    await renderOnce();
    const afterFirst = imageBytesCacheSizeForTest();
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    await renderOnce();
    await renderOnce();
    // 同一 dataURL 跨份复用：缓存条目数不再增长
    expect(imageBytesCacheSizeForTest()).toBe(afterFirst);
  });

  it("embeds cover data-url image", async () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "img",
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
        id: "cover-img",
        type: "image",
        x: 20,
        y: 20,
        w: 200,
        h: 120,
        imageSrc: tinyPng,
      }),
    ];
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pageCount = await appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: true,
    });
    expect(pageCount).toBeGreaterThanOrEqual(1);
    const bytes = await doc.save();
    // PNG object present
    expect(Buffer.from(bytes).includes(Buffer.from("IDAT")) || bytes.byteLength > 800).toBe(true);
  });

  it("draws cover header zone text and tables with readable CJK", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "cover-hdr",
      paperKind: "A4",
      orientation: "landscape",
      layoutPresetId: null,
      layoutSnapshot: b.layoutSnapshot,
      headerText: "",
      footerText: "",
      headerElements: [],
      footerElements: [],
      coverLayoutPresetId: null,
      coverLayoutSnapshot: {
        ...b.layoutSnapshot,
        marginTopMm: 15,
        marginLeftMm: 15,
        marginRightMm: 15,
        headerBandMm: 22,
        footerBandMm: 0,
      },
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
    const tbl = makeLayoutZoneElement("table");
    tbl.x = 0; tbl.y = 18; tbl.w = 800; tbl.h = 40;
    tbl.tableRows = 2; tbl.tableCols = 2;
    tbl.tableCells = [
      [{ text: "机器配置：", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" },
       { text: "", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" }],
      [{ text: "批次代号：", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" },
       { text: "", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" }],
    ];
    const title = makeLayoutZoneElement("text");
    title.text = "批次报告";
    title.x = 40; title.y = 2; title.w = 160; title.h = 18;
    title.fontSize = 11;
    title.showBorder = true;
    const pn = makeLayoutZoneElement("pageNumber");
    pn.x = 40; pn.y = 60; pn.w = 80; pn.h = 18;
    tmpl.coverHeaderElements = [title, tbl, pn];
    tmpl.coverElements = [];
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
      fs.readFileSync(path.join(process.cwd(), "resources/fonts/ZhuqueFangsong-Regular.ttf")),
      { subset: true },
    );
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: false });
    const bytes = await doc.save();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await parsed.getPage(1);
    const text = (await page.getTextContent()).items.map((it: { str: string }) => it.str).join(" ");
    expect(text).toContain("机器配置");
    expect(text).toContain("批次报告");
  });

  it("stacked zone tables render both rows (shared edge drawn after cell fills)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "stacked-zone-tables",
      paperKind: "A4",
      orientation: "landscape",
      layoutPresetId: null,
      layoutSnapshot: b.layoutSnapshot,
      headerText: "",
      footerText: "",
      headerElements: [],
      footerElements: [],
      coverLayoutPresetId: null,
      coverLayoutSnapshot: {
        ...b.layoutSnapshot,
        marginTopMm: 12,
        marginLeftMm: 15,
        marginRightMm: 15,
        headerBandMm: 28,
        footerBandMm: 0,
      },
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
    const mkRow = (id: string, y: number, label: string) => {
      const t = makeLayoutZoneElement("table");
      t.id = id;
      t.x = 0;
      t.y = y;
      t.w = 900;
      t.h = 24;
      t.tableRows = 1;
      t.tableCols = 2;
      t.tableColWidthsPx = [200, 700];
      t.bgColor = "transparent";
      t.tableCells = [
        [
          {
            text: label,
            bindingKind: "none",
            opcuaNodeId: "",
            sqlText: "",
            sqlParams: [],
            bgColor: "transparent",
          },
          {
            text: "v",
            bindingKind: "none",
            opcuaNodeId: "",
            sqlText: "",
            sqlParams: [],
            bgColor: "transparent",
          },
        ],
      ];
      return t;
    };
    tmpl.coverHeaderElements = [mkRow("z-a", 0, "上表："), mkRow("z-b", 24, "下表：")];
    tmpl.coverElements = [];
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
      fs.readFileSync(path.join(process.cwd(), "resources/fonts/ZhuqueFangsong-Regular.ttf")),
      { subset: true },
    );
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: false });
    const bytes = await doc.save();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await parsed.getPage(1);
    const text = (await page.getTextContent()).items.map((it: { str: string }) => it.str).join(" ");
    expect(text).toContain("上表");
    expect(text).toContain("下表");
  });

  it("body table cell font uses max(10px, 0.85×控件字号) like Mini (not ×0.8 shell)", async () => {
    const tb = hydrateTemplateElement({
      id: "fs-tbl",
      type: "table",
      alignX: "start",
      alignY: "center",
      fontSize: 12,
      tableRows: 1,
      tableCols: 1,
      tableRowHeightPx: 28,
      x: 40,
      y: 40,
      w: 200,
      h: 36,
      tableCells: [
        [
          {
            text: "Aa",
            bindingKind: "none",
            opcuaNodeId: "",
            sqlText: "",
            sqlParams: [],
            bgColor: "transparent",
          },
        ],
      ],
    });
    const tmpl = makeTemplateWithBodyTable(tb);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
    const bytes = await doc.save();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await parsed.getPage(1);
    const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
    const hit = items.find((it) => it.str.includes("Aa"));
    expect(hit).toBeTruthy();
    // Mini: max(10, 12×0.85)=10.2px → 10.2×72/96=7.65pt；旧实现误用 ×0.8→7.2pt
    const fontSizePt = Math.abs(hit!.transform[0]);
    expect(fontSizePt).toBeGreaterThan(7.4);
    expect(fontSizePt).toBeLessThan(7.9);
  });

  it("honors table alignX start/center/end for cell text x", async () => {
    const mk = (alignX: "start" | "center" | "end", id: string) =>
      hydrateTemplateElement({
        id,
        type: "table",
        alignX,
        alignY: "center",
        tableRows: 1,
        tableCols: 1,
        tableRowHeightPx: 28,
        x: 40,
        y: 40,
        w: 400,
        h: 28,
        tableCells: [[ { text: "Hi", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" } ]],
      });

    async function textX(alignX: "start" | "center" | "end"): Promise<number> {
      const tmpl = makeTemplateWithBodyTable(mk(alignX, `a-${alignX}`));
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
      const bytes = await doc.save();
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const parsed = await pdfjs.getDocument({ data: bytes }).promise;
      const page = await parsed.getPage(1);
      const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
      const hit = items.find((it) => it.str.includes("Hi"));
      expect(hit, `missing Hi for ${alignX}`).toBeTruthy();
      return hit!.transform[4];
    }

    const xStart = await textX("start");
    const xCenter = await textX("center");
    const xEnd = await textX("end");
    expect(xCenter).toBeGreaterThan(xStart + 20);
    expect(xEnd).toBeGreaterThan(xCenter + 20);
  });

  it("bodyBackgroundCss white/custom fills appear; transparent skips gray fill", async () => {
    async function bodyPlain(bg: string): Promise<string> {
      const b = blankZonesSnapshot();
      b.layoutSnapshot = { ...b.layoutSnapshot, bodyBackgroundCss: bg };
      const tmpl = makeTemplateWithBodyTable(
        hydrateTemplateElement({
          id: "bg-probe",
          type: "text",
          text: "Bg",
          x: 40,
          y: 40,
          w: 80,
          h: 24,
        }),
      );
      tmpl.layoutSnapshot = b.layoutSnapshot;
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
      return inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    }
    // #ff0000 → 1 0 0 rg
    expect(await bodyPlain("#ff0000")).toMatch(/1(\.0+)?\s+0(\.0+)?\s+0(\.0+)?\s+rg/);
    // #ffffff → 1 1 1 rg（非历史灰 249/255）
    const white = await bodyPlain("#ffffff");
    expect(white).toMatch(/1(\.0+)?\s+1(\.0+)?\s+1(\.0+)?\s+rg/);
    expect(white).not.toMatch(/0\.976\d*\s+0\.976\d*\s+0\.984\d*\s+rg/);
    // transparent：不应再画默认浅灰正文底
    const tr = await bodyPlain("transparent");
    expect(tr).not.toMatch(/0\.976\d*\s+0\.976\d*\s+0\.984\d*\s+rg/);
  });

  it("D19: role accent bars — cover top orange / body left indigo / back bottom purple", async () => {
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "role-accent",
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
      hydrateTemplateElement({ id: "c1", type: "text", text: "Cover", x: 40, y: 40, w: 120, h: 24 }),
    ];
    tmpl.backElements = [
      hydrateTemplateElement({ id: "b1", type: "text", text: "Back", x: 40, y: 40, w: 120, h: 24 }),
    ];
    ensureBodyPages(tmpl)[0].splice(
      0,
      ensureBodyPages(tmpl)[0].length,
      hydrateTemplateElement({ id: "body1", type: "text", text: "Body", x: 40, y: 40, w: 120, h: 24 }),
    );

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pageCount = await appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: true,
    });
    expect(pageCount).toBe(3);

    /** 按页拆 content stream（与 inflatedPdfPlain 相同 inflate） */
    async function pagePlains(bytes: Uint8Array): Promise<string[]> {
      const { inflateSync } = await import("node:zlib");
      const raw = Buffer.from(bytes);
      const parts: string[] = [];
      let idx = 0;
      while (idx < raw.length) {
        const i = raw.indexOf(Buffer.from("stream\n"), idx);
        if (i < 0) break;
        const j = raw.indexOf(Buffer.from("\nendstream"), i);
        if (j < 0) break;
        const chunk = raw.subarray(i + 7, j);
        try {
          parts.push(inflateSync(chunk).toString("latin1"));
        } catch {
          parts.push(chunk.toString("latin1"));
        }
        idx = j + 10;
      }
      return parts.filter((p) => /\bre\b/.test(p) || /\brg\b/.test(p));
    }

    const plains = await pagePlains(await doc.save({ useObjectStreams: false }));
    expect(plains.length).toBeGreaterThanOrEqual(3);
    const cover = plains[0]!;
    const body = plains[1]!;
    const back = plains[2]!;
    // rgb(251 146 60) / (99 102 241) / (168 139 246)
    const orange = /0\.98\d*\s+0\.57\d*\s+0\.23\d*\s+rg/;
    const indigo = /0\.38\d*\s+0\.4\d*\s+0\.94\d*\s+rg/;
    const purple = /0\.65\d*\s+0\.54\d*\s+0\.96\d*\s+rg/;
    expect(orange.test(cover), "cover missing orange top bar").toBe(true);
    expect(indigo.test(body), "body missing indigo left bar").toBe(true);
    expect(purple.test(back), "back missing purple bottom bar").toBe(true);
    // 角色色互不串页
    expect(orange.test(body)).toBe(false);
    expect(purple.test(cover)).toBe(false);
  });

  it("formats zone date by dateFormat and pageNumber slashTotal with total pages", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "date-pn",
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
    const dateEl = makeLayoutZoneElement("date");
    dateEl.dateFormat = "yyyy-MM-dd HH:mm";
    dateEl.x = 20;
    dateEl.y = 4;
    dateEl.w = 160;
    dateEl.h = 18;
    dateEl.fontSize = 11;
    const pn = makeLayoutZoneElement("pageNumber");
    pn.pageNumberMode = "slashTotal";
    pn.x = 200;
    pn.y = 4;
    pn.w = 80;
    pn.h = 18;
    tmpl.headerElements = [dateEl];
    tmpl.footerElements = [pn];
    tmpl.coverElements = [
      hydrateTemplateElement({ id: "c1", type: "text", text: "封面", x: 40, y: 40, w: 120, h: 24 }),
    ];
    tmpl.backElements = [
      hydrateTemplateElement({ id: "b1", type: "text", text: "封尾", x: 40, y: 40, w: 120, h: 24 }),
    ];
    ensureBodyPages(tmpl)[0].splice(
      0,
      ensureBodyPages(tmpl)[0].length,
      hydrateTemplateElement({ id: "body1", type: "text", text: "正文", x: 40, y: 40, w: 120, h: 24 }),
    );

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
      fs.readFileSync(path.join(process.cwd(), "resources/fonts/ZhuqueFangsong-Regular.ttf")),
      { subset: true },
    );
    const pageCount = await appendPdfLibLayoutV2Pages(doc, {
      tmpl,
      previewValues: {},
      font,
      useWinAnsi: false,
    });
    expect(pageCount).toBe(3);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: await doc.save() }).promise;
    const bodyPage = await parsed.getPage(2);
    const bodyText = (await bodyPage.getTextContent()).items.map((it: { str: string }) => it.str).join("");
    expect(bodyText).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(bodyText).toContain("2/3");
  });

  it("fills body SQL table from tableSqlFill.dataRows", async () => {
    const { templateTableSqlFillPreviewKey } = await import("@/lib/report-template/table-sql-fill-preview");
    const tb = hydrateTemplateElement({
      id: "sql-h",
      type: "table",
      tableRows: 3,
      tableCols: 2,
      tableRowHeightPx: 24,
      x: 40,
      y: 40,
      w: 320,
      h: 80,
      alignX: "start",
      alignY: "center",
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
    const tmpl = makeTemplateWithBodyTable(tb);
    const key = templateTableSqlFillPreviewKey("sql-h");
    const previewValues = {
      [key]: { text: "", tableSqlFill: { dataRows: [["temp", "23.5"], ["pressure", "1.02"]] } },
    };
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues, font, useWinAnsi: true });
    const bytes = await doc.save();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const parsed = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await parsed.getPage(1);
    const text = (await page.getTextContent()).items.map((it: { str: string }) => it.str).join(" ");
    expect(text).toContain("temp");
    expect(text).toContain("23.5");
    expect(text).toContain("pressure");
  });

  async function inflatedPdfPlain(bytes: Uint8Array): Promise<string> {
    const { inflateSync } = await import("node:zlib");
    const raw = Buffer.from(bytes);
    const parts: string[] = [];
    let idx = 0;
    while (idx < raw.length) {
      const i = raw.indexOf(Buffer.from("stream\n"), idx);
      if (i < 0) break;
      const j = raw.indexOf(Buffer.from("\nendstream"), i);
      if (j < 0) break;
      const chunk = raw.subarray(i + 7, j);
      try {
        parts.push(inflateSync(chunk).toString("latin1"));
      } catch {
        parts.push(chunk.toString("latin1"));
      }
      idx = j + 10;
    }
    return parts.join("\n");
  }

  it("D10: showBorder false hides chrome stroke; omit/true draws stroke", async () => {
    async function plainFor(showBorder: boolean | undefined): Promise<string> {
      const raw: Record<string, unknown> = {
        id: `sb-${String(showBorder)}`,
        type: "text",
        text: "BorderProbe",
        x: 40,
        y: 40,
        w: 160,
        h: 28,
        bgColor: "transparent",
      };
      if (showBorder !== undefined) raw.showBorder = showBorder;
      const el = hydrateTemplateElement(raw);
      if (showBorder === undefined) {
        (el as { showBorder?: boolean }).showBorder = undefined;
      }
      const tmpl = makeTemplateWithBodyTable(el);
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
      return inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    }

    /** chrome：Mini `rgb(24 24 27 / 0.15)` 叠白 ≈ 0.863 RG */
    const chromeStroke = /0\.86\d*\s+0\.86\d*\s+0\.86\d*\s+RG/;
    expect(chromeStroke.test(await plainFor(false))).toBe(false);
    expect(chromeStroke.test(await plainFor(true))).toBe(true);
    expect(chromeStroke.test(await plainFor(undefined))).toBe(true);
  });

  it("040 D10h: cover header chrome gone after hideBordersOnTemplateSheet", async () => {
    const { hideBordersOnTemplateSheet } = await import("@/lib/report-template/show-border");
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    const chromeStroke = /0\.86\d*\s+0\.86\d*\s+0\.86\d*\s+RG/;

    function buildCoverHeaderTmpl(showBorder: boolean) {
      const b = blankZonesSnapshot();
      b.layoutSnapshot.headerBandMm = 18;
      const tmpl = createTemplate({
        name: "040-hdr-chrome",
        paperKind: "A4",
        orientation: "portrait",
        layoutPresetId: null,
        layoutSnapshot: b.layoutSnapshot,
        headerText: "",
        footerText: "",
        headerElements: [],
        footerElements: [],
        coverLayoutPresetId: "c",
        coverLayoutSnapshot: { ...b.layoutSnapshot, headerBandMm: 18 },
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
      const hz = makeLayoutZoneElement("text");
      hz.id = "hdr-probe";
      hz.text = "HdrChromeProbe";
      hz.x = 20;
      hz.y = 4;
      hz.w = 200;
      hz.h = 22;
      hz.bgColor = "transparent";
      hz.showBorder = showBorder;
      tmpl.coverHeaderElements.push(hz);
      const body = hydrateTemplateElement({
        id: "body-quiet",
        type: "text",
        text: "x",
        x: 40,
        y: 40,
        w: 40,
        h: 16,
        showBorder: false,
        bgColor: "transparent",
      });
      ensureBodyPages(tmpl)[0]!.splice(0, ensureBodyPages(tmpl)[0]!.length, body);
      return tmpl;
    }

    async function plainOf(tmpl: ReturnType<typeof createTemplate>): Promise<string> {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
      return inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    }

    expect(chromeStroke.test(await plainOf(buildCoverHeaderTmpl(true)))).toBe(true);

    const tmpl = buildCoverHeaderTmpl(true);
    expect(hideBordersOnTemplateSheet(tmpl, "cover")).toBeGreaterThanOrEqual(1);
    expect(tmpl.coverHeaderElements[0]!.showBorder).toBe(false);
    expect(chromeStroke.test(await plainOf(tmpl))).toBe(false);
  });

  it("circle pageNumber diameter follows 2.75em not full control height", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "circle-pn",
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
      backLayoutSnapshot: {
        ...b.layoutSnapshot,
        footerBandMm: 24,
      },
      backHeaderText: "",
      backFooterText: "",
      backHeaderElements: [],
      backFooterElements: [],
      backBodyZoneElements: [],
    });
    const pn = makeLayoutZoneElement("pageNumber");
    pn.pageNumberMode = "circle";
    pn.fontSize = 12;
    pn.x = 0;
    pn.y = 0;
    pn.w = 680;
    pn.h = 68;
    pn.color = "#52525b";
    pn.showBorder = false;
    tmpl.backFooterElements = [pn];
    tmpl.backElements = [];
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
      fs.readFileSync(path.join(process.cwd(), "resources/fonts/ZhuqueFangsong-Regular.ttf")),
      { subset: true },
    );
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: false });
    const plain = await inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    // #52525b → ≈0.322 RG；圆半径按 zone×0.85 的 2.75em ≈10.1pt（旧未×0.85≈12；整盒高≈24）
    expect(plain).toMatch(/0\.32\d*\s+0\.32\d*\s+0\.35\d*\s+RG/);
    const arcs = [
      ...plain.matchAll(
        /([\d.]+)\s+([\d.]+)\s+m\n([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+c/g,
      ),
    ];
    const radii = arcs.map((m) => Math.abs(Number(m[7]) - Number(m[1])));
    const r = radii.find((v) => v > 5 && v < 40);
    expect(r, `radii from arcs: ${radii.slice(0, 8).join(",")}`).toBeTruthy();
    expect(r!).toBeLessThan(12);
    expect(r!).toBeGreaterThan(8);
  });

  it("D14/D13: body box and chart placeholder are drawn", async () => {
    const box = hydrateTemplateElement({
      id: "box1",
      type: "box",
      text: "BoxLabel",
      x: 20,
      y: 20,
      w: 120,
      h: 40,
      bgColor: "transparent",
    });
    const chart = hydrateTemplateElement({
      id: "ch1",
      type: "chart",
      chartKind: "bar",
      text: "ChartStub",
      x: 20,
      y: 80,
      w: 160,
      h: 60,
    });
    const tmpl = makeTemplateWithBodyTable(box);
    ensureBodyPages(tmpl)[0].push(chart);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
    const plain = await inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    // Helvetica 文本以 PDF hex 串写入
    expect(plain).toMatch(/<426F784C6162656C>/); // BoxLabel
    expect(plain).toMatch(/<436861727453747562>/); // ChartStub
  });

  it("D11: image caption text is embedded", async () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const img = hydrateTemplateElement({
      id: "img1",
      type: "image",
      text: "CapABC",
      imageCaptionPosition: "bottom",
      imageSrc: dataUrl,
      x: 10,
      y: 10,
      w: 200,
      h: 120,
    });
    const tmpl = makeTemplateWithBodyTable(img);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
    const plain = await inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    expect(plain).toMatch(/<436170414243>/); // CapABC
    expect(plain).toMatch(/\/Image-/);
  });

  it("D12: signature watermark text is embedded", async () => {
    const sig = hydrateTemplateElement({
      id: "sig1",
      type: "signature",
      signatureDisplayMode: "watermark",
      signerLabel: "SignOK",
      x: 10,
      y: 10,
      w: 180,
      h: 60,
    });
    const tmpl = makeTemplateWithBodyTable(sig);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
    const plain = await inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    expect(plain).toMatch(/<5369676E4F4B>/); // SignOK
    expect(plain).toMatch(/0\.72\s+0\.72\s+0\.75\s+rg/); // watermark tint
  });

  it("D17: zone box with transparent bg does not force gray fill", async () => {
    const { makeLayoutZoneElement } = await import("@/lib/report-template/layout-zone-element");
    const b = blankZonesSnapshot();
    const tmpl = createTemplate({
      name: "zone-box",
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
    const zb = makeLayoutZoneElement("box");
    zb.bgColor = "transparent";
    zb.showBorder = false;
    zb.text = "";
    zb.x = 10;
    zb.y = 10;
    zb.w = 80;
    zb.h = 40;
    tmpl.headerElements = [zb];
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
    const plain = await inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    // 无 label、无边、透明底 → 不应出现默认灰填色块（0.94 rg 一带）
    expect(plain).not.toMatch(/0\.94\d*\s+0\.94\d*\s+0\.94\d*\s+rg/);
  });

  it("D9: per-cell / per-col background fills appear in PDF content", async () => {
    const tb = hydrateTemplateElement({
      id: "bg-cells",
      type: "table",
      tableRows: 1,
      tableCols: 2,
      tableRowHeightPx: 28,
      x: 40,
      y: 40,
      w: 320,
      h: 28,
      tableColBgColors: ["#ff0000", "transparent"],
      tableCells: [
        [
          { text: "R", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "transparent" },
          { text: "B", bindingKind: "none", opcuaNodeId: "", sqlText: "", sqlParams: [], bgColor: "#0000ff" },
        ],
      ],
    });
    expect(tb.tableColBgColors?.[0]).toBe("#ff0000");
    expect(tb.tableCells?.[0]?.[1]?.bgColor).toBe("#0000ff");
    const tmpl = makeTemplateWithBodyTable(tb);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
    const plain = await inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    expect(plain).toMatch(/1(\.0+)?\s+0(\.0+)?\s+0(\.0+)?\s+rg/);
    expect(plain).toMatch(/0(\.0+)?\s+0(\.0+)?\s+1(\.0+)?\s+rg/);
  });

  it("D20: body table outer grid strokes after near-white cell fills", async () => {
    const cell = (text: string) => ({
      text,
      bindingKind: "none" as const,
      opcuaNodeId: "",
      sqlText: "",
      sqlParams: [] as [],
      bgColor: "transparent",
    });
    const tb = hydrateTemplateElement({
      id: "d20-outer",
      type: "table",
      tableRows: 2,
      tableCols: 2,
      tableRowHeightPx: 28,
      x: 40,
      y: 40,
      w: 320,
      h: 56,
      tableCells: [
        [cell("A"), cell("B")],
        [cell("C"), cell("D")],
      ],
    });
    const tmpl = makeTemplateWithBodyTable(tb);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await appendPdfLibLayoutV2Pages(doc, { tmpl, previewValues: {}, font, useWinAnsi: true });
    const plain = await inflatedPdfPlain(await doc.save({ useObjectStreams: false }));
    // transparent → ZONE_TABLE_DEFAULT_INNER_BG；parseCssColor 忽略 alpha → 实白 1 1 1 rg
    const fillIdx = plain.search(/1(\.0+)?\s+1(\.0+)?\s+1(\.0+)?\s+rg/);
    // 网格 #d4d4d8 → 212/255≈0.831
    const strokeIdx = plain.search(/0\.83\d*\s+0\.83\d*\s+0\.84\d*\s+RG/);
    expect(fillIdx, "expected white cell fill").toBeGreaterThanOrEqual(0);
    expect(strokeIdx, "expected table grid stroke color").toBeGreaterThanOrEqual(0);
    // 描边必须在填底之后，否则外框会被盖住
    expect(strokeIdx).toBeGreaterThan(fillIdx);
    const strokeOps = plain.match(/\bS\b/g) || [];
    expect(strokeOps.length).toBeGreaterThanOrEqual(4);
  });
});
