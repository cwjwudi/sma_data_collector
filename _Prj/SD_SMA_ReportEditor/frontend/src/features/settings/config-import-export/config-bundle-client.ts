import {
  loadLayoutDisplayOrder,
  saveLayoutDisplayOrderMap,
  type LayoutDisplayOrderMap,
} from "@/lib/layout-display-order";
import {
  importReportGeneratorPrefsFromExport,
  loadReportGeneratorPrefs,
} from "@/lib/report-generator-prefs";
import {
  loadReportExportPrefs,
  saveReportExportPrefs,
  type ReportExportPrefs,
} from "@/lib/report-export-prefs";
import {
  loadTemplateDisplayOrder,
  saveTemplateDisplayOrder,
} from "@/lib/template-display-order";

export type ConfigBundleClientPrefs = {
  report_generator?: unknown;
  report_export?: unknown;
  template_display_order?: string[];
  layout_display_order?: LayoutDisplayOrderMap;
};

export type ConfigBundlePayload = {
  bundle_version?: number;
  exported_at?: string;
  export_mode?: string;
  schema_version?: number;
  app_preferences?: unknown;
  db_connections?: unknown[];
  opcua_servers?: unknown[];
  templates?: unknown[];
  layout_presets?: unknown[];
  signature_assets?: unknown[];
  client_prefs?: ConfigBundleClientPrefs;
};

export function isConfigBundlePayload(data: unknown): data is ConfigBundlePayload {
  if (!data || typeof data !== "object") return false;
  const o = data as ConfigBundlePayload;
  if (typeof o.bundle_version === "number" && o.bundle_version >= 2) return true;
  return (
    Array.isArray(o.templates) ||
    Array.isArray(o.layout_presets) ||
    Array.isArray(o.signature_assets) ||
    (o.client_prefs != null && typeof o.client_prefs === "object")
  );
}

/** 合并本机「生成报表 / 历史报表」等偏好进待导出包 */
export function attachClientPrefsToBundle<T extends Record<string, unknown>>(bundle: T): T {
  const client_prefs: ConfigBundleClientPrefs = {
    report_generator: loadReportGeneratorPrefs(),
    report_export: loadReportExportPrefs(),
    template_display_order: loadTemplateDisplayOrder(),
    layout_display_order: loadLayoutDisplayOrder(),
  };
  return { ...bundle, client_prefs };
}

function normalizeReportExportPrefs(raw: unknown): ReportExportPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { watchDir?: unknown };
  const watchDir = typeof o.watchDir === "string" && o.watchDir.trim() ? o.watchDir.trim() : null;
  return { watchDir };
}

function normalizeTemplateDisplayOrder(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids;
}

function normalizeLayoutDisplayOrder(raw: unknown): LayoutDisplayOrderMap | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as LayoutDisplayOrderMap;
}

/** 应用配置包中的 client_prefs（服务端 import 响应或本地 JSON） */
export function applyClientPrefsFromBundle(raw: unknown): string[] {
  const applied: string[] = [];
  if (!raw || typeof raw !== "object") return applied;
  const prefs = raw as ConfigBundleClientPrefs;

  if (importReportGeneratorPrefsFromExport(prefs.report_generator)) {
    applied.push("生成报表配置");
  }

  const exportPrefs = normalizeReportExportPrefs(prefs.report_export);
  if (exportPrefs) {
    saveReportExportPrefs(exportPrefs);
    applied.push("历史报表配置");
  }

  const tplOrder = normalizeTemplateDisplayOrder(prefs.template_display_order);
  if (tplOrder) {
    saveTemplateDisplayOrder(tplOrder);
    applied.push("模版显示顺序");
  }

  const layoutOrder = normalizeLayoutDisplayOrder(prefs.layout_display_order);
  if (layoutOrder) {
    saveLayoutDisplayOrderMap(layoutOrder);
    applied.push("版式显示顺序");
  }

  return applied;
}

/** 旧版仅含 db/opc 的 JSON：服务端字段 + 文件内嵌的 client_prefs */
export function buildImportDataFromFile(parsed: unknown): {
  serverPayload: Record<string, unknown>;
  clientPrefs: unknown;
} {
  if (!parsed || typeof parsed !== "object") {
    return { serverPayload: {}, clientPrefs: null };
  }
  const o = parsed as ConfigBundlePayload;
  const clientPrefs = o.client_prefs ?? null;
  if (isConfigBundlePayload(o)) {
    return { serverPayload: { ...o }, clientPrefs };
  }
  return { serverPayload: { ...o }, clientPrefs };
}
