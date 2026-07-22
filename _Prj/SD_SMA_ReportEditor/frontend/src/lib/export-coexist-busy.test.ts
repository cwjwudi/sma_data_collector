import { afterEach, describe, expect, it } from "vitest";
import {
  beginExportCoexistSession,
  endExportCoexistSession,
  pdfExportCoexistPauseActive,
  resetExportCoexistBusyForTests,
} from "@/lib/export-coexist-busy";

describe("export-coexist-busy (035 M8)", () => {
  afterEach(() => {
    resetExportCoexistBusyForTests();
  });

  it("full pause activates while session open", () => {
    expect(pdfExportCoexistPauseActive.value).toBe(false);
    beginExportCoexistSession("full");
    expect(pdfExportCoexistPauseActive.value).toBe(true);
    endExportCoexistSession();
    expect(pdfExportCoexistPauseActive.value).toBe(false);
  });

  it("basic session does not pause coexist UI tasks", () => {
    beginExportCoexistSession("basic");
    expect(pdfExportCoexistPauseActive.value).toBe(false);
    endExportCoexistSession();
  });

  it("nested full keeps pause until last end", () => {
    beginExportCoexistSession("full");
    beginExportCoexistSession("full");
    endExportCoexistSession();
    expect(pdfExportCoexistPauseActive.value).toBe(true);
    endExportCoexistSession();
    expect(pdfExportCoexistPauseActive.value).toBe(false);
  });
});
