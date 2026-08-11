import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPreviewLevelPdfDefaultMigration,
  normalizePdfExportEngine,
  PDF_EXPORT_PREVIEW_DEFAULT_MIGRATE_KEY,
  readPdfExportEngineFromPrefs,
} from "@/lib/pdf-export-engine";

describe("pdf-export-engine (034 M11)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  it("defaults to chromium (preview-level delivery)", () => {
    expect(normalizePdfExportEngine(undefined)).toBe("chromium");
    expect(normalizePdfExportEngine("")).toBe("chromium");
    expect(readPdfExportEngineFromPrefs({})).toBe("chromium");
  });

  it("accepts chromium aliases", () => {
    expect(normalizePdfExportEngine("chromium")).toBe("chromium");
    expect(normalizePdfExportEngine("printToPDF")).toBe("chromium");
    expect(readPdfExportEngineFromPrefs({ pdfExportEngine: "chromium" })).toBe("chromium");
  });

  it("accepts pdf-lib aliases (draft opt-in)", () => {
    expect(normalizePdfExportEngine("pdf-lib")).toBe("pdf-lib");
    expect(normalizePdfExportEngine("vector")).toBe("pdf-lib");
    expect(readPdfExportEngineFromPrefs({ pdfExportEngine: "pdf-lib" })).toBe("pdf-lib");
  });

  it("one-time migrates stored pdf-lib default to chromium", () => {
    const first = applyPreviewLevelPdfDefaultMigration({ pdfExportEngine: "pdf-lib" as const });
    expect(first.changed).toBe(true);
    expect(first.prefs.pdfExportEngine).toBe("chromium");
    expect(localStorage.getItem(PDF_EXPORT_PREVIEW_DEFAULT_MIGRATE_KEY)).toBe("1");

    const second = applyPreviewLevelPdfDefaultMigration({ pdfExportEngine: "pdf-lib" as const });
    expect(second.changed).toBe(false);
    expect(second.prefs.pdfExportEngine).toBe("pdf-lib");
  });
});
