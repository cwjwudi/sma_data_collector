import { describe, expect, it } from "vitest";
import {
  formatAutoBatchOpcBindingHint,
  resolveAutoBatchOpcBinding,
  type AutoBatchOpcBinding,
} from "@/lib/auto-batch-opc-binding";
import type { ReportGeneratorPrefs } from "@/lib/report-generator-prefs";

function prefs(partial: Partial<ReportGeneratorPrefs>): ReportGeneratorPrefs {
  return partial as ReportGeneratorPrefs;
}

describe("resolveAutoBatchOpcBinding", () => {
  it("优先使用结批文件名 OPC 变量", () => {
    const binding = resolveAutoBatchOpcBinding(
      prefs({
        autoFileNameOpcServerId: "srv-a",
        autoFileNameOpcNodeId: "ns=3;i=15007",
        autoExportDirOpcServerId: "srv-b",
        autoExportDirOpcNodeId: "ns=3;i=99999",
      }),
    );
    expect(binding).toEqual({
      serverId: "srv-a",
      nodeId: "ns=3;i=15007",
      from: "fileName",
    } satisfies AutoBatchOpcBinding);
  });

  it("文件名为空时回退到保存目录 OPC", () => {
    const binding = resolveAutoBatchOpcBinding(
      prefs({
        autoFileNameOpcServerId: "",
        autoFileNameOpcNodeId: "",
        autoExportDirOpcServerId: "srv-b",
        autoExportDirOpcNodeId: "ns=3;i=88888",
      }),
    );
    expect(binding?.from).toBe("exportDir");
    expect(binding?.nodeId).toBe("ns=3;i=88888");
  });

  it("均未配置时返回 null", () => {
    expect(resolveAutoBatchOpcBinding(prefs({}))).toBeNull();
  });
});

describe("formatAutoBatchOpcBindingHint", () => {
  it("未配置时给出引导文案", () => {
    expect(formatAutoBatchOpcBindingHint(null)).toContain("生成报表");
  });

  it("已配置时展示来源与 NodeId", () => {
    const hint = formatAutoBatchOpcBindingHint({
      serverId: "s",
      nodeId: "ns=3;i=1",
      from: "fileName",
    });
    expect(hint).toContain("结批文件名 OPC");
    expect(hint).toContain("ns=3;i=1");
  });
});
