/**
 * 空连接列表重载 / 轮询策略（DatabaseWorkbench）。
 * 空列表成功返回是合法稳态，不得当成「后端未就绪」继续砸新建草稿。
 */

export type EmptyReloadDraftAction = "reset" | "preserve";

/** 空列表 reload 成功时，是否重置 draftConn */
export function emptyReloadDraftAction(creatingNew: boolean): EmptyReloadDraftAction {
  return creatingNew ? "preserve" : "reset";
}

/**
 * 空列表 loadWatch 是否还应继续调度下一次拉取。
 * - 已有连接 → 停
 * - 已成功拿到空数组 → 停（稳态）
 * - 超过最大次数 → 停
 * - 仅在「尚未成功确认空列表」且可能后端未就绪时继续
 */
export function shouldContinueEmptyLoadWatch(opts: {
  connectionsCount: number;
  emptyListConfirmed: boolean;
  ticks: number;
  maxTicks?: number;
}): boolean {
  const maxTicks = opts.maxTicks ?? 12;
  if (opts.connectionsCount > 0) return false;
  if (opts.emptyListConfirmed) return false;
  if (opts.ticks > maxTicks) return false;
  return true;
}

/**
 * ConnectionManager：creatingNew 下父级反复下发 null 时是否保留本地 draft。
 * immediate 首次（prev 未知）应初始化；仅「已在新建且上次也是 null」时保留。
 */
export function shouldPreserveCreateDraftOnNullModel(opts: {
  creatingNew: boolean;
  prevCreatingNew: boolean | undefined;
  prevModelWasNull: boolean | undefined;
}): boolean {
  if (!opts.creatingNew) return false;
  return opts.prevCreatingNew === true && opts.prevModelWasNull === true;
}
