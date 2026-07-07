import { describe, expect, it } from "vitest";
import {
  buildExportResultPlcMessage,
  hasAnyExportResultBinding,
  isExportResultOpcFeedbackConfigured,
  listConfiguredExportResultBindings,
  resolveExportResultOpcWriteContext,
  writeExportResultToOpcua,
} from "./exportResultOpcFeedback";
import {
  defaultExportResultOpcFeedback,
  defaultReportGeneratorPrefs,
  isExportResultOpcCustomized,
  resolveExportResultOpcForTemplate,
} from "@/lib/report-generator-prefs";

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

  it("detects customized per-template feedback", () => {
    expect(isExportResultOpcCustomized(defaultExportResultOpcFeedback())).toBe(false);
    expect(
      isExportResultOpcCustomized({ ...defaultExportResultOpcFeedback(), enabled: true }),
    ).toBe(true);
    expect(
      isExportResultOpcCustomized({
        ...defaultExportResultOpcFeedback(),
        messageNodeId: "ns=1;s=Msg",
      }),
    ).toBe(true);
    expect(
      isExportResultOpcCustomized({ ...defaultExportResultOpcFeedback(), serverId: "s1" }),
    ).toBe(true);
  });

  it("falls back to default config when template entry is a blank snapshot", () => {
    const prefs = defaultReportGeneratorPrefs();
    prefs.exportResultOpc = {
      ...defaultExportResultOpcFeedback(),
      enabled: true,
      serverId: "s1",
      statusNodeId: "ns=1;s=Status",
    };
    // 历史遗留：模版条目是自动生成的空白快照
    prefs.exportResultOpcByTemplateId = { "tpl-1": defaultExportResultOpcFeedback() };

    const resolved = resolveExportResultOpcForTemplate(prefs, "tpl-1");
    expect(resolved).toBe(prefs.exportResultOpc);
    expect(resolveExportResultOpcWriteContext(resolved).ok).toBe(true);
  });

  it("keeps per-template config when user customized it", () => {
    const prefs = defaultReportGeneratorPrefs();
    prefs.exportResultOpc = {
      ...defaultExportResultOpcFeedback(),
      enabled: true,
      serverId: "s1",
      statusNodeId: "ns=1;s=Status",
    };
    const custom = {
      ...defaultExportResultOpcFeedback(),
      enabled: false,
      serverId: "s2",
      statusNodeId: "ns=9;s=Other",
    };
    prefs.exportResultOpcByTemplateId = { "tpl-1": custom };

    // 用户为该模版单独配置过（即使当前禁用）也应尊重模版配置
    expect(resolveExportResultOpcForTemplate(prefs, "tpl-1")).toBe(custom);
    // 未配置过的模版走默认
    expect(resolveExportResultOpcForTemplate(prefs, "tpl-2")).toBe(prefs.exportResultOpc);
  });
});
