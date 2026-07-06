import { describe, expect, it } from "vitest";
import {
  buildExportResultPlcMessage,
  hasAnyExportResultBinding,
  isExportResultOpcFeedbackConfigured,
  listConfiguredExportResultBindings,
  resolveExportResultOpcWriteContext,
  writeExportResultToOpcua,
} from "./exportResultOpcFeedback";
import { defaultExportResultOpcFeedback } from "@/lib/report-generator-prefs";

describe("exportResultOpcFeedback", () => {
  it("detects configured feedback", () => {
    expect(isExportResultOpcFeedbackConfigured(defaultExportResultOpcFeedback())).toBe(false);
    expect(
      isExportResultOpcFeedbackConfigured({
        ...defaultExportResultOpcFeedback(),
        enabled: true,
        serverId: "s1",
        statusNodeId: "ns=2;i=3",
      }),
    ).toBe(true);
  });

  it("lists only configured bindings", () => {
    const fb = {
      ...defaultExportResultOpcFeedback(),
      statusNodeId: "ns=2;i=1",
      messageNodeId: "",
      filePathNodeId: "ns=2;s=path",
    };
    expect(listConfiguredExportResultBindings(fb)).toEqual(["status", "path"]);
    expect(hasAnyExportResultBinding(fb)).toBe(true);
    expect(hasAnyExportResultBinding(defaultExportResultOpcFeedback())).toBe(false);
  });

  it("buildExportResultPlcMessage uses batch labels for manual vs auto", () => {
    expect(
      buildExportResultPlcMessage({ success: true, fileName: "a.pdf" }, "manual"),
    ).toBe("模拟截批");
    expect(buildExportResultPlcMessage({ success: true, fileName: "a.pdf" }, "auto")).toBe("截批");
    expect(buildExportResultPlcMessage({ success: false, message: "网络错误" }, "manual")).toBe(
      "网络错误",
    );
  });

  it("buildExportResultPlcMessage includes split pdf count", () => {
    expect(
      buildExportResultPlcMessage(
        {
          success: true,
          fileName: "a.pdf",
          filePath: "C:/report/a_part-1-of-2.pdf",
          filePaths: ["C:/report/a_part-1-of-2.pdf", "C:/report/a_part-2-of-2.pdf"],
        },
        "auto",
      ),
    ).toContain("共 2 份 PDF");
  });

  it("skips write when disabled or unconfigured", async () => {
    const res = await writeExportResultToOpcua(defaultExportResultOpcFeedback(), {
      success: true,
      filePath: "/tmp/a.pdf",
    });
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.skipped).toBe(true);
  });

  it("requires OPC server when nodes are bound", () => {
    const ctx = resolveExportResultOpcWriteContext({
      ...defaultExportResultOpcFeedback(),
      enabled: true,
      statusNodeId: "ns=1;s=Status",
    });
    expect(ctx.ok).toBe(false);
    if (!ctx.ok) expect(ctx.message).toContain("OPC UA");
  });
});
