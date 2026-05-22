#!/usr/bin/env node
/**
 * 打包演示工具包 zip 并生成 demo-pack/latest.json
 *
 * 用法：
 *   node packaging/scripts/build-demo-pack.mjs --version 0.1.0
 *   node packaging/scripts/build-demo-pack.mjs --version 0.1.0 --notes "MariaDB + OPC UA 演示"
 *
 * 产物：
 *   packaging/demo-pack/output/report-editor-demo-pack-<version>.zip
 *   packaging/demo-pack/latest.json
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const sourceDir = path.join(root, 'packaging/demo-pack/source')
const outDir = path.join(root, 'packaging/demo-pack/output')

function parseArgs(argv) {
  const out = { version: '0.1.0', notes: 'MariaDB + OPC UA 演示环境（需 Docker Desktop）' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--version' && next) {
      out.version = next
      i++
    } else if (a === '--notes' && next) {
      out.notes = next
      i++
    }
  }
  return out
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function zipSource(version) {
  fs.mkdirSync(outDir, { recursive: true })
  const zipName = `report-editor-demo-pack-${version}.zip`
  const zipPath = path.join(outDir, zipName)
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
  execSync(`cd "${sourceDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`, { stdio: 'inherit' })
  return { zipName, zipPath }
}

const args = parseArgs(process.argv)
if (!fs.existsSync(sourceDir)) {
  console.error('缺少 source 目录:', sourceDir)
  process.exit(1)
}

const { zipName, zipPath } = zipSource(args.version)
const sha256 = sha256File(zipPath)
const stat = fs.statSync(zipPath)

const manifest = {
  version: args.version,
  releasedAt: new Date().toISOString().slice(0, 10),
  notes: args.notes,
  platforms: {
    'darwin-arm64': { url: zipName, sha256, size: stat.size },
    'darwin-x64': { url: zipName, sha256, size: stat.size },
    'darwin-universal': { url: zipName, sha256, size: stat.size },
    'win32-x64': { url: zipName, sha256, size: stat.size },
    'linux-x64': { url: zipName, sha256, size: stat.size },
  },
}

const manifestPath = path.join(root, 'packaging/demo-pack/latest.json')
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

console.log('')
console.log('演示工具包已生成:')
console.log(' ', zipPath)
console.log(' SHA256:', sha256)
console.log(' 清单:', manifestPath)
console.log('')
console.log('Portal 发布：将 zip 与 latest.json 复制到 public/downloads/report-editor/demo-pack/')
