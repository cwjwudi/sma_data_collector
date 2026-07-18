/**
 * 历史报表缩略图懒加载可见性（docs/029）。
 * 与 IntersectionObserver 协作：entries 变更后必须 restart，不能仅 ensure（ensure 在已有 observer 时 noop）。
 */

export type ThumbObserverMode = "ensure" | "restart";
export type ThumbObserverAction = "noop" | "create" | "restart";

/**
 * ensure：无 observer 时创建，已有则 noop（旧 bug：keep-alive 重回后只 ensure 无效）。
 * restart：始终重建（disconnect + create），用于 entries 清空 visible 之后强制首轮回调。
 */
export function nextThumbObserverAction(
  hasObserver: boolean,
  mode: ThumbObserverMode,
): ThumbObserverAction {
  if (mode === "restart") return hasObserver ? "restart" : "create";
  return hasObserver ? "noop" : "create";
}

/** entries 列表刷新/翻页后的处理计划 */
export function planAfterHistoryEntriesChanged(): {
  clearVisible: true;
  observerMode: "restart";
} {
  return { clearVisible: true, observerMode: "restart" };
}

/** 将本次 IO 相交的 filePath 合并进可见集 */
export function mergeIntersectingFilePaths(
  current: ReadonlySet<string>,
  intersectingPaths: readonly string[],
): { next: Set<string>; changed: boolean } {
  const next = new Set(current);
  let changed = false;
  for (const raw of intersectingPaths) {
    const fp = String(raw || "").trim();
    if (!fp || next.has(fp)) continue;
    next.add(fp);
    changed = true;
  }
  return { next, changed };
}

export function shouldRenderHistoryThumb(visible: ReadonlySet<string>, filePath: string): boolean {
  return visible.has(String(filePath || ""));
}

/**
 * 模拟「清空可见 + 仅 ensure」失败路径 vs「清空 + restart」成功路径（供单测锁契约，不碰 DOM）。
 */
export function simulateEntriesRefreshVisibility(opts: {
  previouslyVisible: readonly string[];
  intersectingAfterRefresh: readonly string[];
  /** 旧行为：只 ensure（observer 已存在 → noop，相交结果到不了 visible） */
  strategy: "ensure_only_bug" | "restart_after_clear";
}): Set<string> {
  let hasObserver = true; // keep-alive 重回：observer 常驻
  let visible = new Set<string>(); // clear
  const plan = planAfterHistoryEntriesChanged();
  if (plan.clearVisible) visible = new Set();

  const mode = opts.strategy === "restart_after_clear" ? plan.observerMode : "ensure";
  const action = nextThumbObserverAction(hasObserver, mode);
  if (action === "noop") {
    // 旧 bug：不相交回调，visible 保持空
    return visible;
  }
  // create / restart 后浏览器会对当前相交元素回调
  hasObserver = true;
  void hasObserver;
  const { next } = mergeIntersectingFilePaths(visible, opts.intersectingAfterRefresh);
  return next;
}
