import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const mod = require(join(here, "../../electron/pdf-export-cancel.cjs")) as {
  registerPdfExportJob: (jobId: string) => { cancelled: boolean };
  cancelPdfExportJob: (jobId: string) => boolean;
  isPdfExportCancelled: (jobId: string) => boolean;
  unregisterPdfExportJob: (jobId: string) => void;
  resetPdfExportCancelForTests: () => void;
};

describe("pdf-export-cancel (032 P1-D)", () => {
  afterEach(() => {
    mod.resetPdfExportCancelForTests();
  });

  it("register → cancel → isCancelled", () => {
    mod.registerPdfExportJob("j1");
    expect(mod.isPdfExportCancelled("j1")).toBe(false);
    expect(mod.cancelPdfExportJob("j1")).toBe(true);
    expect(mod.isPdfExportCancelled("j1")).toBe(true);
  });

  it("unregister clears job", () => {
    mod.registerPdfExportJob("j2");
    mod.cancelPdfExportJob("j2");
    mod.unregisterPdfExportJob("j2");
    expect(mod.isPdfExportCancelled("j2")).toBe(false);
    expect(mod.cancelPdfExportJob("j2")).toBe(false);
  });
});
