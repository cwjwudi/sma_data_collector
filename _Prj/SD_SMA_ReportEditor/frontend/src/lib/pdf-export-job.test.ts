import { describe, expect, it } from "vitest";
import {
  clearPdfExportFillCacheAfterFailure,
  isPdfExportCancelledError,
  newPdfExportJobId,
} from "@/lib/pdf-export-job";
import {
  clearPdfExportFillCache,
  peekPdfExportFillCache,
  setPdfExportFillCache,
} from "@/lib/report-template/pdf-export-fill-cache";

describe("pdf-export-job (032 P1-D)", () => {
  it("newPdfExportJobId unique-ish", () => {
    const a = newPdfExportJobId("t");
    const b = newPdfExportJobId("t");
    expect(a).not.toBe(b);
    expect(a.startsWith("t-")).toBe(true);
  });

  it("isPdfExportCancelledError", () => {
    expect(isPdfExportCancelledError(new Error("导出已取消"))).toBe(true);
    expect(isPdfExportCancelledError("Export cancelled")).toBe(true);
    expect(isPdfExportCancelledError(new Error("timeout"))).toBe(false);
  });

  it("clearPdfExportFillCacheAfterFailure clears cache", () => {
    clearPdfExportFillCache();
    setPdfExportFillCache({
      templateId: "x",
      values: {},
      totalReports: 2,
      stats: null,
    });
    expect(peekPdfExportFillCache()?.templateId).toBe("x");
    clearPdfExportFillCacheAfterFailure(new Error("导出已取消"));
    expect(peekPdfExportFillCache()).toBeNull();
  });
});
