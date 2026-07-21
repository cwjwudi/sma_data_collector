import { describe, expect, it } from "vitest";
import {
  normalizePdfExportEngine,
  readPdfExportEngineFromPrefs,
} from "@/lib/pdf-export-engine";

describe("pdf-export-engine", () => {
  it("defaults to chromium", () => {
    expect(normalizePdfExportEngine(undefined)).toBe("chromium");
    expect(readPdfExportEngineFromPrefs({})).toBe("chromium");
  });

  it("accepts pdf-lib aliases", () => {
    expect(normalizePdfExportEngine("pdf-lib")).toBe("pdf-lib");
    expect(normalizePdfExportEngine("vector")).toBe("pdf-lib");
    expect(readPdfExportEngineFromPrefs({ pdfExportEngine: "pdf-lib" })).toBe("pdf-lib");
  });
});
