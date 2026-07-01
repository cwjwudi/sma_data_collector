/**
 * OPC UA 自动截批轮询：应用级单例，离开「生成报表」页仍持续监听并导出 PDF。
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
import { runTemplateExportPreflight } from "@/lib/templateExportPreflight";
import { showAppToast } from "@/composables/useAppToast";
import { auditLog } from "@/lib/auditLog";
import {
  cloneExportResultOpcForTemplate,
  loadReportGeneratorPrefs,
  saveReportGeneratorPrefs,
  type ExportResultOpcFeedback,
  type ReportGeneratorPrefs,
} from "@/lib/report-generator-prefs";
import {
  isExportResultOpcFeedbackConfigured,
  writeExportResultToOpcua,
  type ExportResultWritePayload,
} from "@/lib/exportResultOpcFeedback";
import { NumericSampleRing, coerceOpcTriggerNumericSample, isOpcTriggerChartEligible } from "@/lib/auto-trigger-value-history";

const RG_UI = {
  opcAuto: "OPC UA 自动截批",
  feedback: "截批结果反馈",
} as const;

const RG_STATUS_OPC_AUTO = `[${RG_UI.opcAuto}]`;

export type BindingRuntime = {
  poll: OpcTriggerPollState;
  history: NumericSampleRing;
  chartEligible: boolean | null;
};

export const reportAutoExportStatus: Ref<string> = ref("");

let pollTimer: ReturnType<typeof setInterval> | null = null;
let autoExportBusy = false;
let lastBindingConfigKey = "";
let templateSummariesCache: TemplateSummary[] = [];
let templateSummariesLoadedAt = 0;
const TEMPLATE_CACHE_MS = 30_000;

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
    };
    bindingRuntime.set(id, r);
  }
  return r;
}

export function resetReportAutoExportBindingRuntime(): void {
  bindingRuntime.clear();
  lastBindingConfigKey = "";
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
  }
  pruneBindingRuntime(prefs.auto.bindings);
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

function resolveExportResultOpc(prefs: ReportGeneratorPrefs, templateId: string): ExportResultOpcFeedback {
  const tid = templateId.trim();
  if (!tid) return prefs.exportResultOpc;
  const existing = prefs.exportResultOpcByTemplateId?.[tid];
  if (existing) return existing;
  return cloneExportResultOpcForTemplate(prefs.exportResultOpc);
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
  payload: ExportResultWritePayload,
  templateId: string | null,
): Promise<void> {
  const fb = resolveExportResultOpc(prefs, templateId || "");
  if (!isExportResultOpcFeedbackConfigured(fb)) return;
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
        detail: { context: "auto", templateId: templateId || undefined },
      });
    } else {
      void auditLog({
        action: "export.opc_writeback",
        result: "ok",
        summary: `${RG_UI.opcAuto}写回`,
        detail: { context: "auto", templateId: templateId || undefined },
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

type AutoPdfExportAttempt = {
  fileName: string;
  filePath: string;
  filePaths?: string[];
  totalReports?: number;
  note?: string;
};

async function runAutoPdfExport(prefs: ReportGeneratorPrefs, templateId: string): Promise<AutoPdfExportAttempt> {
  const api = window.electronAPI;
  if (!api?.runPdfExport || !api.pathJoin) {
    throw new Error(`当前环境不支持${RG_UI.opcAuto}`);
  }

  const tid = templateId.trim();
  if (!tid) throw new Error(`未配置${RG_UI.opcAuto}报表模版`);

  const preflight = await runTemplateExportPreflight(tid);
  if (!preflight.ok) {
    throw new Error(preflight.summary);
  }

  const resolved = await resolveAutoExportDir(prefs);
  const dir = resolved.dir.trim();
  if (!dir) throw new Error(resolved.note || `未配置${RG_UI.opcAuto}保存目录`);

  const summaries = await loadTemplateSummariesCached();
  const tmeta = summaries.find((x) => x.id === tid);
  const built = await buildAutoExportFileName(prefs, tmeta?.name || tid);
  const filePath = await api.pathJoin(dir, built.base);

  const exportRes = await api.runPdfExport({
    templateId: tid,
    filePath,
    openAfter: false,
  });

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
  };
}

async function pollAutoTriggerOnce(): Promise<void> {
  if (!electronShell()) return;

  const prefs = loadReportGeneratorPrefs();
  syncBindingConfigKey(prefs);

  if (!prefs.auto.enabled || autoExportBusy) return;

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
  let exportedThisPoll = false;

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
      const eventLabel = autoTriggerEventLabel(b.mode, b.compareValue);
      let fileName = "—";
      autoExportBusy = true;
      try {
        const result = await runAutoPdfExport(prefs, b.templateId!);
        fileName = result.fileName;
        recordBindingTriggerLog(prefs, b.id, {
          event: eventLabel,
          fileName: result.fileName,
          filePath: result.filePath,
          success: true,
          message: result.note,
        });
        void notifyExportResultToPlc(
          prefs,
          {
            success: true,
            filePath: result.filePath,
            filePaths: result.filePaths,
            fileName: result.fileName,
            message: result.note,
          },
          b.templateId || null,
        );
        void auditLog({
          action: "export.auto_pdf",
          result: "ok",
          summary: result.fileName,
          object_type: "template",
          object_id: b.templateId || undefined,
          detail: { filePath: result.filePath, filePaths: result.filePaths, bindingId: b.id, event: eventLabel },
        });
        exportedThisPoll = true;
        const noteSuffix = result.note ? `（${result.note}）` : "";
        const fileCount = result.filePaths?.length || 1;
        reportAutoExportStatus.value =
          fileCount > 1
            ? `${RG_STATUS_OPC_AUTO}·${label} 已保存 ${fileCount} 个文件：${result.filePaths?.join("；")}${noteSuffix}`
            : `${RG_STATUS_OPC_AUTO}·${label} 已保存 ${result.filePath}${noteSuffix}`;
        showAppToast(
          fileCount > 1
            ? `${RG_STATUS_OPC_AUTO}·${label}\n已保存 ${fileCount} 个 PDF`
            : `${RG_STATUS_OPC_AUTO}·${label}\n已保存 ${result.fileName}`,
          { tone: "ok", durationMs: 8000 },
        );
      } catch (e) {
        const msg = humanizePdfExportError(e);
        try {
          const tmeta = summaries.find((x) => x.id === b.templateId);
          const built = await buildAutoExportFileName(prefs, tmeta?.name || b.templateId || "");
          fileName = built.base;
        } catch {
          /* ignore */
        }
        recordBindingTriggerLog(prefs, b.id, {
          event: eventLabel,
          fileName,
          success: false,
          message: msg,
        });
        void auditLog({
          action: "export.auto_pdf",
          result: "fail",
          summary: msg,
          object_type: "template",
          object_id: b.templateId || undefined,
          detail: { bindingId: b.id, event: eventLabel },
        });
        void notifyExportResultToPlc(prefs, { success: false, message: msg }, b.templateId || null);
        reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO}·${label} 失败：${msg.split("\n")[0]}`;
        showAppToast(`${RG_STATUS_OPC_AUTO}·${label} 失败\n${msg}`, { tone: "err", durationMs: 14000 });
      } finally {
        autoExportBusy = false;
      }
      continue;
    }

    anyListening = true;
  }

  if (exportedThisPoll) return;
  if (statusParts.length) {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} ${statusParts.join("；")}`;
  } else if (anyListening) {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} 监听 ${active.length} 条已启用绑定…`;
  } else {
    reportAutoExportStatus.value = `${RG_STATUS_OPC_AUTO} 监听中…`;
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
}

export function notifyReportAutoExportSettingsChanged(): void {
  window.dispatchEvent(new CustomEvent("report-generator-auto-export-changed"));
}
