/**
 * 结批/导出进度全局态：离开「生成报表」后仍可从侧栏重新打开页面与进度条。
 */
import { computed, ref } from "vue";
import {
  dismissAppToast,
  showAppToast,
  type AppToastAction,
} from "@/composables/useAppToast";
import { buildExportCancelToastAction } from "@/lib/pdf-export-cancel-ui";

export const REPORT_GENERATE_ROUTE = "/generate";

export type ReportExportProgressSession = {
  id: string;
  title: string;
  detail: string;
  jobId: string;
  busy: boolean;
  /** 用户点 toast × 收起后仍在导出：侧栏可恢复 */
  minimized: boolean;
  onCancel?: () => void;
};

export const reportExportProgressSessions = ref<ReportExportProgressSession[]>([]);

export const hasActiveReportExport = computed(() =>
  reportExportProgressSessions.value.some((s) => s.busy),
);

export const primaryReportExportSession = computed((): ReportExportProgressSession | null => {
  const busy = reportExportProgressSessions.value.filter((s) => s.busy);
  if (!busy.length) return null;
  return busy.find((s) => s.minimized) || busy[busy.length - 1] || null;
});

let openGeneratePageHandler: (() => void | Promise<void>) | null = null;

export function registerOpenGenerateReportPage(handler: (() => void | Promise<void>) | null): void {
  openGeneratePageHandler = handler;
}

export function openGenerateReportPage(): void {
  void openGeneratePageHandler?.();
}

export function isBatchProgressToastId(id: string): boolean {
  return String(id || "").startsWith("batch-progress-");
}

function upsertSession(
  partial: Omit<ReportExportProgressSession, "minimized" | "onCancel"> & {
    minimized?: boolean;
    onCancel?: () => void;
  },
): void {
  const list = reportExportProgressSessions.value;
  const idx = list.findIndex((s) => s.id === partial.id);
  const prev = idx >= 0 ? list[idx] : undefined;
  const next: ReportExportProgressSession = {
    id: partial.id,
    title: partial.title,
    detail: partial.detail,
    jobId: partial.jobId,
    busy: partial.busy,
    minimized: partial.minimized ?? prev?.minimized ?? false,
    onCancel: partial.onCancel ?? prev?.onCancel,
  };
  if (idx >= 0) {
    const copy = list.slice();
    copy[idx] = next;
    reportExportProgressSessions.value = copy;
  } else {
    reportExportProgressSessions.value = [...list, next];
  }
}

function buildOpenPageAction(): AppToastAction {
  return {
    label: "打开页面",
    onClick: () => openGenerateReportPage(),
  };
}

function showProgressToast(session: ReportExportProgressSession): void {
  const cancel = buildExportCancelToastAction(session.jobId, () => {
    session.onCancel?.();
  });
  showAppToast(`[${session.title}]\n${session.detail}`, {
    id: session.id,
    tone: "info",
    durationMs: 0,
    spinner: true,
    action: cancel,
    secondaryAction: buildOpenPageAction(),
    onBodyClick: () => openGenerateReportPage(),
  });
}

/** 进行中：更新全局态；未收起时刷新右下角 toast（含「打开页面」） */
export function publishBatchExportProgress(opts: {
  id: string;
  title: string;
  detail: string;
  jobId?: string;
  onCancel?: () => void;
}): void {
  const id = String(opts.id || "").trim();
  if (!id) return;
  const prev = reportExportProgressSessions.value.find((s) => s.id === id);
  upsertSession({
    id,
    title: opts.title,
    detail: opts.detail,
    jobId: String(opts.jobId || prev?.jobId || "").trim(),
    busy: true,
    onCancel: opts.onCancel,
  });
  const session = reportExportProgressSessions.value.find((s) => s.id === id);
  if (!session || session.minimized) return;
  showProgressToast(session);
}

/** 导出结束：清会话（完成/失败 toast 由调用方继续用同一 id 展示） */
export function endBatchExportProgress(id: string): void {
  const tid = String(id || "").trim();
  if (!tid) return;
  reportExportProgressSessions.value = reportExportProgressSessions.value.filter((s) => s.id !== tid);
}

/** toast ×：进行中则收起到侧栏，而非丢进度 */
export function tryMinimizeBatchExportProgress(id: string): boolean {
  const tid = String(id || "").trim();
  const session = reportExportProgressSessions.value.find((s) => s.id === tid);
  if (!session?.busy) return false;
  upsertSession({ ...session, minimized: true });
  dismissAppToast(tid);
  return true;
}

/** 侧栏 / 「打开页面」：恢复 toast 并跳转生成报表 */
export function restoreBatchExportProgress(id?: string): void {
  const targetId = String(id || primaryReportExportSession.value?.id || "").trim();
  const session = reportExportProgressSessions.value.find((s) => s.id === targetId && s.busy);
  if (!session) {
    openGenerateReportPage();
    return;
  }
  upsertSession({ ...session, minimized: false });
  showProgressToast(session);
  openGenerateReportPage();
}
