/**
 * 035：应用后台/最小化时额外降载信号。
 * 不停自动结批 OPC 轮询与 PLC 心跳；暂停 UI 探活/Dashboard/AI pending，并由主进程裁剪空闲预热窗。
 */
import { computed, ref, type Ref } from "vue";
import { pdfExportCoexistPauseActive } from "@/lib/export-coexist-busy";

/** 主窗口不可见/最小化/失焦（由主进程或 visibility 驱动） */
export const appBackgroundIdleActive: Ref<boolean> = ref(false);

/**
 * UI 次要任务是否应暂停：结批全开降载 或 后台空闲。
 * 自动结批轮询 / PLC 心跳 **不要** 读此信号。
 */
export const uiSecondaryTasksPaused = computed(
  () => pdfExportCoexistPauseActive.value || appBackgroundIdleActive.value,
);

export function setAppBackgroundIdle(idle: boolean): void {
  appBackgroundIdleActive.value = Boolean(idle);
}

/** 测试用 */
export function resetAppBackgroundIdleForTests(): void {
  appBackgroundIdleActive.value = false;
}
