/** 「生成报表」页本地偏好（localStorage） */

import {
  defaultAutoFileNameSegments,
  normalizeAutoFileNameSegments,
  segmentsFromLegacyPattern,
  type AutoFileNameSegment,
  type AutoFileNameSource,
} from "@/lib/auto-export-filename";

export type { AutoFileNameSegment, AutoFileNameSource };

export type AutoOpcTriggerMode = "truthy" | "equals" | "rising";

/** 自动导出目标文件夹：固定默认路径，或 OPC UA String 变量（失败/空时回退默认） */
export type AutoExportDirSource = "default" | "opcua";

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
  manualOpenAfter: boolean;
  auto: {
    enabled: boolean;
    serverId: string;
    nodeId: string;
    mode: AutoOpcTriggerMode;
    equalsText: string;
    pollSec: number;
    cooldownSec: number;
    openAfter: boolean;
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
  manualOpenAfter: false,
  auto: {
    enabled: false,
    serverId: "",
    nodeId: "",
    mode: "rising",
    equalsText: "1",
    pollSec: 2,
    cooldownSec: 60,
    openAfter: false,
  },
});

export function loadReportGeneratorPrefs(): ReportGeneratorPrefs {
  const base = defaultReportGeneratorPrefs();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const o = JSON.parse(raw) as Partial<ReportGeneratorPrefs> & { autoFilePattern?: string };
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
      manualOpenAfter: Boolean(o.manualOpenAfter),
      auto: {
        enabled: Boolean(o.auto?.enabled),
        serverId: typeof o.auto?.serverId === "string" ? o.auto.serverId : base.auto.serverId,
        nodeId: typeof o.auto?.nodeId === "string" ? o.auto.nodeId : base.auto.nodeId,
        mode:
          o.auto?.mode === "truthy" || o.auto?.mode === "equals" || o.auto?.mode === "rising"
            ? o.auto.mode
            : base.auto.mode,
        equalsText: typeof o.auto?.equalsText === "string" ? o.auto.equalsText : base.auto.equalsText,
        pollSec:
          typeof o.auto?.pollSec === "number" && Number.isFinite(o.auto.pollSec)
            ? Math.min(300, Math.max(0.5, o.auto.pollSec))
            : base.auto.pollSec,
        cooldownSec:
          typeof o.auto?.cooldownSec === "number" && Number.isFinite(o.auto.cooldownSec)
            ? Math.min(3600, Math.max(1, o.auto.cooldownSec))
            : base.auto.cooldownSec,
        openAfter: Boolean(o.auto?.openAfter),
      },
    };
  } catch {
    return base;
  }
}

export function saveReportGeneratorPrefs(p: ReportGeneratorPrefs): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
