#!/usr/bin/env node
/**
 * 根据 packaging 输出目录生成 latest.json（应用内更新清单）
 *
 * 用法：
 *   node packaging/scripts/generate-update-manifest.mjs \
 *     --version 0.2.0 \
 *     --notes "修复与改进" \
 *     --base-url https://example.com/updates \
 *     --win packaging/windows/output/Report\ Editor-Setup-0.2.0-x64.exe \
 *     --mac-arm64 packaging/mac/output/Report\ Editor-0.2.0-arm64.dmg \
 *     --mac-x64 packaging/mac/output/Report\ Editor-0.2.0-x64.dmg
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version.trim() : ''
  } catch {
    return ''
  }
}

function parseArgs(argv) {
  const out = { notes: '', baseUrl: '', version: '' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--version' && next) {
      out.version = next
      i++
    } else if (a === '--notes' && next) {
      out.notes = next
      i++
    } else if (a === '--base-url' && next) {
      out.baseUrl = next.replace(/\/+$/, '')
      i++
    } else if (a === '--win' && next) {
      out.win = next
      i++
    } else if (a === '--mac-arm64' && next) {
      out.macArm64 = next
      i++
    } else if (a === '--mac-x64' && next) {
      out.macX64 = next
      i++
    } else if (a === '--out' && next) {
      out.out = next
      i++
    }
  }
  out.out = out.out || path.join(root, 'packaging/updates/latest.json')
  return out
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function artifactEntry(filePath, baseUrl) {
  const stat = fs.statSync(filePath)
  const name = path.basename(filePath)
  const url = baseUrl ? `${baseUrl}/${encodeURIComponent(name)}` : name
  return {
    url,
    sha256: sha256File(filePath),
    size: stat.size,
    fileName: name,
  }
}

const args = parseArgs(process.argv)
if (!args.version) {
  args.version = readPackageVersion()
}
if (!args.version) {
  console.error('缺少 --version（或未在 frontend/package.json 中找到 version）')
  process.exit(1)
}

const platforms = {}
if (args.win && fs.existsSync(args.win)) {
  platforms['win32-x64'] = artifactEntry(args.win, args.baseUrl)
}
if (args.macArm64 && fs.existsSync(args.macArm64)) {
  platforms['darwin-arm64'] = artifactEntry(args.macArm64, args.baseUrl)
}
if (args.macX64 && fs.existsSync(args.macX64)) {
  platforms['darwin-x64'] = artifactEntry(args.macX64, args.baseUrl)
}

if (!Object.keys(platforms).length) {
  console.error('未找到任何安装包文件，请检查 --win / --mac-arm64 / --mac-x64 路径')
  process.exit(1)
}

const manifest = {
  version: args.version,
  releasedAt: new Date().toISOString(),
  notes: args.notes || '',
  platforms: Object.fromEntries(
    Object.entries(platforms).map(([k, v]) => [
      k,
      { url: v.url, sha256: v.sha256, size: v.size },
    ]),
  ),
}

fs.mkdirSync(path.dirname(args.out), { recursive: true })
fs.writeFileSync(args.out, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
console.log(`Wrote ${args.out}`)
console.log(JSON.stringify(manifest, null, 2))
