/**
 * 表格 SQL 填充 / 结批取数：可重试错误判定（缺表、短暂 OPC 未就绪等）。
 * 典型场景：结批信号早于 PLC 更新分表名，或分表刚创建尚未可见。
 */

export const SQL_FILL_RETRY_MAX_ATTEMPTS = 4;
/** 各次重试前等待（ms），第 1 次失败后开始 */
export const SQL_FILL_RETRY_DELAYS_MS = [600, 1200, 2200] as const;

/** 整次绑定刷新 / 自动结批整单：首次 + 再试 */
export const BINDING_FILL_OUTER_RETRY_MAX = 2;
export const BINDING_FILL_OUTER_RETRY_DELAYS_MS = [1000] as const;

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/** MySQL 1146 / 表不存在 / 库中无此对象等 */
export function isMissingTableSqlError(raw: unknown): boolean {
  const t = String(raw ?? "");
  if (!t.trim()) return false;
  const low = t.toLowerCase();
  if (/\b1146\b/.test(t)) return true;
  if (/doesn't exist/.test(low) || /does not exist/.test(low)) return true;
  if (/table\s+['`].+['`]\s+doesn't exist/i.test(t)) return true;
  if (/unknown table/i.test(t)) return true;
  if (/基表或视图不存在|表不存在|对象名 .+ 无效/.test(t)) return true;
  if (/invalid object name/i.test(low)) return true;
  return false;
}

/** 适合「重读 OPC 表名 + 再查 SQL」的错误 */
export function isRetryableTableFillError(raw: unknown): boolean {
  const t = String(raw ?? "");
  if (isMissingTableSqlError(t)) return true;
  if (/未配置可用的 opc/i.test(t)) return false;
  const low = t.toLowerCase();
  // OPC 瞬时失败：重读后再试
  if (/表名 opc|读取失败|timeout|timed out|econnreset|socket hang up/i.test(low)) {
    return true;
  }
  if (/opc\s*ua/.test(low) && /失败|超时|不可用/.test(t)) return true;
  return false;
}

/** 整次绑定填充结果是否值得外层整单重试（多为缺表/填充失败） */
export function isRetryableBindingFillSummary(raw: unknown): boolean {
  const t = String(raw ?? "");
  if (!t.trim()) return false;
  if (isMissingTableSqlError(t)) return true;
  if (/数据源填充失败|绑定报错|（填充）|（sql）/i.test(t)) return true;
  if (/导出前数据源检查未通过/.test(t) && /1146|doesn't exist|填充失败|绑定报错/i.test(t)) {
    return true;
  }
  return false;
}

export function retryDelayMs(attemptIndex: number, delays: readonly number[]): number {
  if (attemptIndex < 0) return delays[0] ?? 500;
  if (attemptIndex >= delays.length) return delays[delays.length - 1] ?? 1500;
  return delays[attemptIndex] ?? 500;
}
