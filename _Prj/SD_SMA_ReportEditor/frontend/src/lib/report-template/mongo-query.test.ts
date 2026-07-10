import { describe, expect, it } from "vitest";
import {
  defaultMongoQueryConfig,
  hydrateMongoQuery,
  parseMongoFilterJson,
  parseMongoPipelineJson,
  substituteMongoCollection,
  substituteMongoJsonParams,
} from "./mongo-query";
import { quoteSqlIdentifier, quoteSqlTableRef } from "./table-sql-visual-compile";
import { collectBindingDedupeTasks, connectionSupportsMongo, connectionSupportsSql } from "./binding-preview-utils";
import { compileScalarVisualSql } from "./scalar-sql-visual-compile";
import { migrateReportTemplate, type ReportTemplate } from "./model";
import { defaultTableSqlFillConfig } from "./table-sql-fill";

describe("mongo-query helpers", () => {
  it("hydrates defaults", () => {
    const q = hydrateMongoQuery({});
    expect(q.mode).toBe("find");
    expect(q.filterJson).toBe("{}");
    expect(q.limit).toBe(200);
  });

  it("substitutes {{pN}} then parses JSON", () => {
    const value = substituteMongoJsonParams('{"batch":{{p0}},"n":{{p1}}}', { 0: "B1", 1: 3 });
    expect(value).toEqual({ batch: "B1", n: 3 });
  });

  it("parses pipeline and filter", () => {
    expect(parseMongoFilterJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseMongoPipelineJson('[{"$limit":1}]')).toEqual([{ $limit: 1 }]);
    expect(parseMongoPipelineJson("{}")).toEqual([]);
  });

  it("substitutes collection from OPC", () => {
    expect(substituteMongoCollection("fallback", "live_col")).toBe("live_col");
    expect(substituteMongoCollection("fallback", "")).toBe("fallback");
  });

  it("defaultMongoQueryConfig is stable", () => {
    expect(defaultMongoQueryConfig().pipelineJson).toBe("[]");
  });
});

describe("sql dialect quoting", () => {
  it("quotes by engine", () => {
    expect(quoteSqlIdentifier("mysql", "t")).toBe("`t`");
    expect(quoteSqlIdentifier("mariadb", "t")).toBe("`t`");
    expect(quoteSqlIdentifier("postgres", "t")).toBe('"t"');
    expect(quoteSqlIdentifier("sqlite", "t")).toBe('"t"');
  });

  it("quotes postgres schema.table", () => {
    expect(quoteSqlTableRef("postgres", "app.orders")).toBe('"app"."orders"');
    expect(quoteSqlTableRef("sqlite", "orders")).toBe('"orders"');
  });

  it("scalar visual compile refuses missing engine / mongodb", () => {
    expect(
      compileScalarVisualSql({
        connectionId: "c",
        database: "d",
        table: "t",
        engine: "",
        valueColumn: "v",
        whereColumn: "",
        whereParamSlot: 0,
      }),
    ).toBe("");
    expect(
      compileScalarVisualSql({
        connectionId: "c",
        database: "d",
        table: "t",
        engine: "mongodb",
        valueColumn: "v",
        whereColumn: "",
        whereParamSlot: 0,
      }),
    ).toBe("");
    expect(
      compileScalarVisualSql({
        connectionId: "c",
        database: "d",
        table: "app.t",
        engine: "postgres",
        valueColumn: "v",
        whereColumn: "",
        whereParamSlot: 0,
      }),
    ).toBe('SELECT "v" FROM "app"."t" LIMIT 1');
  });
});

describe("connection engine gates", () => {
  it("supports sql vs mongo", () => {
    expect(connectionSupportsSql("mysql")).toBe(true);
    expect(connectionSupportsSql("postgres")).toBe(true);
    expect(connectionSupportsSql("sqlite")).toBe(true);
    expect(connectionSupportsSql("mongodb")).toBe(false);
    expect(connectionSupportsMongo("mongodb")).toBe(true);
    expect(connectionSupportsMongo("mysql")).toBe(false);
  });
});

describe("collectBindingDedupeTasks mongo", () => {
  it("collects parameter mongo + table fill mongo", () => {
    const fill = defaultTableSqlFillConfig();
    fill.enabled = true;
    fill.fillMode = "mongo";
    fill.mongoQuery = {
      ...defaultMongoQueryConfig(),
      connectionId: "m1",
      database: "db",
      collection: "col",
      mode: "find",
      filterJson: '{"a":1}',
    };
    const tmpl = migrateReportTemplate({
      id: "t1",
      name: "t",
      updatedAt: "",
      bodyPages: [
        [
          {
            id: "p1",
            type: "parameter",
            x: 0,
            y: 0,
            w: 40,
            h: 20,
            bindingKind: "mongo",
            mongoQuery: {
              ...defaultMongoQueryConfig(),
              connectionId: "m1",
              database: "db",
              collection: "metrics",
              valueField: "value",
            },
            sqlParams: [],
          },
          {
            id: "tbl1",
            type: "table",
            x: 0,
            y: 40,
            w: 200,
            h: 100,
            tableRows: 2,
            tableCols: 2,
            tableSqlFill: fill,
          },
        ],
      ],
    }) as ReportTemplate;
    const { mongoTasks, sqlTasks } = collectBindingDedupeTasks(tmpl, null, null);
    expect(sqlTasks).toHaveLength(0);
    expect(mongoTasks.length).toBeGreaterThanOrEqual(2);
    expect(mongoTasks.some((t) => t.collection === "metrics")).toBe(true);
    expect(mongoTasks.some((t) => t.collection === "col" && t.tableFillColCount === 2)).toBe(true);
  });

  it("skips table fill mongo when fillMode is not mongo", () => {
    const fill = defaultTableSqlFillConfig();
    fill.enabled = true;
    fill.fillMode = "manual_sql";
    fill.querySql = "SELECT 1";
    fill.mongoQuery = {
      ...defaultMongoQueryConfig(),
      connectionId: "m1",
      database: "db",
      collection: "col",
    };
    const tmpl = migrateReportTemplate({
      id: "t2",
      name: "t",
      updatedAt: "",
      bodyPages: [
        [
          {
            id: "tbl1",
            type: "table",
            x: 0,
            y: 0,
            w: 200,
            h: 100,
            tableRows: 2,
            tableCols: 2,
            tableSqlFill: fill,
          },
        ],
      ],
    }) as ReportTemplate;
    const { mongoTasks } = collectBindingDedupeTasks(tmpl, null, "sql1");
    expect(mongoTasks).toHaveLength(0);
  });
});
