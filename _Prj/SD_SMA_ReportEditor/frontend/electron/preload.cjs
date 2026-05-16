const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** 打开/关闭 Chromium DevTools（主进程侧停靠，默认右侧） */
  setDevtoolsOpen: (open) => ipcRenderer.invoke('devtools-set-open', Boolean(open)),
})
