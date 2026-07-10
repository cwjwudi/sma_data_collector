import { describe, expect, it } from "vitest";
import { humanizePdfExportError, formatPreflightBlockerSummary } from "./pdfExportErrors";
import {
  collectBindingPreviewIssues,
  summarizeBindingPreviewIssues,
  parseExportFailureDiagnostics,
} from "./bindingPreviewErrors";

describe("humanizePdfExportError", () => {
  it("maps render timeout", () => {
    expect(humanizePdfExportError("PDF 渲染超时")).toContain("可能原因");
  });

  it("maps disk full", () => {
    expect(humanizePdfExportError({ message: "ENOSPC" })).toContain("磁盘空间不足");
  });

  it("剥掉 IPC 包装前缀，不把已可读化的超时误判为数据源检查未通过", () => {
    const wrapped =
      "Error invoking remote method 'pdf-export-run': Error: 导出超时。请检查数据库 / OPC UA 连接与网络，然后重试。";
    const out = humanizePdfExportError(wrapped);
    expect(out).toBe("导出超时。请检查数据库 / OPC UA 连接与网络，然后重试。");
    expect(out).not.toContain("数据源检查未通过");
  });

  it("主进程渲染超时文案原样透传", () => {
    const wrapped =
      "Error invoking remote method 'pdf-export-run': Error: PDF 渲染超时：渲染窗口约 2 分钟无响应（页面可能加载失败或取数卡住）\n可能原因：模版较大、数据源取数慢或渲染窗口无响应。";
    const out = humanizePdfExportError(wrapped);
    expect(out.startsWith("PDF 渲染超时：渲染窗口约 2 分钟无响应")).toBe(true);
    expect(out).not.toContain("数据源检查未通过");
  });

  it("真正的预检失败摘要保持原样", () => {
    const summary = "发现 1 个问题：\n1. OPC UA 连接「PLC」测试失败";
    expect(humanizePdfExportError(summary)).toBe(summary);
  });

  it("配置缺失类错误不包装成数据源检查未通过", () => {
    const msg = "未配置 OPC UA 自动结批保存目录";
    expect(humanizePdfExportError(msg)).toBe(msg);
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

  it("includes table diagnostics in issue lines", () => {
    const issues = collectBindingPreviewIssues({
      "tblfill:1": {
        text: "（填充）Table missing",
        tableSqlFill: {
          dataRows: [],
          error: "Table missing",
          diagnostics: {
            resolvedTable: "data_batchinfo_20260707",
            tableOpcNodeId: "ns=6;s=Table",
            database: "sma_data_test",
            sqlExecuted: "SELECT * FROM `data_batchinfo_20260707`",
          },
        },
      },
    });
    expect(issues[0]).toContain("运行时表名=data_batchinfo_20260707");
    expect(issues[0]).toContain("表名OPC=");
  });

  it("parses export diagnostics marker from error message", () => {
    const { message, diagnostics } = parseExportFailureDiagnostics(
      "导出前数据源检查未通过。\n\n---EXPORT_DIAGNOSTICS---\n{\"issueCount\":1,\"issues\":[{\"key\":\"a\",\"kind\":\"fill\",\"message\":\"x\"}]}",
    );
    expect(message).toContain("导出前数据源检查未通过");
    expect(diagnostics?.issueCount).toBe(1);
    expect(diagnostics?.issues?.[0]?.key).toBe("a");
  });
});
