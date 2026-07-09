import { describe, expect, it } from "vitest";
import { hydrateTableCell, migrateReportTemplate, type ReportTemplate } from "@/lib/report-template/model";
import { hydrateZoneTableCell } from "@/lib/report-template/layout-zone-element";
import { collectBindingDedupeTasks, resolveEffectiveScalarSql } from "@/lib/report-template/binding-preview-utils";
import { clearGridCellBindings } from "@/lib/report-template/table-binding-utils";
import type { ScalarSqlVisualConfig } from "@/lib/report-template/scalar-sql-visual";

const visual: ScalarSqlVisualConfig = {
  connectionId: "c1",
  database: "wn_9",
  table: "product_data",
  engine: "mysql",
  valueColumn: "product_name",
  whereColumn: "batch_no",
  whereParamSlot: 0,
};

describe("单元格标量 SQL 点选配置", () => {
  it("hydrateTableCell 保留点选配置（fillMode + visual）", () => {
    const cell = hydrateTableCell({
      bindingKind: "sql",
      sqlText: "",
      scalarSqlFillMode: "visual",
      scalarSqlVisual: visual,
    });
    expect(cell.scalarSqlFillMode).toBe("visual");
    expect(cell.scalarSqlVisual?.table).toBe("product_data");
    expect(cell.scalarSqlVisual?.valueColumn).toBe("product_name");
  });

  it("hydrateTableCell 对旧数据不注入默认点选对象", () => {
    const cell = hydrateTableCell({ bindingKind: "sql", sqlText: "SELECT 1" });
    expect(cell.scalarSqlFillMode).toBeUndefined();
    expect(cell.scalarSqlVisual).toBeUndefined();
  });

  it("hydrateZoneTableCell 保留点选配置", () => {
    const cell = hydrateZoneTableCell({
      bindingKind: "sql",
      sqlText: "",
      scalarSqlFillMode: "visual",
      scalarSqlVisual: visual,
    });
    expect(cell.scalarSqlFillMode).toBe("visual");
    expect(cell.scalarSqlVisual?.whereColumn).toBe("batch_no");
  });

  it("visual 模式下 resolveEffectiveScalarSql 编译点选配置（sqlText 未同步也可用）", () => {
    expect(resolveEffectiveScalarSql("", "visual", visual)).toBe(
      "SELECT `product_name` FROM `product_data` WHERE `batch_no` = {{p0}} LIMIT 1",
    );
  });

  it("collectBindingDedupeTasks 携带可视化库名与连接，避免 MySQL 1046", () => {
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
            bindingKind: "sql",
            sqlText: "",
            scalarSqlFillMode: "visual",
            scalarSqlVisual: visual,
            sqlParams: [],
          },
        ],
      ],
    }) as ReportTemplate;
    const { sqlTasks } = collectBindingDedupeTasks(tmpl, null, "fallback-conn");
    expect(sqlTasks).toHaveLength(1);
    expect(sqlTasks[0].connectionId).toBe("c1");
    expect(sqlTasks[0].database).toBe("wn_9");
    expect(sqlTasks[0].sql).toContain("product_name");
  });

  it("clearGridCellBindings 一并清空点选配置", () => {
    const cell = hydrateTableCell({
      bindingKind: "sql",
      sqlText: "SELECT 1",
      scalarSqlFillMode: "visual",
      scalarSqlVisual: visual,
    });
    clearGridCellBindings([[cell]]);
    expect(cell.bindingKind).toBe("none");
    expect(cell.sqlText).toBe("");
    expect(cell.scalarSqlVisual).toBeNull();
  });
});
