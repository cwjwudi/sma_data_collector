/**
 * 039：导出全屏遮罩页 preload。极简桥——只暴露进度订阅与关闭，
 * 遮罩页本身是内联静态 HTML（不加载 SPA），保证在同机让核时也能秒开画出。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('exportOverlay', {
  /** 主进程推送导出进度：{ phase, partIndex, totalReports, templateName } */
  onProgress: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const handler = (_e, payload) => {
      try {
        cb(payload || {})
      } catch {
        /* ignore */
      }
    }
    ipcRenderer.on('export-overlay-progress', handler)
    return () => ipcRenderer.removeListener('export-overlay-progress', handler)
  },
  /** 操作员强制隐藏（Esc / 角落按钮）——保证任何时候能看回 HMI */
  dismiss: () => ipcRenderer.send('export-overlay-dismiss'),
})
