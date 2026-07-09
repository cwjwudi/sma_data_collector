import { describe, expect, it } from "vitest";
import {
  hydrateTableSqlFill,
  isVerticalSqlFill,
  TABLE_SQL_COLUMN_PICK_SEQUENCE,
  TABLE_SQL_VERTICAL_FIELD_PENDING,
} from "@/lib/report-template/table-sql-fill";
import {
  appendVerticalSqlSlot,
  applyTableSqlLayoutMode,
  applyVisualSqlOutputColumnPick,
  compileVisualTableSql,
} from "@/lib/report-template/table-sql-visual-compile";
import {
  buildVerticalSqlLogicalRows,
  verticalSqlLogicalRowCount,
} from "@/lib/report-template/table-sql-vertical";
import { formatSqlFillTableCellPreview } from "@/lib/report-template/table-sql-fill-preview";

describe("vertical sql fill", () => {
  it("transposes one SQL row into label/value logical rows with blank separators", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      fillMode: "visual",
      layoutMode: "vertical",
      visualSource: {
        connectionId: "c1",
        database: "db",
        table: "alarms",
        engine: "mysql",
        columns: ["name", "", "status"],
      },
      verticalFieldLabels: ["名称", "", "状态"],
      resultColumnNames: ["名称", "值"],
    });
    expect(isVerticalSqlFill(fill)).toBe(true);
    const logical = buildVerticalSqlLogicalRows(fill, [["泵A", "OK"]]);
    expect(logical).toEqual([
      { label: "名称", value: "泵A", blank: false },
      { label: "", value: "", blank: true },
      { label: "状态", value: "OK", blank: false },
    ]);
  });

  it("inserts blank between multiple SQL result records", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      layoutMode: "vertical",
      visualSource: {
        connectionId: "c1",
        table: "t",
        engine: "mysql",
        columns: ["a", "b"],
        database: "",
      },
    });
    expect(verticalSqlLogicalRowCount(fill, 2)).toBe(2 * 2 + 1);
    const logical = buildVerticalSqlLogicalRows(fill, [
      ["1", "x"],
      ["2", "y"],
    ]);
    expect(logical).toHaveLength(5);
    expect(logical[2].blank).toBe(true);
    expect(logical[3]).toEqual({ label: "a", value: "2", blank: false });
  });

  it("compiles SELECT without blank slots and without NULL placeholders", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      fillMode: "visual",
      layoutMode: "vertical",
      visualSource: {
        connectionId: "c1",
        table: "alarms",
        engine: "mysql",
        columns: ["name", "", "status"],
        database: "",
      },
    });
    expect(compileVisualTableSql(fill)).toBe(true);
    expect(fill.querySql).toBe("SELECT `name`, `status` FROM `alarms`");
    expect(fill.querySql).not.toContain("NULL");
  });

  it("renders vertical cells from logical rows", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      layoutMode: "vertical",
      resultColumnNames: ["名称", "值"],
      visualSource: {
        connectionId: "c1",
        table: "t",
        engine: "mysql",
        columns: ["a"],
        database: "",
      },
    });
    const preview = { dataRows: [["v1"]] };
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 0, colIndex: 0, preview })).toBe("名称");
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 1, colIndex: 0, preview })).toBe("a");
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 1, colIndex: 1, preview })).toBe("v1");
  });
});

describe("horizontal blank + sequence columns", () => {
  it("compiles only field columns and skips blank/sequence in SELECT", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      fillMode: "visual",
      visualSource: {
        connectionId: "c1",
        table: "t",
        engine: "mysql",
        columns: ["", "name", ""],
        database: "",
      },
      columnRoles: ["sequence", "field", "blank"],
      resultColumnNames: ["序号", "名称", ""],
    });
    expect(compileVisualTableSql(fill)).toBe(true);
    expect(fill.querySql).toBe("SELECT `name` FROM `t`");
  });

  it("appendVerticalSqlSlot field uses pending sentinel not blank", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      fillMode: "visual",
      layoutMode: "vertical",
      visualSource: {
        connectionId: "c1",
        table: "t",
        engine: "mysql",
        columns: ["a"],
        database: "",
      },
    });
    appendVerticalSqlSlot(fill, "field");
    expect(fill.visualSource!.columns).toEqual(["a", TABLE_SQL_VERTICAL_FIELD_PENDING]);
    appendVerticalSqlSlot(fill, "blank");
    expect(fill.visualSource!.columns).toEqual(["a", TABLE_SQL_VERTICAL_FIELD_PENDING, ""]);
  });

  it("applyVisualSqlOutputColumnPick sets sequence role", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      fillMode: "visual",
      visualSource: {
        connectionId: "c1",
        table: "t",
        engine: "mysql",
        columns: ["a", "b"],
        database: "",
      },
    });
    applyVisualSqlOutputColumnPick(fill, 2, 0, TABLE_SQL_COLUMN_PICK_SEQUENCE);
    expect(fill.columnRoles?.[0]).toBe("sequence");
    expect(fill.resultColumnNames[0]).toBe("序号");
  });

  it("formats sequence continuous vs restart_per_page across slices", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      columnRoles: ["sequence", "field"],
      sequencePageMode: "continuous",
      resultColumnNames: ["序号", "名称"],
      visualSource: {
        connectionId: "c1",
        table: "t",
        engine: "mysql",
        columns: ["", "name"],
        database: "",
      },
    });
    const preview = {
      dataRows: [
        ["", "a"],
        ["", "b"],
        ["", "c"],
      ],
    };
    // 第 2 页切片从 dataRowStart=1 起，连续编号应为 2
    expect(
      formatSqlFillTableCellPreview({
        fill,
        rowIndex: 1,
        colIndex: 0,
        preview,
        previewSlice: { dataRowStart: 1, dataRowCount: 2, includeHeaderRow: true },
      }),
    ).toBe("2");

    fill.sequencePageMode = "restart_per_page";
    expect(
      formatSqlFillTableCellPreview({
        fill,
        rowIndex: 1,
        colIndex: 0,
        preview,
        previewSlice: { dataRowStart: 1, dataRowCount: 2, includeHeaderRow: true },
      }),
    ).toBe("1");
  });

  it("blank column renders empty", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      columnRoles: ["blank", "field"],
      resultColumnNames: ["", "名称"],
      visualSource: {
        connectionId: "c1",
        table: "t",
        engine: "mysql",
        columns: ["", "name"],
        database: "",
      },
    });
    const preview = { dataRows: [["", "x"]] };
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 1, colIndex: 0, preview })).toBe("\u00a0");
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 1, colIndex: 1, preview })).toBe("x");
  });

  it("applyTableSqlLayoutMode switches to vertical and forces 2-col headers", () => {
    const fill = hydrateTableSqlFill({ enabled: true, fillMode: "visual" });
    let cols = 4;
    applyTableSqlLayoutMode(fill, "vertical", (n) => {
      cols = n;
    });
    expect(cols).toBe(2);
    expect(fill.layoutMode).toBe("vertical");
    expect(fill.resultColumnNames[0]).toBe("名称");
    expect(fill.resultColumnNames[1]).toBe("值");
    expect(fill.visualSource!.columns).toEqual([TABLE_SQL_VERTICAL_FIELD_PENDING]);
  });
});
