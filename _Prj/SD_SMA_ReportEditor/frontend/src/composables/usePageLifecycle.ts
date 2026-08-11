/**
 * 统一页面生命周期（032）：keep-alive 页的 B 级任务必须 pause/resume。
 * A 级（结批/心跳/侧栏探活）不得注册到此 composable。
 */
import { onActivated, onDeactivated, onMounted, onUnmounted } from "vue";

export type PageTaskScope = "page" | "page-focus";

export type PageTask = {
  id: string;
  pause: () => void;
  resume: () => void;
  /**
   * page：仅路由离开 pause
   * page-focus：路由离开 + document.hidden（最小化等）pause
   */
  scope?: PageTaskScope;
};

export type UsePageLifecycleApi = {
  pageId: string;
  register: (task: PageTask) => () => void;
  /** 当前是否处于 activated（keep-alive 可见） */
  isPageActive: () => boolean;
};

/**
 * @param pageId 须与 defineOptions.name / keep-alive include 一致
 */
export function usePageLifecycle(pageId: string): UsePageLifecycleApi {
  const tasks = new Map<string, Required<Pick<PageTask, "scope">> & PageTask>();
  let pageActive = false;
  let visBound = false;

  function register(task: PageTask): () => void {
    const normalized: Required<Pick<PageTask, "scope">> & PageTask = {
      ...task,
      scope: task.scope ?? "page",
    };
    tasks.set(task.id, normalized);
    if (pageActive) {
      if (normalized.scope === "page-focus" && typeof document !== "undefined" && document.hidden) {
        normalized.pause();
      } else {
        normalized.resume();
      }
    }
    return () => {
      tasks.delete(task.id);
    };
  }

  function pauseByScope(scope: PageTaskScope | "all"): void {
    for (const t of tasks.values()) {
      if (scope === "all" || t.scope === scope || (scope === "page" && t.scope === "page-focus")) {
        t.pause();
      }
    }
  }

  function resumeVisibleTasks(): void {
    const hidden = typeof document !== "undefined" && document.hidden;
    for (const t of tasks.values()) {
      if (t.scope === "page-focus" && hidden) {
        t.pause();
        continue;
      }
      t.resume();
    }
  }

  function onVisibilityChange(): void {
    if (!pageActive) return;
    if (document.hidden) {
      for (const t of tasks.values()) {
        if (t.scope === "page-focus") t.pause();
      }
    } else {
      for (const t of tasks.values()) {
        if (t.scope === "page-focus") t.resume();
      }
    }
  }

  function bindVisibility(): void {
    if (visBound || typeof document === "undefined") return;
    document.addEventListener("visibilitychange", onVisibilityChange);
    visBound = true;
  }

  function unbindVisibility(): void {
    if (!visBound || typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    visBound = false;
  }

  onMounted(() => {
    // 非 keep-alive 页不会触发 onActivated；首挂也需 resume
    pageActive = true;
    bindVisibility();
    resumeVisibleTasks();
  });

  onActivated(() => {
    pageActive = true;
    bindVisibility();
    resumeVisibleTasks();
  });

  onDeactivated(() => {
    pageActive = false;
    pauseByScope("all");
  });

  onUnmounted(() => {
    pageActive = false;
    pauseByScope("all");
    tasks.clear();
    unbindVisibility();
  });

  return {
    pageId,
    register,
    isPageActive: () => pageActive,
  };
}
