/**
 * 可移动卷枚举（022 · Q13）：Win Removable / mac /Volumes 外置卷。
 * 不强区分闪存与移动硬盘；界面称「可移动存储」。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const os = require('node:os')

/**
 * @returns {Array<{ path: string, label: string, platform: string }>}
 */
function listRemovableVolumesWin() {
  try {
    const script = [
      "$ErrorActionPreference='SilentlyContinue'",
      "[System.IO.DriveInfo]::GetDrives() |",
      "  Where-Object { $_.DriveType.ToString() -eq 'Removable' -and $_.IsReady } |",
      "  ForEach-Object { $_.Name.TrimEnd('\\') + '|' + ($_.VolumeLabel -replace '[\\|\\r\\n]','') }",
    ].join(' ')
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 8000, windowsHide: true },
    )
    return String(out || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf('|')
        const root = (i >= 0 ? line.slice(0, i) : line).trim()
        const label = (i >= 0 ? line.slice(i + 1) : '').trim() || root
        const p = root.endsWith(':') ? `${root}\\` : root
        return { path: p, label, platform: 'win32' }
      })
      .filter((v) => v.path)
  } catch {
    return []
  }
}

/**
 * @returns {Array<{ path: string, label: string, platform: string }>}
 */
function listRemovableVolumesMac() {
  const volumesRoot = '/Volumes'
  if (!fs.existsSync(volumesRoot)) return []
  /** 常见系统卷名，不当作「可移动」提示 */
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
    // 尽力用 diskutil 看 Removable/External；失败则仍列入（确认框兜底）
    let prefer = true
    try {
      const info = execFileSync('diskutil', ['info', full], {
        encoding: 'utf8',
        timeout: 4000,
      })
      const rem = /Removable Media:\s*Yes/i.test(info)
      const ext = /Protocol:\s*(USB|Thunderbolt|Secure Digital)/i.test(info)
        || /Internal:\s*No/i.test(info)
      if (!rem && !ext && /Internal:\s*Yes/i.test(info)) {
        prefer = false
      }
    } catch {
      /* keep prefer */
    }
    if (prefer) out.push({ path: full, label: name, platform: 'darwin' })
  }
  return out
}

/**
 * @returns {Array<{ path: string, label: string, platform: string }>}
 */
function listRemovableVolumes() {
  const plat = os.platform()
  if (plat === 'win32') return listRemovableVolumesWin()
  if (plat === 'darwin') return listRemovableVolumesMac()
  return []
}

module.exports = {
  listRemovableVolumes,
  listRemovableVolumesWin,
  listRemovableVolumesMac,
}
