import { describe, expect, it } from "vitest";
import {
  normalizePdfExportEngine,
  readPdfExportEngineFromPrefs,
} from "@/lib/pdf-export-engine";

describe("pdf-export-engine", () => {
  it("defaults to pdf-lib (0.3.115 field verify)", () => {
    expect(normalizePdfExportEngine(undefined)).toBe("pdf-lib");
    expect(readPdfExportEngineFromPrefs({})).toBe("pdf-lib");
  });

  it("accepts chromium rollback aliases", () => {
    expect(normalizePdfExportEngine("chromium")).toBe("chromium");
    expect(normalizePdfExportEngine("printToPDF")).toBe("chromium");
    expect(readPdfExportEngineFromPrefs({ pdfExportEngine: "chromium" })).toBe("chromium");
  });

  it("accepts pdf-lib aliases", () => {
    expect(normalizePdfExportEngine("pdf-lib")).toBe("pdf-lib");
    expect(normalizePdfExportEngine("vector")).toBe("pdf-lib");
    expect(readPdfExportEngineFromPrefs({ pdfExportEngine: "pdf-lib" })).toBe("pdf-lib");
  });
});
