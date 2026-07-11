import { describe, expect, it } from "vitest";
import {
  ensureTableGrid,
  type TemplateElement,
} from "@/lib/report-template/model";
import {
  ensureTableSqlResultColumnNames,
  ensureVerticalFieldLabels,
  hydrateTableSqlFill,
  resolveContinueRecordSepLabel,
  resolveResultColumnName,
  resolveTableSqlLabelDisplay,
  TABLE_SQL_FILL_SEP_PICK_SLOT,
  tableSqlFillHdrPickSlot,
  tableSqlFillVlabelPickSlot,
  verticalSlotLabel,
} from "@/lib/report-template/table-sql-fill";
import { applyTableSqlFillOpcPick } from "@/lib/report-template/table-sql-visual-compile";

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
    expect(fill.verticalFieldLabelBindings?.[0]).toEqual({
      bindingKind: "opcua",
      opcuaNodeId: "ns=2;s=VLabel",
    });
    expect(fill.resultColumnNameBindings?.[0]).toEqual({
      bindingKind: "opcua",
      opcuaNodeId: "ns=2;s=Hdr",
    });
    expect(fill.continueRecordSepLabelBinding).toEqual({
      bindingKind: "opcua",
      opcuaNodeId: "ns=2;s=Sep",
    });
    expect(verticalSlotLabel(fill, 0, { previewText: "EN" })).toBe("EN");
    expect(resolveResultColumnName(fill, 0, { previewText: "HDR" })).toBe("HDR");
    expect(resolveContinueRecordSepLabel(fill, { previewText: "SEP" })).toBe("SEP");
  });

  it("ensure*Bindings keeps array identity across repeated ensureTableGrid (Vue render-safe)", () => {
    const fill = hydrateTableSqlFill({
      enabled: true,
      resultColumnNames: ["a", "b"],
      resultColumnNameBindings: [
        { bindingKind: "opcua", opcuaNodeId: "ns=1;s=A" },
        { bindingKind: "none", opcuaNodeId: "" },
      ],
      layoutMode: "vertical",
      visualSource: {
        connectionId: "c",
        table: "t",
        engine: "mysql",
        columns: ["f1", "f2"],
        database: "",
      },
      verticalFieldLabels: ["L1", "L2"],
      verticalFieldLabelBindings: [
        { bindingKind: "none", opcuaNodeId: "" },
        { bindingKind: "opcua", opcuaNodeId: "ns=1;s=B" },
      ],
    });
    const el = {
      id: "t1",
      type: "table",
      tableRows: 3,
      tableCols: 2,
      tableCells: [],
      tableSqlFill: fill,
    } as unknown as TemplateElement;

    ensureTableGrid(el);
    const hdrRef = fill.resultColumnNameBindings;
    const vRef = fill.verticalFieldLabelBindings;
    const hdr0 = hdrRef![0];
    const v1 = vRef![1];

    ensureTableGrid(el);
    ensureTableSqlResultColumnNames(fill, 2);
    ensureVerticalFieldLabels(fill);
    ensureTableGrid(el);

    expect(fill.resultColumnNameBindings).toBe(hdrRef);
    expect(fill.verticalFieldLabelBindings).toBe(vRef);
    expect(fill.resultColumnNameBindings![0]).toBe(hdr0);
    expect(fill.verticalFieldLabelBindings![1]).toBe(v1);
    expect(fill.resultColumnNameBindings![0].opcuaNodeId).toBe("ns=1;s=A");
    expect(fill.verticalFieldLabelBindings![1].opcuaNodeId).toBe("ns=1;s=B");
  });
});
