/** 「生成报表」页本地偏好（localStorage） */



import {

  defaultAutoFileNameSegments,

  normalizeAutoFileNameSegments,

  segmentsFromLegacyPattern,

  withOpcuaFileNameSegment,

  type AutoFileNameSegment,

  type AutoFileNameSource,

} from "@/lib/auto-export-filename";

import {

  loadAutoTriggerBindings,

  type AutoTriggerBinding,

} from "@/lib/auto-trigger-bindings";

import {
  AUTO_EXPORT_MAX_PARALLEL_DEFAULT,
  clampAutoExportMaxParallel,
} from "@/lib/auto-export-status-codes";



export type { AutoFileNameSegment, AutoFileNameSource, AutoTriggerBinding };



export type AutoOpcTriggerMode = "rising" | "falling" | "equals";



/** 自动导出目标文件夹：固定默认路径，或 OPC UA String 变量（失败/空时回退默认） */

export type AutoExportDirSource = "default" | "opcua";

export type ExportResultOpcStatusKind = "bool" | "int";

/** 导出完成/失败后写回 PLC 的 OPC UA 变量绑定 */
export interface ExportResultOpcFeedback {
  enabled: boolean;
  serverId: string;
  statusNodeId: string;
  statusNodeLabel: string;
  statusKind: ExportResultOpcStatusKind;
  messageNodeId: string;
  messageNodeLabel: string;
  filePathNodeId: string;
  filePathNodeLabel: string;
  messageMaxLen: number;
}

export const defaultExportResultOpcFeedback = (): ExportResultOpcFeedback => ({
  enabled: false,
  serverId: "",
  statusNodeId: "",
  statusNodeLabel: "",
  statusKind: "bool",
  messageNodeId: "",
  messageNodeLabel: "",
  filePathNodeId: "",
  filePathNodeLabel: "",
  messageMaxLen: 200,
});

/** PLC 心跳（软件可用信号）写入模式：常写 1（PLC 清零）/ Bool 翻转 / 计数累加 */
export type PlcHeartbeatMode = "constant_one" | "toggle" | "counter";

/** 周期向 PLC 写 OPC UA 变量，PLC 侧看门狗判断报表软件是否在线 */
export interface PlcHeartbeatConfig {
  enabled: boolean;
  serverId: string;
  nodeId: string;
  nodeLabel: string;
  /** 写入周期（毫秒） */
  intervalMs: number;
  mode: PlcHeartbeatMode;
}

export const defaultPlcHeartbeatConfig = (): PlcHeartbeatConfig => ({
  enabled: false,
  serverId: "",
  nodeId: "",
  nodeLabel: "",
  intervalMs: 200,
  mode: "constant_one",
});



export interface ReportGeneratorPrefs {

  templateId: string | null;

  autoExportDirSource: AutoExportDirSource;

  /** 默认导出目录（Electron 下为绝对路径）；OPC 不可用时回退到此路径 */

  autoExportDir: string | null;

  /** OPC UA String 变量：变量值为导出目录绝对路径 */

  autoExportDirOpcServerId: string;

  autoExportDirOpcNodeId: string;

  /** 自动导出文件名：按勾选片段拼接；autoFileNameSource 保留兼容旧配置 */

  autoFileNameSource: AutoFileNameSource;

  autoFileNameSegments: AutoFileNameSegment[];

  /** 片段之间的连接符 */

  autoFileNameSeparator: string;

  autoFileNameOpcServerId: string;

  autoFileNameOpcNodeId: string;

  /** 旧 OPC 文件名模式兼容字段；新界面用 hash 片段控制 */

  autoFileNameOpcAppendHash: boolean;

  manualOpenAfter: boolean;

  exportResultOpc: ExportResultOpcFeedback;

  /** 按报表模版单独配置的结批结果反馈变量；key 为 templateId */
  exportResultOpcByTemplateId: Record<string, ExportResultOpcFeedback>;

  /** PLC 心跳：周期写 OPC 变量，供 PLC 判断报表软件在线 */
  heartbeat: PlcHeartbeatConfig;

  auto: {

    enabled: boolean;

    /** 多条 OPC 触发绑定，每条可指定导出模版 */

    bindings: AutoTriggerBinding[];

    /**
     * 同时并行导出上限（人工设置）。
     * 实际并行 = min(本值, 已启用绑定数, 硬顶 16)。
     */
    maxParallelExports: number;

  };

}



const LS_KEY = "reportGeneratorPrefsV1";



export const defaultReportGeneratorPrefs = (): ReportGeneratorPrefs => ({

  templateId: null,

  autoExportDirSource: "default",

  autoExportDir: null,

  autoExportDirOpcServerId: "",

  autoExportDirOpcNodeId: "",

  autoFileNameSource: "segments",

  autoFileNameSegments: defaultAutoFileNameSegments(),

  autoFileNameSeparator: "_",

  autoFileNameOpcServerId: "",

  autoFileNameOpcNodeId: "",

  autoFileNameOpcAppendHash: true,

  manualOpenAfter: false,

  exportResultOpc: defaultExportResultOpcFeedback(),

  exportResultOpcByTemplateId: {},

  heartbeat: defaultPlcHeartbeatConfig(),

  auto: {

    enabled: false,

    bindings: [],

    maxParallelExports: AUTO_EXPORT_MAX_PARALLEL_DEFAULT,

  },

});



type StoredPrefs = Partial<ReportGeneratorPrefs> & {

  autoFilePattern?: string;

  auto?: Partial<ReportGeneratorPrefs["auto"]> & {

    serverId?: string;

    nodeId?: string;

    mode?: unknown;

  };

};



function parseExportResultOpc(raw: unknown, base: ExportResultOpcFeedback): ExportResultOpcFeedback {
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<ExportResultOpcFeedback>;
  return {
    enabled: Boolean(o.enabled),
    serverId: typeof o.serverId === "string" ? o.serverId : base.serverId,
    statusNodeId: typeof o.statusNodeId === "string" ? o.statusNodeId : base.statusNodeId,
    statusNodeLabel: typeof o.statusNodeLabel === "string" ? o.statusNodeLabel : base.statusNodeLabel,
    statusKind: o.statusKind === "int" ? "int" : base.statusKind,
    messageNodeId: typeof o.messageNodeId === "string" ? o.messageNodeId : base.messageNodeId,
    messageNodeLabel: typeof o.messageNodeLabel === "string" ? o.messageNodeLabel : base.messageNodeLabel,
    filePathNodeId: typeof o.filePathNodeId === "string" ? o.filePathNodeId : base.filePathNodeId,
    filePathNodeLabel: typeof o.filePathNodeLabel === "string" ? o.filePathNodeLabel : base.filePathNodeLabel,
    messageMaxLen:
      typeof o.messageMaxLen === "number" && o.messageMaxLen > 0
        ? Math.min(2000, Math.floor(o.messageMaxLen))
        : base.messageMaxLen,
  };
}

function cloneExportResultOpcFeedback(fb: ExportResultOpcFeedback): ExportResultOpcFeedback {
  return { ...fb };
}

function parseExportResultOpcByTemplateId(
  raw: unknown,
  base: ExportResultOpcFeedback,
): Record<string, ExportResultOpcFeedback> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, ExportResultOpcFeedback> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const tid = String(key || "").trim();
    if (!tid) continue;
    out[tid] = parseExportResultOpc(val, cloneExportResultOpcFeedback(base));
  }
  return out;
}

const HEARTBEAT_MIN_INTERVAL_MS = 100;
const HEARTBEAT_MAX_INTERVAL_MS = 3_600_000;

function parsePlcHeartbeat(raw: unknown, base: PlcHeartbeatConfig): PlcHeartbeatConfig {
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<PlcHeartbeatConfig> & { intervalSec?: unknown };
  // 旧版按秒存储：迁移为毫秒
  let intervalMs = Number(o.intervalMs);
  if (!Number.isFinite(intervalMs)) {
    const legacySec = Number(o.intervalSec);
    intervalMs = Number.isFinite(legacySec) ? legacySec * 1000 : NaN;
  }
  const mode: PlcHeartbeatMode =
    o.mode === "toggle" || o.mode === "counter" ? o.mode : base.mode;
  return {
    enabled: Boolean(o.enabled),
    serverId: typeof o.serverId === "string" ? o.serverId : base.serverId,
    nodeId: typeof o.nodeId === "string" ? o.nodeId : base.nodeId,
    nodeLabel: typeof o.nodeLabel === "string" ? o.nodeLabel : base.nodeLabel,
    intervalMs:
      Number.isFinite(intervalMs) &&
      intervalMs >= HEARTBEAT_MIN_INTERVAL_MS &&
      intervalMs <= HEARTBEAT_MAX_INTERVAL_MS
        ? Math.floor(intervalMs)
        : base.intervalMs,
    mode,
  };
}

function parseStoredPrefs(o: StoredPrefs, base: ReportGeneratorPrefs): ReportGeneratorPrefs {
  const dirSource: AutoExportDirSource =
    o.autoExportDirSource === "opcua" ? "opcua" : base.autoExportDirSource;
  const legacyOpcFileNameSource = o.autoFileNameSource === "opcua";
  const fileNameSource: AutoFileNameSource = base.autoFileNameSource;
  const fileNameAppendHash =
    o.autoFileNameOpcAppendHash === false ? false : base.autoFileNameOpcAppendHash;
  const legacyPattern =
    typeof o.autoFilePattern === "string" && o.autoFilePattern.trim() ? o.autoFilePattern.trim() : "";
  let fileNameSegments =
    o.autoFileNameSegments != null
      ? normalizeAutoFileNameSegments(o.autoFileNameSegments)
      : legacyPattern
        ? segmentsFromLegacyPattern(legacyPattern)
        : base.autoFileNameSegments;
  if (legacyOpcFileNameSource) {
    fileNameSegments = withOpcuaFileNameSegment(fileNameSegments);
    if (fileNameAppendHash) {
      if (!fileNameSegments.includes("ts")) fileNameSegments.push("ts");
      if (!fileNameSegments.includes("hash")) fileNameSegments.push("hash");
    }
  }
  const bindingsRaw = loadAutoTriggerBindings(o.auto?.bindings, o.auto, o.templateId);
  const exportResultOpc = parseExportResultOpc(o.exportResultOpc, base.exportResultOpc);
  const bindingFbBase = defaultExportResultOpcFeedback();
  bindingFbBase.statusKind = "int";
  const bindings = bindingsRaw.map((b) => {
    if (!b.exportResultOpc) return b;
    return {
      ...b,
      exportResultOpc: parseExportResultOpc(b.exportResultOpc, cloneExportResultOpcFeedback(bindingFbBase)),
    };
  });
  return {
    templateId: typeof o.templateId === "string" ? o.templateId : base.templateId,
    autoExportDirSource: dirSource,
    autoExportDir: typeof o.autoExportDir === "string" ? o.autoExportDir : base.autoExportDir,
    autoExportDirOpcServerId:
      typeof o.autoExportDirOpcServerId === "string"
        ? o.autoExportDirOpcServerId
        : base.autoExportDirOpcServerId,
    autoExportDirOpcNodeId:
      typeof o.autoExportDirOpcNodeId === "string" ? o.autoExportDirOpcNodeId : base.autoExportDirOpcNodeId,
    autoFileNameSource: fileNameSource,
    autoFileNameSegments: fileNameSegments,
    autoFileNameSeparator:
      typeof o.autoFileNameSeparator === "string" && o.autoFileNameSeparator.length <= 8
        ? o.autoFileNameSeparator
        : base.autoFileNameSeparator,
    autoFileNameOpcServerId:
      typeof o.autoFileNameOpcServerId === "string" ? o.autoFileNameOpcServerId : base.autoFileNameOpcServerId,
    autoFileNameOpcNodeId:
      typeof o.autoFileNameOpcNodeId === "string" ? o.autoFileNameOpcNodeId : base.autoFileNameOpcNodeId,
    autoFileNameOpcAppendHash: fileNameAppendHash,
    manualOpenAfter: Boolean(o.manualOpenAfter),
    exportResultOpc,
    exportResultOpcByTemplateId: parseExportResultOpcByTemplateId(
      o.exportResultOpcByTemplateId,
      exportResultOpc,
    ),
    heartbeat: parsePlcHeartbeat(o.heartbeat, base.heartbeat),
    auto: {
      enabled: Boolean(o.auto?.enabled),
      bindings,
      maxParallelExports: clampAutoExportMaxParallel(
        (o.auto as { maxParallelExports?: unknown } | undefined)?.maxParallelExports ??
          base.auto.maxParallelExports,
      ),
    },
  };
}

export function loadReportGeneratorPrefs(): ReportGeneratorPrefs {
  const base = defaultReportGeneratorPrefs();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    return parseStoredPrefs(JSON.parse(raw) as StoredPrefs, base);
  } catch {
    return base;
  }
}

/** 从配置包中的 report_generator 字段恢复本机偏好 */
export function importReportGeneratorPrefsFromExport(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  try {
    saveReportGeneratorPrefs(parseStoredPrefs(raw as StoredPrefs, defaultReportGeneratorPrefs()));
    return true;
  } catch {
    return false;
  }
}

export function cloneExportResultOpcForTemplate(
  fb: ExportResultOpcFeedback,
): ExportResultOpcFeedback {
  return cloneExportResultOpcFeedback(fb);
}

/**
 * 该反馈配置是否被用户实际配置过（启用、绑定过节点或选过连接）。
 * 未配置过的按模版条目只是历史上自动生成的空白快照，应沿用默认配置。
 */
export function isExportResultOpcCustomized(fb: ExportResultOpcFeedback): boolean {
  return (
    fb.enabled ||
    Boolean(
      fb.statusNodeId.trim() || fb.messageNodeId.trim() || fb.filePathNodeId.trim(),
    ) ||
    Boolean(fb.serverId.trim())
  );
}

/**
 * 写回/校验时解析某模版实际生效的结批结果反馈配置：
 * 模版有单独配置（用户改过）时用模版配置；否则回退到默认配置。
 * 修复：仅在「默认配置」下启用反馈时，历史遗留的空白模版快照会让真实结批静默跳过写回。
 */
export function resolveExportResultOpcForTemplate(
  prefs: ReportGeneratorPrefs,
  templateId: string | null | undefined,
): ExportResultOpcFeedback {
  const tid = String(templateId || "").trim();
  if (!tid) return prefs.exportResultOpc;
  const existing = prefs.exportResultOpcByTemplateId?.[tid];
  if (existing && isExportResultOpcCustomized(existing)) return existing;
  return prefs.exportResultOpc;
}

/**
 * 自动结批写回：优先本绑定独立配置，否则按模版 → 默认。
 */
export function resolveExportResultOpcForBinding(
  prefs: ReportGeneratorPrefs,
  binding: AutoTriggerBinding | null | undefined,
): ExportResultOpcFeedback {
  if (binding?.exportResultOpc && isExportResultOpcCustomized(binding.exportResultOpc)) {
    return binding.exportResultOpc;
  }
  return resolveExportResultOpcForTemplate(prefs, binding?.templateId);
}

/** 新建绑定卡片用的默认反馈（自动结批强制 INT 状态码） */
export function defaultBindingExportResultOpcFeedback(): ExportResultOpcFeedback {
  const fb = defaultExportResultOpcFeedback();
  fb.statusKind = "int";
  return fb;
}



export function saveReportGeneratorPrefs(p: ReportGeneratorPrefs): void {

  try {

    localStorage.setItem(LS_KEY, JSON.stringify(p));

  } catch {

    /* ignore */

  }

}


