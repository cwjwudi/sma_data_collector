import { describe, expect, it, vi } from "vitest";
import { resolveSqlParamValues } from "@/lib/report-template/binding-preview-utils";
import { defaultSqlParam } from "@/lib/report-template/table-sql-fill";

describe("resolveSqlParamValues", () => {
  it("结批批次号从自动结批 OPC 读取", async () => {
    const readOpc = vi.fn(async () => ({ ok: true, value: "BATCH-001" }));
    const values = await resolveSqlParamValues(
      [{ ...defaultSqlParam(), source: "batch_no" }],
      {
        defaultOpcServerId: "default-srv",
        batchBinding: { serverId: "batch-srv", nodeId: "ns=3;i=15007", from: "fileName" },
        readOpc,
      },
    );
    expect(values).toEqual({ 0: "BATCH-001" });
    expect(readOpc).toHaveBeenCalledWith("batch-srv", "ns=3;i=15007");
  });

  it("批次号未配置且无兜底时抛错", async () => {
    await expect(
      resolveSqlParamValues([{ ...defaultSqlParam(), source: "batch_no" }], {
        defaultOpcServerId: "s",
        batchBinding: null,
        readOpc: vi.fn(),
      }),
    ).rejects.toThrow(/结批批次号/);
  });
});
