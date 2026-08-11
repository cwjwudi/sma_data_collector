import { describe, expect, it } from "vitest";
import { buildHistoryRootOptions, normalizeRootKey } from "./report-history-roots";

describe("buildHistoryRootOptions（046 Q7B）", () => {
  it("puts the global export root first, then nonBatch template dirs", () => {
    const out = buildHistoryRootOptions("C:\\Export", [
      { name: "日报", reportKind: "nonBatch", nonBatchOutputDir: "D:\\Reports\\Daily" },
      { name: "结批", reportKind: "batch", nonBatchOutputDir: "" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ path: "C:\\Export", kind: "global" });
    expect(out[1]).toMatchObject({ path: "D:\\Reports\\Daily", kind: "nonBatch" });
    expect(out[1].label).toContain("日报");
  });

  it("deduplicates directories case-insensitively across separators", () => {
    const out = buildHistoryRootOptions("C:\\Export", [
      { name: "A", reportKind: "nonBatch", nonBatchOutputDir: "c:/export" },
      { name: "B", reportKind: "nonBatch", nonBatchOutputDir: "D:/Daily" },
      { name: "C", reportKind: "nonBatch", nonBatchOutputDir: "D:\\Daily\\" },
    ]);
    expect(out.map((x) => x.path)).toEqual(["C:\\Export", "D:/Daily"]);
  });

  it("skips nonBatch templates without a directory and works without a global root", () => {
    const out = buildHistoryRootOptions(null, [
      { name: "A", reportKind: "nonBatch", nonBatchOutputDir: "  " },
      { name: "B", reportKind: "nonBatch", nonBatchOutputDir: "/srv/reports" },
      { name: "C", reportKind: undefined, nonBatchOutputDir: "/ignored" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ path: "/srv/reports", kind: "nonBatch" });
  });
});

describe("normalizeRootKey", () => {
  it("normalizes separators, trailing slashes and case", () => {
    expect(normalizeRootKey("D:\\Reports\\Daily\\")).toBe(normalizeRootKey("d:/reports/daily"));
  });
});
