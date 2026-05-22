/** 「生成报表」页本地偏好（localStorage） */



import {

  defaultAutoFileNameSegments,

  normalizeAutoFileNameSegments,

  segmentsFromLegacyPattern,

  type AutoFileNameSegment,

  type AutoFileNameSource,

} from "@/lib/auto-export-filename";

import {

  loadAutoTriggerBindings,

  type AutoTriggerBinding,

} from "@/lib/auto-trigger-bindings";



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



export interface ReportGeneratorPrefs {

  templateId: string | null;

  autoExportDirSource: AutoExportDirSource;

  /** 默认导出目录（Electron 下为绝对路径）；OPC 不可用时回退到此路径 */

  autoExportDir: string | null;

  /** OPC UA String 变量：变量值为导出目录绝对路径 */

  autoExportDirOpcServerId: string;

  autoExportDirOpcNodeId: string;

  /** 自动导出文件名：勾选片段 或 OPC String 基名 + 随机哈希 */

  autoFileNameSource: AutoFileNameSource;

  autoFileNameSegments: AutoFileNameSegment[];

  /** 片段 / OPC 基名 与哈希 之间的连接符 */

  autoFileNameSeparator: string;

  autoFileNameOpcServerId: string;

  autoFileNameOpcNodeId: string;

  /** OPC 文件名模式：是否在基名后追加随机哈希 */

  autoFileNameOpcAppendHash: boolean;

  manualOpenAfter: boolean;

  exportResultOpc: ExportResultOpcFeedback;

  auto: {

    enabled: boolean;

    /** 多条 OPC 触发绑定，每条可指定导出模版 */

    bindings: AutoTriggerBinding[];

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

  auto: {

    enabled: false,

    bindings: [],

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

function parseStoredPrefs(o: StoredPrefs, base: ReportGeneratorPrefs): ReportGeneratorPrefs {
  const dirSource: AutoExportDirSource =
    o.autoExportDirSource === "opcua" ? "opcua" : base.autoExportDirSource;
  const fileNameSource: AutoFileNameSource =
    o.autoFileNameSource === "opcua" ? "opcua" : base.autoFileNameSource;
  const legacyPattern =
    typeof o.autoFilePattern === "string" && o.autoFilePattern.trim() ? o.autoFilePattern.trim() : "";
  const fileNameSegments =
    o.autoFileNameSegments != null
      ? normalizeAutoFileNameSegments(o.autoFileNameSegments)
      : legacyPattern
        ? segmentsFromLegacyPattern(legacyPattern)
        : base.autoFileNameSegments;
  const bindings = loadAutoTriggerBindings(o.auto?.bindings, o.auto, o.templateId);
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
    autoFileNameOpcAppendHash:
      o.autoFileNameOpcAppendHash === false ? false : base.autoFileNameOpcAppendHash,
    manualOpenAfter: Boolean(o.manualOpenAfter),
    exportResultOpc: parseExportResultOpc(o.exportResultOpc, base.exportResultOpc),
    auto: {
      enabled: Boolean(o.auto?.enabled),
      bindings,
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



export function saveReportGeneratorPrefs(p: ReportGeneratorPrefs): void {

  try {

    localStorage.setItem(LS_KEY, JSON.stringify(p));

  } catch {

    /* ignore */

  }

}


