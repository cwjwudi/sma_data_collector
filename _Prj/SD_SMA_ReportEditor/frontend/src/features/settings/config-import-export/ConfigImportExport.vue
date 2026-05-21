<template>
  <section class="settings-section config-backup">
    <h3 class="settings-section__title">备份与恢复</h3>
    <p class="settings-hint">
      把<strong>数据库连接、现场数据、报表模版、版式、签名</strong>和<strong>默认 PDF 保存位置</strong>等设置，
      保存成一个文件，便于换电脑、重装软件或留档。备份文件请自行保管，不要发给无关人员。
    </p>

    <div class="backup-block">
      <h4 class="backup-subhead">保存备份</h4>
      <button
        type="button"
        class="settings-btn settings-btn--primary settings-btn--block"
        :disabled="busy"
        @click="exportBackup"
      >
        {{ busy ? '正在处理…' : '导出备份文件' }}
      </button>
      <p class="backup-note">会下载一个 JSON 文件，文件名以 <code>report-editor-backup</code> 开头。</p>
    </div>

    <div class="backup-block">
      <h4 class="backup-subhead">从备份恢复</h4>
      <input
        ref="fileRef"
        type="file"
        class="file-input"
        accept="application/json,.json"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile"
      />
      <button
        type="button"
        class="settings-btn settings-btn--file settings-btn--block"
        :disabled="busy"
        @click="pickBackupFile"
      >
        选择备份文件
      </button>
      <p v-if="pendingFileName" class="backup-filename" :title="pendingFileName">{{ pendingFileName }}</p>
      <button
        type="button"
        class="settings-btn settings-btn--primary settings-btn--block"
        :disabled="busy || !pendingJson"
        @click="doImport('merge')"
      >
        恢复配置（保留现有并补充）
      </button>
      <p class="backup-note">
        适合大多数情况：本机已有的连接和模版会保留，备份里的内容会<strong>补充或更新</strong>。
      </p>
      <button
        type="button"
        class="settings-btn settings-btn--danger settings-btn--block settings-btn--muted-danger"
        :disabled="busy || !pendingJson"
        @click="confirmReplace"
      >
        完全替换为本备份
      </button>
      <p class="backup-note backup-note--warn">
        慎用：会<strong>删除</strong>当前所有连接、模版、版式、签名等，只使用备份文件里的内容。操作前请先导出一份当前备份。
      </p>
    </div>

    <p
      v-if="msg"
      class="settings-msg"
      :class="{
        'settings-msg--ok': msgTone === 'ok',
        'settings-msg--warn': msgTone === 'warn',
        'settings-msg--err': msgTone === 'err',
      }"
    >
      {{ msg }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { apiFetch } from '@/api/client.js'
import { refreshLayoutPresets } from '@/lib/report-template/layout-registry'
import {
  applyClientPrefsFromBundle,
  attachClientPrefsToBundle,
  buildImportDataFromFile,
} from '@/features/settings/config-import-export/config-bundle-client'

const busy = ref(false)
const msg = ref('')
const msgTone = ref('')
const fileRef = ref<HTMLInputElement | null>(null)
const pendingJson = ref<unknown>(null)
const pendingFileName = ref('')

function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportBackup() {
  busy.value = true
  msg.value = ''
  msgTone.value = ''
  try {
    const data = attachClientPrefsToBundle(
      (await apiFetch('/settings/config/export?mode=backup')) as Record<string, unknown>,
    )
    const stamp = new Date().toISOString().slice(0, 10)
    downloadJson(data, `report-editor-backup-${stamp}.json`)
    msg.value = '备份文件已保存（一般在「下载」文件夹中）。请妥善保管。'
    msgTone.value = 'ok'
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

function resetPendingSelection() {
  pendingJson.value = null
  pendingFileName.value = ''
  if (fileRef.value) fileRef.value.value = ''
}

function applyPickedBackup(text: string, fileName: string) {
  pendingFileName.value = fileName
  try {
    pendingJson.value = JSON.parse(text)
    msg.value = '文件已选好，请选择下方恢复方式。'
    msgTone.value = 'ok'
  } catch (e: unknown) {
    pendingJson.value = null
    msg.value = e instanceof Error ? e.message : '无法读取该文件，请确认是有效的备份文件。'
    msgTone.value = 'err'
  }
}

async function pickBackupFile() {
  msg.value = ''
  msgTone.value = ''
  resetPendingSelection()

  const api = window.electronAPI
  if (api?.pickConfigJsonFile) {
    try {
      const res = await api.pickConfigJsonFile({ title: '选择备份文件' })
      if (!res || ('canceled' in res && res.canceled)) return
      if ('ok' in res && res.ok === false) {
        msg.value = res.error || '无法读取备份文件'
        msgTone.value = 'err'
        return
      }
      if (!('content' in res) || !res.content) return
      applyPickedBackup(res.content, res.fileName || 'backup.json')
    } catch (e: unknown) {
      msg.value = e instanceof Error ? e.message : '无法打开文件选择对话框'
      msgTone.value = 'err'
    }
    return
  }

  fileRef.value?.click()
}

function onFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  msg.value = ''
  msgTone.value = ''
  resetPendingSelection()
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => {
    applyPickedBackup(String(reader.result || ''), f.name)
  }
  reader.onerror = () => {
    msg.value = '无法读取该文件，请重试。'
    msgTone.value = 'err'
  }
  reader.readAsText(f, 'UTF-8')
}

async function doImport(mode: 'merge' | 'replace') {
  if (!pendingJson.value) return
  busy.value = true
  msg.value = ''
  msgTone.value = ''
  try {
    const { serverPayload, clientPrefs: fileClientPrefs } = buildImportDataFromFile(pendingJson.value)
    const res = (await apiFetch('/settings/config/import', {
      method: 'POST',
      body: { mode, data: serverPayload },
    })) as {
      ok?: boolean
      imported?: { templates?: number; layout_presets?: number; signature_assets?: number }
      client_prefs?: unknown
      warnings?: string[]
    }
    const clientApplied: string[] = []
    try {
      clientApplied.push(...applyClientPrefsFromBundle(res.client_prefs ?? fileClientPrefs))
    } catch (e) {
      console.warn('[ConfigImportExport] apply client prefs failed', e)
    }
    try {
      await refreshLayoutPresets()
    } catch (e) {
      console.warn('[ConfigImportExport] refresh layout presets failed', e)
    }
    try {
      window.dispatchEvent(new CustomEvent('report-editor-config-imported'))
    } catch (e) {
      console.warn('[ConfigImportExport] dispatch config-imported failed', e)
    }
    const parts: string[] = []
    const imp = res.imported
    if (imp?.templates) parts.push(`模版 ${imp.templates} 份`)
    if (imp?.layout_presets) parts.push(`版式 ${imp.layout_presets} 套`)
    if (imp?.signature_assets) parts.push(`签名 ${imp.signature_assets} 个`)
    if (clientApplied.length) parts.push(`本机设置已更新`)
    const detail = parts.length ? `已恢复：${parts.join('、')}。` : '恢复完成。'
    const warnLines = Array.isArray(res.warnings) ? res.warnings.filter((w) => typeof w === 'string' && w) : []
    const warnText = warnLines.length ? `\n${warnLines.join('\n')}` : ''
    msg.value =
      (mode === 'replace' ? `已用备份完全替换当前配置。${detail}` : `已补充恢复配置。${detail}`) + warnText
    msgTone.value = warnLines.length ? 'warn' : 'ok'
    resetPendingSelection()
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

function confirmReplace() {
  if (!pendingJson.value) return
  if (
    !window.confirm(
      '「完全替换」会删除本机现有的连接、模版、版式、签名等，只保留备份文件里的内容。\n\n' +
        '建议先导出一份当前备份再操作。\n\n确定要继续吗？',
    )
  ) {
    return
  }
  void doImport('replace')
}
</script>

<style scoped>
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.backup-block {
  max-width: 480px;
  margin-bottom: 20px;
}

.backup-block:last-of-type {
  margin-bottom: 0;
}

.backup-subhead {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.backup-block .settings-btn--block + .settings-btn--block {
  margin-top: 10px;
}

.backup-filename {
  margin: 0 0 10px;
  font-size: 13px;
  color: #374151;
  word-break: break-all;
  line-height: 1.4;
}

.backup-note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
}

.backup-note code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 4px;
}

.backup-note--warn {
  color: #92400e;
}

.settings-btn--muted-danger {
  margin-top: 14px;
}
</style>
