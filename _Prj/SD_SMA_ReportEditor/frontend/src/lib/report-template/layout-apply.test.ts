import { describe, expect, it } from "vitest";
import { createTemplate } from "@/lib/report-template/model";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";
import {
  applyLayoutPresetToTemplate,
  clearOptionalSheetFromTemplate,
  liftZoneTablesToSheetCanvas,
  stripStaleOptionalSheetZones,
} from "@/lib/report-template/layout-apply";
import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { templateHasCoverSheet } from "@/lib/report-template/editor-sheet";
import type { ReportTemplate } from "@/lib/report-template/model";

function blankTemplate(): ReportTemplate {
  const z = blankZonesSnapshot();
  return createTemplate({
    name: "t",
    paperKind: "A4",
    orientation: "portrait",
    layoutPresetId: null,
    layoutSnapshot: z.layoutSnapshot,
    headerText: z.headerText,
    footerText: z.footerText,
    headerElements: z.headerElements,
    footerElements: z.footerElements,
    coverLayoutPresetId: null,
    coverLayoutSnapshot: z.layoutSnapshot,
    coverHeaderText: z.headerText,
    coverFooterText: z.footerText,
    coverHeaderElements: z.headerElements,
    coverFooterElements: z.footerElements,
    coverBodyZoneElements: z.bodyElements,
    backLayoutPresetId: null,
    backLayoutSnapshot: z.layoutSnapshot,
    backHeaderText: z.headerText,
    backFooterText: z.footerText,
    backHeaderElements: z.headerElements,
    backFooterElements: z.footerElements,
    backBodyZoneElements: z.bodyElements,
  });
}

function coverPresetWithTable(): LayoutPreset {
  const z = blankZonesSnapshot();
  return {
    id: "cov-tbl",
    name: "封面表格",
    updatedAt: "2026-01-01T00:00:00.000Z",
    paperKind: "A4",
    orientation: "portrait",
    marginTopMm: 15,
    marginBottomMm: 15,
    marginLeftMm: 15,
    marginRightMm: 15,
    pageRole: "cover",
    headerText: "",
    footerText: "",
    headerElements: [],
    footerElements: [],
    bodyElements: [
      { id: "ztext", type: "text", x: 10, y: 10, w: 100, h: 20, text: "标题" },
      {
        id: "ztbl",
        type: "table",
        x: 20,
        y: 60,
        w: 300,
        h: 120,
        tableRows: 2,
        tableCols: 3,
        tableRowHeightPx: 30,
        tableCells: [
          [{ text: "a" }, { text: "b" }, { bindingKind: "sql", sqlText: "SELECT 1" }],
          [{ text: "" }, { text: "" }, { text: "" }],
        ],
      },
    ],
    layoutSnapshot: z.layoutSnapshot,
  } as unknown as LayoutPreset;
}

describe("liftZoneTablesToSheetCanvas", () => {
  it("套用封面版式时正文区控件全部提升为可编辑画布控件", () => {
    const t = blankTemplate();
    applyLayoutPresetToTemplate(t, coverPresetWithTable(), "cover");

    expect(t.coverBodyZoneElements.some((e) => e.type === "table")).toBe(false);
    expect(t.coverBodyZoneElements.some((e) => e.id === "ztext")).toBe(false);
    expect(t.coverBodyZoneElements).toHaveLength(0);

    const tbl = t.coverElements.find((e) => e.id === "ztbl");
    expect(tbl).toBeTruthy();
    expect(tbl?.type).toBe("table");
    expect(tbl?.tableRows).toBe(2);
    expect(tbl?.tableCols).toBe(3);
    expect(tbl?.tableRowHeightPx).toBe(30);
    expect(tbl?.tableCells?.[0]?.[2]?.bindingKind).toBe("sql");
    expect(tbl?.tableCells?.[0]?.[2]?.sqlText).toBe("SELECT 1");

    const text = t.coverElements.find((e) => e.id === "ztext");
    expect(text).toBeTruthy();
    expect(text?.type).toBe("text");
    expect(text?.text).toBe("标题");
  });

  it("重复套用（重同步）保留画布上已编辑的表格，不产生重复控件", () => {
    const t = blankTemplate();
    const preset = coverPresetWithTable();
    applyLayoutPresetToTemplate(t, preset, "cover");
    const tbl = t.coverElements.find((e) => e.id === "ztbl");
    if (tbl?.tableCells?.[0]?.[0]) tbl.tableCells[0][0].text = "用户编辑";

    applyLayoutPresetToTemplate(t, preset, "cover");
    const after = t.coverElements.filter((e) => e.id === "ztbl");
    expect(after).toHaveLength(1);
    expect(after[0]?.tableCells?.[0]?.[0]?.text).toBe("用户编辑");
    expect(t.coverBodyZoneElements.some((e) => e.type === "table")).toBe(false);
  });

  it("对旧数据直接调用：装饰层表格与文本迁移到画布", () => {
    const t = blankTemplate();
    const preset = coverPresetWithTable();
    // 模拟旧版本落库的装饰层数据（含表格）
    applyLayoutPresetToTemplate(t, preset, "cover");
    const lifted = t.coverElements.find((e) => e.id === "ztbl");
    expect(lifted).toBeTruthy();
    expect(t.coverElements.some((e) => e.id === "ztext")).toBe(true);
    // 再次调用无副作用
    expect(liftZoneTablesToSheetCanvas(t)).toBe(false);
    expect(t.coverElements.filter((e) => e.id === "ztbl")).toHaveLength(1);
  });

  it("resync 模式：用户删除画布控件后不复活，装饰层也不残留可提升类型", () => {
    const t = blankTemplate();
    const preset = coverPresetWithTable();
    applyLayoutPresetToTemplate(t, preset, "cover");
    t.coverElements = t.coverElements.filter((e) => e.id !== "ztbl" && e.id !== "ztext");

    applyLayoutPresetToTemplate(t, preset, "cover", "resync");
    expect(t.coverElements.some((e) => e.id === "ztbl")).toBe(false);
    expect(t.coverElements.some((e) => e.id === "ztext")).toBe(false);
    expect(t.coverBodyZoneElements.some((e) => e.type === "table")).toBe(false);
    expect(t.coverBodyZoneElements.some((e) => e.id === "ztext")).toBe(false);
  });
});

describe("clearOptionalSheetFromTemplate", () => {
  it("clears cover slot so templateHasCoverSheet becomes false", () => {
    const z = blankZonesSnapshot();
    const t = createTemplate({
      name: "t",
      paperKind: "A4",
      orientation: "portrait",
      layoutPresetId: null,
      layoutSnapshot: z.layoutSnapshot,
      headerText: z.headerText,
      footerText: z.footerText,
      headerElements: z.headerElements,
      footerElements: z.footerElements,
      coverLayoutPresetId: null,
      coverLayoutSnapshot: z.layoutSnapshot,
      coverHeaderText: z.headerText,
      coverFooterText: z.footerText,
      coverHeaderElements: z.headerElements,
      coverFooterElements: z.footerElements,
      coverBodyZoneElements: z.bodyElements,
      backLayoutPresetId: null,
      backLayoutSnapshot: z.layoutSnapshot,
      backHeaderText: z.headerText,
      backFooterText: z.footerText,
      backHeaderElements: z.headerElements,
      backFooterElements: z.footerElements,
      backBodyZoneElements: z.bodyElements,
    });
    const preset: LayoutPreset = {
      id: "cov-1",
      name: "封面 A",
      updatedAt: "2026-01-01T00:00:00.000Z",
      paperKind: "A4",
      orientation: "portrait",
      marginTopMm: 15,
      marginBottomMm: 15,
      marginLeftMm: 15,
      marginRightMm: 15,
      pageRole: "cover",
      headerText: "HDR",
      footerText: "",
      headerElements: [{ id: "h1", type: "text", x: 1, y: 1, w: 10, h: 5, text: "x" }],
      footerElements: [],
      bodyElements: [],
      layoutSnapshot: z.layoutSnapshot,
    };
    applyLayoutPresetToTemplate(t, preset, "cover");
    expect(templateHasCoverSheet(t)).toBe(true);

    clearOptionalSheetFromTemplate(t, "cover");
    expect(t.coverLayoutPresetId).toBeNull();
    expect(templateHasCoverSheet(t)).toBe(false);
  });

  it("stripStaleOptionalSheetZones removes orphan zones when preset id was cleared", () => {
    const z = blankZonesSnapshot();
    const t = createTemplate({
      name: "t",
      paperKind: "A4",
      orientation: "portrait",
      layoutPresetId: null,
      layoutSnapshot: z.layoutSnapshot,
      headerText: z.headerText,
      footerText: z.footerText,
      headerElements: z.headerElements,
      footerElements: z.footerElements,
      coverLayoutPresetId: null,
      coverLayoutSnapshot: z.layoutSnapshot,
      coverHeaderText: z.headerText,
      coverFooterText: z.footerText,
      coverHeaderElements: [{ id: "h1", type: "text", x: 1, y: 1, w: 10, h: 5, text: "x" }],
      coverFooterElements: z.footerElements,
      coverBodyZoneElements: z.bodyElements,
      backLayoutPresetId: null,
      backLayoutSnapshot: z.layoutSnapshot,
      backHeaderText: z.headerText,
      backFooterText: z.footerText,
      backHeaderElements: z.headerElements,
      backFooterElements: z.footerElements,
      backBodyZoneElements: z.bodyElements,
    });
    expect(templateHasCoverSheet(t)).toBe(true);
    expect(stripStaleOptionalSheetZones(t, "cover")).toBe(true);
    expect(templateHasCoverSheet(t)).toBe(false);
  });
});
