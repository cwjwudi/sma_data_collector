import { describe, expect, it } from "vitest";
import {
  applyVisualSqlOutputColumnPick,
  compileVisualTableSql,
  syncVisualFillQueryAndResultNames,
} from "@/lib/report-template/table-sql-visual-compile";
import type { TableSqlFillConfig } from "@/lib/report-template/table-sql-fill";
import { defaultSqlParam, hydrateTableSqlFill } from "@/lib/report-template/table-sql-fill";

describe("compileVisualTableSql", () => {
  it("builds mysql SELECT with placeholders and flattens params", () => {
    const fill: TableSqlFillConfig = hydrateTableSqlFill({});
    fill.enabled = true;
    fill.fillMode = "visual";
    fill.visualSource = {
      connectionId: "c1",
      database: "db1",
      table: "t_log",
      engine: "mysql",
      columns: ["id", "status"],
    };
    fill.visualFilters = [
      {
        id: "f1",
        column: "ts",
        kind: "datetime_between",
        defaults: ["2026-01-01T00:00", "2026-01-31T23:59"],
        bindings: [defaultSqlParam(), defaultSqlParam()],
      },
      {
        id: "f2",
        column: "status",
        kind: "equality",
        defaults: ["RUN"],
        bindings: [defaultSqlParam()],
      },
    ];
    expect(compileVisualTableSql(fill)).toBe(true);
    expect(fill.querySql).toContain("SELECT");
    expect(fill.querySql).toContain("`id`");
    expect(fill.querySql).toContain("WHERE");
    expect(fill.querySql).toContain("{{p0}}");
    expect(fill.querySql).toContain("{{p2}}");
    expect(fill.params.length).toBe(3);
    expect(fill.params[2].literalFallback).toBe("RUN");
    expect(fill.params[2].source).toBe("literal");
  });

  it("uses NULL for empty visual output column slots", () => {
    const fill: TableSqlFillConfig = hydrateTableSqlFill({});
    fill.enabled = true;
    fill.fillMode = "visual";
    fill.visualSource = {
      connectionId: "c1",
      database: "db1",
      table: "t_log",
      engine: "mysql",
      columns: ["id", "", "name"],
    };
    expect(compileVisualTableSql(fill)).toBe(true);
    expect(fill.querySql).toContain("NULL");
    expect(fill.querySql).toContain("`id`");
    expect(fill.querySql).toContain("`name`");
  });

  it("strips opcua node id from compiled flat param when binding source is literal", () => {
    const fill: TableSqlFillConfig = hydrateTableSqlFill({});
    fill.enabled = true;
    fill.fillMode = "visual";
    fill.visualSource = {
      connectionId: "c1",
      database: "db1",
      table: "t_log",
      engine: "mysql",
      columns: ["id"],
    };
    fill.visualFilters = [
      {
        id: "f1",
        column: "status",
        kind: "equality",
        defaults: ["X"],
        bindings: [{ source: "literal", opcuaNodeId: "ns=0;i=1", aboveCellColumnIndex: 0, literalFallback: "" }],
      },
    ];
    expect(compileVisualTableSql(fill)).toBe(true);
    expect(fill.params[0].source).toBe("literal");
    expect(fill.params[0].opcuaNodeId).toBe("");
    expect(fill.params[0].literalFallback).toBe("X");
  });

  it("defaults visual result header to picked field name", () => {
    const fill: TableSqlFillConfig = hydrateTableSqlFill({});
    fill.enabled = true;
    fill.fillMode = "visual";
    fill.visualSource = {
      connectionId: "c1",
      database: "db1",
      table: "t_log",
      engine: "mysql",
      columns: [""],
    };
    applyVisualSqlOutputColumnPick(fill, 1, 0, "status");
    expect(fill.visualSource.columns[0]).toBe("status");
    expect(fill.resultColumnNames[0]).toBe("status");
  });

  it("keeps custom visual result headers when recompiling", () => {
    const fill: TableSqlFillConfig = hydrateTableSqlFill({});
    fill.enabled = true;
    fill.fillMode = "visual";
    fill.visualSource = {
      connectionId: "c1",
      database: "db1",
      table: "t_log",
      engine: "mysql",
      columns: ["status"],
    };
    fill.resultColumnNames = ["状态"];
    syncVisualFillQueryAndResultNames(fill, 1);
    expect(fill.querySql).toContain("`status`");
    expect(fill.resultColumnNames[0]).toBe("状态");
  });
});
