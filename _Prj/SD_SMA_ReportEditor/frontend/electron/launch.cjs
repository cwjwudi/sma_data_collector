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
  // 039：导出/结批时全屏遮罩盖住同机 mappView 白屏，默认开启（现场兜底）
  exportOverlayEnabled: true,
}

function getSettingsPath(app) {
  return path.join(app.getPath('userData'), 'launch-settings.json')
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    openAtLogin: Boolean(src.openAtLogin),
    silentStart: Boolean(src.silentStart),
    // 缺省视为开启（历史配置无此字段时保持兜底遮罩可用）
    exportOverlayEnabled: src.exportOverlayEnabled === undefined ? true : Boolean(src.exportOverlayEnabled),
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
      { encoding: 'buffer', windowsHide: true },
    )
    if (r.status !== 0 || !r.stdout) return null
    // REG_SZ    value...
    const lines = decodeWindowsConsole(r.stdout).split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/REG_SZ\s+(.+)$/i)
      if (m) return m[1].trim()
    }
  } catch {
    /* ignore */
  }
  return null
}

/** 解析 `reg query ...\Run` 的输出为 {name,data} 列表（值名可含空格）。纯函数，便于测试。 */
function parseRunKeyOutput(stdout) {
  const out = []
  for (const line of String(stdout || '').split(/\r?\n/)) {
    // 非贪婪匹配值名到 REG_SZ/REG_EXPAND_SZ 为止
    const m = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/i)
    if (m) out.push({ name: m[1].trim(), data: (m[2] || '').trim() })
  }
  return out
}

/** 列出 HKCU\...\Run 下所有 REG_SZ 值（含旧版本遗留项）。 */
function listWindowsRunEntries() {
  if (process.platform !== 'win32') return []
  try {
    const r = spawnSync('reg', ['query', WIN_RUN_KEY], { encoding: 'buffer', windowsHide: true })
    if (r.status !== 0 || !r.stdout) return []
    return parseRunKeyOutput(decodeWindowsConsole(r.stdout))
  } catch {
    return []
  }
}

/** 返回任一指向本 app exe 的 Run 项数据（含旧值名），供偏好丢失时判定曾开自启。 */
function findAppRunEntryData(execPath) {
  const exeBase = String(execPath ? path.basename(execPath) : '').toLowerCase()
  if (!exeBase) return null
  for (const { data } of listWindowsRunEntries()) {
    if (String(data).toLowerCase().includes(exeBase)) return data
  }
  return null
}

/**
 * 删除旧版本用「其它值名」（0.3.138 前未传 name，Electron 默认用 app 名写入）遗留的
 * 重复自启项，只保留 LOGIN_ITEM_NAME 一份，避免开机同时拉起两个实例、
 * 使第二实例触发 second-instance 弹出主窗口（037b）。
 * @param {string} execPath 当前 exe 路径，用其文件名匹配同一 app 的历史条目
 * @returns {string[]} 被删除的值名
 */
function removeLegacyRunDuplicates(execPath) {
  if (process.platform !== 'win32') return []
  const exeBase = String(execPath ? path.basename(execPath) : '').toLowerCase()
  if (!exeBase) return []
  const removed = []
  for (const { name, data } of listWindowsRunEntries()) {
    if (!name || name === LOGIN_ITEM_NAME) continue
    if (String(data).toLowerCase().includes(exeBase)) {
      const res = syncWindowsRunKey(name, null)
      if (res.ok) removed.push(name)
    }
  }
  return removed
}

/**
 * 解码 Windows 控制台/`reg.exe` 输出。
 * 中文系统多为 GBK/CP936；若按 UTF-8 读会变成乱码，且「找不到」正则匹配失败。
 * @param {Buffer|string|null|undefined} data
 */
function decodeWindowsConsole(data) {
  if (data == null) return ''
  if (typeof data === 'string') return data.trim()
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (!buf.length) return ''
  const utf8 = buf.toString('utf8')
  // 无替换符且像英文/已是 Unicode 文本 → 直接用
  if (!utf8.includes('\uFFFD') && /ERROR:|The operation completed|successfully/i.test(utf8)) {
    return utf8.trim()
  }
  // 不限 win32：现场 reg 输出常是 GBK；本机 mac 单测/日志回放也需同一解码路径
  for (const enc of ['gbk', 'gb18030']) {
    try {
      const text = new TextDecoder(enc).decode(buf).trim()
      if (text && !text.includes('\uFFFD')) return text
    } catch {
      /* ICU 未含该编码时忽略 */
    }
  }
  return utf8.trim()
}

/** reg delete/query 目标不存在（中/英，含曾被误按 UTF-8 解码的乱码兜底）。 */
function isRegNotFoundMessage(text) {
  const s = String(text || '')
  if (!s) return false
  if (/unable to find|cannot find the specified|ERROR:\s*The system was unable/i.test(s)) return true
  if (/找不到|指定的注册表/.test(s)) return true
  return false
}

/**
 * patch 是否触及开机自启相关字段。仅改 exportOverlayEnabled 等时不应碰 HKCU\Run，
 * 否则关自启场景下 `reg delete` 对缺失项报错会误伤设置页（乱码「登录项同步失败」）。
 * @param {Record<string, unknown>|null|undefined} patch
 */
function patchTouchesLoginItem(patch) {
  if (!patch || typeof patch !== 'object') return false
  return Object.prototype.hasOwnProperty.call(patch, 'openAtLogin')
    || Object.prototype.hasOwnProperty.call(patch, 'silentStart')
}

function syncWindowsRunKey(valueName, commandOrNull) {
  if (process.platform !== 'win32') return { ok: true }
  try {
    if (!commandOrNull) {
      const r = spawnSync(
        'reg',
        ['delete', WIN_RUN_KEY, '/v', valueName, '/f'],
        { encoding: 'buffer', windowsHide: true },
      )
      if (r.status === 0) return { ok: true }
      const errText = decodeWindowsConsole(r.stderr) || decodeWindowsConsole(r.stdout)
      // 不存在时 reg 常返回 1；删除本就幂等，视为已关闭成功
      if (r.status === 1 || isRegNotFoundMessage(errText)) {
        return { ok: true }
      }
      return { ok: false, error: errText || `reg delete exit ${r.status}` }
    }
    const r = spawnSync(
      'reg',
      ['add', WIN_RUN_KEY, '/v', valueName, '/t', 'REG_SZ', '/d', commandOrNull, '/f'],
      { encoding: 'buffer', windowsHide: true },
    )
    if (r.status !== 0) {
      const errText = decodeWindowsConsole(r.stderr) || decodeWindowsConsole(r.stdout)
      return { ok: false, error: errText || `reg add exit ${r.status}` }
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
    removedLegacy: [],
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
      // 037b：无论开/关自启，都清掉旧版本遗留的重复自启项，杜绝开机双实例弹窗
      result.removedLegacy = removeLegacyRunDuplicates(exe)
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
    // 兼容旧值名：偏好丢失时，本 app 的任一 Run 项（含 0.3.138 前默认值名）都视为曾开自启
    const existing = readWindowsRunKey(LOGIN_ITEM_NAME) || findAppRunEntryData(process.execPath)
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
  parseRunKeyOutput,
  listWindowsRunEntries,
  findAppRunEntryData,
  removeLegacyRunDuplicates,
  decodeWindowsConsole,
  isRegNotFoundMessage,
  patchTouchesLoginItem,
}
