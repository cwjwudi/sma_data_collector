const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, powerSaveBlocker, session, Tray, Menu, screen } = require('electron')
const { execFile, spawn } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const http = require('http')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')

const execFileAsync = promisify(execFile)
const { createAppUpdater } = require('./updater.cjs')
const { createLayoutSync } = require('./layout-sync.cjs')
const { humanizePdfExportError } = require('./pdfExportErrors.cjs')
const { outputPathForReportPart } = require('./pdf-export-paths.cjs')
const { scanExportEntries, scanExportPdfsCompat } = require('./export-dir-scan.cjs')
const { transferHistoryItems } = require('./history-transfer.cjs')
const {
  listRemovableVolumesDetailed,
  resetWinDriveBaseline,
} = require('./removable-volumes.cjs')
const { withThumbSlot } = require('./pdf-thumb-queue.cjs')
const {
  registerPdfExportJob,
  cancelPdfExportJob,
  isPdfExportCancelled,
  unregisterPdfExportJob,
} = require('./pdf-export-cancel.cjs')
const { isRecoverablePdfExportNavError } = require('./pdf-export-nav-recovery.cjs')
const {
  readLaunchSettings,
  writeLaunchSettings,
  applyLoginItem,
  syncLoginItemOnReady,
  shouldSilentStartThisSession,
  patchTouchesLoginItem,
  SILENT_START_ARG,
} = require('./launch.cjs')

// 五档批导：独立 userData，避免与已打开的安装版抢单实例锁
const fiveTierExportSpec = String(process.env.REPORT_EDITOR_FIVE_TIER_EXPORT || '').trim()
if (fiveTierExportSpec) {
  const batchUserData = path.join(os.tmpdir(), 'sd-sma-report-editor-five-tier-export')
  try {
    fs.mkdirSync(batchUserData, { recursive: true })
  } catch {
    /* ignore */
  }
  app.setPath('userData', batchUserData)
}

// —— 整机单实例（须在 whenReady / 拉后端之前）——
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  // 未拿到锁：立刻退出，禁止再起后端 / 建窗
  app.quit()
  process.exit(0)
}

let mainWindow
let pythonProcess
/** 若为 true：由本 Electron 拉起的后端，exit 时需 kill（避免误杀外部 uvicorn）。 */
let backendStartedByElectron = false
/** 本次为静默启动：隐藏主窗口、托盘驻留；关窗不退出。 */
let silentStartSession = false
let isQuitting = false
let appTray = null
/** 第一实例尚未 createWindow 时收到 second-instance，建窗后再聚焦。 */
let pendingFocusFromSecondInstance = false

app.on('second-instance', (_event, argv) => {
  // 037b：静默自启拉起的第二实例（命令行含 --silent-start）不得弹出主窗口，
  // 否则「开机自启 + 静默」在存在重复自启项/进程残留时会被强制显示页面。
  const silentSecond = Array.isArray(argv) && argv.includes(SILENT_START_ARG)
  if (silentSecond) {
    if (silentStartSession) ensureAppTray()
    return
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindowFromTray()
    return
  }
  pendingFocusFromSecondInstance = true
})

/** PDF 导出并发池：默认 1（030：同机 HMI / 弱 CPU / Hypervisor）；硬顶 16。 */
const PDF_EXPORT_DEFAULT_MAX_PARALLEL = 1
const PDF_EXPORT_HARD_MAX_PARALLEL = 16
let pdfExportMaxParallel = PDF_EXPORT_DEFAULT_MAX_PARALLEL
let pdfExportActiveCount = 0
const pdfExportSlotWaiters = []
/** 导出进行中：整进程降为 Below Normal，给 mappView / Hypervisor 让核 */
let pdfExportPriorityDepth = 0
/** 主窗口后台降载优先级深度（与结批低优先级叠加） */
let appBackgroundPriorityDepth = 0
/** 主窗口是否处于后台（最小化 / 隐藏 / 失焦） */
let appMainWindowBackgroundIdle = false
/** 分卷之间让出 CPU（ms），双核+虚拟化场景减轻 HMI 饿死 */
/** 分卷 yield；可由渲染进程按导出性能档位覆盖（035） */
let pdfExportPartYieldMs = 80
/** 预热池目标大小；0 = 不预热（035 档 0–2） */
let pdfExportPrewarmPoolSize = 0

function cpuBudgetMaxParallel(logicalCores) {
  const n = Math.max(1, Math.floor(Number(logicalCores) || 1))
  if (n <= 4) return 1
  if (n <= 8) return 2
  return Math.min(PDF_EXPORT_HARD_MAX_PARALLEL, Math.floor(n / 4))
}

function resolvePdfExportMaxParallel(configured) {
  const want = Math.min(
    PDF_EXPORT_HARD_MAX_PARALLEL,
    Math.max(1, Number.isFinite(configured) ? Math.floor(configured) : PDF_EXPORT_DEFAULT_MAX_PARALLEL),
  )
  return Math.min(want, cpuBudgetMaxParallel(os.cpus().length))
}

function beginPdfExportLowPriority() {
  pdfExportPriorityDepth += 1
  if (pdfExportPriorityDepth !== 1) return
  try {
    const p = os.constants && os.constants.priority
    if (p && typeof os.setPriority === 'function') {
      os.setPriority(0, p.PRIORITY_BELOW_NORMAL)
    }
  } catch (e) {
    log(`setPriority BelowNormal 失败（忽略）：${e.message}`)
  }
}

function endPdfExportLowPriority() {
  if (pdfExportPriorityDepth <= 0) return
  pdfExportPriorityDepth -= 1
  if (pdfExportPriorityDepth !== 0) return
  // 仍处于后台降载时保持 BelowNormal
  if (appBackgroundPriorityDepth > 0) return
  try {
    const p = os.constants && os.constants.priority
    if (p && typeof os.setPriority === 'function') {
      os.setPriority(0, p.PRIORITY_NORMAL)
    }
  } catch (e) {
    log(`setPriority Normal 失败（忽略）：${e.message}`)
  }
}

/**
 * 030/现场（i3 双核 + AR Hypervisor 占核）：真正吃 CPU 的是**导出渲染进程**
 * （pdf-lib 画版式 / fontkit subset / chromium 排版）与 **Python 后端**（取数），
 * 二者都是独立 OS 进程。此前只 `os.setPriority(0,…)` 降了空转的主进程，等于没让核，
 * 故矢量档也把 Windows 侧仅剩的核占满、mappView 饿死。这里按需降真正的进程优先级。
 *
 * @param {number} pid 目标进程 pid（0/无效则忽略）
 * @param {number} priority os.constants.priority.* 常量
 * @param {string} label 日志标识
 */
function setOsProcessPrioritySafe(pid, priority, label) {
  const target = Math.floor(Number(pid) || 0)
  if (!target || target <= 0) return false
  if (typeof priority !== 'number') return false
  try {
    if (typeof os.setPriority === 'function') {
      os.setPriority(target, priority)
      return true
    }
  } catch (e) {
    log(`setPriority ${label}(${target}) 失败（忽略）：${e && e.message ? e.message : e}`)
  }
  return false
}

/** 让核力度：full → 渲染进程 IDLE/Low（HMI 一忙即完全让路）；basic → BelowNormal。 */
function renderProcessCoexistPriority(coexistPause) {
  const p = os.constants && os.constants.priority
  if (!p) return null
  return String(coexistPause) === 'basic' ? p.PRIORITY_BELOW_NORMAL : p.PRIORITY_LOW
}

/** 导出期把渲染进程（按档 IDLE/BelowNormal）与后端（BelowNormal）降载，给同机 mappView 让核。 */
function applyExportProcessCoexistPriority(renderWebContents, coexistPause) {
  const p = os.constants && os.constants.priority
  if (!p) return
  const renderPriority = renderProcessCoexistPriority(coexistPause)
  try {
    if (renderWebContents && !renderWebContents.isDestroyed() && renderPriority != null) {
      setOsProcessPrioritySafe(renderWebContents.getOSProcessId(), renderPriority, 'export-renderer')
    }
  } catch {
    /* 渲染进程 pid 取用失败忽略 */
  }
  // 取数在后端进程，full 档一并降到 BelowNormal（IO 为主，不必 IDLE 以免拖慢取数）
  if (String(coexistPause) !== 'basic' && pythonProcess && pythonProcess.pid) {
    setOsProcessPrioritySafe(pythonProcess.pid, p.PRIORITY_BELOW_NORMAL, 'backend')
  }
}

/** 导出结束/窗口归还池前，把渲染进程与后端恢复 NORMAL。 */
function restoreExportProcessCoexistPriority(renderWebContents) {
  const p = os.constants && os.constants.priority
  if (!p) return
  try {
    if (renderWebContents && !renderWebContents.isDestroyed()) {
      setOsProcessPrioritySafe(renderWebContents.getOSProcessId(), p.PRIORITY_NORMAL, 'export-renderer')
    }
  } catch {
    /* ignore */
  }
  if (pythonProcess && pythonProcess.pid) {
    setOsProcessPrioritySafe(pythonProcess.pid, p.PRIORITY_NORMAL, 'backend')
  }
}

function yieldToOs(ms) {
  const wait = Math.max(0, Number(ms) || 0)
  if (!wait) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, wait))
}

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
  beginPdfExportLowPriority()
  try {
    return await fn()
  } finally {
    endPdfExportLowPriority()
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

async function readDataSourceStartupSnapshot() {
  const file = path.join(getReportEditorDataDir(), 'config.json')
  try {
    let rawText
    try {
      rawText = await fs.promises.readFile(file, 'utf8')
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
        return { connections: [], app_preferences: {}, source: file, ok: true }
      }
      throw e
    }
    const raw = JSON.parse(rawText)
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

async function commandForPid(pid) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -ExpandProperty CommandLine`,
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 1500 },
      )
      return String(stdout || '').trim()
    }
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 1500,
    })
    return String(stdout || '').trim()
  } catch {
    return ''
  }
}

async function backendListenerPid() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'tcp'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 1500,
      })
      for (const line of String(stdout || '').split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue
        const parts = line.trim().split(/\s+/)
        const local = parts[1] || ''
        const pid = Number(parts[parts.length - 1])
        if (local.endsWith(`:${BACKEND_PORT}`) && Number.isFinite(pid)) return pid
      }
      return 0
    }
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${BACKEND_PORT}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      timeout: 1500,
    })
    const pid = Number(String(stdout || '').trim().split(/\s+/)[0])
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
  const pid = await backendListenerPid()
  if (!pid) return false
  const command = await commandForPid(pid)
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
    if (!(await backendListenerPid())) return true
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    /* ignore */
  }
  await new Promise((resolve) => setTimeout(resolve, 200))
  return !(await backendListenerPid())
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

/**
 * 菜单栏 / 系统托盘图标：macOS 需要约 16–22px，过大 PNG/ICNS 常显示为空白，
 * 导致静默启动后找不到「打开主界面」入口。
 */
function resolveTrayIcon() {
  const src = resolveAppIcon()
  if (!src || src.isEmpty()) return null
  if (process.platform !== 'darwin') return src
  try {
    const sized = src.resize({ width: 22, height: 22 })
    if (sized.isEmpty()) return src
    // Template 图在浅/深色菜单栏下都更易辨认
    if (typeof sized.setTemplateImage === 'function') sized.setTemplateImage(true)
    return sized
  } catch {
    return src
  }
}

function showMainWindowFromTray() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
  // 静默会话曾隐藏窗口时，确保 Dock 图标可点回（macOS）
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.show()
    } catch {
      /* ignore */
    }
  }
}

/* ========== 039：导出全屏遮罩（盖住同机 mappView 被饿死的白屏） ========== */
let exportOverlayWindow = null
let exportOverlayHideTimer = null
/** 进行中的导出计数（0→1 显示遮罩，→0 隐藏）；支持并行导出 */
let exportOverlayUiCount = 0
let exportOverlayLastProgress = null
/** 硬超时：最多盖 120s，防遮罩卡死长时间锁住 HMI（用户确认） */
const EXPORT_OVERLAY_MAX_MS = 120000

function isExportOverlayEnabled() {
  // 五档批导为无人值守/自动退出，不弹遮罩
  if (fiveTierExportSpec) return false
  try {
    return Boolean(readLaunchSettings(app).exportOverlayEnabled)
  } catch {
    return true
  }
}

function buildExportOverlayHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; user-select:none; }
  html,body { width:100%; height:100%; overflow:hidden;
    background:radial-gradient(1200px 800px at 50% 40%, #1b2440 0%, #0b1120 70%, #070b16 100%);
    color:#e8ecf6; font-family:"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif;
    -webkit-app-region:no-drag; cursor:default; }
  .wrap { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:26px; }
  .ring { width:76px; height:76px; border-radius:50%;
    border:5px solid rgba(120,160,255,0.18); border-top-color:#6aa0ff;
    animation:spin 0.9s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .title { font-size:30px; font-weight:600; letter-spacing:2px; }
  .sub { font-size:16px; color:#9fb0d4; letter-spacing:1px; }
  .counter { font-size:15px; color:#c7d4ef; min-height:20px; }
  .bar { width:360px; max-width:60vw; height:6px; border-radius:99px;
    background:rgba(120,160,255,0.15); overflow:hidden; position:relative; }
  .bar > i { position:absolute; left:-40%; top:0; height:100%; width:40%;
    border-radius:99px; background:linear-gradient(90deg,transparent,#6aa0ff,transparent);
    animation:slide 1.25s ease-in-out infinite; }
  @keyframes slide { 0%{left:-40%;} 100%{left:100%;} }
  .hint { position:absolute; bottom:22px; left:0; right:0; text-align:center;
    font-size:13px; color:#6f7ea0; }
  #ov-close { position:absolute; top:16px; right:20px; width:40px; height:40px;
    border-radius:8px; border:1px solid rgba(160,180,220,0.25); background:rgba(255,255,255,0.04);
    color:#9fb0d4; font-size:20px; line-height:38px; text-align:center; cursor:pointer;
    opacity:0.55; }
  #ov-close:hover { opacity:1; background:rgba(255,255,255,0.1); }
</style></head><body>
  <div id="ov-close" title="隐藏（Esc）">×</div>
  <div class="wrap">
    <div class="ring"></div>
    <div class="title">正在生成报表</div>
    <div class="sub">结批导出进行中，请稍候…</div>
    <div class="counter" id="ov-counter"></div>
    <div class="bar"><i></i></div>
  </div>
  <div class="hint">此界面为报表结批临时提示 · 按 Esc 或点右上角 × 可隐藏回主画面</div>
<script>
  (function(){
    var api = window.exportOverlay;
    var counter = document.getElementById('ov-counter');
    function render(p){
      if (!p) return;
      var total = Number(p.totalReports) || 0;
      if (total > 1) {
        var idx = (Number(p.partIndex) || 0) + 1;
        if (idx > total) idx = total;
        counter.textContent = '第 ' + idx + ' / 共 ' + total + ' 份';
      } else {
        counter.textContent = '';
      }
    }
    if (api && api.onProgress) api.onProgress(render);
    function dismiss(){ if (api && api.dismiss) api.dismiss(); }
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') dismiss(); });
    var btn = document.getElementById('ov-close');
    if (btn) btn.addEventListener('click', dismiss);
  })();
</script></body></html>`
}

function armExportOverlayTimeout() {
  if (exportOverlayHideTimer) clearTimeout(exportOverlayHideTimer)
  exportOverlayHideTimer = setTimeout(() => {
    log('导出遮罩：达最长显示时间（120s），自动隐藏以防锁住 HMI')
    hideExportOverlay('timeout')
  }, EXPORT_OVERLAY_MAX_MS)
}

function pushExportOverlayProgress(payload) {
  if (payload) exportOverlayLastProgress = { ...(exportOverlayLastProgress || {}), ...payload }
  const w = exportOverlayWindow
  if (w && !w.isDestroyed()) {
    try {
      w.webContents.send('export-overlay-progress', exportOverlayLastProgress || {})
    } catch {
      /* ignore */
    }
  }
}

function showExportOverlay() {
  if (!isExportOverlayEnabled()) return
  try {
    if (exportOverlayWindow && !exportOverlayWindow.isDestroyed()) {
      if (!exportOverlayWindow.isVisible()) exportOverlayWindow.show()
      exportOverlayWindow.setAlwaysOnTop(true, 'screen-saver')
      pushExportOverlayProgress(null)
      armExportOverlayTimeout()
      return
    }
    const disp = screen.getPrimaryDisplay()
    const b = (disp && disp.bounds) || { x: 0, y: 0, width: 1280, height: 800 }
    const win = new BrowserWindow({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      show: false,
      frame: false,
      backgroundColor: '#0b1120',
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, 'overlay-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    exportOverlayWindow = win
    win.setMenuBarVisibility(false)
    win.once('ready-to-show', () => {
      if (!exportOverlayWindow || exportOverlayWindow.isDestroyed()) return
      try {
        win.setAlwaysOnTop(true, 'screen-saver')
      } catch {
        /* ignore */
      }
      try {
        win.setFullScreen(true)
      } catch {
        /* ignore */
      }
      win.show()
      win.focus()
      pushExportOverlayProgress(null)
    })
    // Esc 兜底（页面内也监听；此处防页面脚本异常时仍可退出）
    win.webContents.on('before-input-event', (_e, input) => {
      if (input && input.type === 'keyDown' && String(input.key) === 'Escape') {
        hideExportOverlay('esc')
      }
    })
    win.on('closed', () => {
      if (exportOverlayWindow === win) exportOverlayWindow = null
    })
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildExportOverlayHtml()))
    armExportOverlayTimeout()
  } catch (e) {
    log(`导出遮罩显示失败（忽略）：${e && e.message ? e.message : e}`)
  }
}

function hideExportOverlay(reason = 'done') {
  if (exportOverlayHideTimer) {
    clearTimeout(exportOverlayHideTimer)
    exportOverlayHideTimer = null
  }
  const w = exportOverlayWindow
  exportOverlayWindow = null
  exportOverlayLastProgress = null
  if (w && !w.isDestroyed()) {
    try {
      w.destroy()
    } catch {
      /* ignore */
    }
  }
  if (reason && reason !== 'done') log(`导出遮罩隐藏（${reason}）`)
}

/** 导出开始：计数 0→1 时弹遮罩（用户强关后本会话不再自动重弹） */
function beginExportOverlaySession() {
  exportOverlayUiCount += 1
  if (exportOverlayUiCount === 1) {
    exportOverlayLastProgress = { phase: 'render', partIndex: 0, totalReports: 0 }
    showExportOverlay()
  }
}

/** 导出结束：计数归 0 时隐藏遮罩 */
function endExportOverlaySession() {
  exportOverlayUiCount = Math.max(0, exportOverlayUiCount - 1)
  if (exportOverlayUiCount === 0) hideExportOverlay('done')
}

ipcMain.on('export-overlay-dismiss', () => hideExportOverlay('user'))

function destroyAppTray() {
  if (!appTray) return
  try {
    appTray.destroy()
  } catch {
    /* ignore */
  }
  appTray = null
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: '打开主界面',
      click: () => showMainWindowFromTray(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        destroyAppTray()
        app.quit()
      },
    },
  ])
}

function ensureAppTray() {
  if (appTray) return
  const icon = resolveTrayIcon()
  if (!icon || icon.isEmpty()) {
    log('Tray icon unavailable; silent start will still hide the window')
  }
  try {
    appTray = new Tray(icon && !icon.isEmpty() ? icon : nativeImage.createEmpty())
  } catch (e) {
    log(`Tray create failed: ${e.message}`)
    return
  }
  appTray.setToolTip('报表编辑器 AI 版')
  const menu = buildTrayMenu()
  appTray.setContextMenu(menu)
  // Windows：双击托盘打开；macOS：单击菜单栏图标即出菜单（含「打开主界面」）
  appTray.on('double-click', () => showMainWindowFromTray())
  if (process.platform === 'darwin') {
    // 部分系统版本单击不弹出菜单时，仍可通过左键直接打开窗口
    appTray.on('click', () => showMainWindowFromTray())
    if (app.dock) {
      try {
        app.dock.setMenu(menu)
      } catch (e) {
        log(`dock.setMenu failed (ignore): ${e.message}`)
      }
    }
  }
}

function createWindow() {
  const appIcon = resolveAppIcon()
  const hideOnCreate = silentStartSession
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '报表编辑器 AI 版',
    show: !hideOnCreate,
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
  const loadDist =
    Boolean(fiveTierExportSpec) ||
    ['1', 'true', 'yes'].includes(String(process.env.REPORT_EDITOR_LOAD_DIST || '').toLowerCase())
  if (isDev && !loadDist) {
    mainWindow.loadURL(VITE_DEV_URL)
  } else {
    mainWindow.loadFile(getRendererIndexHtml())
  }

  // 主页面加载完成后预热导出窗口：结批时省去整套 SPA 冷启动
  mainWindow.webContents.once('did-finish-load', () => {
    ensurePdfExportWindowPrewarmed(mainWindow ? mainWindow.webContents : null)
    publishAppResourceMode()
    if (fiveTierExportSpec) {
      void runFiveTierExportBatch(fiveTierExportSpec).catch((e) => {
        log(`五档批导失败：${e && e.message ? e.message : e}`)
        void finishFiveTierExportAndExit('', 1)
      })
    }
  })

  // 035：后台/最小化时释放预热窗 + 通知渲染进程暂停次要轮询（不停自动结批）
  const onActivity = () => syncMainWindowBackgroundIdle()
  mainWindow.on('blur', onActivity)
  mainWindow.on('focus', onActivity)
  mainWindow.on('show', onActivity)
  mainWindow.on('hide', onActivity)
  mainWindow.on('minimize', onActivity)
  mainWindow.on('restore', onActivity)

  if (silentStartSession) {
    mainWindow.on('close', (e) => {
      if (isQuitting) return
      e.preventDefault()
      mainWindow.hide()
      syncMainWindowBackgroundIdle()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    appMainWindowBackgroundIdle = true
    endAppBackgroundLowPriority()
    // 预热窗口是隐藏窗口：不销毁会阻止 window-all-closed，导致应用无法退出
    destroyWarmPdfExportWindows()
  })

  if (pendingFocusFromSecondInstance) {
    pendingFocusFromSecondInstance = false
    // 静默启动也可能被第二实例唤起：必须 show，不能只 focus
    showMainWindowFromTray()
  }
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
    await fs.promises.writeFile(res.filePath, content, 'utf8')
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
    const stat = await fs.promises.stat(filePath)
    if (stat.size > MAX_CONFIG_JSON_BYTES) {
      return { ok: false, error: `备份文件过大（超过 ${Math.round(MAX_CONFIG_JSON_BYTES / 1024 / 1024)} MB）` }
    }
    const buf = await fs.promises.readFile(filePath)
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

/** 030/033：pdf-lib 嵌入随包开源 CJK（Noto TTF / 朱雀仿宋→FangSong）；Noto 优先 TTF（OTF subset 乱码） */
const BUNDLED_FONT_FILES = {
  'noto-sans-sc': ['NotoSansSC-Regular.ttf', 'NotoSansSC-Regular.otf'],
  fangsong: ['ZhuqueFangsong-Regular.ttf'],
}

function resolveBundledFontKey(opts) {
  const keyRaw = opts && (opts.key || opts.id)
  if (keyRaw && BUNDLED_FONT_FILES[keyRaw]) return keyRaw
  const fam = String((opts && opts.family) || '')
    .trim()
    .toLowerCase()
  if (
    fam === 'fangsong' ||
    fam === '仿宋' ||
    fam === 'zhuque fangsong' ||
    fam === '朱雀仿宋' ||
    fam === 'zhuquefangsong'
  ) {
    return 'fangsong'
  }
  return 'noto-sans-sc'
}

ipcMain.handle('bundled-cjk-font', async (_event, opts) => {
  const key = resolveBundledFontKey(opts || {})
  const fileNames = BUNDLED_FONT_FILES[key] || BUNDLED_FONT_FILES['noto-sans-sc']
  const roots = [
    path.join(process.resourcesPath || '', 'fonts'),
    path.join(__dirname, '..', 'resources', 'fonts'),
  ]
  for (const fileName of fileNames) {
    for (const root of roots) {
      const fp = path.join(root, fileName)
      try {
        if (!fp || !fs.existsSync(fp)) continue
        const buf = await fs.promises.readFile(fp)
        if (buf.length < 1000) continue
        return {
          ok: true,
          key,
          family: key === 'fangsong' ? 'FangSong' : 'Noto Sans SC',
          base64: buf.toString('base64'),
          path: fp,
          bytes: buf.length,
        }
      } catch {
        /* try next */
      }
    }
  }
  return { ok: false, key, error: `bundled font not found: ${fileNames.join(' | ')}` }
})

ipcMain.handle('scan-export-pdfs', async (_event, opts) => {
  return scanExportPdfsCompat(opts || {})
})

/** 历史报表：单层文件夹+PDF 分页（010）；cwd 不得逃出 rootDir */
ipcMain.handle('scan-export-entries', async (_event, opts) => {
  return scanExportEntries(opts || {})
})

/** 历史报表分屏：左⇄右 复制/移动（022）；写入两侧均受各自 root 沙箱约束 */
ipcMain.handle('history-transfer', async (_event, opts) => {
  return transferHistoryItems(opts || {})
})

/** 可移动卷列表（插拔轮询由渲染进程调用；025：Win 含 USB/新盘符；031/032：async） */
ipcMain.handle('list-removable-volumes', async (_event, opts) => {
  try {
    if (opts && opts.resetBaseline) resetWinDriveBaseline()
    const detailed = await listRemovableVolumesDetailed()
    return {
      ok: true,
      volumes: detailed.volumes || [],
      error: detailed.error || undefined,
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e), volumes: [] }
  }
})

ipcMain.handle('delete-export-file', async (_event, opts) => {
  const filePath = opts && opts.filePath
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: '无效路径' }
  }
  const resolved = path.resolve(filePath)
  try {
    const st = await fs.promises.stat(resolved)
    if (!st.isFile()) {
      return { ok: false, error: '不是文件' }
    }
    await fs.promises.unlink(resolved)
    return { ok: true }
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
      return { ok: false, error: '文件不存在' }
    }
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

/** 历史报表缩略图：优先系统缩略图，否则返回 base64；全局并发 ≤2（032 P1-B） */
ipcMain.handle('get-export-pdf-thumbnail', async (_event, opts) => {
  return withThumbSlot(async () => {
    const filePath = opts && opts.filePath
    const maxBytes = 35 * 1024 * 1024
    if (!filePath || typeof filePath !== 'string') {
      return { ok: false, error: '缺少文件路径' }
    }
    const resolved = path.resolve(filePath)
    let st
    try {
      st = await fs.promises.stat(resolved)
    } catch (e) {
      if (e && e.code === 'ENOENT') return { ok: false, error: '文件不存在' }
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
      const buf = await fs.promises.readFile(resolved)
      return { ok: true, base64: buf.toString('base64') }
    } catch (e) {
      return { ok: false, error: `读取失败：${e.message || e}` }
    }
  })
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

/** 以 refWc（发起导出的窗口）的 http/file 源为准拼导出页 URL；否则回落 dev / dist */
function buildPdfExportUrl(refWc, hash) {
  const withHash = String(hash || '').startsWith('#') ? String(hash) : `#${hash}`
  try {
    if (refWc && !refWc.isDestroyed()) {
      const cur = String(refWc.getURL() || '')
      if (/^https?:\/\//i.test(cur)) {
        const u = new URL(cur)
        return `${u.origin}${u.pathname}${u.search}${withHash}`
      }
      if (/^file:/i.test(cur)) {
        return `${cur.split('#')[0]}${withHash}`
      }
    }
  } catch {
    /* ignore */
  }
  const loadDist =
    app.isPackaged ||
    Boolean(fiveTierExportSpec) ||
    ['1', 'true', 'yes'].includes(String(process.env.REPORT_EDITOR_LOAD_DIST || '').toLowerCase())
  if (!loadDist) {
    // 历史：dev 下传入 hash=`#/pdf-export?...`
    return `${VITE_DEV_URL}/${withHash}`
  }
  return `${pathToFileURL(getRendererIndexHtml()).href}${withHash}`
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

/**
 * 033：导航失败（如 ERR_FAILED）时销毁隐藏窗并冷启动新窗重试一次。
 * holder.win 在 loadURL 前更新，避免 ready 信号落到旧窗引用上。
 * @returns {Promise<boolean>} hotSwitched
 */
async function navigatePdfExportWindowWithRecovery(holder, targetUrl) {
  try {
    return await navigatePdfExportWindow(holder.win, targetUrl)
  } catch (e) {
    if (!isRecoverablePdfExportNavError(e)) throw e
    log(`PDF export navigate failed (${e && e.message ? e.message : e}); recreating window`)
    destroyPdfExportWindow(holder.win)
    holder.win = createPdfExportWindow()
    await holder.win.loadURL(targetUrl)
    return false
  }
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

function beginAppBackgroundLowPriority() {
  appBackgroundPriorityDepth += 1
  if (appBackgroundPriorityDepth !== 1) return
  // 与结批低优先级共用 os.setPriority；已在结批中则深度叠加即可
  try {
    const p = os.constants && os.constants.priority
    if (p && typeof os.setPriority === 'function') {
      os.setPriority(0, p.PRIORITY_BELOW_NORMAL)
    }
  } catch (e) {
    log(`background setPriority 失败（忽略）：${e.message}`)
  }
}

function endAppBackgroundLowPriority() {
  if (appBackgroundPriorityDepth <= 0) return
  appBackgroundPriorityDepth -= 1
  if (appBackgroundPriorityDepth !== 0) return
  if (pdfExportPriorityDepth > 0) return
  try {
    const p = os.constants && os.constants.priority
    if (p && typeof os.setPriority === 'function') {
      os.setPriority(0, p.PRIORITY_NORMAL)
    }
  } catch (e) {
    log(`background restore priority 失败（忽略）：${e.message}`)
  }
}

function publishAppResourceMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    mainWindow.webContents.send('app-resource-mode', {
      mode: appMainWindowBackgroundIdle ? 'background' : 'foreground',
    })
  } catch {
    /* ignore */
  }
}

function syncMainWindowBackgroundIdle() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    appMainWindowBackgroundIdle = true
    return
  }
  const idle =
    !mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused()
  if (idle === appMainWindowBackgroundIdle) return
  appMainWindowBackgroundIdle = idle
  if (idle) {
    // 后台：立刻拆掉空闲预热窗（进行中的导出窗不在 warm 池）
    destroyWarmPdfExportWindows()
    beginAppBackgroundLowPriority()
  } else {
    endAppBackgroundLowPriority()
    ensurePdfExportWindowPrewarmed(mainWindow.webContents)
  }
  publishAppResourceMode()
}

function trimWarmPdfExportWindows() {
  if (appMainWindowBackgroundIdle) {
    destroyWarmPdfExportWindows()
    return
  }
  const cap =
    pdfExportPrewarmPoolSize <= 0
      ? 0
      : Math.min(pdfExportPrewarmPoolSize, pdfExportMaxParallel, 2)
  while (warmPdfWins.length > cap) {
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
  if (appMainWindowBackgroundIdle) {
    destroyWarmPdfExportWindows()
    return
  }
  discardUnusableWarmPdfExportWindows()
  trimWarmPdfExportWindows()
  if (pdfExportPrewarmPoolSize <= 0) {
    destroyWarmPdfExportWindows()
    return
  }
  const targetPoolSize = Math.min(pdfExportPrewarmPoolSize, pdfExportMaxParallel, 2)
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
  pdfExportMaxParallel = resolvePdfExportMaxParallel(
    Number.isFinite(max) ? max : PDF_EXPORT_DEFAULT_MAX_PARALLEL,
  )
  drainPdfExportSlotWaiters()
  trimWarmPdfExportWindows()
  ensurePdfExportWindowPrewarmed()
  return {
    max: pdfExportMaxParallel,
    cpuBudget: cpuBudgetMaxParallel(os.cpus().length),
    logicalCores: os.cpus().length,
  }
})

/** 035：按导出性能档位设置预热池 / 分卷 yield / 并行 */
ipcMain.handle('pdf-export-set-perf-profile', (_event, opts) => {
  const pool = Math.floor(Number(opts && opts.prewarmPoolSize))
  if (Number.isFinite(pool) && pool >= 0) {
    pdfExportPrewarmPoolSize = Math.min(4, pool)
  }
  const yieldMs = Math.floor(Number(opts && opts.yieldMs))
  if (Number.isFinite(yieldMs) && yieldMs >= 0) {
    pdfExportPartYieldMs = Math.min(2000, yieldMs)
  }
  const max = Math.floor(Number(opts && opts.maxParallel))
  if (Number.isFinite(max) && max >= 1) {
    pdfExportMaxParallel = resolvePdfExportMaxParallel(max)
    drainPdfExportSlotWaiters()
  }
  trimWarmPdfExportWindows()
  if (pdfExportPrewarmPoolSize <= 0) destroyWarmPdfExportWindows()
  else ensurePdfExportWindowPrewarmed()
  return {
    prewarmPoolSize: pdfExportPrewarmPoolSize,
    yieldMs: pdfExportPartYieldMs,
    maxParallel: pdfExportMaxParallel,
  }
})

ipcMain.handle('pdf-export-cancel', async (_event, opts) => {
  const jobId = opts && typeof opts.jobId === 'string' ? opts.jobId : ''
  if (!jobId) return { ok: false, error: '缺少 jobId' }
  const found = cancelPdfExportJob(jobId)
  return { ok: found, cancelled: found }
})

async function handlePdfExportRun(event, opts) {
  const filePath = opts && opts.filePath
  const templateId = opts && opts.templateId
  const openAfter = Boolean(opts && opts.openAfter)
  const engineRaw = opts && opts.engine
  // 034 M11：缺省 / 未知 → chromium（预览级）；仅显式 pdf-lib 走草稿
  const engineNorm = String(engineRaw || '')
    .trim()
    .toLowerCase()
  const exportEngine =
    engineNorm === 'pdf-lib' || engineNorm === 'pdflib' || engineNorm === 'vector'
      ? 'pdf-lib'
      : 'chromium'
  const exportMode = exportEngine === 'pdf-lib' ? 'coexist' : 'fidelity'
  // 让核力度：缺省按最强 full（渲染进程 IDLE）——现场弱 CPU 保 mappView；仅档 4 传 basic
  const coexistPause = String((opts && opts.coexistPause) || 'full').toLowerCase() === 'basic' ? 'basic' : 'full'
  const jobYieldRaw = Math.floor(Number(opts && opts.yieldMs))
  const jobYieldMs =
    Number.isFinite(jobYieldRaw) && jobYieldRaw >= 0
      ? Math.min(2000, jobYieldRaw)
      : pdfExportPartYieldMs
  const jobId =
    opts && typeof opts.jobId === 'string' && opts.jobId.trim()
      ? opts.jobId.trim()
      : `pdf-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (!filePath || typeof filePath !== 'string') throw new Error('缺少 filePath')
  if (!templateId || typeof templateId !== 'string') throw new Error('缺少 templateId')

  registerPdfExportJob(jobId)
  // 039：导出期弹全屏遮罩盖住同机 mappView（默认开，可 Esc / 角落关 / 120s 超时）
  beginExportOverlaySession()

  return runPdfExportWithSlot(async () => {
    let pdfWin = null
    let exportOk = false
    try {
      function throwIfCancelled() {
        if (isPdfExportCancelled(jobId)) {
          throw new Error('导出已取消')
        }
      }
      throwIfCancelled()

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
        // 039：同步喂给全屏遮罩（第 x/共 y 份）
        try {
          pushExportOverlayProgress({ ...payload, templateId })
        } catch {
          /* ignore */
        }
      }

      /** seq 保证 hash 每次都变化：热切换时可靠触发导出页的路由监听重新取数 */
      const layoutFidelityRaw = opts && opts.layoutFidelity
      const layoutFidelity =
        exportEngine === 'pdf-lib' &&
        String(layoutFidelityRaw || '')
          .trim()
          .toLowerCase() === 'layout-v2'
          ? 'layout-v2'
          : exportEngine === 'pdf-lib'
            ? 'draft-v1'
            : 'print-to-pdf'

      const allowBindingIssues = Boolean(opts && opts.allowBindingIssues)

      function partHash(partIndex) {
        const allowQ = allowBindingIssues ? '&allowBindingIssues=1' : ''
        return `#/pdf-export?templateId=${encodeURIComponent(templateId)}&reportPartIndex=${partIndex}&engine=${encodeURIComponent(exportEngine)}&layoutFidelity=${encodeURIComponent(layoutFidelity)}${allowQ}&seq=${Date.now()}`
      }

      // 优先复用预热窗口：SPA 已启动，进入取数只差一次 hash 切换
      pdfWin = acquirePdfExportWindow()
      const warmStart = Boolean(pdfWin.webContents.getURL())
      /** 033：导航恢复时同步替换引用，供 ready 过滤与 finally 回收 */
      const pdfWinHolder = {
        get win() {
          return pdfWin
        },
        set win(w) {
          pdfWin = w
        },
      }

      // 现场让核：把真正吃 CPU 的渲染进程（+ 后端）降优先级；重建窗后需重新施加
      function applyRenderCoexistPriority() {
        const w = pdfWinHolder.win
        if (w && !w.isDestroyed()) {
          applyExportProcessCoexistPriority(w.webContents, coexistPause)
        }
      }
      applyRenderCoexistPriority()

      /** 渲染窗口取数期间每 10 秒发一次心跳：连续 2 分钟无心跳视为无响应；总时长上限 10 分钟 */
      const RENDER_IDLE_TIMEOUT_MS = 120000
      const RENDER_TOTAL_CAP_MS = 600000

      async function renderPart(partIndex) {
        throwIfCancelled()
        // 每份开始前重申渲染进程优先级（复用/重建窗后 pid 可能变）
        applyRenderCoexistPriority()
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
            const w = pdfWinHolder.win
            if (!w || w.isDestroyed()) return false
            return senderBrowserWindow(ev.sender) === w
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
        // 033：ERR_FAILED 等可恢复错误 → 销毁窗冷启动重试一次。
        const payload = await new Promise((resolve, reject) => {
          readyPromise.then(resolve, reject)
          navigatePdfExportWindowWithRecovery(pdfWinHolder, targetUrl)
            .then((hotSwitched) => {
              // 导航后（含 033 恢复重建的新窗）重申渲染进程优先级，趁 CPU 密集渲染前生效
              applyRenderCoexistPriority()
              if (!hotSwitched) return
              hotNavFallbackTimer = setTimeout(() => {
                if (flags.rendererSignal || flags.hotNavFellBack) return
                const w = pdfWinHolder.win
                if (!w || w.isDestroyed()) return
                flags.hotNavFellBack = true
                log('PDF export hot hash-switch silent; falling back to full page load')
                w.loadURL(targetUrl).catch((err) => {
                  if (!isRecoverablePdfExportNavError(err)) return
                  log(`PDF export hot-nav fallback failed (${err.message}); recreating window`)
                  destroyPdfExportWindow(pdfWinHolder.win)
                  pdfWinHolder.win = createPdfExportWindow()
                  pdfWinHolder.win.loadURL(targetUrl).catch(() => {})
                  applyRenderCoexistPriority()
                })
              }, HOT_NAV_FALLBACK_MS)
            })
            .catch(reject)
        })
        const readyMs = Date.now() - navStartMs
        if (!payload || !payload.ok) {
          const baseErr = (payload && payload.error) || 'PDF render failed'
          const diag = payload && payload.diagnostics
          if (diag && typeof diag === 'object') {
            let diagJson = ''
            try {
              diagJson = JSON.stringify(diag)
            } catch {
              diagJson = ''
            }
            if (diagJson) {
              throw new Error(`${baseErr}\n\n---EXPORT_DIAGNOSTICS---\n${diagJson}`)
            }
          }
          throw new Error(baseErr)
        }

        const printStartMs = Date.now()
        let pdfBuffer
        let printMs = 0
        let engineMeta = {
          engine: exportEngine,
          exportMode,
          printToPDFSkipped: false,
        }
        if (payload.pdfBase64 && typeof payload.pdfBase64 === 'string') {
          pdfBuffer = Buffer.from(payload.pdfBase64, 'base64')
          printMs = Number(payload.pdfLibMs) || Date.now() - printStartMs
          engineMeta = {
            engine: payload.engine || 'pdf-lib',
            exportMode: payload.exportMode || 'coexist',
            layoutFidelity: payload.layoutFidelity || 'draft-v1',
            fontFamily: payload.fontFamily || null,
            fontEmbedded: Boolean(payload.fontEmbedded),
            pageCount: Number(payload.pageCount) || 0,
            pdfLibMs: Number(payload.pdfLibMs) || printMs,
            printToPDFSkipped: true,
          }
        } else {
          pdfBuffer = await pdfWin.webContents.printToPDF({
            landscape: false,
            printBackground: true,
            marginsType: 1,
            pageRanges: '',
            preferCSSPageSize: true,
          })
          printMs = Date.now() - printStartMs
          engineMeta = {
            engine: 'chromium',
            exportMode: 'fidelity',
            printToPDFSkipped: false,
          }
        }
        pdfWin.__exportUses = (pdfWin.__exportUses || 0) + 1
        return {
          pdfBuffer,
          totalReports: Math.max(1, Math.floor(Number(payload.totalReports) || 1)),
          stats: payload.stats || null,
          phases: payload.phases && typeof payload.phases === 'object' ? payload.phases : null,
          readyMs,
          printMs,
          engineMeta,
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
      let engineAudit = {
        engine: exportEngine,
        exportMode,
        printToPDFSkipped: exportEngine === 'pdf-lib',
      }

      function mergeTimings(part) {
        timings.readyMs += Number(part.readyMs) || 0
        timings.printMs += Number(part.printMs) || 0
        if (part.phases) {
          timings.dataMs += Number(part.phases.dataMs) || 0
        }
        if (part.engineMeta && typeof part.engineMeta === 'object') {
          engineAudit = { ...engineAudit, ...part.engineMeta }
        }
      }

      async function writePartPdf(partIndex, totalReports, pdfBuffer) {
        throwIfCancelled()
        const outPath = outputPathForPart(partIndex, totalReports)
        const writeStartMs = Date.now()
        await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
        await fs.promises.writeFile(outPath, pdfBuffer)
        timings.writeMs += Date.now() - writeStartMs
        return outPath
      }

      sendProgress({ phase: 'render', partIndex: 0, totalReports: 0 })
      const first = await renderPart(0)
      const totalReports = first.totalReports
      stats = mergeStats(stats, first.stats)
      mergeTimings(first)
      const filePaths = []
      filePaths.push(await writePartPdf(0, totalReports, first.pdfBuffer))
      sendProgress({ phase: 'saved', partIndex: 0, totalReports })

      for (let partIndex = 1; partIndex < totalReports; partIndex++) {
        throwIfCancelled()
        // 030：分卷间隙让出 CPU，减轻 Hypervisor/同机 mappView 饿死
        await yieldToOs(jobYieldMs)
        sendProgress({ phase: 'render', partIndex, totalReports })
        const part = await renderPart(partIndex)
        stats = mergeStats(stats, part.stats)
        mergeTimings(part)
        filePaths.push(await writePartPdf(partIndex, totalReports, part.pdfBuffer))
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
        engine: engineAudit.engine || exportEngine,
        exportMode: engineAudit.exportMode || exportMode,
        engineMeta: engineAudit,
        durationMs: Date.now() - startedAtMs,
      }
    } catch (e) {
      throw new Error(humanizePdfExportError(e, { phase: 'export' }))
    } finally {
      unregisterPdfExportJob(jobId)
      // 039：本次导出结束，计数归 0 时收起遮罩（与 begin 对称）
      endExportOverlaySession()
      // 导出结束：把渲染进程（归还池的窗）与后端恢复 NORMAL，避免让核状态长期残留
      try {
        if (pdfWin && !pdfWin.isDestroyed()) {
          restoreExportProcessCoexistPriority(pdfWin.webContents)
        } else {
          restoreExportProcessCoexistPriority(null)
        }
      } catch {
        /* ignore */
      }
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
}

ipcMain.handle('pdf-export-run', (event, opts) => handlePdfExportRun(event, opts))

// 035：五档批导历史批次数上限（同时间戳的 summary_ / tierN_ 算一批）
const FIVE_TIER_EXPORT_HISTORY_KEEP = 5

/**
 * 导出目录只保留最近 keep 批（按文件名时间戳 YYYY-MM-DDTHH-mm-ss）。
 * 不删 _preview 等调试子目录。
 */
async function pruneFiveTierExportHistory(outDir, keep = FIVE_TIER_EXPORT_HISTORY_KEEP) {
  const nKeep = Math.max(1, Math.floor(Number(keep) || FIVE_TIER_EXPORT_HISTORY_KEEP))
  let names
  try {
    names = await fs.promises.readdir(outDir)
  } catch {
    return { kept: 0, dropped: 0, removedFiles: 0 }
  }
  const stampRe = /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/
  const stamps = new Set()
  for (const name of names) {
    if (!name.startsWith('summary_') && !/^tier\d+_/.test(name)) continue
    const m = stampRe.exec(name)
    if (m) stamps.add(m[1])
  }
  const ordered = [...stamps].sort().reverse()
  const drop = ordered.slice(nKeep)
  let removedFiles = 0
  for (const stamp of drop) {
    for (const name of names) {
      if (!name.includes(stamp)) continue
      if (!name.startsWith('summary_') && !/^tier\d+_/.test(name)) continue
      try {
        await fs.promises.unlink(path.join(outDir, name))
        removedFiles += 1
      } catch {
        /* ignore */
      }
    }
  }
  return { kept: Math.min(ordered.length, nKeep), dropped: drop.length, removedFiles }
}

/** 035：五档对照导出。env REPORT_EDITOR_FIVE_TIER_EXPORT=templateId|outDir */
async function runFiveTierExportBatch(spec) {
  const parts = String(spec || '').split('|')
  const templateId = (parts[0] || '').trim()
  const outDir = (parts[1] || '').trim() || path.join(os.tmpdir(), 'report-editor-five-tier-exports')
  if (!templateId) throw new Error('REPORT_EDITOR_FIVE_TIER_EXPORT 缺少 templateId')
  fs.mkdirSync(outDir, { recursive: true })
  const tiers = [
    { tier: 0, label: '仅内容', engine: 'pdf-lib', layoutFidelity: 'draft-v1', yieldMs: 200 },
    { tier: 1, label: '矢量版式', engine: 'pdf-lib', layoutFidelity: 'layout-v2', yieldMs: 200 },
    { tier: 2, label: '预览稳', engine: 'chromium', layoutFidelity: 'print-to-pdf', yieldMs: 200 },
    { tier: 3, label: '功能折中', engine: 'chromium', layoutFidelity: 'print-to-pdf', yieldMs: 80 },
    { tier: 4, label: '不妥协', engine: 'chromium', layoutFidelity: 'print-to-pdf', yieldMs: 40 },
  ]
  const sender = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null
  if (!sender) throw new Error('主窗口未就绪')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const results = []
  for (const t of tiers) {
    const safeLabel = t.label.replace(/[\\/:*?"<>|]/g, '_')
    const filePath = path.join(outDir, `tier${t.tier}_${safeLabel}_${stamp}.pdf`)
    log(`五档批导：档 ${t.tier} ${t.label} → ${filePath}`)
    try {
      // 按档设置预热/yield（与 UI 一致）；0.3.140 起档 2 也保留 1 预热窗（免冷启动）
      pdfExportPrewarmPoolSize = t.tier >= 4 ? 2 : t.tier >= 2 ? 1 : 0
      pdfExportPartYieldMs = t.yieldMs
      trimWarmPdfExportWindows()
      const res = await handlePdfExportRun(
        { sender },
        {
          templateId,
          filePath,
          openAfter: false,
          engine: t.engine,
          layoutFidelity: t.layoutFidelity,
          yieldMs: t.yieldMs,
          // 让核力度：仅档 4「不妥协」basic，其余 full（渲染进程 IDLE）
          coexistPause: t.tier >= 4 ? 'basic' : 'full',
          // 对照批导：离线 OPC/SQL 失败仍出 PDF，便于比五档版式
          allowBindingIssues: true,
          jobId: `five-tier-${t.tier}-${Date.now()}`,
        },
      )
      results.push({ ...t, ok: true, filePath: res.filePath || filePath, engine: res.engine, exportMode: res.exportMode })
      log(`五档批导：档 ${t.tier} 完成`)
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      results.push({ ...t, ok: false, error: msg, filePath })
      log(`五档批导：档 ${t.tier} 失败：${msg}`)
    }
  }
  const summaryPath = path.join(outDir, `summary_${stamp}.json`)
  await fs.promises.writeFile(summaryPath, JSON.stringify({ templateId, outDir, results }, null, 2), 'utf8')
  log(`五档批导完成：${summaryPath}`)
  try {
    const pruned = await pruneFiveTierExportHistory(outDir, FIVE_TIER_EXPORT_HISTORY_KEEP)
    if (pruned.dropped > 0) {
      log(
        `五档批导：已清理旧历史 ${pruned.dropped} 批（${pruned.removedFiles} 个文件），保留最近 ${pruned.kept} 批`,
      )
    }
  } catch (e) {
    log(`五档批导：清理旧历史失败（忽略）：${e && e.message ? e.message : e}`)
  }
  await finishFiveTierExportAndExit(outDir)
}

/**
 * 038：批导收尾勿走 app.quit()——Windows 上 Chromium 析构常 0xC0000005，
 * 且会盖掉 process.exit(0) 的退出码。卸掉 quit 钩子后硬退；并写 .five-tier-exit 供脚本认成功。
 */
async function finishFiveTierExportAndExit(outDir, exitCode = 0) {
  isQuitting = true
  const code = Number.isFinite(Number(exitCode)) ? Math.floor(Number(exitCode)) : 1
  if (outDir) {
    try {
      fs.writeFileSync(path.join(outDir, '.five-tier-exit'), String(code), 'utf8')
    } catch {
      /* ignore */
    }
  }
  try {
    destroyAppTray()
  } catch {
    /* ignore */
  }
  try {
    killPython()
  } catch {
    /* ignore */
  }
  try {
    app.removeAllListeners('before-quit')
    app.removeAllListeners('will-quit')
    app.removeAllListeners('quit')
    app.removeAllListeners('window-all-closed')
  } catch {
    /* ignore */
  }
  try {
    log(`五档批导：app.exit(${code})（038 卸钩子硬退）`)
  } catch {
    /* ignore */
  }
  try {
    app.exit(code)
  } catch {
    /* ignore */
  }
  process.exit(code)
}

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

ipcMain.handle('launch-settings-get', () => {
  const settings = readLaunchSettings(app)
  return {
    ...settings,
    packaged: app.isPackaged,
    silentStartSession: Boolean(silentStartSession),
    execPath: process.execPath,
  }
})

ipcMain.handle('launch-settings-set', (_event, patch) => {
  const p = patch || {}
  const next = writeLaunchSettings(app, p)
  // 仅改 exportOverlayEnabled 等非自启字段时不要碰 HKCU\Run：
  // 关自启 + 注册表项本就不存在时，reg delete 的中文报错曾被 UTF-8 误读成乱码「登录项同步失败」。
  const touchLogin = patchTouchesLoginItem(p) && !fiveTierExportSpec
  const applied = touchLogin
    ? applyLoginItem(app, next)
    : {
        execPath: process.execPath,
        loginCommand: null,
        applied: false,
        skipped: false,
        error: null,
        removedLegacy: [],
      }
  return {
    ...next,
    packaged: app.isPackaged,
    silentStartSession: Boolean(silentStartSession),
    execPath: applied.execPath,
    loginCommand: applied.loginCommand,
    loginApplied: applied.applied,
    loginSkipped: applied.skipped,
    loginError: applied.error,
    loginRemovedLegacy: applied.removedLegacy || [],
  }
})

app.whenReady().then(async () => {
  log('Starting application...')

  silentStartSession = shouldSilentStartThisSession(app, process.argv)
  try {
    // 037：五档批导等旁路勿改系统登录项；正常启动校正死链/无引号
    const sync = syncLoginItemOnReady(app, { skip: Boolean(fiveTierExportSpec) })
    if (Array.isArray(sync.removedLegacy) && sync.removedLegacy.length) {
      log(`Removed legacy autostart entries: ${sync.removedLegacy.join(', ')}`)
    }
    if (sync.error) log(`syncLoginItemOnReady: ${sync.error}`)
    else if (sync.applied) log(`Login item synced: ${sync.loginCommand || '(cleared)'}`)
    else if (sync.skipped) log('Login item sync skipped')
  } catch (e) {
    log(`applyLoginItem failed (ignore): ${e.message}`)
  }
  if (silentStartSession) {
    log('Silent start session: main window hidden, tray enabled')
    ensureAppTray()
  }

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.brteam.sd_sma.report_editor_ai')
  }

  // 字体选择器：允许 Local Font Access API（queryLocalFonts）
  // Chromium 走 setPermissionCheckHandler（同步），不一定进 RequestHandler
  try {
    const allowLocalFonts = (permission) =>
      permission === 'local-fonts' || permission === 'font-access'
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      if (allowLocalFonts(permission)) return true
      return true
    })
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(true)
    })
  } catch (e) {
    log(`local-fonts permission handler 安装失败（忽略）：${e.message}`)
  }

  // 防止系统挂起本应用（macOS App Nap / Windows 后台省电），
  // 保证最小化或后台运行时 OPC UA 自动结批仍每秒轮询；不阻止屏幕熄灭。
  try {
    powerSaveBlocker.start('prevent-app-suspension')
  } catch (e) {
    log(`powerSaveBlocker 启动失败（忽略）：${e.message}`)
  }

  // 先拉起后端并等到健康，再开窗口，避免模版页首拉打到未就绪端口后被离线空列表「钉死」
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

  try {
    await waitForBackend()
    log('Backend is ready for renderer requests')
  } catch (e) {
    log(`Warning: ${e.message} — opening renderer with local cached data`)
  }

  createWindow()

  // 预热窗口保活：结批可能间隔数天，长期驻留的渲染进程可能被系统回收/崩溃，
  // 定期检查并重建，保证下一次结批仍能热启动
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (appMainWindowBackgroundIdle) return
    const hasUnavailableWindow = warmPdfWins.some((win) => !isReusablePdfWindow(win))
    if (
      pdfExportPrewarmPoolSize > 0 &&
      (hasUnavailableWindow ||
        warmPdfWins.length < Math.min(pdfExportPrewarmPoolSize, pdfExportMaxParallel, 2))
    ) {
      log('PDF export warm window pool unavailable; re-prewarming')
      ensurePdfExportWindowPrewarmed(mainWindow.webContents)
    }
  }, 5 * 60 * 1000)
})

app.on('window-all-closed', () => {
  if (silentStartSession && !isQuitting) {
    // 静默会话：主窗口关闭后仍由托盘保活，不杀后端
    return
  }
  killPython()
  // macOS 默认可驻留托盘；为使「关掉开发窗口」与 Windows 一致、并释放 8000，这里直接 quit。
  app.quit()
})

// macOS：点 Dock 图标会触发 activate。静默启动时窗口是 hide 的，若不处理则用户无法再打开界面。
app.on('activate', () => {
  if (isQuitting) return
  showMainWindowFromTray()
  if (silentStartSession) ensureAppTray()
})

app.on('before-quit', () => {
  isQuitting = true
  destroyAppTray()
  killPython()
})
