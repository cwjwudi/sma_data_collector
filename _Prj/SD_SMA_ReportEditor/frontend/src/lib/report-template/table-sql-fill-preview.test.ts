import { describe, expect, it } from "vitest";
import {
  hydrateTableSqlFill,
  visualSqlNeedsStructureTable,
  visualSqlStructureTableName,
} from "@/lib/report-template/table-sql-fill";
import { formatScalarForPreviewValue } from "@/lib/report-template/binding-preview-utils";
import {
  sanitizeOpcTableName,
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

describe("formatScalarForPreviewValue datetime normalization", () => {
  it("replaces ISO T separator with space", () => {
    // 回归：数据库 datetime 经 JSON 序列化带 T（2026-07-08T15:19:48），报表应显示空格分隔
    expect(formatScalarForPreviewValue("2026-07-08T15:19:48")).toBe("2026-07-08 15:19:48");
    expect(formatScalarForPreviewValue("2026-07-08T15:19:48.123")).toBe("2026-07-08 15:19:48.123");
    expect(formatScalarForPreviewValue("2026-07-08T15:19:48+08:00")).toBe("2026-07-08 15:19:48+08:00");
  });

  it("keeps non-datetime strings untouched", () => {
    expect(formatScalarForPreviewValue("T恤批次")).toBe("T恤批次");
    expect(formatScalarForPreviewValue("2026-07-08")).toBe("2026-07-08");
    expect(formatScalarForPreviewValue(42)).toBe("42");
  });
});
