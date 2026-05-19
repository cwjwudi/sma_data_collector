const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** 打开/关闭 Chromium DevTools（主进程侧停靠，默认右侧） */
  setDevtoolsOpen: (open) => ipcRenderer.invoke('devtools-set-open', Boolean(open)),

  /** 保存 PDF 对话框，返回绝对路径或 null */
  showSavePdfDialog: (opts) => ipcRenderer.invoke('dialog-save-pdf', opts || {}),

  /** 选择导出目录（自动导出用） */
  pickExportDirectory: (opts) => ipcRenderer.invoke('dialog-pick-directory', opts || {}),

  /** 使用隐藏窗口渲染 "#/pdf-export" 并写入 PDF */
  runPdfExport: (opts) => ipcRenderer.invoke('pdf-export-run', opts),

  /** 使用系统默认应用打开路径（PDF 文件等） */
  shellOpenPath: (filePath) => ipcRenderer.invoke('shell-open-path', filePath),

  /** 路径拼接（跟随 OS） */
  pathJoin: (...parts) => ipcRenderer.invoke('path-join', parts),

  /** 仅 PDF 导出隐藏窗口：渲染完成后通知主进程 */
  notifyPdfExportReady: (payload) => ipcRenderer.send('pdf-export-ready', payload),
})
