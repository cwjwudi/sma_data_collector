#!/usr/bin/env node
/**
 * Extract layout_presets and templates from a Report Editor backup JSON.
 *
 * Usage:
 *   node packaging/scripts/extract-team-cloud-assets.mjs [backup.json]
 *
 * Outputs:
 *   packaging/updates/team-layout-presets.json
 *   packaging/updates/team-templates.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const updatesDir = path.join(root, 'packaging/updates')

function findNewestBackup() {
  const names = fs.readdirSync(updatesDir).filter((n) => n.startsWith('report-editor-backup-') && n.endsWith('.json'))
  if (!names.length) return ''
  names.sort()
  return path.join(updatesDir, names[names.length - 1])
}

const backupPath = process.argv[2] ? path.resolve(process.argv[2]) : findNewestBackup()
if (!backupPath || !fs.existsSync(backupPath)) {
  console.error('Backup JSON not found.')
  process.exit(1)
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
const now = new Date().toISOString()

const layoutPresets = backup.layout_presets
const templates = backup.templates
if (!Array.isArray(layoutPresets) || !layoutPresets.length) {
  console.error('No layout_presets in backup')
  process.exit(1)
}
if (!Array.isArray(templates) || !templates.length) {
  console.error('No templates in backup')
  process.exit(1)
}

const layoutOut = path.join(updatesDir, 'team-layout-presets.json')
const templateOut = path.join(updatesDir, 'team-templates.json')

fs.writeFileSync(
  layoutOut,
  JSON.stringify({ version: 1, updatedAt: now, layout_presets: layoutPresets }, null, 2) + '\n',
  'utf8',
)
fs.writeFileSync(
  templateOut,
  JSON.stringify({ version: 1, updatedAt: now, templates }, null, 2) + '\n',
  'utf8',
)

console.log(`Wrote ${layoutOut} (${layoutPresets.length} presets)`)
console.log(`Wrote ${templateOut} (${templates.length} templates)`)
console.log(`  from: ${backupPath}`)
