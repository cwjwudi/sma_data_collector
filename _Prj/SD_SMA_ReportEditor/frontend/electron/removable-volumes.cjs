/**
 * 可移动卷枚举（022 · Q13 / 025 / 031）：Win Removable+USB / mac /Volumes。
 * 032：IPC 热路径禁止同步子进程调用；一律 async + in-flight 合并。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const os = require('node:os')

const execFileAsync = promisify(execFile)

/** @type {Set<string> | null} 分屏首轮可见的盘符快照（大写 `E:`） */
let winDriveBaseline = null

/** @type {Promise<{ volumes: Array<object>, error?: string }> | null} */
let inFlightDetailed = null
/** @type {{ at: number, result: { volumes: Array<object>, error?: string } } | null} */
let shortCache = null
const SHORT_CACHE_MS = 400

function resetWinDriveBaseline() {
  winDriveBaseline = null
}

/**
 * @param {string} script
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<string>}
 */
async function runPowerShellEncoded(script, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 12000
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  )
  return String(stdout || '')
}

/**
 * 解析 `根|标签|kind` 行。
 * @param {string} text
 * @returns {Array<{ path: string, label: string, platform: string, kind: string }>}
 */
function parseWinVolumeLines(text) {
  const out = []
  const seen = new Set()
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const parts = t.split('|')
    let root = (parts[0] || '').trim().toUpperCase().replace(/\\+$/, '')
    if (!root) continue
    if (/^[A-Z]$/.test(root)) root = `${root}:`
    if (!/^[A-Z]:$/.test(root)) continue
    if (seen.has(root)) continue
    seen.add(root)
    const label = (parts[1] || '').trim() || root
    const kind = (parts[2] || 'removable').trim().toLowerCase() || 'removable'
    out.push({
      path: `${root}\\`,
      label,
      platform: 'win32',
      kind,
    })
  }
  return out
}

function systemDriveRoot() {
  const raw = String(process.env.SystemDrive || 'C:').trim().toUpperCase().replace(/\\+$/, '')
  return /^[A-Z]:$/.test(raw) ? raw : 'C:'
}

/**
 * 所有已就绪逻辑盘（含 Fixed），供「新盘符」差集。
 * @returns {Promise<Array<{ path: string, label: string, platform: string, kind: string }>>}
 */
async function listAllReadyDrivesWin() {
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | ForEach-Object {",
    "  $root = $_.Name.TrimEnd('\\').ToUpper()",
    "  $lab = ($_.VolumeLabel -replace '[\\|\\r\\n]','')",
    "  $kind = $_.DriveType.ToString().ToLower()",
    "  Write-Output ('{0}|{1}|{2}' -f $root, $lab, $kind)",
    '}',
  ].join('\n')
  try {
    return parseWinVolumeLines(await runPowerShellEncoded(script))
  } catch {
    return []
  }
}

/**
 * Removable（.NET）+ USB 总线卷（Get-Disk BusType=USB）+ 新盘符差集。
 * @returns {Promise<{ volumes: Array<object>, error?: string }>}
 */
async function listRemovableVolumesWin() {
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$seen = @{}",
    'function Emit([string]$root, [string]$label, [string]$kind) {',
    "  $r = $root.TrimEnd('\\').ToUpper()",
    "  if ($r.Length -eq 1) { $r = $r + ':' }",
    "  if ($r -notmatch '^[A-Z]:$') { return }",
    '  if ($seen.ContainsKey($r)) { return }',
    '  $seen[$r] = $true',
    "  $lab = if ($label) { ($label -replace '[\\|\\r\\n]','') } else { $r }",
    "  Write-Output ('{0}|{1}|{2}' -f $r, $lab, $kind)",
    '}',
    "[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and $_.DriveType -eq 'Removable' } | ForEach-Object {",
    "  Emit $_.Name $_.VolumeLabel 'removable'",
    '}',
    'try {',
    "  Get-Disk | Where-Object { $_.BusType -eq 'USB' -and $_.OperationalStatus -eq 'Online' } | ForEach-Object {",
    '    $disk = $_',
    '    Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue |',
    '      Where-Object { $_.DriveLetter } | ForEach-Object {',
    "        $letter = [string]$_.DriveLetter",
    '        $vol = $null',
    '        try { $vol = Get-Volume -DriveLetter $_.DriveLetter -ErrorAction SilentlyContinue } catch {}',
    "        $lab = if ($vol) { $vol.FileSystemLabel } else { '' }",
    "        Emit ($letter + ':') $lab 'usb'",
    '      }',
    '  }',
    '} catch {}',
  ].join('\n')

  /** @type {Array<{ path: string, label: string, platform: string, kind: string }>} */
  let detected = []
  let error
  try {
    detected = parseWinVolumeLines(await runPowerShellEncoded(script))
  } catch (e) {
    error = String(e && e.message ? e.message : e)
    detected = []
  }

  const allReady = await listAllReadyDrivesWin()
  const sys = systemDriveRoot()
  if (winDriveBaseline == null) {
    winDriveBaseline = new Set(allReady.map((d) => d.path.replace(/\\+$/, '').toUpperCase()))
  } else {
    for (const d of allReady) {
      const key = d.path.replace(/\\+$/, '').toUpperCase()
      if (key === sys) continue
      if (winDriveBaseline.has(key)) continue
      if (detected.some((x) => x.path.replace(/\\+$/, '').toUpperCase() === key)) continue
      detected.push({
        path: `${key}\\`,
        label: d.label || key,
        platform: 'win32',
        kind: 'new',
      })
    }
  }

  detected = detected.filter((d) => d.path.replace(/\\+$/, '').toUpperCase() !== sys)

  return { volumes: detected, error }
}

/**
 * @returns {Promise<Array<{ path: string, label: string, platform: string, kind?: string }>>}
 */
async function listRemovableVolumesMac() {
  const volumesRoot = '/Volumes'
  try {
    await fs.promises.access(volumesRoot)
  } catch {
    return []
  }
  const skip = new Set(['Macintosh HD', 'Macintosh HD - Data'])
  let names
  try {
    names = await fs.promises.readdir(volumesRoot)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (!name || name.startsWith('.') || skip.has(name)) continue
    const full = path.join(volumesRoot, name)
    try {
      const st = await fs.promises.lstat(full)
      if (!st.isDirectory() && !st.isSymbolicLink()) continue
    } catch {
      continue
    }
    let prefer = true
    try {
      const { stdout: info } = await execFileAsync('diskutil', ['info', full], {
        encoding: 'utf8',
        timeout: 4000,
        maxBuffer: 2 * 1024 * 1024,
      })
      const rem = /Removable Media:\s*Yes/i.test(info)
      const ext =
        /Protocol:\s*(USB|Thunderbolt|Secure Digital)/i.test(info) || /Internal:\s*No/i.test(info)
      if (!rem && !ext && /Internal:\s*Yes/i.test(info)) {
        prefer = false
      }
    } catch {
      /* keep prefer */
    }
    if (prefer) out.push({ path: full, label: name, platform: 'darwin', kind: 'volume' })
  }
  return out
}

/**
 * @returns {Promise<{ volumes: Array<object>, error?: string }>}
 */
async function listRemovableVolumesDetailedOnce() {
  const plat = os.platform()
  if (plat === 'win32') return listRemovableVolumesWin()
  if (plat === 'darwin') return { volumes: await listRemovableVolumesMac() }
  return { volumes: [] }
}

/**
 * @returns {Promise<{ volumes: Array<object>, error?: string }>}
 */
async function listRemovableVolumesDetailed() {
  const now = Date.now()
  if (shortCache && now - shortCache.at < SHORT_CACHE_MS) {
    return shortCache.result
  }
  if (inFlightDetailed) return inFlightDetailed
  inFlightDetailed = listRemovableVolumesDetailedOnce()
    .then((result) => {
      shortCache = { at: Date.now(), result }
      return result
    })
    .finally(() => {
      inFlightDetailed = null
    })
  return inFlightDetailed
}

/**
 * @returns {Promise<Array<object>>}
 */
async function listRemovableVolumes() {
  const detailed = await listRemovableVolumesDetailed()
  return detailed.volumes
}

module.exports = {
  listRemovableVolumes,
  listRemovableVolumesDetailed,
  listRemovableVolumesWin,
  listRemovableVolumesMac,
  parseWinVolumeLines,
  resetWinDriveBaseline,
  systemDriveRoot,
  runPowerShellEncoded,
}
