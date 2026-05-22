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
      | { ok: true; filePath: string; fileName: string; content: string }
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
    }) => Promise<{ ok: boolean; filePath: string }>;
    shellOpenPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
    pathJoin: (...parts: string[]) => Promise<string>;
    notifyPdfExportReady: (payload: { ok: boolean; error?: string }) => void;
    scanExportPdfs: (opts: { dir: string }) => Promise<{
      ok: boolean;
      error?: string;
      dir?: string;
      files?: {
        name: string;
        filePath: string;
        fileUrl?: string;
        sizeBytes: number;
        modifiedAt: string;
      }[];
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
      baseUrl: string;
      defaultBaseUrl: string;
      skipTlsVerify: boolean;
      packaged: boolean;
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
      downloadPercent: number | null
      downloadedReady: boolean
      latestVersion: string | null
    }>
    setAppUpdateConfig: (patch: { baseUrl?: string; skipTlsVerify?: boolean }) => Promise<{
      currentVersion: string;
      platform: string;
      baseUrl: string;
      defaultBaseUrl: string;
      skipTlsVerify: boolean;
      packaged: boolean;
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
    downloadAppUpdate: () => Promise<{
      ok: boolean
      error?: string
      cancelled?: boolean
      path?: string
      latestVersion?: string
      status?: string
    }>
    cancelAppUpdateDownload: () => Promise<{ ok: boolean; cancelled?: boolean }>
    installAppUpdate: () => Promise<{ ok: boolean; error?: string; message?: string; mode?: string }>
    onAppUpdateDownloadProgress: (
      listener: (payload: {
        phase?: string
        received?: number
        total?: number
        percent?: number | null
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
  };
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
