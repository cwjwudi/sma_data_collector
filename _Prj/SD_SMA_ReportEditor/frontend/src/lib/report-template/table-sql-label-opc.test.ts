import { describe, expect, it } from "vitest";
import {
  hydrateTableSqlFill,
  resolveContinueRecordSepLabel,
  resolveResultColumnName,
  resolveTableSqlLabelDisplay,
  verticalSlotLabel,
} from "@/lib/report-template/table-sql-fill";
import { applyTableSqlFillOpcPick } from "@/lib/report-template/table-sql-visual-compile";
import {
  TABLE_SQL_FILL_SEP_PICK_SLOT,
  tableSqlFillHdrPickSlot,
  tableSqlFillVlabelPickSlot,
} from "@/lib/report-template/table-sql-fill";

describe("table sql label OPC", () => {
  it("resolveTableSqlLabelDisplay prefers OPC over static", () => {
    expect(
      resolveTableSqlLabelDisplay({
        staticText: "中文",
        binding: { bindingKind: "opcua", opcuaNodeId: "ns=1;s=L" },
        opcPreviewText: "EN Label",
      }),
    ).toBe("EN Label");
    expect(
      resolveTableSqlLabelDisplay({
        staticText: "中文",
        binding: { bindingKind: "opcua", opcuaNodeId: "ns=1;s=L" },
        opcPreviewText: "",
      }),
    ).toBe("中文");
  });

  it("verticalSlotLabel and headers honor bindings", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      layoutMode: "vertical",
      visualSource: {
        connectionId: "c",
        table: "t",
        engine: "mysql",
        columns: ["f1"],
        database: "",
      },
      verticalFieldLabels: ["标签"],
      resultColumnNames: ["名称", "值"],
    });
    applyTableSqlFillOpcPick(fill, tableSqlFillVlabelPickSlot(0), "ns=2;s=VLabel");
    applyTableSqlFillOpcPick(fill, tableSqlFillHdrPickSlot(0), "ns=2;s=Hdr");
    applyTableSqlFillOpcPick(fill, TABLE_SQL_FILL_SEP_PICK_SLOT, "ns=2;s=Sep");
    expect(fill.verticalFieldLabelBindings?.[0]?.opcuaNodeId).toBe("ns=2;s=VLabel");
    expect(verticalSlotLabel(fill, 0, { previewText: "Label EN" })).toBe("Label EN");
    expect(resolveResultColumnName(fill, 0, { previewText: "Name" })).toBe("Name");
    expect(resolveContinueRecordSepLabel(fill, { previewText: "---" })).toBe("---");
  });
});
