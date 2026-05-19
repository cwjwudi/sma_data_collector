/** 「生成报表」页本地偏好（localStorage） */

export type AutoOpcTriggerMode = "truthy" | "equals" | "rising";

export interface ReportGeneratorPrefs {
  templateId: string | null;
  /** 自动导出默认目录（Electron 下为绝对路径） */
  autoExportDir: string | null;
  /** 自动导出文件名模板，占位：{name} 模版名；{ts} 时间戳 yyyyMMdd_HHmmss */
  autoFilePattern: string;
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
  autoExportDir: null,
  autoFilePattern: "{name}_{ts}.pdf",
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
    const o = JSON.parse(raw) as Partial<ReportGeneratorPrefs>;
    return {
      templateId: typeof o.templateId === "string" ? o.templateId : base.templateId,
      autoExportDir: typeof o.autoExportDir === "string" ? o.autoExportDir : base.autoExportDir,
      autoFilePattern:
        typeof o.autoFilePattern === "string" && o.autoFilePattern.trim()
          ? o.autoFilePattern.trim()
          : base.autoFilePattern,
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
