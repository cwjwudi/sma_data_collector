/**
 * OPC UA 自动结批轮询：应用级单例，离开「生成报表」页仍持续监听并导出 PDF。
 */
import { ref, type Ref } from "vue";
import { listTemplateSummaries, type TemplateSummary } from "@/api/templates";
import { evaluateAutoOpcTrigger, createOpcTriggerPollState, type OpcTriggerPollState } from "@/lib/auto-opc-trigger";
import { resolveAutoExportDir } from "@/lib/resolve-auto-export-dir";
import { readSavedOpcNodeValue } from "@/lib/opcua-string-variables";
import { appendTriggerLogEntry, autoTriggerEventLabel } from "@/lib/auto-trigger-log";
import {
  AUTO_OPC_POLL_INTERVAL_MS,
  bindingConfigKey,
  isTriggerBindingActive,
  isTriggerBindingComplete,
  type AutoTriggerBinding,
} from "@/lib/auto-trigger-bindings";
import { buildAutoExportFileName } from "@/lib/auto-export-filename";
import { humanizePdfExportError } from "@/lib/pdfExportErrors";
import {
  exportFailureAuditDetail,
  parseExportFailureDiagnostics,
} from "@/lib/bindingPreviewErrors";
import {
  BINDING_FILL_OUTER_RETRY_DELAYS_MS,
  BINDING_FILL_OUTER_RETRY_MAX,
  isRetryableBindingFillSummary,
  retryDelayMs,
  sleepMs,
} from "@/lib/report-template/sql-fill-retry";
import { runTemplateExportPreflight, type TemplateExportPreflightResult } from "@/lib/templateExportPreflight";
import { showAppToast } from "@/composables/useAppToast";
import { auditLog } from "@/lib/auditLog";
import {
  loadReportGeneratorPrefs,
  resolveExportResultOpcForBinding,
  saveReportGeneratorPrefs,
  type ReportGeneratorPrefs,
} from "@/lib/report-generator-prefs";
import {
  resolveExportResultOpcWriteContext,
  writeExportResultToOpcua,
  type ExportResultWritePayload,
} from "@/lib/exportResultOpcFeedback";
import { NumericSampleRing, coerceOpcTriggerNumericSample, isOpcTriggerChartEligible } from "@/lib/auto-trigger-value-history";
import {
  AUTO_EXPORT_STATUS,
  AUTO_EXPORT_STATUS_CHART_MAX_SAMPLES,
  autoExportStatusLabel,
  clampAutoExportMaxParallel,
} from "@/lib/auto-export-status-codes";

const RG_UI = {
  opcAuto: "OPC UA 自动结批",
  feedback: "结批结果反馈",
} as const;

const RG_STATUS_OPC_AUTO = `[${RG_UI.opcAuto}]`;

export type BindingRuntime = {
  poll: OpcTriggerPollState;
  history: NumericSampleRing;
  chartEligible: boolean | null;
  /** 本绑定导出 INT 状态码历史（折线） */
  statusHistory: NumericSampleRing;
  lastStatusCode: number;
  lastStatusText: string;
};

export const reportAutoExportStatus: Ref<string> = ref("");

let pollTimer: ReturnType<typeof setInterval> | null = null;
/** 正在导出（含排队已受理）的绑定 id */
const busyBindingIds = new Set<string>();
/** 当前真正在跑 PDF 的数量 */
let activeExportCount = 0;
/** 等待空闲槽的绑定任务 */
type QueuedExportJob = {
  bindingId: string;
  prefs: ReportGeneratorPrefs;
  label: string;
  eventLabel: string;
  nodeId: string;
  serverId: string;
  templateId: string;
};
const exportQueue: QueuedExportJob[] = [];
let lastBindingConfigKey = "";
let templateSummariesCache: TemplateSummary[] = [];
let templateSummariesLoadedAt = 0;
const TEMPLATE_CACHE_MS = 30_000;

/**
 * 结批预检保活：两次结批可能间隔数天，后台每 60 秒对已启用绑定的模版跑一次预检——
 * 既维持 OPC UA 连接池会话（后端 90 秒空闲即断开），又把预检结果缓存下来，
 * 收到结批指令时直接取用，做到「即结批即渲染」。
 */
const PREFLIGHT_WARM_INTERVAL_MS = 60_000;
const PREFLIGHT_CACHE_TTL_MS = 150_000;
let preflightWarmupBusy = false;
let lastPreflightWarmupAt = 0;
const preflightCache = new Map<string, { at: number; result: TemplateExportPreflightResult }>();

function getFreshPreflightResult(templateId: string): TemplateExportPreflightResult | null {
  const e = preflightCache.get(templateId);
  if (!e || !e.result.ok) return null;
  if (Date.now() - e.at > PREFLIGHT_CACHE_TTL_MS) return null;
  return e.result;
}

async function warmupPreflightCache(bindings: AutoTriggerBinding[]): Promise<void> {
  if (preflightWarmupBusy) return;
  preflightWarmupBusy = true;
  try {
    const tids = [
      ...new Set(
        bindings
          .filter(isTriggerBindingActive)
          .map((b) => (b.templateId || "").trim())
          .filter(Boolean),
      ),
    ];
    for (const tid of tids) {
      if (activeExportCount > 0) return;
      try {
        const result = await runTemplateExportPreflight(tid);
        if (result.ok) {
          preflightCache.set(tid, { at: Date.now(), result });
        } else {
          preflightCache.delete(tid);
        }
      } catch {
        preflightCache.delete(tid);
      }
    }
  } finally {
    preflightWarmupBusy = false;
  }
}

const bindingRuntime = new Map<string, BindingRuntime>();

function electronShell(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.runPdfExport);
}

export function getReportAutoExportBindingRuntime(id: string): BindingRuntime {
  let r = bindingRuntime.get(id);
  if (!r) {
    r = {
      poll: createOpcTriggerPollState(),
      history: new NumericSampleRing(),
      chartEligible: null,
      statusHistory: new NumericSampleRing(AUTO_EXPORT_STATUS_CHART_MAX_SAMPLES),
      lastStatusCode: AUTO_EXPORT_STATUS.IDLE,
      lastStatusText: autoExportStatusLabel(AUTO_EXPORT_STATUS.IDLE),
    };
    bindingRuntime.set(id, r);
  }
  return r;
}

export function resetReportAutoExportBindingRuntime(): void {
  bindingRuntime.clear();
  lastBindingConfigKey = "";
  busyBindingIds.clear();
  exportQueue.length = 0;
  activeExportCount = 0;
}

function pruneBindingRuntime(bindings: AutoTriggerBinding[]): void {
  const ids = new Set(bindings.map((b) => b.id));
  for (const key of bindingRuntime.keys()) {
    if (!ids.has(key)) bindingRuntime.delete(key);
  }
}

function syncBindingConfigKey(prefs: ReportGeneratorPrefs): void {
  const key = prefs.auto.bindings.map(bindingConfigKey).join("\n");
  if (key === lastBindingConfigKey) return;
  lastBindingConfigKey = key;
  for (const b of prefs.auto.bindings) {
    const r = getReportAutoExportBindingRuntime(b.id);
    r.poll = createOpcTriggerPollState();
    r.history.clear();
    r.chartEligible = null;
    r.statusHistory.clear();
    r.lastStatusCode = AUTO_EXPORT_STATUS.IDLE;
    r.lastStatusText = autoExportStatusLabel(AUTO_EXPORT_STATUS.IDLE);
  }
  pruneBindingRuntime(prefs.auto.bindings);
}

function syncElectronMaxParallel(prefs: ReportGeneratorPrefs): void {
  const max = clampAutoExportMaxParallel(prefs.auto.maxParallelExports);
  void window.electronAPI?.setPdfExportMaxParallel?.(max);
}

function currentMaxParallel(prefs: ReportGeneratorPrefs): number {
  const configured = clampAutoExportMaxParallel(prefs.auto.maxParallelExports);
  const activeCount = Math.max(1, prefs.auto.bindings.filter(isTriggerBindingActive).length);
  return Math.min(configured, activeCount);
}

async function setBindingExportStatus(
  prefs: ReportGeneratorPrefs,
  binding: AutoTriggerBinding,
  code: number,
  text: string,
  opts?: { success?: boolean; filePath?: string; filePaths?: string[]; fileName?: string },
): Promise<void> {
  const rt = getReportAutoExportBindingRuntime(binding.id);
  rt.lastStatusCode = code;
  rt.lastStatusText = text || autoExportStatusLabel(code);
  rt.statusHistory.push(code);

  const fb = resolveExportResultOpcForBinding(prefs, binding);
  const writeCtx = resolveExportResultOpcWriteContext(fb);
  if (!writeCtx.ok) return;

  const terminal = code === AUTO_EXPORT_STATUS.SUCCESS || code === AUTO_EXPORT_STATUS.FAILED;
  const payload: ExportResultWritePayload = {
    success: opts?.success ?? code === AUTO_EXPORT_STATUS.SUCCESS,
    statusCode: code,
    message: text || autoExportStatusLabel(code),
    filePath: opts?.filePath,
    filePaths: opts?.filePaths,
    fileName: opts?.fileName,
  };
  // 非终态只写状态+信息，避免清空路径；终态走完整写回
  if (!terminal) {
    payload.success = false;
    payload.filePath = undefined;
  }
  try {
    const res = await writeExportResultToOpcua(fb, payload, "auto");
    if (!res.ok && terminal) {
      showAppToast(`${RG_UI.feedback}写回 OPC 失败\n${res.errors.join("；")}`, {
        tone: "warn",
        durationMs: 10000,
      });
    }
  } catch {
    /* ignore stage write errors */
  }
}

async function loadTemplateSummariesCached(): Promise<TemplateSummary[]> {
  const now = Date.now();
  if (templateSummariesCache.length && now - templateSummariesLoadedAt < TEMPLATE_CACHE_MS) {
    return templateSummariesCache;
  }
  try {
    templateSummariesCache = await listTemplateSummaries();
  } catch {
    templateSummariesCache = [];
  }
  templateSummariesLoadedAt = now;
  return templateSummariesCache;
}

function normalizeSavedPdfPaths(
  exportRes: { filePath?: string; filePaths?: string[] } | null | undefined,
  fallbackPath: string,
): string[] {
  const paths = Array.isArray(exportRes?.filePaths)
    ? exportRes.filePaths.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (paths.length) return paths;
  const single = String(exportRes?.filePath || fallbackPath || "").trim();
  return single ? [single] : [];
}

function pdfExportSummaryForPaths(savedPaths: string[], note?: string): string | undefined {
  const parts: string[] = [];
  if (savedPaths.length > 1) parts.push(`共 ${savedPaths.length} 份 PDF`);
  const n = (note || "").trim();
  if (n) parts.push(n);
  return parts.length ? parts.join("；") : undefined;
}

function recordBindingOpcSample(
  bindingId: string,
  rt: BindingRuntime,
  raw: unknown,
  dataType?: string,
): void {
  const eligible = isOpcTriggerChartEligible(dataType);
  if (rt.chartEligible === null) {
    rt.chartEligible = eligible;
  } else if (rt.chartEligible !== eligible) {
    rt.chartEligible = eligible;
    rt.history.clear();
  }
  if (!eligible) return;
  const n = coerceOpcTriggerNumericSample(raw, dataType);
  if (n != null) rt.history.push(n);
  void bindingId;
}

function bindingDisplayLabel(b: AutoTriggerBinding, index: number, summaries: TemplateSummary[]): string {
  const tpl = summaries.find((x) => x.id === b.templateId);
  const name = tpl?.name?.trim();
  return name ? `绑定 ${index + 1}（${name}）` : `绑定 ${index + 1}`;
}

function recordBindingTriggerLog(
  prefs: ReportGeneratorPrefs,
  bindingId: string,
  entry: {
    event: string;
    fileName: string;
    filePath?: string;
    success: boolean;
    message?: string;
  },
): ReportGeneratorPrefs {
  const b = prefs.auto.bindings.find((x) => x.id === bindingId);
  if (!b) return prefs;
  b.triggerLog = appendTriggerLogEntry(b.triggerLog, {
    at: new Date().toISOString(),
    ...entry,
  });
  saveReportGeneratorPrefs(prefs);
  window.dispatchEvent(new CustomEvent("report-generator-prefs-updated"));
  return prefs;
}

async function notifyExportResultToPlc(
  prefs: ReportGeneratorPrefs,
  binding: AutoTriggerBinding,
  payload: ExportResultWritePayload,
): Promise<void> {
  const fb = resolveExportResultOpcForBinding(prefs, binding);
  const writeCtx = resolveExportResultOpcWriteContext(fb);
  if (!writeCtx.ok) return;
  try {
    const res = await writeExportResultToOpcua(fb, payload, "auto");
    if (!res.ok) {
      const hint = res.errors.join("；");
      showAppToast(`${RG_UI.feedback}写回 OPC 失败\n${hint}`, { tone: "warn", durationMs: 10000 });
      const statusLine = `[写回 PLC] 失败：${hint}`;
      reportAutoExportStatus.value = reportAutoExportStatus.value
        ? `${reportAutoExportStatus.value} · ${statusLine}`
        : statusLine;
      void auditLog({
        action: "export.opc_writeback",
        result: "fail",
        summary: hint,
        detail: {
          context: "auto",
          templateId: binding.templateId || undefined,
          bindingId: binding.id,
          statusCode: payload.statusCode,
        },
      });
    } else {
      void auditLog({
        action: "export.opc_writeback",
        result: "ok",
        summary: `${RG_UI.opcAuto}写回`,
        detail: {
          context: "auto",
          templateId: binding.templateId || undefined,
          bindingId: binding.id,
          statusCode: payload.statusCode,
        },
      });
    }
  } catch {
    showAppToast(`${RG_UI.feedback}写回 OPC 失败`, { tone: "warn", durationMs: 8000 });
    const statusLine = "[写回 PLC] 失败：未知错误";
    reportAutoExportStatus.value = reportAutoExportStatus.value
      ? `${reportAutoExportStatus.value} · ${statusLine}`
      : statusLine;
  }
}

/** 结批全链路分阶段耗时（毫秒），用于审计日志与完成提示的现场定位 */
export type ExportPhaseTimings = {
  /** 数据源连通预检（与目录解析、模版列表并行，取最长者） */
  preflightMs?: number;
  /** 文件名解析（可能含 OPC 文件名变量读取）与路径拼接 */
  prepMs?: number;
  /** 导出窗口从导航到渲染就绪（含窗口内启动 + 取数 + 绘制） */
  readyMs?: number;
  /** 其中：窗口内取数（OPC 读 + SQL 查询） */
  dataMs?: number;
  /** Chromium printToPDF 排版打印 */
  printMs?: number;
  /** PDF 写盘 */
  writeMs?: number;
  /** 是否复用了预热窗口（false 表示本次整页冷启动） */
  warmStart?: boolean;
};

type AutoPdfExportAttempt = {
  fileName: string;
  filePath: string;
  filePaths?: string[];
  totalReports?: number;
  note?: string;
  stats?: { opcReads: number; sqlQueries: number; sqlRows: number; mongoQueries?: number };
  durationMs?: number;
  timings?: ExportPhaseTimings;
};

/** 结批进度弹窗/审计共用：把取数统计整理成一行可读文本 */
export function formatExportStatsLine(
  stats: { opcReads: number; sqlQueries: number; sqlRows: number; mongoQueries?: number } | null | undefined,
): string {
  if (!stats) return "";
  const parts: string[] = [];
  if (stats.opcReads > 0) parts.push(`OPC 读取 ${stats.opcReads} 点`);
  if (stats.sqlQueries > 0) parts.push(`SQL 查询 ${stats.sqlQueries} 次 / ${stats.sqlRows} 行`);
  if (stats.mongoQueries && stats.mongoQueries > 0) parts.push(`Mongo 查询 ${stats.mongoQueries} 次`);
  return parts.join(" · ");
}

/** 把分阶段耗时整理成一行可读文本（完成提示与审计摘要用） */
export function formatExportTimingsLine(t: ExportPhaseTimings | null | undefined): string {
  if (!t) return "";
  const sec = (ms: number): string => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  const parts: string[] = [];
  if (t.preflightMs != null) parts.push(`预检 ${sec(t.preflightMs)}`);
  if (t.prepMs != null && t.prepMs >= 100) parts.push(`文件名 ${sec(t.prepMs)}`);
  if (t.readyMs != null) {
    const dataMs = t.dataMs || 0;
    if (dataMs > 0) {
      parts.push(`取数 ${sec(dataMs)}`);
      parts.push(`渲染 ${sec((t.readyMs || 0) - dataMs)}`);
    } else {
      parts.push(`取数渲染 ${sec(t.readyMs)}`);
    }
  }
  if (t.printMs != null || t.writeMs != null) {
    parts.push(`打印 ${sec((t.printMs || 0) + (t.writeMs || 0))}`);
  }
  if (t.warmStart != null) parts.push(t.warmStart ? "窗口已预热" : "窗口冷启动");
  return parts.join(" · ");
}

async function runAutoPdfExport(
  prefs: ReportGeneratorPrefs,
  templateId: string,
  onStage?: (text: string, code?: number) => void,
): Promise<AutoPdfExportAttempt> {
  const api = window.electronAPI;
  if (!api?.runPdfExport || !api.pathJoin) {
    throw new Error(`当前环境不支持${RG_UI.opcAuto}`);
  }

  const tid = templateId.trim();
  if (!tid) throw new Error(`未配置${RG_UI.opcAuto}报表模版`);

  onStage?.("正在检查数据源连接…", AUTO_EXPORT_STATUS.PREFLIGHT);
  // 预检、导出目录解析、模版列表三者互不依赖：并行执行缩短结批前等待。
  // 后台保活已缓存的新鲜预检结果直接取用（连接状态刚验证过），预检耗时降为 0
  const preflightStartMs = Date.now();
  const cachedPreflight = getFreshPreflightResult(tid);
  const [preflight, resolved, summaries] = await Promise.all([
    cachedPreflight ?? runTemplateExportPreflight(tid),
    resolveAutoExportDir(prefs),
    loadTemplateSummariesCached(),
  ]);
  const preflightMs = Date.now() - preflightStartMs;
  if (!preflight.ok) {
    throw new Error(preflight.summary);
  }

  const dir = resolved.dir.trim();
  if (!dir) throw new Error(resolved.note || `未配置${RG_UI.opcAuto}保存目录`);

  const prepStartMs = Date.now();
  const tmeta = summaries.find((x) => x.id === tid);
  const built = await buildAutoExportFileName(prefs, tmeta?.name || tid);
  const filePath = await api.pathJoin(dir, built.base);
  const prepMs = Date.now() - prepStartMs;

  onStage?.("正在取数并渲染报表…", AUTO_EXPORT_STATUS.READING);
  const offProgress = api.onPdfExportProgress?.((p) => {
    if (p.templateId && p.templateId !== tid) return;
    const total = Number(p.totalReports) || 0;
    const idx = (Number(p.partIndex) || 0) + 1;
    if (p.phase === "render") {
      onStage?.(
        total > 1 ? `正在取数并渲染第 ${idx}/${total} 份报表…` : "正在取数并渲染报表…",
        AUTO_EXPORT_STATUS.RENDERING,
      );
    } else if (p.phase === "saved") {
      onStage?.(
        total > 1 ? `已保存第 ${idx}/${total} 份 PDF…` : "PDF 已保存，正在收尾…",
        AUTO_EXPORT_STATUS.SAVING,
      );
    }
  });

  let exportRes: Awaited<ReturnType<NonNullable<typeof api.runPdfExport>>> | undefined;
  try {
    for (let attempt = 1; attempt <= BINDING_FILL_OUTER_RETRY_MAX; attempt++) {
      if (attempt > 1) {
        onStage?.(
          `数据源取数未就绪，正在重试（${attempt}/${BINDING_FILL_OUTER_RETRY_MAX}）…`,
          AUTO_EXPORT_STATUS.READING,
        );
        await sleepMs(retryDelayMs(attempt - 2, BINDING_FILL_OUTER_RETRY_DELAYS_MS));
      }
      try {
        exportRes = await api.runPdfExport({
          templateId: tid,
          filePath,
          openAfter: false,
        });
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt >= BINDING_FILL_OUTER_RETRY_MAX || !isRetryableBindingFillSummary(msg)) {
          throw e;
        }
      }
    }
    if (!exportRes) throw new Error("导出未返回结果");
  } finally {
    offProgress?.();
  }

  const notes = [resolved.note, built.note].filter(Boolean).join("；");
  const savedPaths = normalizeSavedPdfPaths(exportRes, filePath);
  const splitNote = pdfExportSummaryForPaths(savedPaths);
  const exportNote = [preflight.warnings.join(" "), notes, splitNote].filter(Boolean).join("；");
  return {
    fileName: built.base,
    filePath: savedPaths[0],
    filePaths: savedPaths,
    totalReports: exportRes.totalReports,
    note: exportNote || undefined,
    stats: exportRes.stats,
    durationMs: exportRes.durationMs,
    timings: { preflightMs, prepMs, ...(exportRes.timings || {}) },
  };
}

async function executeBindingExport(job: QueuedExportJob): Promise<void> {
  const { bindingId, label, eventLabel, nodeId, serverId, templateId } = job;
  let prefs = loadReportGeneratorPrefs();
  const binding = prefs.auto.bindings.find((x) => x.id === bindingId);
  if (!binding) {
    busyBindingIds.delete(bindingId);
    activeExportCount = Math.max(0, activeExportCount - 1);
    pumpExportQueue();
    return;
  }

  const startedAtMs = Date.now();
  const progressToastId = `batch-progress-${bindingId}`;
  const stage = (text: string, code?: number): void => {
    showAppToast(`${RG_STATUS_OPC_AUTO}·${label}\n收到结批指令（${eventLabel}）\n${text}`, {
      id: progressToastId,
      tone: "info",
      durationMs: 0,
      spinner: true,
    });
    if (code != null) {
      void setBindingExportStatus(prefs, binding, code, text);
    }
  };

  stage("正在准备生成报表…", AUTO_EXPORT_STATUS.PREFLIGHT);
  void auditLog({
    action: "export.batch_trigger",
    result: "ok",
    summary: `${label}：收到结批指令（${eventLabel}）`,
    object_type: "template",
    object_id: templateId || undefined,
    detail: { bindingId, event: eventLabel, nodeId, serverId },
  });

  let fileName = "—";
  try {
    const result = await runAutoPdfExport(prefs, templateId, stage);
    fileName = result.fileName;
    prefs = recordBindingTriggerLog(prefs, bindingId, {
      event: eventLabel,
      fileName: result.fileName,
      filePath: result.filePath,
      success: true,
      message: result.note,
    });
    stage(`正在写回${RG_UI.feedback}…`, AUTO_EXPORT_STATUS.WRITING_PLC);
    await notifyExportResultToPlc(prefs, binding, {
      success: true,
      statusCode: AUTO_EXPORT_STATUS.SUCCESS,
      filePath: result.filePath,
      filePaths: result.filePaths,
      fileName: result.fileName,
      message: result.note,
    });
    const rt = getReportAutoExportBindingRuntime(bindingId);
    rt.lastStatusCode = AUTO_EXPORT_STATUS.SUCCESS;
    rt.lastStatusText = autoExportStatusLabel(AUTO_EXPORT_STATUS.SUCCESS);
    rt.statusHistory.push(AUTO_EXPORT_STATUS.SUCCESS);

    const totalMs = Date.now() - startedAtMs;
    const statsLine = formatExportStatsLine(result.stats);
    const timingsLine = formatExportTimingsLine(result.timings);
    void auditLog({
      action: "export.auto_pdf",
      result: "ok",
      summary: `${result.fileName}（耗时 ${(totalMs / 1000).toFixed(1)} 秒${statsLine ? `；${statsLine}` : ""}${timingsLine ? `；${timingsLine}` : ""}）`,
      object_type: "template",
      object_id: templateId || undefined,
      detail: {
        filePath: result.filePath,
        filePaths: result.filePaths,
        bindingId,
        event: eventLabel,
        durationMs: totalMs,
        renderMs: result.durationMs,
        stats: result.stats,
        timings: result.timings,
        totalReports: result.totalReports,
      },
    });
    const noteSuffix = result.note ? `（${result.note}）` : "";
    const fileCount = result.filePaths?.length || 1;
    reportAutoExportStatus.value =
      fileCount > 1
        ? `${RG_STATUS_OPC_AUTO}·${label} 已保存 ${fileCount} 个文件：${result.filePaths?.join("；")}${noteSuffix}`
        : `${RG_STATUS_OPC_AUTO}·${label} 已保存 ${result.filePath}${noteSuffix}`;
    const doneLines = [
      `${RG_STATUS_OPC_AUTO}·${label}`,
      fileCount > 1 ? `结批完成：已保存 ${fileCount} 个 PDF` : `结批完成：已保存 ${result.fileName}`,
      `耗时 ${(totalMs / 1000).toFixed(1)} 秒${statsLine ? ` · ${statsLine}` : ""}`,
    ];
    if (timingsLine) doneLines.push(timingsLine);
    showAppToast(doneLines.join("\n"), { id: progressToastId, tone: "ok", durationMs: 10000 });
  } catch (e) {
    const parsed = parseExportFailureDiagnostics(e);
    const msg = humanizePdfExportError(parsed.message || e);
    try {
      const summaries = await loadTemplateSummariesCached();
      const tmeta = summaries.find((x) => x.id === templateId);
      const built = await buildAutoExportFileName(prefs, tmeta?.name || templateId || "");
      fileName = built.base;
    } catch {
      /* ignore */
    }
    prefs = recordBindingTriggerLog(prefs, bindingId, {
      event: eventLabel,
      fileName,
      success: false,
      message: msg,
    });
    void auditLog({
      action: "export.auto_pdf",
      result: "fail",
      summary: msg.split("\n").slice(0, 8).join("；"),
      object_type: "template",
      object_id: templateId || undefined,
      detail: exportFailureAuditDetail({
        errorMessage: msg,
        diagnostics: parsed.diagnostics,
        extra: {
          bindingId,
          event: eventLabel,
          nodeId,
          serverId,
          label,
          durationMs: Date.now() - startedAtMs,
          fileName,
        },
      }),
    });
    await setBindingExportStatus(prefs, binding, AUTO_EXPORT_STATUS.FAILED, msg.split("\n")[0] || msg, {
      success: false,
    });
    void notifyExportResultToPlc(prefs, binding, {
      success: false,
      statusCode: AUTO_EXPORT_STATUS.FAILED,
      message: msg,
    });
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO}·${label} 失败：${msg.split("\n")[0]}`;
    showAppToast(`${RG_STATUS_OPC_AUTO}·${label} 结批失败\n${msg}`, {
      id: progressToastId,
      tone: "err",
      durationMs: 14000,
    });
  } finally {
    activeExportCount = Math.max(0, activeExportCount - 1);
    busyBindingIds.delete(bindingId);
    pumpExportQueue();
  }
}

function pumpExportQueue(): void {
  const prefs = loadReportGeneratorPrefs();
  const max = currentMaxParallel(prefs);
  while (exportQueue.length && activeExportCount < max) {
    const job = exportQueue.shift();
    if (!job) break;
    if (!busyBindingIds.has(job.bindingId)) {
      continue;
    }
    activeExportCount += 1;
    void executeBindingExport(job);
  }
}

function enqueueBindingExport(job: QueuedExportJob): void {
  if (busyBindingIds.has(job.bindingId)) return;
  busyBindingIds.add(job.bindingId);
  const binding = job.prefs.auto.bindings.find((x) => x.id === job.bindingId);
  if (binding) {
    void setBindingExportStatus(
      job.prefs,
      binding,
      AUTO_EXPORT_STATUS.QUEUED,
      autoExportStatusLabel(AUTO_EXPORT_STATUS.QUEUED),
    );
  }
  exportQueue.push(job);
  pumpExportQueue();
}

async function pollAutoTriggerOnce(): Promise<void> {
  if (!electronShell()) return;

  const prefs = loadReportGeneratorPrefs();
  syncBindingConfigKey(prefs);
  syncElectronMaxParallel(prefs);

  if (!prefs.auto.enabled) return;

  pruneBindingRuntime(prefs.auto.bindings);

  const bindings = prefs.auto.bindings;
  const active = bindings.filter(isTriggerBindingActive);

  if (!bindings.length) {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} 请点击「新建绑定」添加触发变量…`;
    return;
  }
  if (!active.length) {
    const anyComplete = bindings.some(isTriggerBindingComplete);
    reportAutoExportStatus.value = anyComplete
      ? `${RG_STATUS_OPC_AUTO} 已配置的绑定均未启用，请打开至少一条绑定的「启用」开关…`
      : `${RG_STATUS_OPC_AUTO} 请启用绑定并完成模版、连接与触发节点配置…`;
    return;
  }

  const resolved = await resolveAutoExportDir(prefs);
  if (!resolved.dir.trim()) {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} ${resolved.note || `请配置默认或 OPC ${RG_UI.opcAuto}保存文件夹…`}`;
    return;
  }

  const summaries = await loadTemplateSummariesCached();
  const statusParts: string[] = [];
  let anyListening = false;

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const label = bindingDisplayLabel(b, i, summaries);
    if (!isTriggerBindingActive(b)) continue;

    const srv = b.serverId.trim();
    const nodeId = b.nodeId.trim();
    const rt = getReportAutoExportBindingRuntime(b.id);

    let raw: unknown;
    let dataType: string | undefined;
    try {
      const read = await readSavedOpcNodeValue(srv, nodeId);
      if (!read.ok) throw new Error(read.message || "读 OPC 失败");
      raw = read.value;
      dataType = read.dataType;
    } catch {
      rt.poll = createOpcTriggerPollState();
      statusParts.push(`${label}：读取失败`);
      continue;
    }

    recordBindingOpcSample(b.id, rt, raw, dataType);

    const fire = evaluateAutoOpcTrigger(b.mode, raw, b.compareValue, rt.poll);

    if (fire) {
      if (busyBindingIds.has(b.id)) {
        statusParts.push(`${label}：忙碌中，忽略二次触发`);
        continue;
      }
      const eventLabel = autoTriggerEventLabel(b.mode, b.compareValue);
      enqueueBindingExport({
        bindingId: b.id,
        prefs,
        label,
        eventLabel,
        nodeId,
        serverId: srv,
        templateId: b.templateId!,
      });
      continue;
    }

    anyListening = true;
  }

  const running = activeExportCount;
  const queued = exportQueue.length;
  if (statusParts.length) {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} ${statusParts.join("；")}`;
  } else if (running || queued) {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} 并行导出中 ${running} 路${queued ? `，排队 ${queued}` : ""}（上限 ${currentMaxParallel(prefs)}）…`;
  } else if (anyListening) {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} 监听 ${active.length} 条已启用绑定…`;
  } else {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} 监听中…`;
  }

  // 空闲期后台保活：预检缓存 + OPC 连接池会话（不阻塞本次轮询）
  if (running === 0 && Date.now() - lastPreflightWarmupAt > PREFLIGHT_WARM_INTERVAL_MS) {
    lastPreflightWarmupAt = Date.now();
    void warmupPreflightCache(bindings);
  }
}

function restartPollLoop(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!electronShell()) return;

  const prefs = loadReportGeneratorPrefs();
  if (!prefs.auto.enabled) {
    reportAutoExportStatus.value = "";
    return;
  }

  void pollAutoTriggerOnce();
  pollTimer = setInterval(() => void pollAutoTriggerOnce(), AUTO_OPC_POLL_INTERVAL_MS);
}

export function initReportAutoExportTrigger(): void {
  if (pollTimer) return;
  restartPollLoop();
  window.addEventListener("report-generator-auto-export-changed", restartPollLoop);
  window.addEventListener("report-editor-config-imported", invalidateTemplateSummariesCache);
}

export function disposeReportAutoExportTrigger(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  window.removeEventListener("report-generator-auto-export-changed", restartPollLoop);
  window.removeEventListener("report-editor-config-imported", invalidateTemplateSummariesCache);
}

export function invalidateTemplateSummariesCache(): void {
  templateSummariesLoadedAt = 0;
  preflightCache.clear();
}

export function notifyReportAutoExportSettingsChanged(): void {
  window.dispatchEvent(new CustomEvent("report-generator-auto-export-changed"));
}
