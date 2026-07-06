<template>
  <section class="settings-section settings-section--featured config-backup">
    <h3 class="settings-section__title">备份与恢复</h3>
    <div class="backup-callout">
      <strong>升级、换电脑或重装前，请先导出备份。</strong>
      导出的备份文件已<strong>加密</strong>（`.rebak`），可防止被随意查看或篡改，换台电脑也能直接导入恢复。
      卸载或重装前请务必先在此导出，以免本机配置丢失。
    </div>

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
    </div>

    <div class="backup-block">
      <h4 class="backup-subhead">从备份恢复</h4>
      <input
        ref="fileRef"
        type="file"
        class="file-input"
        accept=".rebak,application/json,.json,application/octet-stream"
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
        :disabled="busy || !hasPending"
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
        :disabled="busy || !hasPending"
        @click="confirmReplace"
      >
        完全替换为本备份
      </button>
      <p class="backup-note backup-note--warn">
        慎用：会<strong>删除</strong>当前所有连接、模版、版式、签名等，只使用备份文件里的内容。操作前请先导出一份当前备份。
      </p>
    </div>

    <div class="backup-block">
      <h4 class="backup-subhead">快速复位</h4>
      <button
        type="button"
        class="settings-btn settings-btn--danger settings-btn--block"
        :disabled="busy || resetting"
        @click="quickReset"
      >
        {{ resetting ? '正在复位…' : '快速复位（清空并恢复初始状态）' }}
      </button>
      <p class="backup-note backup-note--warn">
        会<strong>删除</strong>本机所有数据源、模版、版式、签名、操作审计与查询记录，恢复到刚安装的状态。
        不会删除已生成到磁盘的 PDF 报表文件。操作前请务必先导出备份。
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
import { computed, ref } from 'vue'
import { apiFetch } from '@/api/client.js'
import { resolveApiHref } from '@/api/apiBase.js'
import { refreshLayoutPresets } from '@/lib/report-template/layout-registry'
import {
  applyClientPrefsFromBundle,
  collectClientPrefs,
  buildImportDataFromFile,
  notifyReportEditorConfigRestored,
} from '@/features/settings/config-import-export/config-bundle-client'
import { auditLog } from '@/lib/auditLog'

const REBAK_MAGIC = 'SDRE1\n'

const busy = ref(false)
const resetting = ref(false)
const msg = ref('')
const msgTone = ref('')
const fileRef = ref<HTMLInputElement | null>(null)
/** 明文/旧版 JSON 备份内容 */
const pendingJson = ref<unknown>(null)
/** 加密 .rebak 备份的原始字节 */
const pendingBytes = ref<Uint8Array | null>(null)
const pendingFileName = ref('')
const hasPending = computed(() => Boolean(pendingBytes.value) || pendingJson.value != null)

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

function bytesLookEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < REBAK_MAGIC.length) return false
  for (let i = 0; i < REBAK_MAGIC.length; i += 1) {
    if (bytes[i] !== REBAK_MAGIC.charCodeAt(i)) return false
  }
  return true
}

function downloadBlob(blob: Blob, filename: string) {
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
    const res = await fetch(resolveApiHref('/settings/config/export'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'backup', format: 'encrypted', client_prefs: collectClientPrefs() }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `导出失败（HTTP ${res.status}）`)
    }
    const blob = await res.blob()
    const stamp = new Date().toISOString().slice(0, 10)
    downloadBlob(blob, `report-editor-backup-${stamp}.rebak`)
    msg.value = '加密备份文件已保存（一般在「下载」文件夹中）。文件已加密，请妥善保管。'
    msgTone.value = 'ok'
    void auditLog({ action: 'config.export', summary: '导出加密配置备份', result: 'ok' })
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

function resetPendingSelection() {
  pendingJson.value = null
  pendingBytes.value = null
  pendingFileName.value = ''
  if (fileRef.value) fileRef.value.value = ''
}

function applyPickedText(text: string, fileName: string) {
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

function applyPickedEncrypted(bytes: Uint8Array, fileName: string) {
  pendingBytes.value = bytes
  pendingFileName.value = fileName
  msg.value = '已选择加密备份文件，请选择下方恢复方式。'
  msgTone.value = 'ok'
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
      if ('encrypted' in res && res.encrypted && 'contentBase64' in res && res.contentBase64) {
        applyPickedEncrypted(base64ToBytes(res.contentBase64), res.fileName || 'backup.rebak')
        return
      }
      if ('content' in res && res.content) {
        applyPickedText(res.content, res.fileName || 'backup.json')
      }
    } catch (e: unknown) {
      msg.value = e instanceof Error ? e.message : '无法打开文件选择对话框'
      msgTone.value = 'err'
    }
    return
  }

  fileRef.value?.click()
}

async function onFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  msg.value = ''
  msgTone.value = ''
  resetPendingSelection()
  if (!f) return
  try {
    const buf = await f.arrayBuffer()
    const bytes = new Uint8Array(buf)
    if (bytesLookEncrypted(bytes)) {
      applyPickedEncrypted(bytes, f.name)
    } else {
      applyPickedText(new TextDecoder('utf-8').decode(bytes), f.name)
    }
  } catch {
    msg.value = '无法读取该文件，请重试。'
    msgTone.value = 'err'
  }
}

type ImportResponse = {
  ok?: boolean
  imported?: {
    templates?: number
    layout_presets?: number
    signature_assets?: number
    audit_entries?: number
  }
  client_prefs?: unknown
  warnings?: string[]
}

async function importEncrypted(mode: 'merge' | 'replace'): Promise<ImportResponse> {
  const bytes = pendingBytes.value as Uint8Array
  const res = await fetch(resolveApiHref(`/settings/config/import?mode=${mode}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data ? String((data as { detail: unknown }).detail) : text
    throw new Error(detail || `恢复失败（HTTP ${res.status}）`)
  }
  return (data || {}) as ImportResponse
}

async function doImport(mode: 'merge' | 'replace') {
  if (!hasPending.value) return
  busy.value = true
  msg.value = ''
  msgTone.value = ''
  try {
    let res: ImportResponse
    let fileClientPrefs: unknown = null
    if (pendingBytes.value) {
      res = await importEncrypted(mode)
    } else {
      const built = buildImportDataFromFile(pendingJson.value)
      fileClientPrefs = built.clientPrefs
      res = (await apiFetch('/settings/config/import', {
        method: 'POST',
        body: { mode, data: built.serverPayload },
      })) as ImportResponse
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
    notifyReportEditorConfigRestored()
    const parts: string[] = []
    const imp = res.imported
    if (imp?.templates) parts.push(`模版 ${imp.templates} 份`)
    if (imp?.layout_presets) parts.push(`版式 ${imp.layout_presets} 套`)
    if (imp?.signature_assets) parts.push(`签名 ${imp.signature_assets} 个`)
    if (imp?.audit_entries) parts.push(`审计 ${imp.audit_entries} 条`)
    if (clientApplied.length) parts.push(`本机设置已更新`)
    const detail = parts.length ? `已恢复：${parts.join('、')}。` : '恢复完成。'
    const warnLines = Array.isArray(res.warnings) ? res.warnings.filter((w) => typeof w === 'string' && w) : []
    const warnText = warnLines.length ? `\n${warnLines.join('\n')}` : ''
    msg.value =
      (mode === 'replace' ? `已用备份完全替换当前配置。${detail}` : `已补充恢复配置。${detail}`) +
      warnText +
      (clientApplied.length ? '\n生成报表等页面已自动刷新，无需重启。' : '')
    msgTone.value = warnLines.length ? 'warn' : 'ok'
    void auditLog({
      action: 'config.import',
      result: 'ok',
      summary: mode === 'replace' ? '完全替换' : '合并恢复',
      detail: { mode, parts },
    })
    resetPendingSelection()
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

function confirmReplace() {
  if (!hasPending.value) return
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

async function quickReset() {
  if (
    !window.confirm(
      '「快速复位」会删除本机所有数据源、模版、版式、签名、操作审计与查询记录，恢复到初始状态。\n\n' +
        '此操作不可撤销，强烈建议先「导出备份文件」。\n\n确定要继续吗？',
    )
  ) {
    return
  }
  resetting.value = true
  msg.value = ''
  msgTone.value = ''
  try {
    const res = (await apiFetch('/settings/config/reset', { method: 'POST' })) as { ok?: boolean }
    if (!res?.ok) throw new Error('复位未成功')
    try {
      for (const key of [
        'tm-view-mode',
        'lp-view-mode',
        'rh-view-mode',
        'reportGeneratorPrefsV1',
        'reportExportPrefsV1',
        'sd-sma-report-editor.template-display-order',
        'sd-sma-report-editor.layout-display-order',
        'rptp-report-templates',
        'rptp-layout-presets',
      ]) {
        localStorage.removeItem(key)
      }
    } catch (e) {
      console.warn('[ConfigImportExport] clear local prefs failed', e)
    }
    try {
      await refreshLayoutPresets()
    } catch (e) {
      console.warn('[ConfigImportExport] refresh layout presets failed', e)
    }
    notifyReportEditorConfigRestored()
    msg.value = '已恢复到初始状态。各页面将自动刷新显示。'
    msgTone.value = 'ok'
    void auditLog({ action: 'config.reset', summary: '快速复位', result: 'ok' })
    resetPendingSelection()
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    resetting.value = false
  }
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

.backup-callout {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  font-size: 13px;
  line-height: 1.55;
  color: #78350f;
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
