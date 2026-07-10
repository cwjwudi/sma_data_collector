const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, powerSaveBlocker } = require('electron')
const { execFileSync, spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')
const { createAppUpdater } = require('./updater.cjs')
const { createDemoPackManager } = require('./demo-pack.cjs')
const { createLayoutSync } = require('./layout-sync.cjs')
const { humanizePdfExportError } = require('./pdfExportErrors.cjs')
const { outputPathForReportPart } = require('./pdf-export-paths.cjs')

let mainWindow
let pythonProcess
/** 若为 true：由本 Electron 拉起的后端，exit 时需 kill（避免误杀外部 uvicorn）。 */
let backendStartedByElectron = false

/** PDF 导出并发池：避免大量隐藏渲染窗口同时占用 CPU / 内存。 */
const PDF_EXPORT_DEFAULT_MAX_PARALLEL = 4
const PDF_EXPORT_HARD_MAX_PARALLEL = 16
let pdfExportMaxParallel = PDF_EXPORT_DEFAULT_MAX_PARALLEL
let pdfExportActiveCount = 0
const pdfExportSlotWaiters = []

function acquirePdfExportSlot() {
  if (pdfExportActiveCount < pdfExportMaxParallel) {
    pdfExportActiveCount += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => pdfExportSlotWaiters.push(resolve))
}

function drainPdfExportSlotWaiters() {
  while (pdfExportSlotWaiters.length && pdfExportActiveCount < pdfExportMaxParallel) {
    pdfExportActiveCount += 1
    pdfExportSlotWaiters.shift()()
  }
}

function releasePdfExportSlot() {
  pdfExportActiveCount = Math.max(0, pdfExportActiveCount - 1)
  drainPdfExportSlotWaiters()
}

async function runPdfExportWithSlot(fn) {
  await acquirePdfExportSlot()
  try {
    return await fn()
  } finally {
    releasePdfExportSlot()
  }
}

/**
 * 预热的 PDF 导出隐藏窗口池：SPA 常驻待命，结批时仅切 hash 即进入取数渲染，
 * 省去每次导出整页冷启动（Vue/依赖包解析执行 + 字体加载，Windows 上约 1~3 秒）。
 */
const warmPdfWins = []
const PDF_EXPORT_PREWARM_HASH = '#/pdf-export?prewarm=1'
/** 复用上限：超过后销毁重建，避免长期驻留的渲染进程累积内存 */
const PDF_EXPORT_WINDOW_MAX_USES = 30

const BACKEND_PORT = 8000
/** 后端绑定地址：0.0.0.0 表示同时监听本机回环与局域网网卡（同网段可访问）。 */
const BACKEND_BIND_HOST = '0.0.0.0'
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

function maskDbConnectionForRenderer(conn) {
  const out = { ...(conn || {}) }
  out.has_password = Boolean(out.password_enc)
  delete out.password_enc
  if (out.is_demo && out.demo_channel === 'remote') {
    out.host = ''
    out.port = null
    out.username = null
    out.database = ''
    out.has_password = true
  }
  return out
}

function maskOpcServerForRenderer(server) {
  const out = { ...(server || {}) }
  out.has_password = Boolean(out.password_enc)
  delete out.password_enc
  if (out.is_demo && out.demo_channel === 'remote') {
    out.endpoint_url = ''
    out.username = null
    out.has_password = false
  }
  return out
}

function readDataSourceStartupSnapshot() {
  const file = path.join(getReportEditorDataDir(), 'config.json')
  try {
    if (!fs.existsSync(file)) {
      return { connections: [], app_preferences: {}, source: file, ok: true }
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const connections = Array.isArray(raw.db_connections)
      ? raw.db_connections.map(maskDbConnectionForRenderer).filter((c) => c.id)
      : []
    const opcuaServers = Array.isArray(raw.opcua_servers)
      ? raw.opcua_servers.map(maskOpcServerForRenderer).filter((s) => s.id)
      : []
    return {
      connections,
      opcua_servers: opcuaServers,
      app_preferences: raw.app_preferences && typeof raw.app_preferences === 'object' ? raw.app_preferences : {},
      source: file,
      ok: true,
    }
  } catch (e) {
    return { connections: [], app_preferences: {}, source: file, ok: false, message: e.message }
  }
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

/**
 * 前端静态页目录。打包后位于 resources/web（extraResources 带入，asar 外），
 * 主窗口/PDF 渲染窗口从这里加载，后端也用它服务网页版。
 * 注意：electron-builder 会把 extraResources 的来源目录从 asar 中排除，
 * 因此打包后 asar 内不再有 dist，页面必须从本目录加载。
 */
function getWebDistDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'web')
  }
  return path.join(__dirname, '..', 'dist')
}

function getRendererIndexHtml() {
  const webIndex = path.join(getWebDistDir(), 'index.html')
  if (fs.existsSync(webIndex)) return webIndex
  // 兜底：老包（无 resources/web）仍从 asar 内 dist 加载
  return path.join(__dirname, '..', 'dist', 'index.html')
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
    REPORT_EDITOR_HTTP_HOST: BACKEND_BIND_HOST,
    // 避免 Windows 旧版 conhost 把 ANSI 当乱码；与 dev_uvicorn.ps1 行为一致
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    PYTHONUTF8: '1',
    PYTHONUNBUFFERED: '1',
  }
  // 前端静态页：让后端在同端口直接服务网页版（浏览器访问 http://<IP>:<端口>/）
  const webDist = getWebDistDir()
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    env.REPORT_EDITOR_WEB_DIST = webDist
    log(`REPORT_EDITOR_WEB_DIST=${webDist}`)
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
    const pyArgs = ['-m', 'uvicorn', 'main:app', '--host', BACKEND_BIND_HOST, '--port', String(BACKEND_PORT)]
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

function commandForPid(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -ExpandProperty CommandLine`,
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 1500 },
      )
      return out.trim()
    }
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 1500,
    }).trim()
  } catch {
    return ''
  }
}

function backendListenerPid() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 1500,
      })
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue
        const parts = line.trim().split(/\s+/)
        const local = parts[1] || ''
        const pid = Number(parts[parts.length - 1])
        if (local.endsWith(`:${BACKEND_PORT}`) && Number.isFinite(pid)) return pid
      }
      return 0
    }
    const out = execFileSync('lsof', ['-nP', `-iTCP:${BACKEND_PORT}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      timeout: 1500,
    })
    const pid = Number(out.trim().split(/\s+/)[0])
    return Number.isFinite(pid) ? pid : 0
  } catch {
    return 0
  }
}

function isOurBackendCommand(command) {
  const normalized = String(command || '').replace(/\\/g, '/').toLowerCase()
  return normalized.includes('/report_backend/report_backend') || normalized.includes('report_backend.exe')
}

async function stopStaleBundledBackendIfUnhealthy() {
  const pid = backendListenerPid()
  if (!pid) return false
  const command = commandForPid(pid)
  if (!isOurBackendCommand(command)) return false
  if (await checkBackendHealthOnce()) return false
  log(`发现旧后端进程占用 ${BACKEND_PORT} 且健康检查无响应，准备清理: pid=${pid}`)
  try {
    process.kill(pid)
  } catch (e) {
    log(`清理旧后端失败: ${e.message}`)
    return false
  }
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (!backendListenerPid()) return true
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    /* ignore */
  }
  await new Promise((resolve) => setTimeout(resolve, 200))
  return !backendListenerPid()
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
      // 最小化/后台时不节流定时器，保证 OPC UA 自动结批轮询持续运行
      backgroundThrottling: false,
    },
  })

  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL)
  } else {
    mainWindow.loadFile(getRendererIndexHtml())
  }

  // 主页面加载完成后预热导出窗口：结批时省去整套 SPA 冷启动
  mainWindow.webContents.once('did-finish-load', () => {
    ensurePdfExportWindowPrewarmed(mainWindow ? mainWindow.webContents : null)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    // 预热窗口是隐藏窗口：不销毁会阻止 window-all-closed，导致应用无法退出
    destroyWarmPdfExportWindows()
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

ipcMain.handle('datasource-startup-snapshot', () => readDataSourceStartupSnapshot())

/** 枚举本机可用的 IPv4 局域网地址（排除回环与未分配），主用地址排在最前。 */
function collectLanIps() {
  const ifaces = os.networkInterfaces()
  const out = []
  for (const [name, addrs] of Object.entries(ifaces || {})) {
    for (const a of addrs || []) {
      if (!a || a.family !== 'IPv4' || a.internal) continue
      if (!a.address || a.address.startsWith('169.254.')) continue
      out.push({ address: a.address, iface: name })
    }
  }
  // 常见现场局域网网段优先展示
  const rank = (ip) => {
    if (ip.startsWith('192.168.')) return 0
    if (ip.startsWith('10.')) return 1
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2
    return 3
  }
  out.sort((x, y) => rank(x.address) - rank(y.address))
  return out
}

ipcMain.handle('app-get-service-endpoints', () => {
  const lanIps = collectLanIps()
  const primaryLan = lanIps.length ? lanIps[0].address : null
  const isDev = !app.isPackaged
  // 后端已挂载前端静态页时，网页版与后端同端口（浏览器直接打开即可）
  const webServed = fs.existsSync(path.join(getWebDistDir(), 'index.html'))
  const rendererUrl = isDev
    ? VITE_DEV_URL
    : webServed
      ? `http://127.0.0.1:${BACKEND_PORT}`
      : 'file://（本地打包页面）'
  const rendererLanUrl = isDev
    ? primaryLan
      ? `http://${primaryLan}:5173`
      : null
    : webServed && primaryLan
      ? `http://${primaryLan}:${BACKEND_PORT}`
      : null
  return {
    backendHost: BACKEND_BIND_HOST,
    backendPort: BACKEND_PORT,
    backendLoopbackUrl: `http://127.0.0.1:${BACKEND_PORT}`,
    backendLanUrl: primaryLan ? `http://${primaryLan}:${BACKEND_PORT}` : null,
    rendererMode: isDev ? 'dev' : 'packaged',
    rendererUrl,
    rendererLanUrl,
    lanIps,
    appVersion: app.getVersion(),
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

const REBAK_MAGIC = Buffer.from('SDRE1\n', 'utf8')

ipcMain.handle('dialog-pick-config-json', async (event, opts) => {
  const win = senderBrowserWindow(event.sender) || mainWindow
  const res = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
    title: (opts && opts.title) || '选择备份文件',
    properties: ['openFile'],
    filters: [
      { name: '备份文件', extensions: ['rebak', 'json'] },
      { name: '加密备份', extensions: ['rebak'] },
      { name: 'JSON 备份', extensions: ['json'] },
    ],
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
    const buf = fs.readFileSync(filePath)
    const encrypted = buf.length >= REBAK_MAGIC.length && buf.subarray(0, REBAK_MAGIC.length).equals(REBAK_MAGIC)
    if (encrypted) {
      return {
        ok: true,
        filePath,
        fileName: path.basename(filePath),
        encrypted: true,
        contentBase64: buf.toString('base64'),
      }
    }
    return {
      ok: true,
      filePath,
      fileName: path.basename(filePath),
      encrypted: false,
      content: buf.toString('utf8'),
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

function createPdfExportWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 1680,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // 隐藏窗口默认被节流，关闭以保证后台渲染 PDF 不变慢
      backgroundThrottling: false,
    },
  })
  win.__exportUses = 0
  return win
}

/** 以 refWc（发起导出的窗口）的 http 源为准拼导出页 URL；否则回落 dev / 打包路径 */
function buildPdfExportUrl(refWc, hash) {
  try {
    if (refWc && !refWc.isDestroyed()) {
      const cur = refWc.getURL()
      if (cur && /^https?:\/\//i.test(cur)) {
        const u = new URL(cur)
        u.hash = hash
        return u.href
      }
    }
  } catch {
    /* ignore */
  }
  if (!app.isPackaged) {
    return `${VITE_DEV_URL}/${hash}`
  }
  return `${pathToFileURL(getRendererIndexHtml()).href}${hash}`
}

function isReusablePdfWindow(win) {
  return Boolean(win && !win.isDestroyed() && !win.webContents.isCrashed())
}

/**
 * 导航隐藏导出窗口。同源同文档时仅改 location.hash（不整页重载，
 * 已启动的 SPA 立即进入取数），否则整页 loadURL 冷启动。返回是否走了热切换。
 */
async function navigatePdfExportWindow(win, targetUrl) {
  const cur = String(win.webContents.getURL() || '')
  const [curBase] = cur.split('#')
  const [nextBase, nextHash] = targetUrl.split('#')
  if (curBase && curBase === nextBase && nextHash) {
    try {
      await win.webContents.executeJavaScript(
        `window.location.hash = ${JSON.stringify('#' + nextHash)}; true`,
        true,
      )
      return true
    } catch {
      /* 回落整页加载 */
    }
  }
  await win.loadURL(targetUrl)
  return false
}

function destroyPdfExportWindow(win) {
  if (win && !win.isDestroyed()) win.destroy()
}

/** 从空闲池中取一个窗口；没有可用窗口时创建独立窗口供当前导出任务使用。 */
function acquirePdfExportWindow() {
  while (warmPdfWins.length) {
    const win = warmPdfWins.pop()
    if (isReusablePdfWindow(win)) return win
    destroyPdfExportWindow(win)
  }
  return createPdfExportWindow()
}

/** 将成功导出的窗口归还空闲池；已达到复用次数或池已满时销毁。 */
function releasePdfExportWindow(win) {
  const reusable =
    isReusablePdfWindow(win) &&
    (win.__exportUses || 0) < PDF_EXPORT_WINDOW_MAX_USES &&
    warmPdfWins.length < pdfExportMaxParallel
  if (reusable) {
    warmPdfWins.push(win)
    return true
  }
  destroyPdfExportWindow(win)
  return false
}

function trimWarmPdfExportWindows() {
  while (warmPdfWins.length > pdfExportMaxParallel) {
    destroyPdfExportWindow(warmPdfWins.pop())
  }
}

function discardUnusableWarmPdfExportWindows() {
  for (let index = warmPdfWins.length - 1; index >= 0; index -= 1) {
    if (!isReusablePdfWindow(warmPdfWins[index])) {
      destroyPdfExportWindow(warmPdfWins[index])
      warmPdfWins.splice(index, 1)
    }
  }
}

/** 空闲时预热少量导出窗口，失败静默不影响导出。 */
function ensurePdfExportWindowPrewarmed(refWc) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  discardUnusableWarmPdfExportWindows()
  trimWarmPdfExportWindows()
  const targetPoolSize = Math.min(2, pdfExportMaxParallel)
  while (warmPdfWins.length < targetPoolSize) {
    try {
      const win = createPdfExportWindow()
      const url = buildPdfExportUrl(refWc || mainWindow.webContents, PDF_EXPORT_PREWARM_HASH)
      warmPdfWins.push(win)
      win.loadURL(url).catch(() => {
        const index = warmPdfWins.indexOf(win)
        if (index >= 0) warmPdfWins.splice(index, 1)
        destroyPdfExportWindow(win)
      })
    } catch (e) {
      log(`预热 PDF 导出窗口失败（忽略）：${e.message}`)
      break
    }
  }
}

function destroyWarmPdfExportWindows() {
  while (warmPdfWins.length) {
    destroyPdfExportWindow(warmPdfWins.pop())
  }
}

ipcMain.handle('pdf-export-set-max-parallel', (_event, opts) => {
  const max = Math.floor(Number(opts && opts.max))
  pdfExportMaxParallel = Math.min(
    PDF_EXPORT_HARD_MAX_PARALLEL,
    Math.max(1, Number.isFinite(max) ? max : PDF_EXPORT_DEFAULT_MAX_PARALLEL),
  )
  drainPdfExportSlotWaiters()
  trimWarmPdfExportWindows()
  ensurePdfExportWindowPrewarmed()
  return { max: pdfExportMaxParallel }
})

ipcMain.handle('pdf-export-run', async (event, opts) => {
  const filePath = opts && opts.filePath
  const templateId = opts && opts.templateId
  const openAfter = Boolean(opts && opts.openAfter)
  const jobId = opts && typeof opts.jobId === 'string' ? opts.jobId : ''
  if (!filePath || typeof filePath !== 'string') throw new Error('缺少 filePath')
  if (!templateId || typeof templateId !== 'string') throw new Error('缺少 templateId')

  return runPdfExportWithSlot(async () => {
    let pdfWin = null
    let exportOk = false
    try {
      function outputPathForPart(partIndex, totalReports) {
        return outputPathForReportPart(filePath, partIndex, totalReports)
      }

      /** 向发起导出的窗口推送阶段进度（结批弹窗显示用；窗口已关则忽略） */
      function sendProgress(payload) {
        try {
          const w = senderBrowserWindow(event.sender)
          if (w && !w.isDestroyed()) {
            event.sender.send('pdf-export-progress', { ...payload, jobId, templateId })
          }
        } catch {
          /* ignore */
        }
      }

      /** seq 保证 hash 每次都变化：热切换时可靠触发导出页的路由监听重新取数 */
      function partHash(partIndex) {
        return `#/pdf-export?templateId=${encodeURIComponent(templateId)}&reportPartIndex=${partIndex}&seq=${Date.now()}`
      }

      // 优先复用预热窗口：SPA 已启动，进入取数只差一次 hash 切换
      pdfWin = acquirePdfExportWindow()
      const warmStart = Boolean(pdfWin.webContents.getURL())

      /** 渲染窗口取数期间每 10 秒发一次心跳：连续 2 分钟无心跳视为无响应；总时长上限 10 分钟 */
      const RENDER_IDLE_TIMEOUT_MS = 120000
      const RENDER_TOTAL_CAP_MS = 600000

      async function renderPart(partIndex) {
        const targetUrl = buildPdfExportUrl(event.sender, partHash(partIndex))
        /** 热切换看门狗：仅改 hash 后渲染页若迟迟没有心跳/完成信号，整页重载一次兜底 */
        const HOT_NAV_FALLBACK_MS = 8000
        const flags = { rendererSignal: false, hotNavFellBack: false }
        let hotNavFallbackTimer = null

        const readyPromise = new Promise((resolve, reject) => {
          let idleTimer = null
          let capTimer = null

          function cleanup() {
            if (idleTimer) clearTimeout(idleTimer)
            if (capTimer) clearTimeout(capTimer)
            if (hotNavFallbackTimer) clearTimeout(hotNavFallbackTimer)
            ipcMain.removeListener('pdf-export-ready', onReady)
            ipcMain.removeListener('pdf-export-heartbeat', onHeartbeat)
          }

          function fail(message) {
            cleanup()
            reject(new Error(message))
          }

          function armIdleTimer() {
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              fail('PDF 渲染超时：渲染窗口约 2 分钟无响应（页面可能加载失败或取数卡住）')
            }, RENDER_IDLE_TIMEOUT_MS)
          }

          function isFromPdfWin(ev) {
            if (!pdfWin || pdfWin.isDestroyed()) return false
            return senderBrowserWindow(ev.sender) === pdfWin
          }

          function onHeartbeat(ev) {
            if (!isFromPdfWin(ev)) return
            flags.rendererSignal = true
            armIdleTimer()
          }

          function onReady(ev, payload) {
            if (!isFromPdfWin(ev)) return
            flags.rendererSignal = true
            cleanup()
            resolve(payload || {})
          }

          capTimer = setTimeout(() => {
            fail('PDF 渲染超时：取数渲染超过 10 分钟仍未完成')
          }, RENDER_TOTAL_CAP_MS)
          armIdleTimer()
          ipcMain.on('pdf-export-ready', onReady)
          ipcMain.on('pdf-export-heartbeat', onHeartbeat)
        })

        const navStartMs = Date.now()
        // 导航与完成信号并行等待：导航报错立即失败；导航悬挂由 readyPromise 的超时兜底，
        // 避免 readyPromise 先超时时产生无人接收的 unhandled rejection 并卡死后续结批。
        const payload = await new Promise((resolve, reject) => {
          readyPromise.then(resolve, reject)
          navigatePdfExportWindow(pdfWin, targetUrl)
            .then((hotSwitched) => {
              if (!hotSwitched) return
              hotNavFallbackTimer = setTimeout(() => {
                if (flags.rendererSignal || flags.hotNavFellBack) return
                if (!pdfWin || pdfWin.isDestroyed()) return
                flags.hotNavFellBack = true
                log('PDF export hot hash-switch silent; falling back to full page load')
                pdfWin.loadURL(targetUrl).catch(() => {})
              }, HOT_NAV_FALLBACK_MS)
            })
            .catch(reject)
        })
        const readyMs = Date.now() - navStartMs
        if (!payload || !payload.ok) {
          throw new Error((payload && payload.error) || 'PDF render failed')
        }

        const printStartMs = Date.now()
        const pdfBuffer = await pdfWin.webContents.printToPDF({
          landscape: false,
          printBackground: true,
          marginsType: 1,
          pageRanges: '',
          preferCSSPageSize: true,
        })
        pdfWin.__exportUses = (pdfWin.__exportUses || 0) + 1
        return {
          pdfBuffer,
          totalReports: Math.max(1, Math.floor(Number(payload.totalReports) || 1)),
          stats: payload.stats || null,
          phases: payload.phases && typeof payload.phases === 'object' ? payload.phases : null,
          readyMs,
          printMs: Date.now() - printStartMs,
        }
      }

      function mergeStats(total, part) {
        if (!part || typeof part !== 'object') return total
        return {
          opcReads: total.opcReads + (Number(part.opcReads) || 0),
          sqlQueries: total.sqlQueries + (Number(part.sqlQueries) || 0),
          sqlRows: total.sqlRows + (Number(part.sqlRows) || 0),
        }
      }

      const startedAtMs = Date.now()
      let stats = { opcReads: 0, sqlQueries: 0, sqlRows: 0 }
      /** 分阶段耗时（多份报表求和）：readyMs 含窗口内启动+取数+绘制；dataMs 为其中的取数部分 */
      const timings = { warmStart, readyMs: 0, dataMs: 0, printMs: 0, writeMs: 0 }

      function mergeTimings(part) {
        timings.readyMs += Number(part.readyMs) || 0
        timings.printMs += Number(part.printMs) || 0
        if (part.phases) {
          timings.dataMs += Number(part.phases.dataMs) || 0
        }
      }

      function writePartPdf(partIndex, totalReports, pdfBuffer) {
        const outPath = outputPathForPart(partIndex, totalReports)
        const writeStartMs = Date.now()
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.writeFileSync(outPath, pdfBuffer)
        timings.writeMs += Date.now() - writeStartMs
        return outPath
      }

      sendProgress({ phase: 'render', partIndex: 0, totalReports: 0 })
      const first = await renderPart(0)
      const totalReports = first.totalReports
      stats = mergeStats(stats, first.stats)
      mergeTimings(first)
      const filePaths = []
      filePaths.push(writePartPdf(0, totalReports, first.pdfBuffer))
      sendProgress({ phase: 'saved', partIndex: 0, totalReports })

      for (let partIndex = 1; partIndex < totalReports; partIndex++) {
        sendProgress({ phase: 'render', partIndex, totalReports })
        const part = await renderPart(partIndex)
        stats = mergeStats(stats, part.stats)
        mergeTimings(part)
        filePaths.push(writePartPdf(partIndex, totalReports, part.pdfBuffer))
        sendProgress({ phase: 'saved', partIndex, totalReports })
      }

      if (openAfter) {
        await shell.openPath(filePaths[0])
      }

      exportOk = true
      return {
        ok: true,
        filePath: filePaths[0],
        filePaths,
        totalReports,
        stats,
        timings,
        durationMs: Date.now() - startedAtMs,
      }
    } catch (e) {
      throw new Error(humanizePdfExportError(e, { phase: 'export' }))
    } finally {
      // 成功窗口回到预热页并归还空闲池；失败或超复用上限的窗口销毁。
      let recycled = false
      if (exportOk && isReusablePdfWindow(pdfWin) && mainWindow && !mainWindow.isDestroyed()) {
        let prewarmNavigationOk = false
        try {
          await navigatePdfExportWindow(
            pdfWin,
            buildPdfExportUrl(event.sender, PDF_EXPORT_PREWARM_HASH),
          )
          prewarmNavigationOk = true
        } catch {
          /* 预热页导航失败时销毁该窗口。 */
        }
        if (prewarmNavigationOk) recycled = releasePdfExportWindow(pdfWin)
      }
      if (!recycled) {
        destroyPdfExportWindow(pdfWin)
      }
      ensurePdfExportWindowPrewarmed(event.sender)
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

let demoPackManager

function getDemoPackManager() {
  if (!demoPackManager) {
    demoPackManager = createDemoPackManager({
      app,
      resolveBaseUrl: () => getAppUpdater().getConfig().baseUrl,
      readSkipTlsVerify: () => Boolean(getAppUpdater().getConfig().skipTlsVerify),
    })
  }
  return demoPackManager
}

ipcMain.handle('demo-pack-get-state', () => getDemoPackManager().getState())
ipcMain.handle('demo-pack-check', () => getDemoPackManager().checkRemote())
ipcMain.handle('demo-pack-install', () => getDemoPackManager().downloadAndInstall())
ipcMain.handle('demo-pack-start', () => getDemoPackManager().startCompose())
ipcMain.handle('demo-pack-stop', () => getDemoPackManager().stopCompose())

ipcMain.handle('app-update-get-config', () => getAppUpdater().getConfig())
ipcMain.handle('app-update-get-state', () => getAppUpdater().getState())
ipcMain.handle('app-update-set-config', (_event, patch) => getAppUpdater().setConfig(patch || {}))
ipcMain.handle('app-update-check', (_event, options) => getAppUpdater().check(options || {}))
ipcMain.handle('app-update-download', (_event, options) => getAppUpdater().download(options || {}))
ipcMain.handle('app-update-cancel-download', () => getAppUpdater().cancelDownload())
ipcMain.handle('app-update-install', (_event, options) => getAppUpdater().install(options || {}))
ipcMain.handle('app-update-skip-version', () => getAppUpdater().skipAvailableVersion())
ipcMain.handle('app-update-clear-skipped', () => getAppUpdater().clearSkippedVersions())
ipcMain.handle('app-update-open-mac-app', async () => getAppUpdater().openMacApplication())
ipcMain.handle('app-update-download-installer', () => getAppUpdater().downloadInstallerToDownloads())
ipcMain.handle('app-update-cancel-installer-download', () => getAppUpdater().cancelInstallerDownload())

ipcMain.handle('layout-sync-get-config', () => getLayoutSync().getConfig())
ipcMain.handle('layout-sync-set-config', (_event, patch) => getLayoutSync().setConfig(patch || {}))
ipcMain.handle('layout-sync-login', (_event, creds) => getLayoutSync().login(creds || {}))
ipcMain.handle('layout-sync-register', (_event, creds) => getLayoutSync().register(creds || {}))
ipcMain.handle('layout-sync-download-defaults', () => getLayoutSync().downloadDefaults())
ipcMain.handle('layout-sync-download-mine', () => getLayoutSync().downloadMine())
ipcMain.handle('layout-sync-upload', (_event, payload) => getLayoutSync().upload(payload || {}))
ipcMain.handle('layout-sync-upload-config', (_event, payload) => getLayoutSync().uploadConfigBundle(payload || {}))
ipcMain.handle('layout-sync-download-config', () => getLayoutSync().downloadConfigBundle())

app.whenReady().then(async () => {
  log('Starting application...')

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.brteam.sd_sma.report_editor')
  }

  // 防止系统挂起本应用（macOS App Nap / Windows 后台省电），
  // 保证最小化或后台运行时 OPC UA 自动结批仍每秒轮询；不阻止屏幕熄灭。
  try {
    powerSaveBlocker.start('prevent-app-suspension')
  } catch (e) {
    log(`powerSaveBlocker 启动失败（忽略）：${e.message}`)
  }

  createWindow()

  // 预热窗口保活：结批可能间隔数天，长期驻留的渲染进程可能被系统回收/崩溃，
  // 定期检查并重建，保证下一次结批仍能热启动
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const hasUnavailableWindow = warmPdfWins.some((win) => !isReusablePdfWindow(win))
    if (hasUnavailableWindow || warmPdfWins.length < Math.min(2, pdfExportMaxParallel)) {
      log('PDF export warm window pool unavailable; re-prewarming')
      ensurePdfExportWindowPrewarmed(mainWindow.webContents)
    }
  }, 5 * 60 * 1000)

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
  const backendHealthy = await checkBackendHealthOnce()

  if (backendHealthy && (!isDev || reuse)) {
    log(
      `检测到 ${BACKEND_URL} 已有健康后端，跳过启动 Python 子进程。`,
    )
  } else {
    if (!backendHealthy) {
      await stopStaleBundledBackendIfUnhealthy()
    }
    if (isDev && backendHealthy) {
      log(
        `[提示] ${BACKEND_URL} 已在监听；仍由本 Electron 尝试启动后端。若端口被占会失败。\n` +
          '若在单独终端跑了 uvicorn，请先停掉或使用 REPORT_EDITOR_REUSE_BACKEND=1 复用外部后端（关闭 Electron 不会杀外部进程）。',
      )
    }
    startPythonBackend()
    backendStartedByElectron = Boolean(pythonProcess)
  }

  waitForBackend()
    .then(() => log('Backend is ready for renderer requests'))
    .catch((e) => log(`Warning: ${e.message} — renderer remains open with local cached data`))
})

app.on('window-all-closed', () => {
  killPython()
  // macOS 默认可驻留托盘；为使「关掉开发窗口」与 Windows 一致、并释放 8000，这里直接 quit。
  app.quit()
})

app.on('before-quit', () => {
  killPython()
})
