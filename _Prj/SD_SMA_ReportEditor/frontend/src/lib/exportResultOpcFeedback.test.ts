import { describe, expect, it } from "vitest";
import {
  isExportResultOpcFeedbackConfigured,
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
});
