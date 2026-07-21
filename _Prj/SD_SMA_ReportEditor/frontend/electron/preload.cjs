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

  /** 取消进行中的 PDF 导出（032 P1-D；需与 runPdfExport 的 jobId 对应） */
  cancelPdfExport: (opts) => ipcRenderer.invoke('pdf-export-cancel', opts || {}),

  /** 设置 PDF 导出最大并行数（主进程限制为 1..16） */
  setPdfExportMaxParallel: (max) => ipcRenderer.invoke('pdf-export-set-max-parallel', { max }),

  /** 使用系统默认应用打开路径（PDF 文件等） */
  shellOpenPath: (filePath) => ipcRenderer.invoke('shell-open-path', filePath),

  /** 路径拼接（跟随 OS） */
  pathJoin: (...parts) => ipcRenderer.invoke('path-join', parts),

  /** 随包 CJK 字体（pdf-lib embed；缺文件则 ok:false） */
  getBundledCjkFont: () => ipcRenderer.invoke('bundled-cjk-font'),

  /** 启动阶段直读本机配置，避免等待 FastAPI 才能显示已保存连接 */
  getDataSourceStartupSnapshot: () => ipcRenderer.invoke('datasource-startup-snapshot'),

  /** 后端/前端服务地址（含局域网 IP，供设置页展示与复制） */
  getServiceEndpoints: () => ipcRenderer.invoke('app-get-service-endpoints'),

  /** 仅 PDF 导出隐藏窗口：渲染完成后通知主进程（JSON 兜底剥掉 Vue 代理等不可克隆对象） */
  notifyPdfExportReady: (payload) => {
    let clean = { ok: false }
    try {
      clean = JSON.parse(JSON.stringify(payload || {}))
    } catch {
      clean = { ok: Boolean(payload && payload.ok), error: '完成信号序列化失败' }
    }
    ipcRenderer.send('pdf-export-ready', clean)
  },

  /** 仅 PDF 导出隐藏窗口：取数期间心跳，避免大模版慢取数被 2 分钟硬超时误杀 */
  notifyPdfExportHeartbeat: () => ipcRenderer.send('pdf-export-heartbeat'),

  /** 订阅 PDF 导出阶段进度（结批弹窗显示「第 X/Y 份」等），返回取消订阅函数 */
  onPdfExportProgress: (listener) => {
    const fn = (_event, payload) => listener(payload)
    ipcRenderer.on('pdf-export-progress', fn)
    return () => ipcRenderer.removeListener('pdf-export-progress', fn)
  },

  /** 扫描目录下 PDF（历史报表兼容；仅本层 PDF） */
  scanExportPdfs: (opts) => ipcRenderer.invoke('scan-export-pdfs', opts || {}),

  /** 单层文件夹 + PDF 分页浏览（010） */
  scanExportEntries: (opts) => ipcRenderer.invoke('scan-export-entries', opts || {}),

  /** 历史报表分屏：左⇄右 复制 / 移动（022） */
  historyTransfer: (opts) => ipcRenderer.invoke('history-transfer', opts || {}),

  /** 可移动存储卷枚举（022/025）；opts.resetBaseline 在开启分屏时重置 Win 盘符基线 */
  listRemovableVolumes: (opts) => ipcRenderer.invoke('list-removable-volumes', opts || {}),

  /** 删除磁盘上的导出文件 */
  deleteExportFile: (opts) => ipcRenderer.invoke('delete-export-file', opts || {}),

  /** 在系统文件管理器中显示文件 */
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

  /** 历史报表 PDF 缩略图（dataUrl 或 base64 供 pdf.js） */
  getExportPdfThumbnail: (opts) => ipcRenderer.invoke('get-export-pdf-thumbnail', opts || {}),

  /** 应用内检查更新 / 下载 / 安装（仅桌面正式包） */
  getAppUpdateConfig: () => ipcRenderer.invoke('app-update-get-config'),
  getAppUpdateState: () => ipcRenderer.invoke('app-update-get-state'),
  setAppUpdateConfig: (patch) => ipcRenderer.invoke('app-update-set-config', patch || {}),
  checkAppUpdate: (options) => ipcRenderer.invoke('app-update-check', options || {}),
  downloadAppUpdate: (options) => ipcRenderer.invoke('app-update-download', options || {}),
  cancelAppUpdateDownload: () => ipcRenderer.invoke('app-update-cancel-download'),
  installAppUpdate: (options) => ipcRenderer.invoke('app-update-install', options || {}),
  skipAppUpdateVersion: () => ipcRenderer.invoke('app-update-skip-version'),
  clearAppUpdateSkippedVersions: () => ipcRenderer.invoke('app-update-clear-skipped'),
  openMacApplication: () => ipcRenderer.invoke('app-update-open-mac-app'),
  /** 下载当前平台完整安装包到「下载」文件夹（用于重装，不自动安装） */
  downloadAppInstaller: () => ipcRenderer.invoke('app-update-download-installer'),
  cancelAppInstallerDownload: () => ipcRenderer.invoke('app-update-cancel-installer-download'),
  onAppInstallerDownloadProgress: (listener) => {
    const fn = (_event, payload) => listener(payload)
    ipcRenderer.on('installer-download-progress', fn)
    return () => ipcRenderer.removeListener('installer-download-progress', fn)
  },
  onAppUpdateDownloadProgress: (listener) => {
    const fn = (_event, payload) => listener(payload)
    ipcRenderer.on('update-download-progress', fn)
    return () => ipcRenderer.removeListener('update-download-progress', fn)
  },
  onAppUpdateCheckResult: (listener) => {
    const fn = (_event, payload) => listener(payload)
    ipcRenderer.on('update-check-result', fn)
    return () => ipcRenderer.removeListener('update-check-result', fn)
  },

  /** 模版与版式云端同步（Portal 登录 + 上传/下载） */
  getLayoutSyncConfig: () => ipcRenderer.invoke('layout-sync-get-config'),
  setLayoutSyncConfig: (patch) => ipcRenderer.invoke('layout-sync-set-config', patch || {}),
  layoutSyncLogin: (creds) => ipcRenderer.invoke('layout-sync-login', creds || {}),
  layoutSyncRegister: (creds) => ipcRenderer.invoke('layout-sync-register', creds || {}),
  layoutSyncDownloadDefaults: () => ipcRenderer.invoke('layout-sync-download-defaults'),
  layoutSyncDownloadMine: () => ipcRenderer.invoke('layout-sync-download-mine'),
  layoutSyncUpload: (payload) => ipcRenderer.invoke('layout-sync-upload', payload || {}),
  /** 整机配置云备份（加密 .rebak 的 base64） */
  layoutSyncUploadConfig: (payload) => ipcRenderer.invoke('layout-sync-upload-config', payload || {}),
  layoutSyncDownloadConfig: () => ipcRenderer.invoke('layout-sync-download-config'),

  /** 开机自启 / 静默启动偏好（仅桌面版） */
  getLaunchSettings: () => ipcRenderer.invoke('launch-settings-get'),
  setLaunchSettings: (patch) => ipcRenderer.invoke('launch-settings-set', patch || {}),
})
