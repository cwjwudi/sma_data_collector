import { describe, expect, it } from "vitest";
import { sqlResponseFirstScalar, substituteScalarSqlParams } from "@/lib/report-template/binding-preview-utils";
import type { TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";

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
