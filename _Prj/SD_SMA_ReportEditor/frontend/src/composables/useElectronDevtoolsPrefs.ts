import { useStorage } from "@vueuse/core";
import { watch } from "vue";
import {
  ELECTRON_DEVTOOLS_STORAGE_KEY,
  syncDevtoolsOpenToMain,
} from "@/lib/electron-devtools-storage";

/** Electron 桌面壳：是否显示右侧 DevTools（与设置页开关同步） */
export function useElectronDevtoolsPrefs() {
  const devtoolsOpen = useStorage(ELECTRON_DEVTOOLS_STORAGE_KEY, true);
  watch(
    devtoolsOpen,
    (v) => {
      syncDevtoolsOpenToMain(!!v);
    },
    { flush: "sync" },
  );
  return { devtoolsOpen };
}
