import { nextTick, ref } from "vue";

export type AppConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 若提供，显示第三按钮（通常为「不保存」） */
  discardText?: string;
  danger?: boolean;
};

export type AppConfirmState = Required<Omit<AppConfirmOptions, "discardText">> & {
  open: boolean;
  discardText: string;
  showDiscard: boolean;
};

export type AppConfirmResult = "confirm" | "discard" | "cancel";

const defaultState: AppConfirmState = {
  open: false,
  title: "请确认",
  message: "",
  confirmText: "确定",
  cancelText: "取消",
  discardText: "不保存",
  showDiscard: false,
  danger: false,
};

export const appConfirmState = ref<AppConfirmState>({ ...defaultState });

let activeResolve: ((result: AppConfirmResult) => void) | null = null;
let restoreTarget: HTMLElement | null = null;

function restorePageFocus() {
  const target = restoreTarget;
  restoreTarget = null;
  window.focus();
  window.requestAnimationFrame(() => {
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
      return;
    }
    document.body?.focus({ preventScroll: true });
  });
}

function openConfirm(options: AppConfirmOptions): Promise<AppConfirmResult> {
  if (activeResolve) {
    activeResolve("cancel");
    activeResolve = null;
  }
  const active = document.activeElement;
  restoreTarget = active instanceof HTMLElement ? active : null;
  const discardText = options.discardText?.trim() || "";
  appConfirmState.value = {
    ...defaultState,
    ...options,
    discardText: discardText || defaultState.discardText,
    showDiscard: Boolean(discardText),
    open: true,
  };
  return nextTick().then(
    () =>
      new Promise<AppConfirmResult>((resolve) => {
        activeResolve = resolve;
      }),
  );
}

/** 双按钮确认：确定 → true，取消 → false */
export async function appConfirm(options: AppConfirmOptions): Promise<boolean> {
  const result = await openConfirm({
    ...options,
    discardText: undefined,
  });
  return result === "confirm";
}

/**
 * 离开编辑页三选：保存 / 不保存 / 取消。
 * - confirm：用户点「保存」
 * - discard：用户点「不保存」
 * - cancel：取消或关闭
 */
export async function appConfirmSaveLeave(options: {
  title?: string;
  message: string;
  saveText?: string;
  discardText?: string;
  cancelText?: string;
}): Promise<AppConfirmResult> {
  return openConfirm({
    title: options.title ?? "未保存的更改",
    message: options.message,
    confirmText: options.saveText ?? "保存",
    discardText: options.discardText ?? "不保存",
    cancelText: options.cancelText ?? "取消",
  });
}

export function resolveAppConfirm(result: AppConfirmResult | boolean): void {
  const normalized: AppConfirmResult =
    result === true ? "confirm" : result === false ? "cancel" : result;
  appConfirmState.value = { ...defaultState };
  if (activeResolve) {
    activeResolve(normalized);
    activeResolve = null;
  }
  restorePageFocus();
}
