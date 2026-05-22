#!/usr/bin/env node
/**
 * Extract layout_presets from a Report Editor backup JSON into team-layout-presets.json.
 *
 * Usage:
 *   node packaging/scripts/extract-team-layout-presets.mjs [backup.json] [--out path]
 *
 * Default backup: packaging/updates/report-editor-backup-*.json (newest match)
 * Default out:    packaging/updates/team-layout-presets.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const defaultOut = path.join(root, 'packaging/updates/team-layout-presets.json')

function parseArgs(argv) {
  const out = { backup: '', out: defaultOut }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--out' && next) {
      out.out = path.resolve(next)
      i++
    } else if (!a.startsWith('-') && !out.backup) {
      out.backup = path.resolve(a)
    }
  }
  return out
}

function findNewestBackup() {
  const dir = path.join(root, 'packaging/updates')
  const names = fs.readdirSync(dir).filter((n) => n.startsWith('report-editor-backup-') && n.endsWith('.json'))
  if (!names.length) return ''
  names.sort()
  return path.join(dir, names[names.length - 1])
}

const args = parseArgs(process.argv)
const backupPath = args.backup || findNewestBackup()
if (!backupPath || !fs.existsSync(backupPath)) {
  console.error('Backup JSON not found. Pass path or place report-editor-backup-*.json under packaging/updates/')
  process.exit(1)
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
const items = backup.layout_presets
if (!Array.isArray(items) || !items.length) {
  console.error('No layout_presets array in backup:', backupPath)
  process.exit(1)
}

const payload = {
  version: 1,
  updatedAt: new Date().toISOString(),
  layout_presets: items,
}

fs.mkdirSync(path.dirname(args.out), { recursive: true })
fs.writeFileSync(args.out, JSON.stringify(payload, null, 2) + '\n', 'utf8')
console.log(`Wrote ${args.out}`)
console.log(`  from: ${backupPath}`)
console.log(`  presets: ${items.length}`)
