import { describe, expect, it } from "vitest";
import {
  bindScalarSqlParams,
  quoteSqlScalarValue,
  sqlParamPlaceholder,
  sqlResponseFirstScalar,
  substituteScalarSqlParams,
} from "@/lib/report-template/binding-preview-utils";
import type { TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";

const BS = "\\"; // 单个反斜杠，避免手工计数转义

describe("substituteScalarSqlParams", () => {
  it("uses live OPC values and quotes strings safely", () => {
    const params: TableSqlParamBinding[] = [
      { source: "opcua", opcuaNodeId: "ns=2;s=batch", aboveCellColumnIndex: 0, literalFallback: "" },
    ];

    expect(substituteScalarSqlParams("SELECT v FROM t WHERE batch = {{p0}}", params, { 0: "A'01" })).toBe(
      "SELECT v FROM t WHERE batch = 'A''01'",
    );
  });

  it("uses literal fallbacks when no live value exists", () => {
    const params: TableSqlParamBinding[] = [
      { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "42" },
      { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "RUN" },
    ];

    expect(substituteScalarSqlParams("SELECT {{p0}}, {{p1}}, {{p2}}", params, {})).toBe(
      "SELECT 42, 'RUN', NULL",
    );
  });

  it("accepts uppercase placeholder names", () => {
    const params: TableSqlParamBinding[] = [
      {
        source: "opcua",
        opcuaNodeId: "ns=6;s=::DataGen:strBatchCode",
        aboveCellColumnIndex: 0,
        literalFallback: "",
      },
    ];

    expect(
      substituteScalarSqlParams(
        "SELECT product_name FROM wn_9.product_data WHERE batch_no = {{P0}}",
        params,
        { 0: "BATCH-20260603-001" },
      ),
    ).toBe("SELECT product_name FROM wn_9.product_data WHERE batch_no = 'BATCH-20260603-001'");
  });

  it("does not double-quote quoted placeholders", () => {
    const params: TableSqlParamBinding[] = [
      {
        source: "opcua",
        opcuaNodeId: "ns=6;s=::DataGen:strBatchCode",
        aboveCellColumnIndex: 0,
        literalFallback: "",
      },
    ];

    expect(
      substituteScalarSqlParams(
        "SELECT product_name FROM wn_9.product_data WHERE batch_no = '{{P0}}'",
        params,
        { 0: "BATCH-20260603-001" },
      ),
    ).toBe("SELECT product_name FROM wn_9.product_data WHERE batch_no = 'BATCH-20260603-001'");
  });
});

describe("quoteSqlScalarValue 方言相关转义（防注入/防断串）", () => {
  it("mysql 系转义反斜杠，尾随反斜杠不再逃逸闭合引号", () => {
    // 回归：MySQL/MariaDB 默认反斜杠为转义符，值 'C:\' 会把闭合引号转义掉 → 断串/注入
    expect(quoteSqlScalarValue("C:" + BS, { engine: "mysql" })).toBe("'C:" + BS + BS + "'");
    expect(quoteSqlScalarValue("a" + BS, { engine: "mariadb" })).toBe("'a" + BS + BS + "'");
  });

  it("postgres/sqlite 标准字符串不转义反斜杠（反斜杠为字面量）", () => {
    expect(quoteSqlScalarValue("C:" + BS, { engine: "postgres" })).toBe("'C:" + BS + "'");
    expect(quoteSqlScalarValue("C:" + BS, { engine: "sqlite" })).toBe("'C:" + BS + "'");
  });

  it("mysql 系同时转义引号与反斜杠，中和注入载荷", () => {
    // 载荷 \' OR 1=1-- ：\ → \\，' → '' ，整体仍被安全包裹为字面量
    const out = quoteSqlScalarValue(BS + "' OR 1=1--", { engine: "mysql" });
    expect(out).toBe("'" + BS + BS + "''" + " OR 1=1--'");
  });

  it("引号在各方言下均按 SQL 标准翻倍", () => {
    expect(quoteSqlScalarValue("A'01", { engine: "mysql" })).toBe("'A''01'");
    expect(quoteSqlScalarValue("A'01", { engine: "postgres" })).toBe("'A''01'");
  });
});

describe("substituteScalarSqlParams 透传 engine", () => {
  it("mysql 系参数值中的反斜杠被安全转义", () => {
    const params: TableSqlParamBinding[] = [
      { source: "opcua", opcuaNodeId: "ns=2;s=p", aboveCellColumnIndex: 0, literalFallback: "" },
    ];
    expect(
      substituteScalarSqlParams("SELECT * FROM t WHERE path = {{p0}}", params, { 0: "C:" + BS }, "mysql"),
    ).toBe("SELECT * FROM t WHERE path = 'C:" + BS + BS + "'");
  });
});

describe("bindScalarSqlParams 真参数化（P2-A）", () => {
  it("mysql/postgres 用 %s，sqlite 用 ?", () => {
    expect(sqlParamPlaceholder("mysql")).toBe("%s");
    expect(sqlParamPlaceholder("mariadb")).toBe("%s");
    expect(sqlParamPlaceholder("postgres")).toBe("%s");
    expect(sqlParamPlaceholder("sqlite")).toBe("?");
  });

  it("将 {{pN}} 编译为占位符，值只在 params 数组", () => {
    const params: TableSqlParamBinding[] = [
      { source: "opcua", opcuaNodeId: "ns=2;s=batch", aboveCellColumnIndex: 0, literalFallback: "" },
    ];
    const out = bindScalarSqlParams(
      "SELECT v FROM t WHERE batch = {{p0}}",
      params,
      { 0: "A'01" },
      "mysql",
    );
    expect(out.sql).toBe("SELECT v FROM t WHERE batch = %s");
    expect(out.params).toEqual(["A'01"]);
    expect(out.sql).not.toContain("A'01");
  });

  it("剥掉带引号占位符，不双包引号", () => {
    const params: TableSqlParamBinding[] = [
      { source: "opcua", opcuaNodeId: "n", aboveCellColumnIndex: 0, literalFallback: "" },
    ];
    const out = bindScalarSqlParams(
      "SELECT * FROM t WHERE batch_no = '{{P0}}'",
      params,
      { 0: "BATCH-1" },
      "mysql",
    );
    expect(out.sql).toBe("SELECT * FROM t WHERE batch_no = %s");
    expect(out.params).toEqual(["BATCH-1"]);
  });

  it("params 顺序随占位出现顺序（乱序 p2 再 p0）", () => {
    const params: TableSqlParamBinding[] = [
      { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "A" },
      { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "B" },
      { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "C" },
    ];
    const out = bindScalarSqlParams(
      "SELECT {{p2}}, {{p0}}",
      params,
      { 0: "live0", 2: "live2" },
      "postgres",
    );
    expect(out.sql).toBe("SELECT %s, %s");
    expect(out.params).toEqual(["live2", "live0"]);
  });

  it("注入载荷与反斜杠不进入 SQL 文本", () => {
    const params: TableSqlParamBinding[] = [
      { source: "opcua", opcuaNodeId: "n", aboveCellColumnIndex: 0, literalFallback: "" },
    ];
    const payload = BS + "' OR 1=1--";
    const out = bindScalarSqlParams(
      "SELECT * FROM t WHERE path = {{p0}}",
      params,
      { 0: "C:" + BS },
      "mysql",
    );
    expect(out.sql).toBe("SELECT * FROM t WHERE path = %s");
    expect(out.params).toEqual(["C:" + BS]);
    expect(out.sql).not.toContain(BS);
    const inj = bindScalarSqlParams("SELECT * FROM t WHERE x = {{p0}}", params, { 0: payload }, "mysql");
    expect(inj.sql).not.toContain("OR 1=1");
    expect(inj.params).toEqual([payload]);
  });

  it("literal fallback：数字裸绑、字符串绑、缺省 NULL", () => {
    const params: TableSqlParamBinding[] = [
      { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "42" },
      { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "RUN" },
      { source: "literal", opcuaNodeId: "", aboveCellColumnIndex: 0, literalFallback: "" },
    ];
    const out = bindScalarSqlParams("SELECT {{p0}}, {{p1}}, {{p2}}", params, {}, "sqlite");
    expect(out.sql).toBe("SELECT ?, ?, ?");
    expect(out.params).toEqual([42, "RUN", null]);
  });
});

describe("sqlResponseFirstScalar", () => {
  it("reads the first object field when columns are string names", () => {
    expect(
      sqlResponseFirstScalar({
        columns: ["product_name"],
        rows: [{ product_name: "Sample Product 1" }],
      }),
    ).toBe("Sample Product 1");
  });

  it("uses only the first row when a scalar query returns multiple rows", () => {
    expect(
      sqlResponseFirstScalar({
        columns: ["product_name"],
        rows: [{ product_name: "Sample Product 1" }, { product_name: "Sample Product 2" }],
      }),
    ).toBe("Sample Product 1");
  });
});
