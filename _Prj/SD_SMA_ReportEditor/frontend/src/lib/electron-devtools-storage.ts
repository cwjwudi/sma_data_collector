/** 与 useStorage 共用：控制 Electron 内嵌 Chromium DevTools 是否打开（右侧停靠） */
export const ELECTRON_DEVTOOLS_STORAGE_KEY = "sd-sma-report-editor:electron-devtools-open";

export function applyStoredElectronDevtoolsPref(): void {
  if (typeof window === "undefined") return;
  const api = window.electronAPI;
  if (!api?.setDevtoolsOpen) return;
  try {
    const raw = localStorage.getItem(ELECTRON_DEVTOOLS_STORAGE_KEY);
    const open = raw === null ? true : JSON.parse(raw) === true;
    void api.setDevtoolsOpen(open);
  } catch {
    void api.setDevtoolsOpen(true);
  }
}

export function syncDevtoolsOpenToMain(open: boolean): void {
  window.electronAPI?.setDevtoolsOpen?.(open);
}
