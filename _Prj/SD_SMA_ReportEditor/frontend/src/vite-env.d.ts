/// <reference types="vite/client" />

interface Window {
  /** Electron preload 注入，仅在桌面壳中可用 */
  electronAPI?: {
    setDevtoolsOpen: (open: boolean) => Promise<void>;
    showSavePdfDialog: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
    pickExportDirectory: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
    runPdfExport: (opts: {
      templateId: string;
      filePath: string;
      openAfter?: boolean;
    }) => Promise<{ ok: boolean; filePath: string }>;
    shellOpenPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
    pathJoin: (...parts: string[]) => Promise<string>;
    notifyPdfExportReady: (payload: { ok: boolean; error?: string }) => void;
  };
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
