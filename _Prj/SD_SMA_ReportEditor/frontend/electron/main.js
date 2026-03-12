const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

let mainWindow
let pythonProcess

const BACKEND_PORT = 8000
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`
const VITE_DEV_URL = 'http://localhost:5173'

function log(msg) {
  console.log(`[Electron] ${msg}`)
}

function findPython() {
  const backendDir = path.join(__dirname, '..', '..', 'backend')
  const venvPython = path.join(backendDir, 'venv', 'Scripts', 'python.exe')

  const fs = require('fs')
  if (fs.existsSync(venvPython)) {
    log(`Using venv Python: ${venvPython}`)
    return venvPython
  }
  log('Using system Python')
  return 'python'
}

function startPythonBackend() {
  const backendDir = path.join(__dirname, '..', '..', 'backend')
  const pythonExe = findPython()

  pythonProcess = spawn(pythonExe, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
    cwd: backendDir,
    stdio: 'pipe',
  })

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

function waitForBackend(maxRetries = 30, interval = 500) {
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
