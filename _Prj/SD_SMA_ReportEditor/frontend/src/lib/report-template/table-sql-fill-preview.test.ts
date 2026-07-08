import { describe, expect, it } from "vitest";
import { hydrateTableSqlFill } from "@/lib/report-template/table-sql-fill";
import {
  sqlFillQueryLimit,
  TABLE_SQL_FILL_FULL_ROW_LIMIT,
  TABLE_SQL_FILL_PREVIEW_ROW_LIMIT,
} from "@/lib/report-template/table-sql-fill-preview";

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
