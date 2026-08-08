/**
 * 048：问题反馈包客户端——组请求体、下载 zip。
 */
import { resolveApiHref } from "@/api/apiBase.js";
import { listTemplateSummaries, type TemplateSummary } from "@/api/templates";
import { loadReportGeneratorPrefs } from "@/lib/report-generator-prefs";

export type SupportPackDraft = {
  title: string;
  symptom: string;
  expected: string;
  steps: string;
  occurredAt: string;
  templateIds: string[];
  includeFailedPdf: boolean;
  pdfPaths: string[];
};

export type SupportPackSuggestions = {
  templateIds: string[];
  pdfPaths: string[];
  auditCount: number;
};

export function defaultSupportPackDraft(): SupportPackDraft {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    title: "",
    symptom: "",
    expected: "",
    steps: "",
    occurredAt: stamp,
    templateIds: [],
    includeFailedPdf: true,
    pdfPaths: [],
  };
}

export async function fetchSupportPackSuggestions(): Promise<SupportPackSuggestions> {
  const res = await fetch(resolveApiHref("/settings/support-pack/suggestions"));
  if (!res.ok) {
    return { templateIds: [], pdfPaths: [], auditCount: 0 };
  }
  const data = (await res.json()) as SupportPackSuggestions;
  return {
    templateIds: Array.isArray(data.templateIds) ? data.templateIds.map(String) : [],
    pdfPaths: Array.isArray(data.pdfPaths) ? data.pdfPaths.map(String) : [],
    auditCount: Number(data.auditCount) || 0,
  };
}

function collectEnv(): Record<string, unknown> {
  const w = window as Window & {
    reportEditor?: { getVersion?: () => Promise<string> };
    electronAPI?: { getAppVersion?: () => Promise<string> };
  };
  const env: Record<string, unknown> = {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    language: navigator.language,
  };
  return env;
}

async function resolveAppVersion(): Promise<string> {
  try {
    const er = (
      window as {
        reportEditor?: {
          getVersion?: () => Promise<string>;
          getAppInfo?: () => Promise<{ version?: string }>;
        };
      }
    ).reportEditor;
    if (er?.getVersion) {
      const v = await er.getVersion();
      if (v) return String(v);
    }
    if (er?.getAppInfo) {
      const info = await er.getAppInfo();
      if (info?.version) return String(info.version);
    }
  } catch {
    /* ignore */
  }
  return "0.3.146";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportSupportPackZip(draft: SupportPackDraft): Promise<{ filename: string }> {
  const appVersion = await resolveAppVersion();
  const env = { ...collectEnv(), appVersion };
  const generatorPrefs = loadReportGeneratorPrefs();
  const res = await fetch(resolveApiHref("/settings/support-pack/export"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: draft.title,
      symptom: draft.symptom,
      expected: draft.expected,
      steps: draft.steps,
      occurredAt: draft.occurredAt,
      templateIds: draft.templateIds,
      includeFailedPdf: draft.includeFailedPdf,
      pdfPaths: draft.pdfPaths,
      generatorPrefs,
      env,
      appVersion,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `导出失败（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename="([^"]+)"/.exec(cd);
  const filename = m?.[1] || `support-pack-${appVersion || "dev"}.zip`;
  downloadBlob(blob, filename);
  return { filename };
}

/** 从导出失败审计预填草稿（旁路入口）。 */
export function draftFromExportFailure(opts: {
  templateId?: string | null;
  summary?: string | null;
  filePath?: string | null;
}): SupportPackDraft {
  const d = defaultSupportPackDraft();
  d.title = "导出失败反馈";
  d.symptom = String(opts.summary || "导出失败").trim();
  d.expected = "导出成功并生成 PDF，进程不闪退。";
  d.steps = "1. 打开相关模版\n2. 手动导出 / 模拟结批\n3. 观察失败或闪退";
  if (opts.templateId) d.templateIds = [String(opts.templateId)];
  if (opts.filePath) d.pdfPaths = [String(opts.filePath)];
  return d;
}

export async function loadTemplateChoices(): Promise<TemplateSummary[]> {
  try {
    return await listTemplateSummaries();
  } catch {
    return [];
  }
}
