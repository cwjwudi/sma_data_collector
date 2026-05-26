#!/usr/bin/env node
/**
 * 打包后生成 latest.json（含 SHA256）并同步到 WebPortal 静态目录。
 *
 * 用法：
 *   node packaging/scripts/publish-portal-release.mjs
 *   node packaging/scripts/publish-portal-release.mjs --portal-dir /path/to/web-portal-demo/public/downloads/report-editor
 *   node packaging/scripts/publish-portal-release.mjs --copy-artifacts
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
  '/Volumes/web/web-portal-demo/public/downloads/report-editor',
  path.resolve(root, '../../../P004_WebPortal/public/downloads/report-editor'),
  path.resolve(root, '../../../../P004_WebPortal/public/downloads/report-editor'),
].filter(Boolean)

function parseArgs(argv) {
  const out = { portalDir: '', copyArtifacts: false, version: '' }
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

function buildManifest(version, portalDir) {
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

  const searchDirs = [portalDir, path.join(root, 'packaging/updates')].filter(Boolean)
  const platforms = {}
  for (const kind of ['mac', 'win']) {
    const key = kind === 'mac' ? 'darwin-arm64' : 'win32-x64'
    const name = artifactFileName(version, kind)
    let filePath = ''
    for (const dir of searchDirs) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) {
        filePath = candidate
        break
      }
    }
    if (!filePath) {
      const buildPath = findBuildArtifact(version, kind)
      if (buildPath) filePath = buildPath
    }
    if (filePath) {
      platforms[key] = artifactEntryForFile(filePath)
    }
  }

  if (!Object.keys(platforms).length) {
    console.error(`未找到 ${version} 安装包。请先打包或复制到 Portal。`)
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
  if (fs.existsSync(dest)) {
    const srcStat = fs.statSync(src)
    const destStat = fs.statSync(dest)
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      console.log(`[skip] ${path.basename(dest)} already up to date`)
      return true
    }
  }
  fs.copyFileSync(src, dest)
  console.log(`[copy] ${src} -> ${dest}`)
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
  if (buildWin) copyFileIfNewer(buildWin, path.join(portalDir, path.basename(buildWin)))
}

buildManifest(version, portalDir)

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
console.log('')
console.log(`Done. 部署 WebPortal 后，Solutions 页与客户端自动更新将指向 ${version}。`)
