import { describe, expect, it } from "vitest";
import {
  mergeIntersectingFilePaths,
  nextThumbObserverAction,
  planAfterHistoryEntriesChanged,
  shouldRenderHistoryThumb,
  simulateEntriesRefreshVisibility,
} from "./history-thumb-visibility";

describe("nextThumbObserverAction", () => {
  it("ensure：已有 observer 时 noop（锁住旧 ensure 空操作）", () => {
    expect(nextThumbObserverAction(true, "ensure")).toBe("noop");
  });

  it("ensure：无 observer 时 create", () => {
    expect(nextThumbObserverAction(false, "ensure")).toBe("create");
  });

  it("restart：已有 observer 时必须 restart（不能 noop）", () => {
    expect(nextThumbObserverAction(true, "restart")).toBe("restart");
    expect(nextThumbObserverAction(true, "restart")).not.toBe("noop");
  });

  it("restart：无 observer 时 create", () => {
    expect(nextThumbObserverAction(false, "restart")).toBe("create");
  });
});

describe("planAfterHistoryEntriesChanged", () => {
  it("entries 变更后清空可见并要求 restart observer", () => {
    const plan = planAfterHistoryEntriesChanged();
    expect(plan.clearVisible).toBe(true);
    expect(plan.observerMode).toBe("restart");
    // 与 ensure 组合时不得变成 noop
    expect(nextThumbObserverAction(true, plan.observerMode)).toBe("restart");
  });
});

describe("mergeIntersectingFilePaths / shouldRenderHistoryThumb", () => {
  it("合并相交 path，忽略空串与重复", () => {
    const { next, changed } = mergeIntersectingFilePaths(new Set(["a.pdf"]), [
      "a.pdf",
      "  ",
      "b.pdf",
      "b.pdf",
    ]);
    expect(changed).toBe(true);
    expect([...next].sort()).toEqual(["a.pdf", "b.pdf"]);
  });

  it("无新 path 时 changed=false", () => {
    const { changed } = mergeIntersectingFilePaths(new Set(["a.pdf"]), ["a.pdf"]);
    expect(changed).toBe(false);
  });

  it("shouldRender 仅对 visible 内 path 为 true", () => {
    const vis = new Set(["D:\\a.pdf"]);
    expect(shouldRenderHistoryThumb(vis, "D:\\a.pdf")).toBe(true);
    expect(shouldRenderHistoryThumb(vis, "D:\\b.pdf")).toBe(false);
  });
});

describe("simulateEntriesRefreshVisibility（029 契约）", () => {
  const prev = ["D:\\a.pdf", "D:\\b.pdf"];
  const stillInView = ["D:\\a.pdf", "D:\\b.pdf"];

  it("旧策略 ensure_only：keep-alive 重回后首屏仍不可渲染（复现 bug）", () => {
    const visible = simulateEntriesRefreshVisibility({
      previouslyVisible: prev,
      intersectingAfterRefresh: stillInView,
      strategy: "ensure_only_bug",
    });
    expect(visible.size).toBe(0);
    expect(shouldRenderHistoryThumb(visible, "D:\\a.pdf")).toBe(false);
  });

  it("新策略 restart_after_clear：清空后仍能根据相交结果恢复可见", () => {
    const visible = simulateEntriesRefreshVisibility({
      previouslyVisible: prev,
      intersectingAfterRefresh: stillInView,
      strategy: "restart_after_clear",
    });
    expect(shouldRenderHistoryThumb(visible, "D:\\a.pdf")).toBe(true);
    expect(shouldRenderHistoryThumb(visible, "D:\\b.pdf")).toBe(true);
  });

  it("restart 后未相交的卡片仍不渲染（懒加载不回归）", () => {
    const visible = simulateEntriesRefreshVisibility({
      previouslyVisible: prev,
      intersectingAfterRefresh: ["D:\\a.pdf"],
      strategy: "restart_after_clear",
    });
    expect(shouldRenderHistoryThumb(visible, "D:\\a.pdf")).toBe(true);
    expect(shouldRenderHistoryThumb(visible, "D:\\b.pdf")).toBe(false);
  });
});
