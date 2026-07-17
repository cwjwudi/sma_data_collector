/**
 * P3：度量/getter 函数副作用剥离。
 * templateTableColumnInnerWidthsPx / intrinsicOuterHeightForTemplateTable 等度量函数
 * 曾在内部调 ensureTableGrid 就地改 el（补齐 tableColWidthsPx/tableColBgColors、重塑
 * tableCells），在 Vue computed / 渲染期产生非用户 mutation（undo/redo 隐患、重复 ensure）。
 * 这些是纯读取几何的 getter，必须做到「调用后不改 el」，且对已一致的网格结果与旧行为一致。
 */
import { describe, it, expect } from "vitest";
import {
  ensureTableGrid,
  intrinsicOuterHeightForTemplateTable,
  minOuterSizeForTable,
  templateTableColumnInnerWidthsPx,
  type TemplateElement,
} from "@/lib/report-template/model";
import {
  computeZoneTableContentRowHeightsPx,
  ensureZoneTableGrid,
  intrinsicOuterHeightForZoneTable,
  minOuterSizeForZoneTable,
  zoneTableColumnInnerWidthsPx,
  zoneTableVerticalChromePx,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";
import { hydrateTableSqlFill } from "@/lib/report-template/table-sql-fill";

/** 构造「网格已一致、但 tableColWidthsPx/tableColBgColors 故意留空」的正文表：
 *  旧实现会在度量时把两个空数组补齐到列数 → 正好用来验证「无副作用」。 */
function makeTemplateTable(overrides: Partial<TemplateElement> = {}): TemplateElement {
  const rows = 3;
  const cols = 4;
  const tableCells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      text: "",
      bindingKind: "none" as const,
      opcuaNodeId: "",
      sqlText: "",
      sqlParams: [],
      bgColor: "transparent",
    })),
  );
  return {
    id: "t1",
    type: "table",
    x: 0,
    y: 0,
    w: 408,
    h: 100,
    tableRows: rows,
    tableCols: cols,
    tableCells,
    tableColWidthsPx: [],
    tableColBgColors: [],
    tableRowHeightPx: 30,
    fontSize: 12,
    ...overrides,
  } as unknown as TemplateElement;
}

function makeZoneTable(overrides: Partial<LayoutZoneElement> = {}): LayoutZoneElement {
  return makeTemplateTable(overrides as Partial<TemplateElement>) as unknown as LayoutZoneElement;
}

describe("度量 getter 无副作用（渲染/computed 安全）", () => {
  it("templateTableColumnInnerWidthsPx 不写回 el，且结果与预先 ensure 后一致", () => {
    const el = makeTemplateTable();
    const cellsRef = el.tableCells;

    const widths = templateTableColumnInnerWidthsPx(el);

    // 结果正确：与「显式 ensure 后再量」的旧路径一致
    const pre = makeTemplateTable();
    ensureTableGrid(pre);
    const expected = templateTableColumnInnerWidthsPx(pre);
    expect(widths).toEqual(expected);
    expect(widths).toHaveLength(4);

    // 无副作用：空数组不被补齐、网格引用不变
    expect(el.tableColWidthsPx).toHaveLength(0);
    expect(el.tableColBgColors).toHaveLength(0);
    expect(el.tableCells).toBe(cellsRef);
    expect(el.tableRows).toBe(3);
    expect(el.tableCols).toBe(4);
  });

  it("intrinsicOuterHeightForTemplateTable 不写回 el，且结果与预先 ensure 后一致", () => {
    const el = makeTemplateTable();
    const cellsRef = el.tableCells;

    const h = intrinsicOuterHeightForTemplateTable(el);

    const pre = makeTemplateTable();
    ensureTableGrid(pre);
    expect(h).toBe(intrinsicOuterHeightForTemplateTable(pre));
    expect(h).toBeGreaterThan(0);

    expect(el.tableColWidthsPx).toHaveLength(0);
    expect(el.tableColBgColors).toHaveLength(0);
    expect(el.tableCells).toBe(cellsRef);
  });

  it("minOuterSizeForTable 不写回 el", () => {
    const el = makeTemplateTable();
    const cellsRef = el.tableCells;

    const size = minOuterSizeForTable(el);
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);

    expect(el.tableColWidthsPx).toHaveLength(0);
    expect(el.tableColBgColors).toHaveLength(0);
    expect(el.tableCells).toBe(cellsRef);
  });

  it("zoneTableColumnInnerWidthsPx 不写回 el，且结果与预先 ensure 后一致", () => {
    const el = makeZoneTable();
    const cellsRef = el.tableCells;

    const widths = zoneTableColumnInnerWidthsPx(el);

    const pre = makeZoneTable();
    ensureZoneTableGrid(pre);
    expect(widths).toEqual(zoneTableColumnInnerWidthsPx(pre));
    expect(widths).toHaveLength(4);

    expect(el.tableColWidthsPx).toHaveLength(0);
    expect(el.tableColBgColors).toHaveLength(0);
    expect(el.tableCells).toBe(cellsRef);
  });

  it("intrinsicOuterHeightForZoneTable / computeZoneTableContentRowHeightsPx 不写回 el", () => {
    const el = makeZoneTable();
    const cellsRef = el.tableCells;

    const h = intrinsicOuterHeightForZoneTable(el);
    const heights = computeZoneTableContentRowHeightsPx(el);

    const pre = makeZoneTable();
    ensureZoneTableGrid(pre);
    expect(h).toBe(intrinsicOuterHeightForZoneTable(pre));
    expect(heights).toEqual(computeZoneTableContentRowHeightsPx(pre));

    expect(el.tableColWidthsPx).toHaveLength(0);
    expect(el.tableColBgColors).toHaveLength(0);
    expect(el.tableCells).toBe(cellsRef);
  });

  it("P2-C：Zone SQL 填充不再走 chrome+rows*minH 短路，长文案抬高外框", () => {
    const long = "很长的单元格文案 ".repeat(40);
    const el = makeZoneTable({
      tableSqlFill: hydrateTableSqlFill({ enabled: true, maxRows: 2000 }),
      tableRowHeightPx: 24,
      w: 200,
    });
    ensureZoneTableGrid(el);
    const shortCircuit = zoneTableVerticalChromePx() + 3 * 24;
    const h = intrinsicOuterHeightForZoneTable(el, (ri, ci) => (ri === 1 && ci === 0 ? long : ""));
    expect(h).toBeGreaterThan(shortCircuit);
  });
});
