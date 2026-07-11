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
import { apiFetch } from "@/api/client.js";
import { notifyDatasourceChanged } from "@/lib/datasource-sync-events";

/** 需要随备份一起迁移的本机 UI 偏好（localStorage 键白名单）。 */
export const UI_PREF_KEYS = [
  "tm-view-mode",
  "lp-view-mode",
  "rh-view-mode",
  "report-editor-sidebar-collapsed",
  "sd-sma-report-editor:electron-devtools-open",
  "report_editor_setup_wizard",
  "report-editor-demo-license",
  "reportTplBindingPollIntervalSec",
  "reportTplOpcUaLiveRefresh",
  "reportTplDbLiveRefresh",
  "sd-sma-report-editor:ignored-asset-health-issues:v1",
] as const;

const REL_BROWSER_LAYOUT_PREFIX = "relBrowserLayout:";

export type ElectronBackupPrefs = {
  portalBaseUrl?: string;
  portalSkipTlsVerify?: boolean;
  updateBaseUrl?: string;
  updateSkipTlsVerify?: boolean;
  macOpenAfterUpgrade?: boolean;
};

export type ConfigBundleClientPrefs = {
  report_generator?: unknown;
  report_export?: unknown;
  template_display_order?: string[];
  layout_display_order?: LayoutDisplayOrderMap;
  ui_prefs?: Record<string, string>;
  rel_browser_layouts?: Record<string, string>;
  electron_prefs?: ElectronBackupPrefs;
};

export type ConfigBundlePayload = {
  bundle_version?: number;
  exported_at?: string;
  export_mode?: string;
  schema_version?: number;
  app_preferences?: unknown;
  db_connections?: unknown[];
  opcua_servers?: unknown[];
  ai_settings?: unknown;
  query_sessions?: unknown;
  templates?: unknown[];
  layout_presets?: unknown[];
  signature_assets?: unknown[];
  client_prefs?: ConfigBundleClientPrefs;
};

export type ImportStats = {
  db_connections?: number;
  opcua_servers?: number;
  templates?: number;
  layout_presets?: number;
  signature_assets?: number;
  audit_entries?: number;
  query_session_favorites?: number;
  query_session_history?: number;
  has_ai_settings?: boolean;
  has_client_prefs?: boolean;
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

function collectRelBrowserLayouts(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof localStorage === "undefined") return out;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(REL_BROWSER_LAYOUT_PREFIX)) continue;
      const val = localStorage.getItem(key);
      if (val !== null) out[key] = val;
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function collectElectronPrefs(): Promise<ElectronBackupPrefs | undefined> {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api) return undefined;
  const out: ElectronBackupPrefs = {};
  try {
    if (typeof api.getLayoutSyncConfig === "function") {
      const c = await api.getLayoutSyncConfig();
      if (c && typeof c === "object") {
        if (typeof c.portalBaseUrl === "string" && c.portalBaseUrl.trim()) {
          out.portalBaseUrl = c.portalBaseUrl.trim();
        }
        if (typeof c.skipTlsVerify === "boolean") out.portalSkipTlsVerify = c.skipTlsVerify;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof api.getAppUpdateConfig === "function") {
      const c = await api.getAppUpdateConfig();
      if (c && typeof c === "object") {
        if (typeof c.baseUrl === "string" && c.baseUrl.trim()) out.updateBaseUrl = c.baseUrl.trim();
        if (typeof c.skipTlsVerify === "boolean") out.updateSkipTlsVerify = c.skipTlsVerify;
        if (typeof c.macOpenAfterUpgrade === "boolean") out.macOpenAfterUpgrade = c.macOpenAfterUpgrade;
      }
    }
  } catch {
    /* ignore */
  }
  return Object.keys(out).length ? out : undefined;
}

async function applyElectronPrefs(prefs: ElectronBackupPrefs | undefined): Promise<boolean> {
  if (!prefs || typeof window === "undefined") return false;
  const api = window.electronAPI;
  if (!api) return false;
  let applied = false;
  try {
    if (
      typeof api.setLayoutSyncConfig === "function" &&
      (prefs.portalBaseUrl !== undefined || prefs.portalSkipTlsVerify !== undefined)
    ) {
      const patch: Record<string, unknown> = {};
      if (prefs.portalBaseUrl !== undefined) patch.portalBaseUrl = prefs.portalBaseUrl;
      if (prefs.portalSkipTlsVerify !== undefined) patch.skipTlsVerify = prefs.portalSkipTlsVerify;
      await api.setLayoutSyncConfig(patch);
      applied = true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (
      typeof api.setAppUpdateConfig === "function" &&
      (prefs.updateBaseUrl !== undefined ||
        prefs.updateSkipTlsVerify !== undefined ||
        prefs.macOpenAfterUpgrade !== undefined)
    ) {
      const patch: Record<string, unknown> = {};
      if (prefs.updateBaseUrl !== undefined) patch.baseUrl = prefs.updateBaseUrl;
      if (prefs.updateSkipTlsVerify !== undefined) patch.skipTlsVerify = prefs.updateSkipTlsVerify;
      if (prefs.macOpenAfterUpgrade !== undefined) patch.macOpenAfterUpgrade = prefs.macOpenAfterUpgrade;
      await api.setAppUpdateConfig(patch);
      applied = true;
    }
  } catch {
    /* ignore */
  }
  return applied;
}

/** 同步收集本机偏好（不含需 await 的 Electron 项）。 */
export function collectClientPrefs(): ConfigBundleClientPrefs {
  return {
    report_generator: loadReportGeneratorPrefs(),
    report_export: loadReportExportPrefs(),
    template_display_order: loadTemplateDisplayOrder(),
    layout_display_order: loadLayoutDisplayOrder(),
    ui_prefs: collectUiPrefs(),
    rel_browser_layouts: collectRelBrowserLayouts(),
  };
}

/** 完整收集：含 Electron Portal/更新源地址（不含登录 token）。 */
export async function collectClientPrefsFull(): Promise<ConfigBundleClientPrefs> {
  const base = collectClientPrefs();
  const electron_prefs = await collectElectronPrefs();
  return electron_prefs ? { ...base, electron_prefs } : base;
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

  if (
    prefs.rel_browser_layouts &&
    typeof prefs.rel_browser_layouts === "object" &&
    typeof localStorage !== "undefined"
  ) {
    let n = 0;
    for (const [key, val] of Object.entries(prefs.rel_browser_layouts)) {
      if (!key.startsWith(REL_BROWSER_LAYOUT_PREFIX) || typeof val !== "string") continue;
      try {
        localStorage.setItem(key, val);
        n += 1;
      } catch {
        /* ignore */
      }
    }
    if (n) applied.push("ER 图布局");
  }

  return applied;
}

/** 应用 client_prefs（含 Electron）；返回已应用项标签。 */
export async function applyClientPrefsFromBundleFull(raw: unknown): Promise<string[]> {
  const applied = applyClientPrefsFromBundle(raw);
  if (raw && typeof raw === "object") {
    const ep = (raw as ConfigBundleClientPrefs).electron_prefs;
    if (await applyElectronPrefs(ep)) applied.push("Portal/更新源地址");
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

/** 配置/备份恢复后通知各页面刷新。 */
export function notifyReportEditorConfigRestored(): void {
  if (typeof window === "undefined") return;
  invalidateRestoredCaches();
  dispatchConfigRestoredEvents();
}

/** 恢复写入后：失效缓存 → 预拉数据源 → 应用偏好 → 派发事件。 */
export async function finalizeConfigRestore(opts: {
  clientPrefs?: unknown;
}): Promise<string[]> {
  invalidateRestoredCaches();
  try {
    await Promise.all([apiFetch("/database/connections"), apiFetch("/opcua/servers")]);
  } catch {
    /* 预拉失败不阻断恢复 */
  }
  const applied = await applyClientPrefsFromBundleFull(opts.clientPrefs);
  dispatchConfigRestoredEvents();
  notifyDatasourceChanged("all", "config-restore");
  return applied;
}

/** 从导出响应头拼装内容清单文案。 */
export function formatBackupCountSummary(headers: Headers): string {
  const n = (key: string) => {
    const v = headers.get(key);
    const num = v != null ? Number(v) : NaN;
    return Number.isFinite(num) ? num : 0;
  };
  const parts: string[] = [];
  const db = n("X-Backup-Db-Count");
  const opc = n("X-Backup-Opcua-Count");
  const tpl = n("X-Backup-Templates");
  const lay = n("X-Backup-Layouts");
  const sig = n("X-Backup-Signatures");
  const fav = n("X-Backup-Query-Favorites");
  const hasAi = headers.get("X-Backup-Has-Ai") === "1";
  if (db) parts.push(`数据库 ${db} 条`);
  if (opc) parts.push(`OPC UA ${opc} 条`);
  if (tpl) parts.push(`模版 ${tpl} 份`);
  if (lay) parts.push(`版式 ${lay} 套`);
  if (sig) parts.push(`签名 ${sig} 个`);
  if (fav) parts.push(`查询收藏 ${fav} 条`);
  if (hasAi) parts.push("AI 设置");
  return parts.length ? parts.join("、") : "完整软件状态";
}

/** 从导入 imported 统计拼装恢复清单。 */
export function formatImportStatsSummary(imp: ImportStats | null | undefined): string[] {
  const parts: string[] = [];
  if (!imp) return parts;
  if (imp.db_connections) parts.push(`数据库 ${imp.db_connections} 条`);
  if (imp.opcua_servers) parts.push(`OPC UA ${imp.opcua_servers} 条`);
  if (imp.templates) parts.push(`模版 ${imp.templates} 份`);
  if (imp.layout_presets) parts.push(`版式 ${imp.layout_presets} 套`);
  if (imp.signature_assets) parts.push(`签名 ${imp.signature_assets} 个`);
  if (imp.audit_entries) parts.push(`审计 ${imp.audit_entries} 条`);
  if (imp.query_session_favorites || imp.query_session_history) {
    const fav = imp.query_session_favorites || 0;
    const hist = imp.query_session_history || 0;
    parts.push(`查询会话（收藏 ${fav} / 历史 ${hist}）`);
  }
  if (imp.has_ai_settings) parts.push("AI 设置");
  return parts;
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
