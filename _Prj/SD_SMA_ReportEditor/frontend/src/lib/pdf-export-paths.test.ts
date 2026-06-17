import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { outputPathForReportPart } = require("../../electron/pdf-export-paths.cjs") as {
  outputPathForReportPart: (filePath: string, partIndex: number, totalReports: number) => string;
};

describe("outputPathForReportPart", () => {
  it("keeps the original path when there is only one report", () => {
    const filePath = path.join("D:", "reports", "batch.pdf");
    expect(outputPathForReportPart(filePath, 0, 1)).toBe(filePath);
  });

  it("creates unique pdf paths for split report parts", () => {
    const filePath = path.join("D:", "reports", "batch.pdf");
    expect(outputPathForReportPart(filePath, 0, 2)).toBe(path.join("D:", "reports", "batch_part-1-of-2.pdf"));
    expect(outputPathForReportPart(filePath, 1, 2)).toBe(path.join("D:", "reports", "batch_part-2-of-2.pdf"));
  });

  it("adds a pdf extension when the selected path has no extension", () => {
    const filePath = path.join("D:", "reports", "batch");
    expect(outputPathForReportPart(filePath, 0, 2)).toBe(path.join("D:", "reports", "batch_part-1-of-2.pdf"));
  });
});
