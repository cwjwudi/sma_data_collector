import { describe, expect, it } from "vitest";
import { humanizePdfExportError, formatPreflightBlockerSummary } from "./pdfExportErrors";
import {
  collectBindingPreviewIssues,
  summarizeBindingPreviewIssues,
} from "./bindingPreviewErrors";

describe("humanizePdfExportError", () => {
  it("maps render timeout", () => {
    expect(humanizePdfExportError("PDF 渲染超时")).toContain("超过 2 分钟");
  });

  it("maps disk full", () => {
    expect(humanizePdfExportError({ message: "ENOSPC" })).toContain("磁盘空间不足");
  });
});

describe("formatPreflightBlockerSummary", () => {
  it("lists multiple issues", () => {
    const s = formatPreflightBlockerSummary(["连接 A 失败", "连接 B 失败"]);
    expect(s).toContain("2 个问题");
  });
});

describe("bindingPreviewErrors", () => {
  it("collects opc/sql/fill errors", () => {
    const issues = collectBindingPreviewIssues({
      "param:1": { text: "（OPC）连接超时" },
      "cell:2:0:0": { text: "（SQL）access denied" },
      "table:3": {
        text: "（填充）error",
        tableSqlFill: { dataRows: [], error: "boom" },
      },
    });
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(summarizeBindingPreviewIssues(issues)).toContain("数据源填充失败");
  });
});
