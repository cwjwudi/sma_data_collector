import { describe, expect, it } from "vitest";
import {
  appendTriggerLogEntry,
  buildTriggerHistoryLoggerText,
  normalizeTriggerLog,
  triggerLogUiSlice,
  AUTO_TRIGGER_LOG_UI_MAX,
} from "@/lib/auto-trigger-log";

describe("auto-trigger-log", () => {
  it("append keeps newest first and caps length", () => {
    let log = appendTriggerLogEntry([], {
      at: "2026-01-01T00:00:00.000Z",
      event: "上升沿触发",
      fileName: "a.pdf",
      success: true,
    });
    log = appendTriggerLogEntry(log, {
      at: "2026-01-02T00:00:00.000Z",
      event: "上升沿触发",
      fileName: "b.pdf",
      success: false,
    });
    expect(log[0].fileName).toBe("b.pdf");
    expect(log[1].fileName).toBe("a.pdf");
  });

  it("normalize drops invalid rows", () => {
    const log = normalizeTriggerLog([
      { at: "t", event: "e", fileName: "x.pdf", success: true },
      { at: "", event: "e", fileName: "y.pdf", success: false },
    ]);
    expect(log).toHaveLength(1);
    expect(log[0].fileName).toBe("x.pdf");
  });

  it("ui slice limits to 10", () => {
    const log = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      event: "e",
      fileName: `${i}.pdf`,
      success: true,
    }));
    expect(triggerLogUiSlice(log)).toHaveLength(AUTO_TRIGGER_LOG_UI_MAX);
  });

  it("history logger export includes header and rows", () => {
    const text = buildTriggerHistoryLoggerText(
      { bindingLabel: "绑定 1", bindingId: "b1" },
      [{ id: "1", at: "2026-05-19T08:00:00.000Z", event: "上升沿触发", fileName: "r.pdf", success: true }],
    );
    expect(text).toContain("History Logger");
    expect(text).toContain("time\tevent");
    expect(text).toContain("r.pdf");
  });
});
