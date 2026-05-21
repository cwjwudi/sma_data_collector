/** 导出 PDF 监视目录（历史报表页扫描 + 生成报表自动导出共用） */

export interface ReportExportPrefs {
  /** 监视/默认导出文件夹（Electron 下为绝对路径） */
  watchDir: string | null;
}

const LS_KEY = "reportExportPrefsV1";
/** 与「生成报表」页旧键同步 */
const LEGACY_GENERATOR_KEY = "reportGeneratorPrefsV1";

export const defaultReportExportPrefs = (): ReportExportPrefs => ({
  watchDir: null,
});

function migrateFromLegacyGenerator(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_GENERATOR_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { autoExportDir?: string };
    if (typeof o.autoExportDir === "string" && o.autoExportDir.trim()) {
      return o.autoExportDir.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 写回旧键，避免仅改历史页时自动导出目录不同步 */
function syncLegacyGeneratorWatchDir(dir: string | null): void {
  try {
    const raw = localStorage.getItem(LEGACY_GENERATOR_KEY);
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    o.autoExportDir = dir;
    localStorage.setItem(LEGACY_GENERATOR_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

export function loadReportExportPrefs(): ReportExportPrefs {
  const base = defaultReportExportPrefs();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<ReportExportPrefs>;
      const watchDir = typeof o.watchDir === "string" && o.watchDir.trim() ? o.watchDir.trim() : null;
      if (watchDir) return { watchDir };
    }
  } catch {
    /* ignore */
  }
  const legacy = migrateFromLegacyGenerator();
  if (legacy) {
    const p = { watchDir: legacy };
    saveReportExportPrefs(p);
    return p;
  }
  return base;
}

export function saveReportExportPrefs(p: ReportExportPrefs): void {
  const watchDir = p.watchDir?.trim() || null;
  const normalized = { watchDir };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(normalized));
    syncLegacyGeneratorWatchDir(watchDir);
  } catch {
    /* ignore */
  }
}

/** 设置默认 PDF 导出/监视目录，并同步「生成报表」页保底路径 */
export function setDefaultReportExportDir(dir: string | null): void {
  const watchDir = dir?.trim() || null;
  saveReportExportPrefs({ watchDir });
  try {
    const raw = localStorage.getItem(LEGACY_GENERATOR_KEY);
    if (!raw) return;
    const o = JSON.parse(raw) as Record<string, unknown>;
    o.autoExportDir = watchDir;
    if (watchDir && o.autoExportDirSource !== "opcua") {
      o.autoExportDirSource = "default";
    }
    localStorage.setItem(LEGACY_GENERATOR_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}
