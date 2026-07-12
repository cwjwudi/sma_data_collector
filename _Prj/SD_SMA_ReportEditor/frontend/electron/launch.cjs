/**
 * 开机自启 / 静默启动偏好（Electron userData/launch-settings.json）。
 */
const fs = require('fs')
const path = require('path')

const SILENT_START_ARG = '--silent-start'

const DEFAULTS = {
  openAtLogin: false,
  silentStart: false,
}

function getSettingsPath(app) {
  return path.join(app.getPath('userData'), 'launch-settings.json')
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    openAtLogin: Boolean(src.openAtLogin),
    silentStart: Boolean(src.silentStart),
  }
}

function readLaunchSettings(app) {
  const p = getSettingsPath(app)
  try {
    if (!fs.existsSync(p)) return { ...DEFAULTS }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return normalizeSettings(raw)
  } catch {
    return { ...DEFAULTS }
  }
}

function writeLaunchSettings(app, patch) {
  const next = normalizeSettings({ ...readLaunchSettings(app), ...(patch || {}) })
  const p = getSettingsPath(app)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/**
 * 将偏好同步到系统登录项。
 * @param {import('electron').App} app
 * @param {{ openAtLogin?: boolean, silentStart?: boolean }} settings
 */
function applyLoginItem(app, settings) {
  const s = normalizeSettings(settings)
  try {
    if (!app.isPackaged) {
      // 开发态仍写盘，但不改登录项，避免把 electron.exe 挂到开机启动
      return s
    }
    const opts = {
      openAtLogin: s.openAtLogin,
      openAsHidden: Boolean(s.openAtLogin && s.silentStart),
      path: process.execPath,
      args: s.openAtLogin && s.silentStart ? [SILENT_START_ARG] : [],
    }
    app.setLoginItemSettings(opts)
  } catch (e) {
    console.warn('[launch] setLoginItemSettings failed:', e?.message || e)
  }
  return s
}

/**
 * 本次进程是否应按静默方式启动（隐藏主窗口 + 托盘）。
 * 勾选 silentStart 后任意启动方式均静默（含手动双击）；argv / 登录项判断保留作兼容。
 * @param {import('electron').App} app
 * @param {string[]} [argv]
 */
function shouldSilentStartThisSession(app, argv = process.argv) {
  const args = Array.isArray(argv) ? argv : []
  if (args.includes(SILENT_START_ARG)) return true
  try {
    if (readLaunchSettings(app).silentStart) return true
    const lis = app.getLoginItemSettings()
    // 偏好文件缺失时的兜底：系统以隐藏方式打开登录项
    if (lis && lis.wasOpenedAsHidden) return true
  } catch {
    /* ignore */
  }
  return false
}

module.exports = {
  SILENT_START_ARG,
  DEFAULTS,
  readLaunchSettings,
  writeLaunchSettings,
  applyLoginItem,
  shouldSilentStartThisSession,
  normalizeSettings,
}
