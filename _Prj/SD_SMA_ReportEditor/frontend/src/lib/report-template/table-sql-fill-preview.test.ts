import { describe, expect, it } from "vitest";
import {
  hydrateTableSqlFill,
  visualSqlNeedsStructureTable,
  visualSqlStructureTableName,
} from "@/lib/report-template/table-sql-fill";
import { formatScalarForPreviewValue } from "@/lib/report-template/binding-preview-utils";
import {
  formatSqlFillTableCellPreview,
  sanitizeOpcTableName,
  sqlFillPreviewTruncationHint,
  sqlFillQueryLimit,
  substituteSqlFillTableName,
  TABLE_SQL_FILL_FULL_ROW_LIMIT,
  TABLE_SQL_FILL_PREVIEW_ROW_LIMIT,
} from "@/lib/report-template/table-sql-fill-preview";

describe("visualSqlStructureTableName / visualSqlNeedsStructureTable", () => {
  it("uses visualSource.table as structure table regardless of opcua runtime name", () => {
    expect(
      visualSqlStructureTableName({
        connectionId: "c1",
        database: "db",
        table: "sensor_tpl",
        engine: "mysql",
        columns: [],
        tableSource: "opcua",
        tableOpcNodeId: "ns=2;s=DynTable",
      }),
    ).toBe("sensor_tpl");
  });

  it("flags missing structure table only in opcua mode", () => {
    expect(
      visualSqlNeedsStructureTable({
        connectionId: "c1",
        database: "db",
        table: "",
        engine: "mysql",
        columns: [],
        tableSource: "opcua",
        tableOpcNodeId: "ns=2;s=DynTable",
      }),
    ).toBe(true);
    expect(
      visualSqlNeedsStructureTable({
        connectionId: "c1",
        database: "db",
        table: "sensor_tpl",
        engine: "mysql",
        columns: [],
        tableSource: "opcua",
        tableOpcNodeId: "ns=2;s=DynTable",
      }),
    ).toBe(false);
    expect(
      visualSqlNeedsStructureTable({
        connectionId: "c1",
        database: "db",
        table: "",
        engine: "mysql",
        columns: [],
        tableSource: "manual",
      }),
    ).toBe(false);
  });
});

describe("sqlFillQueryLimit", () => {
  it("editor preview caps at preview limit", () => {
    const fill = hydrateTableSqlFill({ maxRows: 5000 });
    expect(sqlFillQueryLimit(fill, false)).toBe(TABLE_SQL_FILL_PREVIEW_ROW_LIMIT);
  });

  it("editor preview keeps small maxRows", () => {
    const fill = hydrateTableSqlFill({ maxRows: 30 });
    expect(sqlFillQueryLimit(fill, false)).toBe(30);
  });

  it("export honors user maxRows above preview limit (no split)", () => {
    // 回归：此前导出沿用预览上限，maxRows>1000 且未开分报表时被静默截断到 1000 行
    const fill = hydrateTableSqlFill({ maxRows: 2000 });
    expect(sqlFillQueryLimit(fill, true)).toBe(2000);
  });

  it("export with split fetches full rows for chunking", () => {
    const fill = hydrateTableSqlFill({ maxRows: 2000, splitReportsOnMaxRows: true });
    expect(sqlFillQueryLimit(fill, true)).toBe(TABLE_SQL_FILL_FULL_ROW_LIMIT);
  });

  it("044: split export no longer capped at 50000 (80000-row site case fits)", () => {
    // 回归：现网 5 万总量帽会把 8 万条结果静默截断；防护值必须远大于现场量级
    const fill = hydrateTableSqlFill({ maxRows: 1000, splitReportsOnMaxRows: true });
    expect(sqlFillQueryLimit(fill, true)).toBeGreaterThanOrEqual(80000);
  });
});

describe("sqlFillPreviewTruncationHint", () => {
  it("未触及预览上限时无提示（所见即所得）", () => {
    const fill = hydrateTableSqlFill({ enabled: true, maxRows: 2000 });
    expect(sqlFillPreviewTruncationHint(fill, 300)).toBeNull();
    expect(sqlFillPreviewTruncationHint(fill, 999)).toBeNull();
  });

  it("取回行数触及 1000 预览上限（maxRows>1000）时给出提示", () => {
    const fill = hydrateTableSqlFill({ enabled: true, maxRows: 2000 });
    const hint = sqlFillPreviewTruncationHint(fill, 1000);
    expect(hint).not.toBeNull();
    expect(hint!.previewLimit).toBe(1000);
    expect(hint!.singleReportMaxRows).toBe(2000);
    expect(hint!.message).toContain("1000");
    expect(hint!.message).toContain("2000");
    expect(hint!.message).toContain("导出");
  });

  it("开启拆分时提示提及份数", () => {
    const fill = hydrateTableSqlFill({ enabled: true, maxRows: 2000, splitReportsOnMaxRows: true });
    const hint = sqlFillPreviewTruncationHint(fill, 1000);
    expect(hint).not.toBeNull();
    expect(hint!.splitEnabled).toBe(true);
    expect(hint!.message).toContain("份");
  });

  it("maxRows<=1000 时预览上限即 maxRows，取满即提示（单报表已满、数据可能更多）", () => {
    const fill = hydrateTableSqlFill({ enabled: true, maxRows: 500 });
    expect(sqlFillPreviewTruncationHint(fill, 499)).toBeNull();
    const hint = sqlFillPreviewTruncationHint(fill, 500);
    expect(hint).not.toBeNull();
    expect(hint!.previewLimit).toBe(500);
    expect(hint!.singleReportMaxRows).toBe(500);
  });
});

describe("sanitizeOpcTableName", () => {
  it("accepts valid identifiers and trims", () => {
    expect(sanitizeOpcTableName(" batch_2026 ")).toBe("batch_2026");
    expect(sanitizeOpcTableName("_t1")).toBe("_t1");
  });

  it("rejects illegal names (injection safety)", () => {
    expect(sanitizeOpcTableName("user; DROP TABLE x")).toBe("");
    expect(sanitizeOpcTableName("2026table")).toBe("");
    expect(sanitizeOpcTableName("表")).toBe("");
    expect(sanitizeOpcTableName("")).toBe("");
    expect(sanitizeOpcTableName(null)).toBe("");
  });
});

describe("substituteSqlFillTableName", () => {
  it("quotes per engine", () => {
    expect(substituteSqlFillTableName("SELECT a FROM {{table}}", "mysql", "t1")).toBe(
      "SELECT a FROM `t1`",
    );
    expect(substituteSqlFillTableName("SELECT a FROM {{table}}", "postgres", "t1")).toBe(
      'SELECT a FROM "t1"',
    );
  });
});

describe("formatSqlFillTableCellPreview 空结果不渲染字面省略号", () => {
  const NBSP = " ";

  function verticalFill() {
    return hydrateTableSqlFill({
      enabled: true,
      fillMode: "visual",
      layoutMode: "vertical",
      visualSource: {
        connectionId: "c1",
        database: "db",
        table: "alarms",
        engine: "mysql",
        columns: ["name", "status"],
      },
      verticalFieldLabels: ["名称", "状态"],
      resultColumnNames: ["名称", "值"],
    });
  }

  it("纵表查询返回 0 行（非加载）时正文格为空白而非 '…'", () => {
    // 回归：导出 refresh 为 silent（previewLoading=false），纵表 0 数据仍保留槽位行，
    // 旧逻辑落到 return "…"，PDF 里印出字面省略号
    const fill = verticalFill();
    const pv = { dataRows: [] as string[][] };
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 1, colIndex: 0, preview: pv, previewLoading: false })).toBe(NBSP);
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 1, colIndex: 1, preview: pv, previewLoading: false })).toBe(NBSP);
  });

  it("纵表 0 行时表头行仍显示列名", () => {
    const fill = verticalFill();
    const pv = { dataRows: [] as string[][] };
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 0, colIndex: 0, preview: pv, previewLoading: false })).toBe("名称");
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 0, colIndex: 1, preview: pv, previewLoading: false })).toBe("值");
  });

  it("加载中占位 '…' 不被误伤", () => {
    const fill = verticalFill();
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 1, colIndex: 0, preview: null, previewLoading: true })).toBe("…");
  });

  it("横表查询返回 0 行（非加载）时正文格为空白而非 '…'", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      fillMode: "visual",
      layoutMode: "horizontal",
      visualSource: {
        connectionId: "c1",
        database: "db",
        table: "alarms",
        engine: "mysql",
        columns: ["name", "status"],
      },
      resultColumnNames: ["名称", "状态"],
    });
    const pv = { dataRows: [] as string[][] };
    expect(formatSqlFillTableCellPreview({ fill, rowIndex: 1, colIndex: 0, preview: pv, previewLoading: false })).toBe(NBSP);
  });
});

describe("formatScalarForPreviewValue datetime normalization", () => {
  it("normalizes ISO datetime to DB-style display (space, no timezone)", () => {
    // 回归：数据库 DATETIME 经 JSON 变成 ISO（T / +00:00），数据参数与表格应显示空格分隔
    expect(formatScalarForPreviewValue("2026-07-08T15:19:48")).toBe("2026-07-08 15:19:48");
    expect(formatScalarForPreviewValue("2026-07-08T15:19:48.123")).toBe("2026-07-08 15:19:48.123");
    expect(formatScalarForPreviewValue("2026-07-10T13:00:51+00:00")).toBe("2026-07-10 13:00:51");
    expect(formatScalarForPreviewValue("2026-07-08T15:19:48+08:00")).toBe("2026-07-08 15:19:48");
    expect(formatScalarForPreviewValue("2026-07-08T15:19:48Z")).toBe("2026-07-08 15:19:48");
  });

  it("keeps non-datetime strings untouched", () => {
    expect(formatScalarForPreviewValue("T恤批次")).toBe("T恤批次");
    expect(formatScalarForPreviewValue("2026-07-08")).toBe("2026-07-08");
    expect(formatScalarForPreviewValue(42)).toBe("42");
    expect(formatScalarForPreviewValue(null)).toBe("");
  });
});
