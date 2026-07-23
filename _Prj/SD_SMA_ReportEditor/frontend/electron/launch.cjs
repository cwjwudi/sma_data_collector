/**
 * 开机自启 / 静默启动偏好（Electron userData/launch-settings.json）。
 * 037：Windows Run 必须对含空格 path 加引号；启动时用当前 execPath 校正死链。
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const SILENT_START_ARG = '--silent-start'
/** 与 package.json appId / setAppUserModelId 一致，保证登录项值名稳定 */
const LOGIN_ITEM_NAME = 'com.brteam.sd_sma.report_editor_ai'
const WIN_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'

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

function hasLaunchSettingsFile(app) {
  try {
    return fs.existsSync(getSettingsPath(app))
  } catch {
    return false
  }
}

function writeLaunchSettings(app, patch) {
  const next = normalizeSettings({ ...readLaunchSettings(app), ...(patch || {}) })
  const p = getSettingsPath(app)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/** Windows 命令行参数加引号（已有成对引号则原样）。 */
function quoteWinArg(value) {
  const s = String(value ?? '')
  if (!s) return '""'
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s
  return `"${s.replace(/"/g, '\\"')}"`
}

/**
 * 组装 Run 键命令：始终给 exe 加引号，避免空格路径被截断。
 * @param {string} execPath
 * @param {string[]} [args]
 */
function formatQuotedLaunchCommand(execPath, args = []) {
  const exe = quoteWinArg(execPath)
  const rest = (Array.isArray(args) ? args : [])
    .map((a) => String(a))
    .filter(Boolean)
    .map((a) => (/[\s"]/.test(a) ? quoteWinArg(a) : a))
  return rest.length ? `${exe} ${rest.join(' ')}` : exe
}

function readWindowsRunKey(valueName = LOGIN_ITEM_NAME) {
  if (process.platform !== 'win32') return null
  try {
    const r = spawnSync(
      'reg',
      ['query', WIN_RUN_KEY, '/v', valueName],
      { encoding: 'utf8', windowsHide: true },
    )
    if (r.status !== 0 || !r.stdout) return null
    // REG_SZ    value...
    const lines = String(r.stdout).split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/REG_SZ\s+(.+)$/i)
      if (m) return m[1].trim()
    }
  } catch {
    /* ignore */
  }
  return null
}

function syncWindowsRunKey(valueName, commandOrNull) {
  if (process.platform !== 'win32') return { ok: true }
  try {
    if (!commandOrNull) {
      const r = spawnSync(
        'reg',
        ['delete', WIN_RUN_KEY, '/v', valueName, '/f'],
        { encoding: 'utf8', windowsHide: true },
      )
      // 不存在时 reg 返回 1，视为已关闭成功
      if (r.status !== 0 && !/unable to find|找不到|ERROR: The system was unable/i.test(String(r.stderr || r.stdout || ''))) {
        return { ok: false, error: String(r.stderr || r.stdout || `reg delete exit ${r.status}`).trim() }
      }
      return { ok: true }
    }
    const r = spawnSync(
      'reg',
      ['add', WIN_RUN_KEY, '/v', valueName, '/t', 'REG_SZ', '/d', commandOrNull, '/f'],
      { encoding: 'utf8', windowsHide: true },
    )
    if (r.status !== 0) {
      return { ok: false, error: String(r.stderr || r.stdout || `reg add exit ${r.status}`).trim() }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * 将偏好同步到系统登录项。
 * @param {import('electron').App} app
 * @param {{ openAtLogin?: boolean, silentStart?: boolean }} settings
 * @param {{ skip?: boolean }} [opts]
 * @returns {{ openAtLogin: boolean, silentStart: boolean, applied: boolean, skipped: boolean, error: string|null, execPath: string, loginCommand: string|null, packaged: boolean }}
 */
function applyLoginItem(app, settings, opts = {}) {
  const s = normalizeSettings(settings)
  const packaged = Boolean(app?.isPackaged)
  const result = {
    ...s,
    applied: false,
    skipped: false,
    error: null,
    execPath: process.execPath,
    loginCommand: null,
    packaged,
  }

  if (opts.skip) {
    result.skipped = true
    return result
  }

  try {
    if (!packaged) {
      // 开发态仍写盘，但不改登录项，避免把 electron.exe 挂到开机启动
      return result
    }

    const exe = process.execPath
    const args = s.openAtLogin && s.silentStart ? [SILENT_START_ARG] : []
    const loginCommand = s.openAtLogin ? formatQuotedLaunchCommand(exe, args) : null
    result.loginCommand = loginCommand
    result.execPath = exe

    if (s.openAtLogin && !fs.existsSync(exe)) {
      result.error = `可执行文件不存在: ${exe}`
      return result
    }

    const electronOpts = {
      openAtLogin: s.openAtLogin,
      openAsHidden: Boolean(s.openAtLogin && s.silentStart),
      path: exe,
      args,
      name: LOGIN_ITEM_NAME,
    }
    app.setLoginItemSettings(electronOpts)

    if (process.platform === 'win32') {
      // Electron 34 写入的 Run 值可能无引号 → 用 reg 覆盖为带引号命令（037）
      const synced = syncWindowsRunKey(LOGIN_ITEM_NAME, loginCommand)
      if (!synced.ok) {
        result.error = synced.error || '写入登录项失败'
        return result
      }
      const verified = readWindowsRunKey(LOGIN_ITEM_NAME)
      if (s.openAtLogin) {
        const okQuoted = Boolean(verified && verified.trimStart().startsWith('"'))
        const okPath = Boolean(verified && verified.includes(exe))
        if (!okQuoted || !okPath) {
          result.error = `登录项校验失败（需带引号且指向当前 exe）。当前: ${verified || '(空)'}`
          return result
        }
        result.applied = true
      } else {
        if (verified) {
          result.error = `关闭自启后登录项仍残留: ${verified}`
          return result
        }
        result.applied = true
      }
    } else {
      result.applied = true
    }
  } catch (e) {
    result.error = e?.message || String(e)
    console.warn('[launch] setLoginItemSettings failed:', result.error)
  }
  return result
}

/**
 * 启动时同步登录项：校正死链；偏好文件缺失时勿用 defaults 清掉残留 Run。
 * @param {import('electron').App} app
 * @param {{ skip?: boolean }} [opts]
 */
function syncLoginItemOnReady(app, opts = {}) {
  if (opts.skip) {
    return applyLoginItem(app, readLaunchSettings(app), { skip: true })
  }
  if (!app.isPackaged) {
    return applyLoginItem(app, readLaunchSettings(app))
  }

  const hasFile = hasLaunchSettingsFile(app)
  const settings = readLaunchSettings(app)

  if (!hasFile && !settings.openAtLogin && process.platform === 'win32') {
    const existing = readWindowsRunKey(LOGIN_ITEM_NAME)
    if (existing) {
      // AppData 偏好丢失但 Run 仍在：视为曾开自启，恢复 json 并用当前 exe 校正
      const silent = existing.includes(SILENT_START_ARG)
      const restored = writeLaunchSettings(app, { openAtLogin: true, silentStart: silent })
      return applyLoginItem(app, restored)
    }
    // 无偏好文件、无 Run：不要 setLoginItemSettings(false) 去碰系统
    return {
      ...settings,
      applied: false,
      skipped: true,
      error: null,
      execPath: process.execPath,
      loginCommand: null,
      packaged: true,
    }
  }

  return applyLoginItem(app, settings)
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
  LOGIN_ITEM_NAME,
  DEFAULTS,
  readLaunchSettings,
  writeLaunchSettings,
  hasLaunchSettingsFile,
  applyLoginItem,
  syncLoginItemOnReady,
  shouldSilentStartThisSession,
  normalizeSettings,
  quoteWinArg,
  formatQuotedLaunchCommand,
  readWindowsRunKey,
  syncWindowsRunKey,
}
