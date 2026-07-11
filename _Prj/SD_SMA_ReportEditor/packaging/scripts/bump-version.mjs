#!/usr/bin/env node
/**
 * 发布前统一 bump 应用版本号（electron-builder 读取 frontend/package.json）。
 *
 * 用法：
 *   node packaging/scripts/bump-version.mjs 0.1.5
 *   node packaging/scripts/bump-version.mjs 0.1.5 --notes "更新说明"
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const frontendPkgPath = path.join(root, 'frontend/package.json')
const lockPath = path.join(root, 'frontend/package-lock.json')
const manifestPath = path.join(root, 'packaging/updates/latest.json')

function parseArgs(argv) {
  const out = { version: '', notes: '' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (!out.version && /^\d+\.\d+\.\d+/.test(a)) {
      out.version = a
    } else if (a === '--notes' && next) {
      out.notes = next
      i++
    }
  }
  return out
}

function bumpLockfileVersion(raw, version) {
  const data = JSON.parse(raw)
  data.version = version
  if (data.packages?.['']) {
    data.packages[''].version = version
  }
  return JSON.stringify(data, null, 2) + '\n'
}

const args = parseArgs(process.argv)
if (!args.version) {
  console.error('用法: node packaging/scripts/bump-version.mjs <版本号> [--notes "说明"]')
  process.exit(1)
}

const version = args.version
const frontendPkg = JSON.parse(fs.readFileSync(frontendPkgPath, 'utf8'))
const prev = frontendPkg.version
frontendPkg.version = version
fs.writeFileSync(frontendPkgPath, JSON.stringify(frontendPkg, null, 2) + '\n', 'utf8')

if (fs.existsSync(lockPath)) {
  const lockRaw = fs.readFileSync(lockPath, 'utf8')
  fs.writeFileSync(lockPath, bumpLockfileVersion(lockRaw, version), 'utf8')
}

const defaultNotes = `Report Editor AI ${version}\n\n- （请填写本版说明）`
const notes = args.notes || defaultNotes
const manifest = {
  version,
  releasedAt: new Date().toISOString(),
  notes,
  platforms: {
    'win32-x64': { url: `Report Editor AI-Setup-${version}-x64.exe`, sha256: '', size: 0 },
    'darwin-arm64': { url: `Report Editor AI-${version}-arm64.dmg`, sha256: '', size: 0 },
  },
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

console.log(`Bumped ${prev} -> ${version}`)
console.log(`  ${path.relative(root, frontendPkgPath)}`)
console.log(`  ${path.relative(root, manifestPath)}`)
console.log('')
console.log('打包完成后运行 generate-update-manifest.mjs 生成 SHA256。')
