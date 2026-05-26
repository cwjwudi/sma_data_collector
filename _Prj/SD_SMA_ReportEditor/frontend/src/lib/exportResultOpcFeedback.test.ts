import { describe, expect, it } from "vitest";
import {
  hasAnyExportResultBinding,
  isExportResultOpcFeedbackConfigured,
  listConfiguredExportResultBindings,
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

  it("skips write when disabled or unconfigured", async () => {
    const res = await writeExportResultToOpcua(defaultExportResultOpcFeedback(), {
      success: true,
      filePath: "/tmp/a.pdf",
    });
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });
});
