import { ref } from "vue";

export type AppToastTone = "ok" | "warn" | "err" | "info";

export type AppToastAction = {
  label: string;
  onClick: () => void;
};

export type AppToastItem = {
  id: string;
  message: string;
  tone: AppToastTone;
  /** 显示旋转指示器（用于「加载中」类持久提示） */
  spinner?: boolean;
  /** 可选操作按钮（如导出取消） */
  action?: AppToastAction;
  /** 次要操作（如结批进度「打开页面」） */
  secondaryAction?: AppToastAction;
  /** 点击正文（离开生成页后点进度条可回到页面） */
  onBodyClick?: () => void;
};

export const appToasts = ref<AppToastItem[]>([]);

let toastSeq = 0;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearToastTimer(id: string): void {
  const t = toastTimers.get(id);
  if (t != null) {
    clearTimeout(t);
    toastTimers.delete(id);
  }
}

/**
 * 显示（或按 id 更新）一个右下角提示。
 * - durationMs > 0：到期自动消失；durationMs === 0：持久显示，需手动 dismiss。
 * - 传入相同 id 可原地更新文案 / 状态（用于分步「加载中 → 完成」）。
 */
export function showAppToast(
  message: string,
  options?: {
    tone?: AppToastTone;
    durationMs?: number;
    id?: string;
    spinner?: boolean;
    action?: AppToastAction;
    secondaryAction?: AppToastAction;
    onBodyClick?: () => void;
  },
): string {
  const tone = options?.tone || "info";
  const durationMs = options?.durationMs ?? (tone === "err" ? 12000 : 6000);
  const id = options?.id || `toast_${Date.now()}_${++toastSeq}`;
  const spinner = Boolean(options?.spinner);
  const action = options?.action;
  const secondaryAction = options?.secondaryAction;
  const onBodyClick = options?.onBodyClick;

  const existing = appToasts.value.find((t) => t.id === id);
  if (existing) {
    appToasts.value = appToasts.value.map((t) =>
      t.id === id ? { ...t, message, tone, spinner, action, secondaryAction, onBodyClick } : t,
    );
  } else {
    appToasts.value = [
      ...appToasts.value,
      { id, message, tone, spinner, action, secondaryAction, onBodyClick },
    ];
  }

  clearToastTimer(id);
  if (durationMs > 0) {
    toastTimers.set(
      id,
      window.setTimeout(() => {
        dismissAppToast(id);
      }, durationMs),
    );
  }
  return id;
}

export function dismissAppToast(id: string): void {
  clearToastTimer(id);
  appToasts.value = appToasts.value.filter((t) => t.id !== id);
}
