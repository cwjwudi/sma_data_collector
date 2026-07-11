import { describe, expect, it } from "vitest";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import { defaultBlankLayoutSnapshot } from "@/lib/report-template/layout-model";
import {
  clampElementToLayout,
  computeFingerprints,
} from "@/lib/report-template/snapshot-fingerprint";
import {
  hydrateTemplateElement,
  createTemplate,
  ensureBodyPages,
  clampTableElementOuterSize,
  applyTemplateTableOuterHeight,
  intrinsicOuterHeightForTemplateTable,
} from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  adjustIntegerColumnPercentsAfterEdit,
  applyTableColumnResizeDeltaPx,
  integerColumnPercentsFromInnerWidthsPx,
  TABLE_COLUMN_WIDTH_PERCENT_MIN,
} from "@/lib/report-template/table-cell-metrics";
import {
  resolveTableCellBackgroundCss,
  ensureTableColBgColors,
  ZONE_TABLE_DEFAULT_INNER_BG,
} from "@/lib/report-template/layout-zone-element";

describe("computePaperLayout", () => {
  it("computes sane A4 portrait content rect", () => {
    const m = computePaperLayout("A4", "portrait", defaultBlankLayoutSnapshot());
    expect(m.pageW).toBeGreaterThan(600);
    expect(m.contentW).toBeGreaterThan(40);
    expect(m.contentH).toBeGreaterThan(40);
    expect(m.contentLeft).toBe(m.ml);
    expect(m.contentTop).toBeGreaterThanOrEqual(m.mt);
  });

  it("landscape swaps page dimensions versus portrait", () => {
    const p = computePaperLayout("A4", "portrait", defaultBlankLayoutSnapshot());
    const l = computePaperLayout("A4", "landscape", defaultBlankLayoutSnapshot());
    expect(p.pageW).toBeLessThan(p.pageH);
    expect(l.pageW).toBeGreaterThan(l.pageH);
  });
});

describe("hydrateTemplateElement", () => {
  it("fills binding defaults when migrating legacy shapes", () => {
    const el = hydrateTemplateElement({
      id: "a",
      type: "parameter",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      text: "x",
    });
    expect(el.bindingKind).toBe("none");
    expect(el.opcuaNodeId).toBe("");
  });

  it("normalizes signatureDisplayMode for signature and strips it for other types", () => {
    const sig = hydrateTemplateElement({
      id: "s",
      type: "signature",
      signatureDisplayMode: "handwriting",
    });
    expect(sig.type).toBe("signature");
    expect(sig.signatureDisplayMode).toBe("handwriting");

    const sigLegacy = hydrateTemplateElement({ id: "s2", type: "signature" });
    expect(sigLegacy.signatureDisplayMode).toBe("both");

    const txt = hydrateTemplateElement({
      id: "t",
      type: "text",
      signatureDisplayMode: "watermark" as never,
    });
    expect(txt.type).toBe("text");
    expect("signatureDisplayMode" in txt ? txt.signatureDisplayMode : undefined).toBeUndefined();
  });

  it("normalizes tableRowHeightPx for table elements", () => {
    const tb = hydrateTemplateElement({
      id: "t",
      type: "table",
      tableRowHeightPx: 200,
    });
    expect(tb.type).toBe("table");
    expect(tb.tableRowHeightPx).toBe(120);
    const txt = hydrateTemplateElement({
      id: "x",
      type: "text",
      tableRowHeightPx: 40 as never,
    });
    expect("tableRowHeightPx" in txt ? (txt as { tableRowHeightPx?: number }).tableRowHeightPx : undefined).toBeUndefined();
  });

  it("hydrates tableColWidthsPx length for tables and strips for non-table", () => {
    const tb = hydrateTemplateElement({
      id: "t",
      type: "table",
      tableCols: 3,
      tableColWidthsPx: [50, 0, -1],
    });
    expect(tb.tableCols).toBe(3);
    expect(tb.tableColWidthsPx).toEqual([50, 0, 0]);
    const txt = hydrateTemplateElement({
      id: "x",
      type: "text",
      tableColWidthsPx: [10, 20] as never,
    });
    expect((txt as { tableColWidthsPx?: number[] }).tableColWidthsPx).toBeUndefined();
  });

  it("normalizes stale vertical SQL tableRows/h on hydrate (legacy upgrade)", () => {
    const tb = hydrateTemplateElement({
      id: "vt",
      type: "table",
      tableRows: 30,
      tableCols: 2,
      tableRowHeightPx: 22,
      h: 700,
      tableSqlFill: {
        enabled: true,
        fillMode: "visual",
        layoutMode: "vertical",
        visualSource: {
          connectionId: "c1",
          table: "demo",
          engine: "mysql",
          columns: ["name", "value", ""],
          database: "",
        },
      },
    });
    expect(tb.tableRows).toBe(4);
    expect(tb.h).toBeLessThan(700);
  });

  it("clampTableElementOuterSize sets static table h to content-aware intrinsic height", () => {
    const tb = hydrateTemplateElement({
      id: "st",
      type: "table",
      tableRows: 10,
      tableCols: 2,
      tableRowHeightPx: 20,
      h: 999,
    });
    clampTableElementOuterSize(tb, 800, 2000);
    expect(tb.h).toBeLessThan(999);
    const h1 = tb.h;
    tb.tableRows = 5;
    clampTableElementOuterSize(tb, 800, 2000);
    expect(tb.h).toBeLessThan(h1!);
    tb.tableRowHeightPx = 40;
    clampTableElementOuterSize(tb, 800, 2000);
    expect(tb.h).toBeGreaterThan(h1! / 2);
  });

  it("applyTemplateTableOuterHeight maps drag height into row height", () => {
    const tb = hydrateTemplateElement({
      id: "rz",
      type: "table",
      tableRows: 4,
      tableCols: 2,
      tableRowHeightPx: 28,
      h: 100,
    });
    clampTableElementOuterSize(tb, 800, 2000);
    const before = tb.tableRowHeightPx!;
    applyTemplateTableOuterHeight(tb, (tb.h ?? 0) + 80, 2000);
    expect(tb.tableRowHeightPx).toBeGreaterThan(before);
    expect(tb.h).toBe(intrinsicOuterHeightForTemplateTable(tb));
  });
});

describe("clampElementToLayout", () => {
  it("keeps rect inside bounds", () => {
    const el = hydrateTemplateElement({ type: "text" });
    el.x = 1000;
    el.w = 500;
    clampElementToLayout(el, 200, 100);
    expect(el.x + el.w).toBeLessThanOrEqual(200);
    expect(el.y + el.h).toBeLessThanOrEqual(100);
  });
});

describe("computeFingerprints", () => {
  it("changes fingerprint when sheet content changes", () => {
    const b = blankZonesSnapshot();
    const t = createTemplate({
      name: "t",
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
    const a = computeFingerprints(t).body;
    ensureBodyPages(t)[0].push(hydrateTemplateElement({ type: "text", text: "hi" }));
    const b_fp = computeFingerprints(t).body;
    expect(a).not.toBe(b_fp);
  });
});

describe("applyTableColumnResizeDeltaPx", () => {
  it("shifts width between adjacent columns while respecting minimum column width", () => {
    const inner = 200;
    const cols = 3;
    const base = applyTableColumnResizeDeltaPx(inner, cols, null, 0, 30);
    expect(base).not.toBeNull();
    expect(base!.length).toBe(3);

    const stepped = applyTableColumnResizeDeltaPx(inner, cols, base, 1, -80);
    expect(stepped).not.toBeNull();
    expect(stepped!.every((w) => w >= 26)).toBe(true);
  });

  it("returns null when delta cannot be applied", () => {
    expect(applyTableColumnResizeDeltaPx(52, 2, null, 0, 0)).toBeNull();
    expect(applyTableColumnResizeDeltaPx(52, 2, null, 0, -999)).toBeNull();
  });
});

describe("table column width integer percents", () => {
  it("maps pixel widths to integer percents that sum to 100", () => {
    const p = integerColumnPercentsFromInnerWidthsPx([40, 30, 30], 100);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
    expect(p).toEqual([40, 30, 30]);
  });

  it("redistributes other columns after editing one percent", () => {
    const prev = [34, 33, 33];
    const next = adjustIntegerColumnPercentsAfterEdit(prev, 0, 50);
    expect(next.reduce((a, b) => a + b, 0)).toBe(100);
    expect(next.every((x) => x >= TABLE_COLUMN_WIDTH_PERCENT_MIN)).toBe(true);
    expect(next[0]).toBe(50);
    expect(next[1]).toBe(25);
    expect(next[2]).toBe(25);
  });

  it("clamps edited column so peers stay at least 1%", () => {
    const prev = [34, 33, 33];
    const next = adjustIntegerColumnPercentsAfterEdit(prev, 0, 100);
    expect(next.reduce((a, b) => a + b, 0)).toBe(100);
    expect(next[1]).toBeGreaterThanOrEqual(TABLE_COLUMN_WIDTH_PERCENT_MIN);
    expect(next[2]).toBeGreaterThanOrEqual(TABLE_COLUMN_WIDTH_PERCENT_MIN);
    expect(next[0]).toBe(98);
  });
});

describe("ensureTableColBgColors", () => {
  it("extends in place without replacing array reference when length matches", () => {
    const el = { type: "table" as const, tableCols: 3, tableColBgColors: ["#fecaca", "transparent", "transparent"] };
    const ref = el.tableColBgColors;
    ensureTableColBgColors(el);
    expect(el.tableColBgColors).toBe(ref);
    expect(el.tableColBgColors).toEqual(["#fecaca", "transparent", "transparent"]);
  });
});

describe("resolveTableCellBackgroundCss", () => {
  it("prefers cell over column and table default", () => {
    const css = resolveTableCellBackgroundCss(
      { tableBgColor: "transparent", tableColBgColors: ["#fecaca", "transparent"] },
      0,
      { bgColor: "#bbf7d0" },
    );
    expect(css).toBe("#bbf7d0");
  });

  it("falls back to column then table default", () => {
    expect(
      resolveTableCellBackgroundCss(
        { tableBgColor: "#fde68a", tableColBgColors: ["#fecaca", "transparent"] },
        0,
        { bgColor: "transparent" },
      ),
    ).toBe("#fecaca");
    expect(
      resolveTableCellBackgroundCss(
        { tableBgColor: "#fde68a", tableColBgColors: ["transparent", "transparent"] },
        1,
        undefined,
      ),
    ).toBe("#fde68a");
    expect(
      resolveTableCellBackgroundCss(
        { tableBgColor: "transparent", tableColBgColors: ["transparent"] },
        0,
        undefined,
      ),
    ).toBe(ZONE_TABLE_DEFAULT_INNER_BG);
  });
});
