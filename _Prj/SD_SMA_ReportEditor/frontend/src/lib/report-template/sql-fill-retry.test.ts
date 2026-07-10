import { describe, expect, it } from "vitest";
import {
  isMissingTableSqlError,
  isRetryableBindingFillSummary,
  isRetryableTableFillError,
  retryDelayMs,
  SQL_FILL_RETRY_DELAYS_MS,
} from "@/lib/report-template/sql-fill-retry";

describe("sql-fill-retry", () => {
  it("detects MySQL 1146 missing table", () => {
    const msg = `(1146, "Table 'sma_data_test.data_batchinfo_20260707' doesn't exist")`;
    expect(isMissingTableSqlError(msg)).toBe(true);
    expect(isRetryableTableFillError(msg)).toBe(true);
    expect(isRetryableBindingFillSummary(`导出前数据源检查未通过\n数据源填充失败（11 处）\n${msg}`)).toBe(
      true,
    );
  });

  it("does not treat permanent config errors as table-fill retry", () => {
    expect(isRetryableTableFillError("未配置可用的 OPC UA 连接")).toBe(false);
  });

  it("retryDelayMs clamps to last delay", () => {
    expect(retryDelayMs(0, SQL_FILL_RETRY_DELAYS_MS)).toBe(600);
    expect(retryDelayMs(99, SQL_FILL_RETRY_DELAYS_MS)).toBe(2200);
  });
});
