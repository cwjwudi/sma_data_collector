#!/usr/bin/env node
/**
 * 打包后生成 latest.json（含 SHA256）并同步到 WebPortal 静态目录。
 *
 * 用法：
 *   node packaging/scripts/publish-portal-release.mjs
 *   node packaging/scripts/publish-portal-release.mjs --portal-dir /path/to/web-portal-demo/public/downloads/report-editor
 *   node packaging/scripts/publish-portal-release.mjs --copy-artifacts
 *   node packaging/scripts/publish-portal-release.mjs --copy-artifacts --only win
 *   node packaging/scripts/publish-portal-release.mjs --copy-artifacts --only mac
 *
 * 环境变量：
 *   REPORT_EDITOR_PORTAL_DIR — Portal 下载目录（覆盖自动探测）
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const manifestPath = path.join(root, 'packaging/updates/latest.json')

const DEFAULT_PORTAL_CANDIDATES = [
  process.env.REPORT_EDITOR_PORTAL_DIR,
  path.resolve(root, '../../../web-portal-demo/public/downloads/report-editor'),
  '/Volumes/web/web-portal-demo/public/downloads/report-editor',
  path.resolve(root, '../../../P004_WebPortal/public/downloads/report-editor'),
  path.resolve(root, '../../../../P004_WebPortal/public/downloads/report-editor'),
].filter(Boolean)

function parseArgs(argv) {
  const out = { portalDir: '', copyArtifacts: false, version: '', only: '' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--portal-dir' && next) {
      out.portalDir = next
      i++
    } else if (a === '--copy-artifacts') {
      out.copyArtifacts = true
    } else if (a === '--version' && next) {
      out.version = next
      i++
    } else if (a === '--only' && next) {
      const v = String(next).toLowerCase()
      if (v === 'mac' || v === 'win' || v === 'all') out.only = v === 'all' ? '' : v
      i++
    }
  }
  return out
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version.trim() : ''
  } catch {
    return ''
  }
}

function readManifestNotes() {
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    return typeof data.notes === 'string' ? data.notes : ''
  } catch {
    return ''
  }
}

function resolvePortalDir(explicit) {
  if (explicit) return path.resolve(explicit)
  for (const candidate of DEFAULT_PORTAL_CANDIDATES) {
    const dir = path.resolve(candidate)
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir
    }
  }
  return ''
}

function artifactFileName(version, kind) {
  return kind === 'mac'
    ? `Report Editor-${version}-arm64.dmg`
    : `Report Editor-Setup-${version}-x64.exe`
}

function findFirstExisting(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p
  }
  return ''
}

function findBuildArtifact(version, kind) {
  const name = artifactFileName(version, kind)
  const dirs = [
    path.join(root, kind === 'mac' ? 'packaging/mac/output' : 'packaging/windows/output'),
    path.join(root, 'packaging/updates'),
  ]
  for (const dir of dirs) {
    const full = path.join(dir, name)
    if (fs.existsSync(full)) return full
  }
  return ''
}

function findWindowsUpdateMetadata(version, name, portalDir = '') {
  const setupName = artifactFileName(version, 'win')
  const candidates = {
    blockmap: `${setupName}.blockmap`,
    latestYml: 'latest.yml',
  }
  const fileName = candidates[name]
  if (!fileName) return ''
  return findFirstExisting([
    portalDir ? path.join(portalDir, fileName) : '',
    path.join(root, 'packaging/windows/output', fileName),
    path.join(root, 'packaging/windows/output-alt', fileName),
    path.join(root, 'packaging/updates', fileName),
  ])
}

function artifactEntryForFile(filePath) {
  const stat = fs.statSync(filePath)
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return {
    url: path.basename(filePath),
    sha256: hash.digest('hex'),
    size: stat.size,
  }
}

/** 将 latest.json 中的 notes 写入 latest.yml，供 electron-updater 与设置页展示 */
function injectReleaseNotesIntoYml(ymlPath, notes) {
  const text = String(notes || '').trim()
  if (!text || !fs.existsSync(ymlPath)) return false
  let content = fs.readFileSync(ymlPath, 'utf8')
  const block = `releaseNotes: |\n${text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')}\n`
  if (/^releaseNotes:/m.test(content)) {
    content = content.replace(/^releaseNotes:[^\n]*\n(?:  .*\n)*/m, block)
  } else {
    content = block + content
  }
  fs.writeFileSync(ymlPath, content, 'utf8')
  console.log(`[patch] releaseNotes -> ${ymlPath}`)
  return true
}

function syncLatestYmlToPortal(version, notes, portalDir) {
  const latestYml = findWindowsUpdateMetadata(version, 'latestYml', portalDir)
  if (!latestYml) return ''
  const dest = path.join(portalDir, 'latest.yml')
  fs.copyFileSync(latestYml, dest)
  injectReleaseNotesIntoYml(dest, notes)
  console.log(`[sync] latest.yml -> ${dest}`)
  return dest
}

function resolveArtifactPath(version, kind, portalDir, options = {}) {
  const name = artifactFileName(version, kind)
  if (options.preferBuild) {
    const built = findBuildArtifact(version, kind)
    if (built) return built
  }
  const searchDirs = [portalDir, path.join(root, 'packaging/updates')].filter(Boolean)
  for (const dir of searchDirs) {
    const candidate = path.join(dir, name)
    if (fs.existsSync(candidate)) return candidate
  }
  return findBuildArtifact(version, kind) || ''
}

function buildManifest(version, portalDir, options = {}) {
  const only = options.only || ''
  let existing = null
  try {
    existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    existing = null
  }
  const notes =
    (existing?.version === version && typeof existing.notes === 'string' && existing.notes) ||
    readManifestNotes() ||
    `Report Editor ${version}`

  /** 同版本分平台发版时保留已有平台条目（例如先 Mac 后 Win） */
  const platforms =
    existing?.version === version && existing.platforms && typeof existing.platforms === 'object'
      ? { ...existing.platforms }
      : {}

  const kinds = only === 'mac' ? ['mac'] : only === 'win' ? ['win'] : ['mac', 'win']
  const updatedKinds = []

  for (const kind of kinds) {
    const key = kind === 'mac' ? 'darwin-arm64' : 'win32-x64'
    const filePath = resolveArtifactPath(version, kind, portalDir, {
      preferBuild: Boolean(options.preferBuild),
    })
    if (filePath) {
      platforms[key] = artifactEntryForFile(filePath)
      updatedKinds.push(kind)
    }
  }

  if (!updatedKinds.length) {
    const hint = only ? `（--only ${only}）` : ''
    console.error(`未找到 ${version} 安装包${hint}。请先打包或复制到 Portal。`)
    process.exit(1)
  }

  if (!Object.keys(platforms).length) {
    console.error(`latest.json 无可用平台条目（version=${version}）。`)
    process.exit(1)
  }

  const manifest = {
    version,
    releasedAt: new Date().toISOString(),
    notes,
    platforms,
  }
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${manifestPath}`)
  console.log(JSON.stringify(manifest, null, 2))
  return manifest
}

function copyFileIfNewer(src, dest) {
  if (!fs.existsSync(src)) return false
  const srcStat = fs.statSync(src)
  if (fs.existsSync(dest)) {
    const destStat = fs.statSync(dest)
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      console.log(`[skip] ${path.basename(dest)} already up to date`)
      return true
    }
  }
  fs.copyFileSync(src, dest)
  const copied = fs.statSync(dest)
  if (copied.size !== srcStat.size) {
    console.error(
      `[error] 拷贝后大小不一致：${path.basename(dest)} 期望 ${srcStat.size}，实际 ${copied.size}`,
    )
    process.exit(1)
  }
  console.log(`[copy] ${src} -> ${dest} (${copied.size} bytes)`)
  return true
}

const args = parseArgs(process.argv)
const version = args.version || readPackageVersion()
if (!version) {
  console.error('缺少版本号（frontend/package.json 或 --version）')
  process.exit(1)
}

const portalDir = resolvePortalDir(args.portalDir)
const buildMac = findBuildArtifact(version, 'mac')
const buildWin = findBuildArtifact(version, 'win')

if (args.copyArtifacts && portalDir) {
  console.log(`Portal dir: ${portalDir}`)
  if (buildMac) copyFileIfNewer(buildMac, path.join(portalDir, path.basename(buildMac)))
  if (buildWin) {
    copyFileIfNewer(buildWin, path.join(portalDir, path.basename(buildWin)))
    const blockmap = findWindowsUpdateMetadata(version, 'blockmap')
    const latestYml = findWindowsUpdateMetadata(version, 'latestYml')
    if (blockmap) copyFileIfNewer(blockmap, path.join(portalDir, path.basename(blockmap)))
    if (latestYml) copyFileIfNewer(latestYml, path.join(portalDir, 'latest.yml'))
    if (!blockmap || !latestYml) {
      console.warn('[warn] Windows 差分更新元数据缺失；electron-updater 将回退为完整安装包下载。')
      console.warn('       期望 output/latest.yml 与 Report Editor-Setup-<version>-x64.exe.blockmap')
    }
  }
}

buildManifest(version, portalDir, { only: args.only, preferBuild: Boolean(args.copyArtifacts) })

if (!portalDir) {
  console.warn('[warn] 未找到 Portal 目录，仅更新了 packaging/updates/latest.json')
  console.warn('       指定路径: node packaging/scripts/publish-portal-release.mjs --portal-dir <dir>')
  process.exit(0)
}

if (!args.copyArtifacts) {
  console.log('')
  console.log(`Portal dir: ${portalDir}`)
}

fs.copyFileSync(manifestPath, path.join(portalDir, 'latest.json'))
console.log(`[sync] latest.json -> ${path.join(portalDir, 'latest.json')}`)
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
syncLatestYmlToPortal(version, manifest.notes || '', portalDir)
console.log('')
console.log(`Done. 部署 WebPortal 后，Solutions 页与客户端自动更新将指向 ${version}。`)
