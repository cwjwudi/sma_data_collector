/// <reference types="vite/client" />

interface Window {
  /** Electron preload 注入，仅在桌面壳中可用 */
  electronAPI?: {
    setDevtoolsOpen: (open: boolean) => Promise<void>;
  };
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
