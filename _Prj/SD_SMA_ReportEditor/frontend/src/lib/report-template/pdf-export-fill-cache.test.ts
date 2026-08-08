import { describe, expect, it, beforeEach } from "vitest";
import {
  clearPdfExportFillCache,
  getPdfExportFillCache,
  setPdfExportFillCache,
  shouldReusePdfExportFill,
} from "@/lib/report-template/pdf-export-fill-cache";

describe("pdf-export-fill-cache (030)", () => {
  beforeEach(() => {
    clearPdfExportFillCache();
  });

  it("U1: part 0 never reuses; full cache allows any part>0", () => {
    setPdfExportFillCache({
      templateId: "tpl-a",
      values: { k: { text: "1" } },
      totalReports: 3,
      stats: { opcReads: 0, sqlQueries: 1, sqlRows: 5000, mongoQueries: 0 },
    });
    expect(shouldReusePdfExportFill({ templateId: "tpl-a", reportPartIndex: 0 })).toBe(false);
    expect(shouldReusePdfExportFill({ templateId: "tpl-a", reportPartIndex: 1 })).toBe(true);
    expect(shouldReusePdfExportFill({ templateId: "tpl-a", reportPartIndex: 2 })).toBe(true);
    expect(shouldReusePdfExportFill({ templateId: "tpl-b", reportPartIndex: 1 })).toBe(false);
  });

  it("U1b: 按份切片缓存仅匹配同一 partIndex", () => {
    setPdfExportFillCache({
      templateId: "tpl-a",
      values: { k: { text: "part1" } },
      totalReports: 3,
      stats: null,
      partIndex: 1,
    });
    expect(shouldReusePdfExportFill({ templateId: "tpl-a", reportPartIndex: 1 })).toBe(true);
    expect(shouldReusePdfExportFill({ templateId: "tpl-a", reportPartIndex: 2 })).toBe(false);
  });

  it("U2: clear / mismatch drops reuse", () => {
    setPdfExportFillCache({
      templateId: "tpl-a",
      values: {},
      totalReports: 2,
      stats: null,
    });
    clearPdfExportFillCache();
    expect(shouldReusePdfExportFill({ templateId: "tpl-a", reportPartIndex: 1 })).toBe(false);
    expect(getPdfExportFillCache("tpl-a")).toBeNull();
  });

  it("U3: getPdfExportFillCache requires matching templateId", () => {
    setPdfExportFillCache({
      templateId: "tpl-a",
      values: { x: { text: "ok" } },
      totalReports: 2,
      stats: null,
    });
    expect(getPdfExportFillCache("tpl-a")?.totalReports).toBe(2);
    expect(getPdfExportFillCache("other")).toBeNull();
  });
});
