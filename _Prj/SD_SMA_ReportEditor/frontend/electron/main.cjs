const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')

let mainWindow
let pythonProcess

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
  const venvPython = path.join(backendDir, 'venv', 'Scripts', 'python.exe')

  if (fs.existsSync(venvPython)) {
    log(`Using venv Python: ${venvPython}`)
    return { cmd: venvPython }
  }
  log('Using system Python')
  return { cmd: 'python' }
}

function startPythonBackend() {
  const backendDir = getBackendDir()
  const dataDir = getReportEditorDataDir()
  fs.mkdirSync(dataDir, { recursive: true })
  log(`REPORT_EDITOR_DATA_DIR=${dataDir}`)

  const env = {
    ...process.env,
    REPORT_EDITOR_DATA_DIR: dataDir,
    // 避免 Windows 旧版 conhost 把 ANSI 当乱码；与 dev_uvicorn.ps1 行为一致
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    PYTHONUTF8: '1',
  }

  if (app.isPackaged) {
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
      stdio: 'pipe',
    })
  }

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`)
  })

  pythonProcess.stderr.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`)
  })

  pythonProcess.on('error', (err) => {
    console.error(`[Python] Failed to start: ${err.message}`)
  })

  pythonProcess.on('close', (code) => {
    log(`Python backend exited with code ${code}`)
    pythonProcess = null
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
    },
  })

  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function killPython() {
  if (pythonProcess) {
    log('Stopping Python backend...')
    pythonProcess.kill()
    pythonProcess = null
  }
}

app.whenReady().then(async () => {
  log('Starting application...')
  startPythonBackend()

  try {
    await waitForBackend()
  } catch (e) {
    log(`Warning: ${e.message} — opening window anyway`)
  }

  createWindow()
})

app.on('window-all-closed', () => {
  killPython()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killPython()
})
