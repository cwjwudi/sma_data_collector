/// <reference types="vite/client" />

interface Window {
  /** Electron preload 注入，仅在桌面壳中可用 */
  electronAPI?: {
    setDevtoolsOpen: (open: boolean) => Promise<void>;
    showSavePdfDialog: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
    pickExportDirectory: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
    pickConfigJsonFile: (opts?: { title?: string; defaultPath?: string }) => Promise<
      | { canceled: true }
      | { ok: false; error?: string }
      | { ok: true; filePath: string; fileName: string; encrypted?: false; content: string }
      | { ok: true; filePath: string; fileName: string; encrypted: true; contentBase64: string }
      | null
    >;
    saveTextFileDialog: (opts?: {
      title?: string;
      defaultPath?: string;
      content: string;
    }) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }>;
    runPdfExport: (opts: {
      templateId: string;
      filePath: string;
      openAfter?: boolean;
      /** 取消用；缺省时主进程生成 */
      jobId?: string;
      /** pdf-lib=同机优先；chromium=版式优先 */
      engine?: "pdf-lib" | "chromium";
    }) => Promise<{
      ok: boolean;
      filePath: string;
      filePaths?: string[];
      totalReports?: number;
      stats?: { opcReads: number; sqlQueries: number; sqlRows: number };
      durationMs?: number;
      engine?: string;
      exportMode?: string;
      engineMeta?: Record<string, unknown>;
      /** 分阶段耗时（多份报表求和）：warmStart 表示复用了预热窗口 */
      timings?: {
        warmStart?: boolean;
        readyMs?: number;
        dataMs?: number;
        printMs?: number;
        writeMs?: number;
      };
    }>;
    cancelPdfExport: (opts: { jobId: string }) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
    setPdfExportMaxParallel: (
      max: number,
    ) => Promise<{ max: number; cpuBudget?: number; logicalCores?: number }>;
    shellOpenPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
    pathJoin: (...parts: string[]) => Promise<string>;
    getBundledCjkFont?: (opts?: {
      family?: string;
      key?: "noto-sans-sc" | "fangsong";
      id?: "noto-sans-sc" | "fangsong";
    }) => Promise<
      | {
          ok: true;
          base64: string;
          key?: string;
          family?: string;
          path?: string;
          bytes?: number;
        }
      | { ok: false; error?: string; key?: string }
    >;
    notifyPdfExportReady: (payload: {
      ok: boolean;
      error?: string;
      totalReports?: number;
      stats?: { opcReads: number; sqlQueries: number; sqlRows: number; mongoQueries?: number };
      phases?: { tplMs: number; dataMs: number; paintMs: number };
      diagnostics?: unknown;
      pdfBase64?: string;
      engine?: string;
      exportMode?: string;
      layoutFidelity?: string;
      fontFamily?: string;
      fontEmbedded?: boolean;
      pageCount?: number;
      pdfLibMs?: number;
      printToPDFSkipped?: boolean;
    }) => void;
    notifyPdfExportHeartbeat?: () => void;
    onPdfExportProgress: (
      listener: (payload: {
        phase?: string;
        partIndex?: number;
        totalReports?: number;
        templateId?: string;
        jobId?: string;
      }) => void,
    ) => () => void;
    scanExportPdfs: (opts: { dir: string; limit?: number }) => Promise<{
      ok: boolean;
      error?: string;
      dir?: string;
      total?: number;
      truncated?: boolean;
      files?: {
        name: string;
        filePath: string;
        fileUrl?: string;
        sizeBytes: number;
        modifiedAt: string;
      }[];
    }>;
    scanExportEntries: (opts: {
      rootDir: string;
      cwd?: string;
      offset?: number;
      limit?: number;
      sort?: "mtime_desc" | "name_asc";
      kinds?: "all" | "pdf_only";
    }) => Promise<{
      ok: boolean;
      error?: string;
      rootDir?: string;
      cwd?: string;
      relSegments?: string[];
      total?: number;
      offset?: number;
      limit?: number;
      hasMore?: boolean;
      entries?: Array<
        | { kind: "dir"; name: string; path: string; modifiedAt?: string }
        | {
            kind: "pdf";
            name: string;
            filePath: string;
            fileUrl?: string;
            sizeBytes: number;
            modifiedAt: string;
          }
      >;
    }>;
    historyTransfer: (opts: {
      sources: string[];
      destDir: string;
      sourceRoot: string;
      destRoot: string;
      mode: "copy" | "move";
      conflict?: "skip" | "overwrite" | "rename";
      dryRun?: boolean;
    }) => Promise<{
      ok: boolean;
      error?: string;
      dryRun?: boolean;
      mode?: "copy" | "move";
      needsConflictDecision?: boolean;
      conflicts?: Array<{ source: string; dest: string; name: string }>;
      copied?: number;
      moved?: number;
      skipped?: number;
      failed?: number;
      results?: Array<{ source: string; dest?: string; status: string; error?: string }>;
    }>;
    listRemovableVolumes: (opts?: { resetBaseline?: boolean }) => Promise<{
      ok: boolean;
      error?: string;
      volumes: Array<{ path: string; label: string; platform: string; kind?: string }>;
    }>;
    deleteExportFile: (opts: { filePath: string }) => Promise<{ ok: boolean; error?: string }>;
    showItemInFolder: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
    getExportPdfThumbnail: (opts: { filePath: string }) => Promise<{
      ok: boolean;
      error?: string;
      dataUrl?: string;
      base64?: string;
    }>;
    getAppUpdateConfig: () => Promise<{
      currentVersion: string;
      platform: string;
      updateMode?: string;
      baseUrl: string;
      defaultBaseUrl: string;
      skipTlsVerify: boolean;
      macOpenAfterUpgrade?: boolean;
      skippedVersions?: Record<string, boolean>;
      packaged: boolean;
      lastCheckAt?: string | null;
      lastCheckStatus?: string | null;
    }>;
    getAppUpdateState: () => Promise<{
      lastCheck: {
        ok?: boolean
        status?: string
        currentVersion?: string
        latestVersion?: string
        message?: string
        notes?: string
        releasedAt?: string | null
      } | null
      downloading: boolean
      downloadPaused: boolean
      downloadPercent: number | null
      downloadedReady: boolean
      latestVersion: string | null
    }>
    setAppUpdateConfig: (patch: {
      baseUrl?: string;
      skipTlsVerify?: boolean;
      macOpenAfterUpgrade?: boolean;
    }) => Promise<{
      currentVersion: string;
      platform: string;
      updateMode?: string;
      baseUrl: string;
      defaultBaseUrl: string;
      skipTlsVerify: boolean;
      macOpenAfterUpgrade?: boolean;
      skippedVersions?: Record<string, boolean>;
      packaged: boolean;
      lastCheckAt?: string | null;
      lastCheckStatus?: string | null;
    }>;
    checkAppUpdate: (options?: { silent?: boolean }) => Promise<{
      ok?: boolean;
      status?: string;
      currentVersion?: string;
      latestVersion?: string;
      message?: string;
      notes?: string;
      releasedAt?: string | null;
      downloadUrl?: string;
      size?: number | null;
      manifestUrl?: string;
    }>;
    downloadAppUpdate: (options?: { fullDownload?: boolean }) => Promise<{
      ok: boolean
      error?: string
      cancelled?: boolean
      paused?: boolean
      mode?: string
      path?: string
      latestVersion?: string
      status?: string
    }>
    cancelAppUpdateDownload: () => Promise<{ ok: boolean; cancelled?: boolean; paused?: boolean }>
    installAppUpdate: (options?: { openAfterUpgrade?: boolean }) => Promise<{
      ok: boolean;
      error?: string;
      message?: string;
      mode?: string;
    }>;
    skipAppUpdateVersion: () => Promise<{ ok: boolean; error?: string; version?: string }>;
    clearAppUpdateSkippedVersions: () => Promise<{ ok: boolean; error?: string }>;
    openMacApplication: () => Promise<{ ok: boolean; error?: string }>;
    downloadAppInstaller: () => Promise<{
      ok: boolean;
      error?: string;
      cancelled?: boolean;
      checksumError?: boolean;
      status?: string;
      path?: string;
      version?: string;
      fileName?: string;
    }>;
    cancelAppInstallerDownload: () => Promise<{ ok: boolean; cancelled?: boolean }>;
    onAppInstallerDownloadProgress: (
      listener: (payload: {
        phase?: string;
        received?: number;
        total?: number;
        percent?: number | null;
      }) => void,
    ) => () => void;
    getDataSourceStartupSnapshot: () => Promise<{
      ok: boolean;
      connections?: Record<string, unknown>[];
      opcua_servers?: Record<string, unknown>[];
      app_preferences?: Record<string, unknown>;
      source?: string;
      message?: string;
    }>;
    getServiceEndpoints: () => Promise<{
      backendHost: string;
      backendPort: number;
      backendLoopbackUrl: string;
      backendLanUrl: string | null;
      rendererMode: 'dev' | 'packaged';
      rendererUrl: string;
      rendererLanUrl: string | null;
      lanIps: { address: string; iface: string }[];
      appVersion: string;
    }>;
    onAppUpdateDownloadProgress: (
      listener: (payload: {
        phase?: string
        received?: number
        total?: number
        percent?: number | null
        mode?: string
      }) => void,
    ) => () => void
    onAppUpdateCheckResult: (
      listener: (payload: {
        ok?: boolean
        status?: string
        currentVersion?: string
        latestVersion?: string
        message?: string
        notes?: string
        releasedAt?: string | null
      }) => void,
    ) => () => void
    getLayoutSyncConfig: () => Promise<{
      portalBaseUrl: string;
      defaultPortalBaseUrl: string;
      username: string;
      loggedIn: boolean;
      skipTlsVerify: boolean;
    }>;
    setLayoutSyncConfig: (patch: {
      portalBaseUrl?: string;
      skipTlsVerify?: boolean;
      logout?: boolean;
    }) => Promise<{
      portalBaseUrl: string;
      defaultPortalBaseUrl: string;
      username: string;
      loggedIn: boolean;
      skipTlsVerify: boolean;
    }>;
    layoutSyncLogin: (creds: { username?: string; password?: string }) => Promise<{
      ok: boolean;
      username?: string;
      expiresAt?: string | null;
    }>;
    layoutSyncRegister: (creds: {
      username?: string;
      password?: string;
      passwordConfirm?: string;
    }) => Promise<{ ok: boolean; username?: string; expiresAt?: string | null }>;
    layoutSyncDownloadDefaults: () => Promise<{
      ok: boolean;
      error?: string;
      layout_presets?: unknown[];
      templates?: unknown[];
      layoutUpdatedAt?: string | null;
      templateUpdatedAt?: string | null;
      source?: string;
    }>;
    layoutSyncDownloadMine: () => Promise<{
      ok: boolean;
      error?: string;
      layout_presets?: unknown[];
      templates?: unknown[];
      layoutUpdatedAt?: string | null;
      templateUpdatedAt?: string | null;
      source?: string;
    }>;
    layoutSyncUpload: (payload: {
      layoutPresets?: unknown[];
      templates?: unknown[];
    }) => Promise<{
      ok: boolean;
      error?: string;
      layoutCount?: number;
      templateCount?: number;
      count?: number;
      layoutUpdatedAt?: string | null;
      templateUpdatedAt?: string | null;
    }>;
    layoutSyncUploadConfig?: (payload: { bundleBase64: string }) => Promise<{
      ok: boolean;
      error?: string;
      updatedAt?: string | null;
      sizeBytes?: number | null;
    }>;
    layoutSyncDownloadConfig?: () => Promise<{
      ok: boolean;
      error?: string;
      bundleBase64?: string;
      updatedAt?: string | null;
    }>;
    getLaunchSettings?: () => Promise<{
      openAtLogin: boolean;
      silentStart: boolean;
      packaged?: boolean;
      silentStartSession?: boolean;
    }>;
    setLaunchSettings?: (patch: {
      openAtLogin?: boolean;
      silentStart?: boolean;
    }) => Promise<{
      openAtLogin: boolean;
      silentStart: boolean;
      packaged?: boolean;
      silentStartSession?: boolean;
    }>;
  };
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
