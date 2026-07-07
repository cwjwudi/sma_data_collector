import { describe, expect, it } from "vitest";
import { compileScalarVisualSql } from "@/lib/report-template/scalar-sql-visual-compile";
import type { ScalarSqlVisualConfig } from "@/lib/report-template/scalar-sql-visual";

function visual(partial: Partial<ScalarSqlVisualConfig>): ScalarSqlVisualConfig {
  return {
    connectionId: "c1",
    database: "wn_9",
    table: "product_data",
    engine: "mysql",
    valueColumn: "product_name",
    whereColumn: "",
    whereParamSlot: 0,
    ...partial,
  };
}

describe("compileScalarVisualSql", () => {
  it("无筛选时生成 LIMIT 1 标量查询", () => {
    expect(compileScalarVisualSql(visual({}))).toBe(
      "SELECT `product_name` FROM `product_data` LIMIT 1",
    );
  });

  it("有筛选列时绑定 p0/p1 参数", () => {
    expect(
      compileScalarVisualSql(
        visual({ whereColumn: "batch_no", whereParamSlot: 0 }),
      ),
    ).toBe("SELECT `product_name` FROM `product_data` WHERE `batch_no` = {{p0}} LIMIT 1");

    expect(
      compileScalarVisualSql(
        visual({ whereColumn: "batch_no", whereParamSlot: 1 }),
      ),
    ).toBe("SELECT `product_name` FROM `product_data` WHERE `batch_no` = {{p1}} LIMIT 1");
  });

  it("缺少表或列时返回空字符串", () => {
    expect(compileScalarVisualSql(visual({ table: "", valueColumn: "" }))).toBe("");
  });
});
