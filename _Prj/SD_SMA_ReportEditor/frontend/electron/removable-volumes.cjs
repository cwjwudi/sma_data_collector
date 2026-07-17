/**
 * 可移动卷枚举（022 · Q13 / 025）：Win Removable+USB / mac /Volumes。
 * 界面称「可移动存储」；确认后再开右侧。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const os = require('node:os')

/** @type {Set<string> | null} 分屏首轮可见的盘符快照（大写 `E:`） */
let winDriveBaseline = null

function resetWinDriveBaseline() {
  winDriveBaseline = null
}

/**
 * @param {string} script
 * @returns {string}
 */
function runPowerShellEncoded(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { encoding: 'utf8', timeout: 12000, windowsHide: true },
  )
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
 * @returns {Array<{ path: string, label: string, platform: string, kind: string }>}
 */
function listAllReadyDrivesWin() {
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
    return parseWinVolumeLines(runPowerShellEncoded(script))
  } catch {
    return []
  }
}

/**
 * Removable（.NET）+ USB 总线卷（Get-Disk BusType=USB）+ 新盘符差集。
 * @returns {{ volumes: Array<object>, error?: string }}
 */
function listRemovableVolumesWin() {
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
    detected = parseWinVolumeLines(runPowerShellEncoded(script))
  } catch (e) {
    error = String(e && e.message ? e.message : e)
    detected = []
  }

  const allReady = listAllReadyDrivesWin()
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
 * @returns {Array<{ path: string, label: string, platform: string, kind?: string }>}
 */
function listRemovableVolumesMac() {
  const volumesRoot = '/Volumes'
  if (!fs.existsSync(volumesRoot)) return []
  const skip = new Set(['Macintosh HD', 'Macintosh HD - Data'])
  let names
  try {
    names = fs.readdirSync(volumesRoot)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (!name || name.startsWith('.') || skip.has(name)) continue
    const full = path.join(volumesRoot, name)
    try {
      const st = fs.lstatSync(full)
      if (!st.isDirectory() && !st.isSymbolicLink()) continue
    } catch {
      continue
    }
    let prefer = true
    try {
      const info = execFileSync('diskutil', ['info', full], {
        encoding: 'utf8',
        timeout: 4000,
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
 * @returns {{ volumes: Array<object>, error?: string }}
 */
function listRemovableVolumesDetailed() {
  const plat = os.platform()
  if (plat === 'win32') return listRemovableVolumesWin()
  if (plat === 'darwin') return { volumes: listRemovableVolumesMac() }
  return { volumes: [] }
}

/**
 * @returns {Array<object>}
 */
function listRemovableVolumes() {
  return listRemovableVolumesDetailed().volumes
}

module.exports = {
  listRemovableVolumes,
  listRemovableVolumesDetailed,
  listRemovableVolumesWin,
  listRemovableVolumesMac,
  parseWinVolumeLines,
  resetWinDriveBaseline,
  systemDriveRoot,
}
