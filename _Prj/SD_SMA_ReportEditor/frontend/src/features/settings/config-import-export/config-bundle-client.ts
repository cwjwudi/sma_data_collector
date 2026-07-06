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
import { invalidateSignature } from "@/lib/signature-registry";
import { clearLayoutCache } from "@/lib/report-template/layout-registry";
import { clearTemplateViewCache } from "@/lib/report-template/template-view-cache";

/** 需要随备份一起迁移的本机 UI 偏好（localStorage 键白名单）。
 * 仅收录「设置类」轻量偏好；模版/版式/数据源等大体量本地缓存由服务端配置包负责，不在此重复。 */
export const UI_PREF_KEYS = [
  "tm-view-mode",
  "lp-view-mode",
  "rh-view-mode",
  "report-editor-sidebar-collapsed",
  "sd-sma-report-editor:electron-devtools-open",
  "report_editor_setup_wizard",
  "report-editor-demo-license",
] as const;

export type ConfigBundleClientPrefs = {
  report_generator?: unknown;
  report_export?: unknown;
  template_display_order?: string[];
  layout_display_order?: LayoutDisplayOrderMap;
  ui_prefs?: Record<string, string>;
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

function collectUiPrefs(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof localStorage === "undefined") return out;
  for (const key of UI_PREF_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) out[key] = val;
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** 收集本机「生成报表 / 历史报表 / 显示顺序 / UI 偏好」等设置，作为配置包的 client_prefs */
export function collectClientPrefs(): ConfigBundleClientPrefs {
  return {
    report_generator: loadReportGeneratorPrefs(),
    report_export: loadReportExportPrefs(),
    template_display_order: loadTemplateDisplayOrder(),
    layout_display_order: loadLayoutDisplayOrder(),
    ui_prefs: collectUiPrefs(),
  };
}

/** 合并本机「生成报表 / 历史报表」等偏好进待导出包 */
export function attachClientPrefsToBundle<T extends Record<string, unknown>>(bundle: T): T {
  return { ...bundle, client_prefs: collectClientPrefs() };
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

  if (prefs.ui_prefs && typeof prefs.ui_prefs === "object" && typeof localStorage !== "undefined") {
    let n = 0;
    for (const key of UI_PREF_KEYS) {
      const val = (prefs.ui_prefs as Record<string, unknown>)[key];
      if (typeof val === "string") {
        try {
          localStorage.setItem(key, val);
          n += 1;
        } catch {
          /* ignore */
        }
      }
    }
    if (n) applied.push("界面偏好");
  }

  return applied;
}

/** 失效各会话缓存（签名、版式、模版视图），用于备份恢复 / 云端下载后强制重拉。 */
export function invalidateRestoredCaches(): void {
  try {
    invalidateSignature();
  } catch {
    /* ignore */
  }
  try {
    clearLayoutCache();
  } catch {
    /* ignore */
  }
  try {
    clearTemplateViewCache();
  } catch {
    /* ignore */
  }
}

/** 仅派发恢复事件，通知各已挂载页面刷新（不清缓存，供已预热后调用）。 */
export function dispatchConfigRestoredEvents(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("report-generator-prefs-updated"));
  window.dispatchEvent(new CustomEvent("report-editor-config-imported"));
}

/** 配置/备份恢复后通知各页面刷新（生成报表绑定、模版列表、签名、版式、自动截批等）。
 * 先失效各会话缓存，再派发事件，确保监听页面拉到的是最新数据而非旧缓存。 */
export function notifyReportEditorConfigRestored(): void {
  if (typeof window === "undefined") return;
  invalidateRestoredCaches();
  dispatchConfigRestoredEvents();
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
