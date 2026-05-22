import { ref } from "vue";

export type AppToastTone = "ok" | "warn" | "err" | "info";

export type AppToastItem = {
  id: string;
  message: string;
  tone: AppToastTone;
};

export const appToasts = ref<AppToastItem[]>([]);

let toastSeq = 0;

export function showAppToast(
  message: string,
  options?: { tone?: AppToastTone; durationMs?: number },
): void {
  const tone = options?.tone || "info";
  const durationMs = options?.durationMs ?? (tone === "err" ? 12000 : 6000);
  const id = `toast_${Date.now()}_${++toastSeq}`;
  appToasts.value = [...appToasts.value, { id, message, tone }];
  window.setTimeout(() => {
    appToasts.value = appToasts.value.filter((t) => t.id !== id);
  }, durationMs);
}

export function dismissAppToast(id: string): void {
  appToasts.value = appToasts.value.filter((t) => t.id !== id);
}
