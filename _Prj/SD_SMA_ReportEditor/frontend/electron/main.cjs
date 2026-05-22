const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')
const { pathToFileURL } = require('url')
const { createAppUpdater } = require('./updater.cjs')
const { createLayoutSync } = require('./layout-sync.cjs')

let mainWindow
let pythonProcess
/** 若为 true：由本 Electron 拉起的后端，exit 时需 kill（避免误杀外部 uvicorn）。 */
let backendStartedByElectron = false

/** PDF 导出串行队列，避免并发隐藏窗口冲突 */
let pdfExportTail = Promise.resolve()

function enqueuePdfExport(fn) {
  const next = pdfExportTail.then(fn)
  pdfExportTail = next.catch(() => {})
  return next
}

const BACKEND_PORT = 8000
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`
const VITE_DEV_URL = 'http://localhost:5173'

function log(msg) {
  console.log(`[Electron] ${msg}`)
}

function getBackendDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'report_backend')
  }
  return path.join(__dirname, '..', '..', 'backend')
}

function getBundledBackendExe() {
  const name = process.platform === 'win32' ? 'report_backend.exe' : 'report_backend'
  return path.join(getBackendDir(), name)
}

/** 后端持久化目录：正式包写入用户目录；开发模式与仓库 backend/data 对齐，便于与命令行 uvicorn 共用 config.json。 */
function getReportEditorDataDir() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'backend-data')
  }
  return path.join(getBackendDir(), 'data')
}

function findPython() {
  const backendDir = getBackendDir()
  const candidates = [
    path.join(backendDir, 'venv', 'Scripts', 'python.exe'),
    path.join(backendDir, 'venv', 'bin', 'python3'),
    path.join(backendDir, 'venv', 'bin', 'python'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      log(`Using venv Python: ${p}`)
      return { cmd: p }
    }
  }
  const fallback = process.platform === 'win32' ? 'python' : 'python3'
  log(`Using system Python (${fallback})`)
  return { cmd: fallback }
}

function startPythonBackend() {
  const backendDir = getBackendDir()
  const dataDir = getReportEditorDataDir()
  fs.mkdirSync(dataDir, { recursive: true })
  log(`REPORT_EDITOR_DATA_DIR=${dataDir}`)

  const env = {
    ...process.env,
    REPORT_EDITOR_DATA_DIR: dataDir,
    REPORT_EDITOR_HTTP_PORT: String(BACKEND_PORT),
    // 避免 Windows 旧版 conhost 把 ANSI 当乱码；与 dev_uvicorn.ps1 行为一致
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    PYTHONUTF8: '1',
    PYTHONUNBUFFERED: '1',
  }

  const useBundledExe = app.isPackaged
  /** 开发模式继承终端 stdio，便于在 concurrently 里直接看到 uvicorn 报错（pipe 时常被淹没） */
  const stdioDev = useBundledExe ? 'pipe' : 'inherit'

  if (useBundledExe) {
    const exe = getBundledBackendExe()
    if (!fs.existsSync(exe)) {
      log(`ERROR: 未找到打包后端: ${exe}`)
      return
    }
    log(`Starting bundled backend: ${exe}`)
    pythonProcess = spawn(exe, [], {
      cwd: path.dirname(exe),
      env,
      stdio: 'pipe',
    })
  } else {
    const { cmd } = findPython()
    const pyArgs = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)]
    pythonProcess = spawn(cmd, pyArgs, {
      cwd: backendDir,
      env,
      stdio: stdioDev,
    })
  }

  if (pythonProcess.stdout) {
    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Python] ${data.toString().trim()}`)
    })
  }
  if (pythonProcess.stderr) {
    pythonProcess.stderr.on('data', (data) => {
      console.log(`[Python] ${data.toString().trim()}`)
    })
  }

  pythonProcess.on('error', (err) => {
    console.error(`[Python] Failed to start: ${err.message}`)
  })

  pythonProcess.on('close', (code) => {
    log(`Python backend exited with code ${code}`)
    pythonProcess = null
    backendStartedByElectron = false
  })
}

function checkBackendHealthOnce() {
  return new Promise((resolve) => {
    const req = http.get(`${BACKEND_URL}/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function waitForBackend(maxRetries = 60, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0

    function check() {
      const req = http.get(`${BACKEND_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          log('Backend is ready')
          resolve()
        } else {
          retry()
        }
      })

      req.on('error', () => retry())
      req.setTimeout(1000, () => {
        req.destroy()
        retry()
      })
    }

    function retry() {
      retries++
      if (retries >= maxRetries) {
        reject(new Error(`Backend did not start after ${maxRetries} retries`))
      } else {
        setTimeout(check, interval)
      }
    }

    check()
  })
}

function resolveAppIcon() {
  const base = path.join(__dirname, '..', 'build')
  const names =
    process.platform === 'win32'
      ? ['icon.ico', 'icon.png']
      : process.platform === 'darwin'
        ? ['icon.icns', 'icon.png']
        : ['icon.png']
  for (const name of names) {
    const p = path.join(base, name)
    if (!fs.existsSync(p)) continue
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
  }
  return null
}

function createWindow() {
  const appIcon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '报表编辑器',
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('devtools-set-open', (_event, open) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (open) {
    mainWindow.webContents.openDevTools({ mode: 'right' })
  } else {
    mainWindow.webContents.closeDevTools()
  }
})

function senderBrowserWindow(wc) {
  try {
    return BrowserWindow.fromWebContents(wc)
  } catch {
    return null
  }
}

ipcMain.handle('dialog-save-pdf', async (event, opts) => {
  const win = senderBrowserWindow(event.sender) || mainWindow
  const res = await dialog.showSaveDialog(win && !win.isDestroyed() ? win : undefined, {
    title: (opts && opts.title) || '导出 PDF',
    defaultPath: (opts && opts.defaultPath) || '报表.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (res.canceled || !res.filePath) return null
  let fp = res.filePath
  if (!fp.toLowerCase().endsWith('.pdf')) fp += '.pdf'
  return fp
})

ipcMain.handle('dialog-save-text', async (event, opts) => {
  const win = senderBrowserWindow(event.sender) || mainWindow
  const content = opts && typeof opts.content === 'string' ? opts.content : ''
  const defaultPath = (opts && opts.defaultPath) || 'history.log'
  const res = await dialog.showSaveDialog(win && !win.isDestroyed() ? win : undefined, {
    title: (opts && opts.title) || '保存日志',
    defaultPath,
    filters: [
      { name: 'History Logger', extensions: ['log', 'txt'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'All', extensions: ['*'] },
    ],
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    fs.writeFileSync(res.filePath, content, 'utf8')
    return { ok: true, filePath: res.filePath }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

ipcMain.handle('dialog-pick-directory', async (event, opts) => {
  const win = senderBrowserWindow(event.sender) || mainWindow
  const res = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
    title: (opts && opts.title) || '选择导出文件夹',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: opts && opts.defaultPath,
  })
  if (res.canceled || !res.filePaths || !res.filePaths.length) return null
  return res.filePaths[0]
})

/** 选择配置备份 JSON（主进程读文件，避免 Electron 内嵌 <input type=file> 偶发白屏） */
const MAX_CONFIG_JSON_BYTES = 64 * 1024 * 1024

ipcMain.handle('dialog-pick-config-json', async (event, opts) => {
  const win = senderBrowserWindow(event.sender) || mainWindow
  const res = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
    title: (opts && opts.title) || '选择备份文件',
    properties: ['openFile'],
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
    defaultPath: opts && opts.defaultPath,
  })
  if (res.canceled || !res.filePaths || !res.filePaths.length) {
    return { canceled: true }
  }
  const filePath = res.filePaths[0]
  try {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_CONFIG_JSON_BYTES) {
      return { ok: false, error: `备份文件过大（超过 ${Math.round(MAX_CONFIG_JSON_BYTES / 1024 / 1024)} MB）` }
    }
    const content = fs.readFileSync(filePath, 'utf8')
    return {
      ok: true,
      filePath,
      fileName: path.basename(filePath),
      content,
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

ipcMain.handle('shell-open-path', async (_event, fp) => {
  if (!fp || typeof fp !== 'string') return { ok: false, error: '无效路径' }
  const err = await shell.openPath(fp)
  return err ? { ok: false, error: err } : { ok: true }
})

ipcMain.handle('path-join', (_event, parts) => {
  if (!Array.isArray(parts)) return ''
  return path.join(...parts.map(String))
})

ipcMain.handle('scan-export-pdfs', async (_event, opts) => {
  const dir = opts && opts.dir
  if (!dir || typeof dir !== 'string') {
    return { ok: false, error: '缺少目录路径', files: [] }
  }
  let resolved
  try {
    resolved = path.resolve(dir.trim())
  } catch (e) {
    return { ok: false, error: String(e.message || e), files: [] }
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: '目录不存在', files: [], dir: resolved }
  }
  let st
  try {
    st = fs.statSync(resolved)
  } catch (e) {
    return { ok: false, error: String(e.message || e), files: [] }
  }
  if (!st.isDirectory()) {
    return { ok: false, error: '路径不是文件夹', files: [], dir: resolved }
  }

  const files = []
  let entries
  try {
    entries = fs.readdirSync(resolved, { withFileTypes: true })
  } catch (e) {
    return { ok: false, error: `无法读取目录：${e.message || e}`, files: [], dir: resolved }
  }

  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (!ent.name.toLowerCase().endsWith('.pdf')) continue
    const filePath = path.join(resolved, ent.name)
    try {
      const fst = fs.statSync(filePath)
      files.push({
        name: ent.name,
        filePath,
        fileUrl: pathToFileURL(filePath).href,
        sizeBytes: fst.size,
        modifiedAt: fst.mtime.toISOString(),
      })
    } catch {
      /* skip unreadable */
    }
  }

  files.sort((a, b) => {
    const ta = new Date(a.modifiedAt).getTime()
    const tb = new Date(b.modifiedAt).getTime()
    return tb - ta
  })

  return { ok: true, files, dir: resolved }
})

ipcMain.handle('delete-export-file', async (_event, opts) => {
  const filePath = opts && opts.filePath
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: '无效路径' }
  }
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: '文件不存在' }
  }
  try {
    const st = fs.statSync(resolved)
    if (!st.isFile()) {
      return { ok: false, error: '不是文件' }
    }
    fs.unlinkSync(resolved)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: '无效路径' }
  }
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: '文件不存在' }
  }
  shell.showItemInFolder(resolved)
  return { ok: true }
})

/** 历史报表缩略图：优先系统缩略图，否则返回 base64 供渲染进程 pdf.js 绘制 */
ipcMain.handle('get-export-pdf-thumbnail', async (_event, opts) => {
  const filePath = opts && opts.filePath
  const maxBytes = 35 * 1024 * 1024
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: '缺少文件路径' }
  }
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: '文件不存在' }
  }
  let st
  try {
    st = fs.statSync(resolved)
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
  if (!st.isFile()) {
    return { ok: false, error: '不是文件' }
  }
  if (st.size > maxBytes) {
    return { ok: false, error: 'PDF 过大，无法生成缩略图' }
  }

  try {
    const thumb = await nativeImage.createThumbnailFromPath(resolved, { width: 400, height: 520 })
    if (thumb && !thumb.isEmpty()) {
      return { ok: true, dataUrl: thumb.toDataURL() }
    }
  } catch {
    /* 部分类型（如 PDF）可能无系统缩略图，走 pdf.js */
  }

  try {
    const buf = fs.readFileSync(resolved)
    return { ok: true, base64: buf.toString('base64') }
  } catch (e) {
    return { ok: false, error: `读取失败：${e.message || e}` }
  }
})

ipcMain.handle('pdf-export-run', async (event, opts) => {
  const filePath = opts && opts.filePath
  const templateId = opts && opts.templateId
  const openAfter = Boolean(opts && opts.openAfter)
  if (!filePath || typeof filePath !== 'string') throw new Error('缺少 filePath')
  if (!templateId || typeof templateId !== 'string') throw new Error('缺少 templateId')

  return enqueuePdfExport(async () => {
    let pdfWin = null
    try {
      const senderWin = senderBrowserWindow(event.sender)
      let loadUrl = ''

      if (senderWin && !senderWin.isDestroyed()) {
        const cur = senderWin.webContents.getURL()
        if (cur && /^https?:\/\//i.test(cur)) {
          try {
            const u = new URL(cur)
            u.hash = `#/pdf-export?templateId=${encodeURIComponent(templateId)}`
            loadUrl = u.href
          } catch {
            /* ignore */
          }
        }
      }

      if (!loadUrl) {
        const isDev = !app.isPackaged
        if (isDev) {
          loadUrl = `${VITE_DEV_URL}/#/pdf-export?templateId=${encodeURIComponent(templateId)}`
        } else {
          const idxHtml = path.join(__dirname, '..', 'dist', 'index.html')
          loadUrl = `${pathToFileURL(idxHtml).href}#/pdf-export?templateId=${encodeURIComponent(templateId)}`
        }
      }

      pdfWin = new BrowserWindow({
        show: false,
        width: 1280,
        height: 1680,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.cjs'),
        },
      })

      const readyPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ipcMain.removeListener('pdf-export-ready', onReady)
          reject(new Error('PDF 渲染超时'))
        }, 120000)

        function onReady(ev, payload) {
          if (!pdfWin || pdfWin.isDestroyed()) return
          if (senderBrowserWindow(ev.sender) !== pdfWin) return
          clearTimeout(timer)
          ipcMain.removeListener('pdf-export-ready', onReady)
          resolve(payload || {})
        }

        ipcMain.on('pdf-export-ready', onReady)
      })

      await pdfWin.loadURL(loadUrl)
      const payload = await readyPromise
      if (!payload || !payload.ok) {
        throw new Error((payload && payload.error) || 'PDF 渲染失败')
      }

      const wc = pdfWin.webContents
      /**
       * preferCSSPageSize + @page { size: … } 已表达纵向/横向。
       * 若再传 landscape:true，部分 Chromium 会与 CSS 页尺寸叠加持平原产生多余空白页。
       */
      const pdfBuffer = await wc.printToPDF({
        landscape: false,
        printBackground: true,
        marginsType: 1,
        pageRanges: '',
        preferCSSPageSize: true,
      })

      const dir = path.dirname(filePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, pdfBuffer)

      if (openAfter) {
        await shell.openPath(filePath)
      }

      return { ok: true, filePath }
    } finally {
      if (pdfWin && !pdfWin.isDestroyed()) {
        pdfWin.destroy()
      }
    }
  })
})

function killPython() {
  if (pythonProcess && backendStartedByElectron) {
    log('Stopping Python backend (Electron 子进程)…')
    try {
      pythonProcess.kill()
    } catch (_) {
      /* ignore */
    }
    pythonProcess = null
    backendStartedByElectron = false
  }
}

let appUpdater

function getAppUpdater() {
  if (!appUpdater) {
    appUpdater = createAppUpdater({
      app,
      shell,
      getMainWindow: () => mainWindow,
      stopBackend: killPython,
    })
  }
  return appUpdater
}

let layoutSync
function getLayoutSync() {
  if (!layoutSync) {
    layoutSync = createLayoutSync(app)
  }
  return layoutSync
}

ipcMain.handle('app-update-get-config', () => getAppUpdater().getConfig())
ipcMain.handle('app-update-get-state', () => getAppUpdater().getState())
ipcMain.handle('app-update-set-config', (_event, patch) => getAppUpdater().setConfig(patch || {}))
ipcMain.handle('app-update-check', (_event, options) => getAppUpdater().check(options || {}))
ipcMain.handle('app-update-download', () => getAppUpdater().download())
ipcMain.handle('app-update-cancel-download', () => getAppUpdater().cancelDownload())
ipcMain.handle('app-update-install', (_event, options) => getAppUpdater().install(options || {}))
ipcMain.handle('app-update-skip-version', () => getAppUpdater().skipAvailableVersion())
ipcMain.handle('app-update-open-mac-app', () => getAppUpdater().openMacApplication())

ipcMain.handle('layout-sync-get-config', () => getLayoutSync().getConfig())
ipcMain.handle('layout-sync-set-config', (_event, patch) => getLayoutSync().setConfig(patch || {}))
ipcMain.handle('layout-sync-login', (_event, creds) => getLayoutSync().login(creds || {}))
ipcMain.handle('layout-sync-register', (_event, creds) => getLayoutSync().register(creds || {}))
ipcMain.handle('layout-sync-download-defaults', () => getLayoutSync().downloadDefaults())
ipcMain.handle('layout-sync-download-mine', () => getLayoutSync().downloadMine())
ipcMain.handle('layout-sync-upload', (_event, payload) => getLayoutSync().upload(payload || {}))

app.whenReady().then(async () => {
  log('Starting application...')

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.brteam.sd_sma.report_editor')
  }

  const isDev = !app.isPackaged
  /**
   * 默认：开发模式也由 Electron spawn 后端，关掉窗口/App 时再 killPython，与本机端口绑定一致。
   * 若在另一终端常驻 `npm run api:dev*` / uvicorn，请设环境变量：
   *   REPORT_EDITOR_REUSE_BACKEND=1
   * 这样会跳过拉起子进程（注意：关掉 Electron **不会**停掉你那边的 uvicorn）。
   */
  const reuse =
    ['1', 'true', 'yes'].includes(
      String(process.env.REPORT_EDITOR_REUSE_BACKEND || '').toLowerCase(),
    )

  if (isDev && reuse && (await checkBackendHealthOnce())) {
    log(
      `检测到 ${BACKEND_URL} 已有健康后端，且 REPORT_EDITOR_REUSE_BACKEND=1，跳过启动 Python 子进程（请自行在该终端 Ctrl+C）。`,
    )
  } else {
    if (isDev && (await checkBackendHealthOnce())) {
      log(
        `[提示] ${BACKEND_URL} 已在监听；仍由本 Electron 尝试启动后端。若端口被占会失败。\n` +
          '若在单独终端跑了 uvicorn，请先停掉或使用 REPORT_EDITOR_REUSE_BACKEND=1 复用外部后端（关闭 Electron 不会杀外部进程）。',
      )
    }
    startPythonBackend()
    backendStartedByElectron = Boolean(pythonProcess)
  }

  try {
    await waitForBackend()
  } catch (e) {
    log(`Warning: ${e.message} — opening window anyway`)
  }

  createWindow()
})

app.on('window-all-closed', () => {
  killPython()
  // macOS 默认可驻留托盘；为使「关掉开发窗口」与 Windows 一致、并释放 8000，这里直接 quit。
  app.quit()
})

app.on('before-quit', () => {
  killPython()
})
