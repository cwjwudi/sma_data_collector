const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')

let mainWindow
let pythonProcess
/** 若为 true：由本 Electron 拉起的后端，exit 时需 kill（避免误杀外部 uvicorn）。 */
let backendStartedByElectron = false

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
  return path.join(getBackendDir(), 'report_backend.exe')
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'SD_SMA ReportEditor',
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

app.whenReady().then(async () => {
  log('Starting application...')

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
