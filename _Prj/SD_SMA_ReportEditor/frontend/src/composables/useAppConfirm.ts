import { nextTick, ref } from "vue";

export type AppConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

export type AppConfirmState = Required<AppConfirmOptions> & {
  open: boolean;
};

const defaultState: AppConfirmState = {
  open: false,
  title: "请确认",
  message: "",
  confirmText: "确定",
  cancelText: "取消",
  danger: false,
};

export const appConfirmState = ref<AppConfirmState>({ ...defaultState });

let activeResolve: ((ok: boolean) => void) | null = null;
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

export async function appConfirm(options: AppConfirmOptions): Promise<boolean> {
  if (activeResolve) {
    activeResolve(false);
    activeResolve = null;
  }
  const active = document.activeElement;
  restoreTarget = active instanceof HTMLElement ? active : null;
  appConfirmState.value = {
    ...defaultState,
    ...options,
    open: true,
  };
  await nextTick();
  return new Promise<boolean>((resolve) => {
    activeResolve = resolve;
  });
}

export function resolveAppConfirm(ok: boolean): void {
  appConfirmState.value = { ...defaultState };
  if (activeResolve) {
    activeResolve(ok);
    activeResolve = null;
  }
  restorePageFocus();
}
