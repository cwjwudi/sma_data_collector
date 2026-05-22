const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** 打开/关闭 Chromium DevTools（主进程侧停靠，默认右侧） */
  setDevtoolsOpen: (open) => ipcRenderer.invoke('devtools-set-open', Boolean(open)),

  /** 保存 PDF 对话框，返回绝对路径或 null */
  showSavePdfDialog: (opts) => ipcRenderer.invoke('dialog-save-pdf', opts || {}),

  /** 选择导出目录（自动导出用） */
  pickExportDirectory: (opts) => ipcRenderer.invoke('dialog-pick-directory', opts || {}),

  /** 选择配置备份 JSON（桌面版推荐，避免内嵌 file input 白屏） */
  pickConfigJsonFile: (opts) => ipcRenderer.invoke('dialog-pick-config-json', opts || {}),

  /** 保存文本日志（history logger 等） */
  saveTextFileDialog: (opts) => ipcRenderer.invoke('dialog-save-text', opts || {}),

  /** 使用隐藏窗口渲染 "#/pdf-export" 并写入 PDF */
  runPdfExport: (opts) => ipcRenderer.invoke('pdf-export-run', opts),

  /** 使用系统默认应用打开路径（PDF 文件等） */
  shellOpenPath: (filePath) => ipcRenderer.invoke('shell-open-path', filePath),

  /** 路径拼接（跟随 OS） */
  pathJoin: (...parts) => ipcRenderer.invoke('path-join', parts),

  /** 仅 PDF 导出隐藏窗口：渲染完成后通知主进程 */
  notifyPdfExportReady: (payload) => ipcRenderer.send('pdf-export-ready', payload),

  /** 扫描目录下 PDF（历史报表） */
  scanExportPdfs: (opts) => ipcRenderer.invoke('scan-export-pdfs', opts || {}),

  /** 删除磁盘上的导出文件 */
  deleteExportFile: (opts) => ipcRenderer.invoke('delete-export-file', opts || {}),

  /** 在系统文件管理器中显示文件 */
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

  /** 历史报表 PDF 缩略图（dataUrl 或 base64 供 pdf.js） */
  getExportPdfThumbnail: (opts) => ipcRenderer.invoke('get-export-pdf-thumbnail', opts || {}),

  /** 应用内检查更新 / 下载 / 安装（仅桌面正式包） */
  getAppUpdateConfig: () => ipcRenderer.invoke('app-update-get-config'),
  setAppUpdateConfig: (patch) => ipcRenderer.invoke('app-update-set-config', patch || {}),
  checkAppUpdate: () => ipcRenderer.invoke('app-update-check'),
  downloadAppUpdate: () => ipcRenderer.invoke('app-update-download'),
  installAppUpdate: () => ipcRenderer.invoke('app-update-install'),
  onAppUpdateDownloadProgress: (listener) => {
    const fn = (_event, payload) => listener(payload)
    ipcRenderer.on('update-download-progress', fn)
    return () => ipcRenderer.removeListener('update-download-progress', fn)
  },

  /** 模版与版式云端同步（Portal 登录 + 上传/下载） */
  getLayoutSyncConfig: () => ipcRenderer.invoke('layout-sync-get-config'),
  setLayoutSyncConfig: (patch) => ipcRenderer.invoke('layout-sync-set-config', patch || {}),
  layoutSyncLogin: (creds) => ipcRenderer.invoke('layout-sync-login', creds || {}),
  layoutSyncRegister: (creds) => ipcRenderer.invoke('layout-sync-register', creds || {}),
  layoutSyncDownloadDefaults: () => ipcRenderer.invoke('layout-sync-download-defaults'),
  layoutSyncDownloadMine: () => ipcRenderer.invoke('layout-sync-download-mine'),
  layoutSyncUpload: (payload) => ipcRenderer.invoke('layout-sync-upload', payload || {}),
})
