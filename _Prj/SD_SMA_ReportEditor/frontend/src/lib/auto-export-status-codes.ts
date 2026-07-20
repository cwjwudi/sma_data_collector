/** 自动结批 / 绑定写回 PLC 的 INT 状态码（与前端折线共用） */

export const AUTO_EXPORT_STATUS = {
  FAILED: 0,
  SUCCESS: 1,
  IDLE: 2,
  QUEUED: 3,
  PREFLIGHT: 4,
  READING: 5,
  RENDERING: 6,
  SAVING: 7,
  WRITING_PLC: 8,
} as const;

export type AutoExportStatusCode = (typeof AUTO_EXPORT_STATUS)[keyof typeof AUTO_EXPORT_STATUS];

export const AUTO_EXPORT_STATUS_LABELS: Record<AutoExportStatusCode, string> = {
  [AUTO_EXPORT_STATUS.FAILED]: "失败",
  [AUTO_EXPORT_STATUS.SUCCESS]: "成功",
  [AUTO_EXPORT_STATUS.IDLE]: "空闲/监听中",
  [AUTO_EXPORT_STATUS.QUEUED]: "已触发/排队",
  [AUTO_EXPORT_STATUS.PREFLIGHT]: "预检中",
  [AUTO_EXPORT_STATUS.READING]: "读取数据",
  [AUTO_EXPORT_STATUS.RENDERING]: "渲染中",
  [AUTO_EXPORT_STATUS.SAVING]: "生成/保存 PDF",
  [AUTO_EXPORT_STATUS.WRITING_PLC]: "写回 PLC",
};

export function autoExportStatusLabel(code: number): string {
  const n = Math.floor(Number(code));
  if (n in AUTO_EXPORT_STATUS_LABELS) {
    return AUTO_EXPORT_STATUS_LABELS[n as AutoExportStatusCode];
  }
  return `状态 ${n}`;
}

/** 并行导出上限：人工可配，硬顶 16；默认 1（030：同机 HMI / 弱 CPU / Hypervisor） */
export const AUTO_EXPORT_MAX_PARALLEL_HARD_CAP = 16;
export const AUTO_EXPORT_MAX_PARALLEL_DEFAULT = 1;

export function clampAutoExportMaxParallel(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return AUTO_EXPORT_MAX_PARALLEL_DEFAULT;
  return Math.min(AUTO_EXPORT_MAX_PARALLEL_HARD_CAP, Math.max(1, v));
}

/** 状态折线保留采样点数 */
export const AUTO_EXPORT_STATUS_CHART_MAX_SAMPLES = 600;
