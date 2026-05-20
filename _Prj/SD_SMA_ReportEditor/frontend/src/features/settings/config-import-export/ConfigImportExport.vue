<template>
  <section class="settings-section config-import">
    <h3 class="settings-section__title">配置导入 / 导出</h3>
    <p class="settings-hint">
      打包内容包含：<strong>数据源</strong>（数据库与 OPC UA）、<strong>报表模版</strong>、<strong>版式</strong>、<strong>签名库</strong>，
      以及本机的<strong>生成报表</strong>与<strong>历史报表</strong>配置（自动导出目录、触发绑定、监视文件夹等）。
      「脱敏」导出会掩码数据库与 OPC 密码（适合共享结构，目标机需重新填口令）。「本机备份」含明文口令，可迁移到另一台电脑导入后自动按该机密钥加密（请妥善保管 JSON 文件）。
    </p>
    <div class="config-import-stack">
      <div class="config-import-grid">
        <button
          type="button"
          class="settings-btn settings-btn--primary settings-btn--block"
          :disabled="busy"
          @click="exportShare"
        >
          导出（脱敏）
        </button>
        <button
          type="button"
          class="settings-btn settings-btn--block"
          :disabled="busy"
          @click="exportBackup"
        >
          导出（本机备份）
        </button>
      </div>

      <div class="config-import-grid">
        <div class="config-import-file-cell">
          <input
            id="config-file-input"
            ref="fileRef"
            type="file"
            class="file-input"
            accept="application/json,.json"
            @change="onFile"
          />
          <label for="config-file-input" class="settings-btn settings-btn--file settings-btn--block file-picker-label">
            选择配置文件
          </label>
        </div>
        <p class="config-import-status" :title="pendingFileName || undefined">
          <span v-if="pendingFileName" class="config-import-status-name">{{ pendingFileName }}</span>
          <span v-else class="config-import-status-placeholder">未选择文件</span>
        </p>
      </div>

      <div class="config-import-grid">
        <button
          type="button"
          class="settings-btn settings-btn--block"
          :disabled="busy || !pendingJson"
          @click="doImport('merge')"
        >
          合并导入
        </button>
        <button
          type="button"
          class="settings-btn settings-btn--danger settings-btn--block"
          :disabled="busy || !pendingJson"
          @click="confirmReplace"
        >
          覆盖导入
        </button>
      </div>
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

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportShare() {
  busy.value = true
  msg.value = ''
  msgTone.value = ''
  try {
    const data = attachClientPrefsToBundle(
      (await apiFetch('/settings/config/export?mode=share')) as Record<string, unknown>,
    )
    downloadJson(data, 'report-editor-bundle-share.json')
    msg.value = '已下载。'
    msgTone.value = 'ok'
  } catch (e) {
    msg.value = e.message || String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

async function exportBackup() {
  busy.value = true
  msg.value = ''
  msgTone.value = ''
  try {
    const data = attachClientPrefsToBundle(
      (await apiFetch('/settings/config/export?mode=backup')) as Record<string, unknown>,
    )
    downloadJson(data, 'report-editor-bundle-backup.json')
    msg.value = '已下载。'
    msgTone.value = 'ok'
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

function onFile(ev: Event) {
  const f = ev.target.files?.[0]
  pendingJson.value = null
  pendingFileName.value = ''
  msg.value = ''
  if (!f) return
  pendingFileName.value = f.name
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const text = String(reader.result || '')
      pendingJson.value = JSON.parse(text)
      msg.value = '已就绪，可选择导入方式。'
      msgTone.value = 'ok'
    } catch (e) {
      msg.value = e.message || '无法解析文件'
      msgTone.value = 'err'
    }
  }
  reader.readAsText(f, 'UTF-8')
}

async function doImport(mode) {
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
    const clientApplied = applyClientPrefsFromBundle(res.client_prefs ?? fileClientPrefs)
    await refreshLayoutPresets()
    window.dispatchEvent(new CustomEvent('report-editor-config-imported'))
    const parts: string[] = []
    const imp = res.imported
    if (imp?.templates) parts.push(`模版 ${imp.templates} 条`)
    if (imp?.layout_presets) parts.push(`版式 ${imp.layout_presets} 条`)
    if (imp?.signature_assets) parts.push(`签名 ${imp.signature_assets} 条`)
    if (clientApplied.length) parts.push(`本机：${clientApplied.join('、')}`)
    const detail = parts.length ? `（${parts.join('；')}）` : ''
    const warnLines = Array.isArray(res.warnings) ? res.warnings.filter((w) => typeof w === 'string' && w) : []
    const warnText = warnLines.length ? `\n${warnLines.join('\n')}` : ''
    msg.value =
      (mode === 'replace' ? `已完成覆盖导入。${detail}` : `已完成合并导入。${detail}`) + warnText
    msgTone.value = warnLines.length ? 'warn' : 'ok'
    if (fileRef.value) fileRef.value.value = ''
    pendingJson.value = null
    pendingFileName.value = ''
  } catch (e) {
    msg.value = e.message || String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

function confirmReplace() {
  if (!pendingJson.value) return
  if (
    !window.confirm(
      '覆盖导入将替换当前数据源、模版、版式、签名库及本机生成/历史报表配置。确定继续？',
    )
  ) {
    return
  }
  doImport('replace')
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

/* 三行共用同一两列网格，左缘与列宽对齐，避免「各行按钮长短不一、间距忽大忽小」 */
.config-import-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 520px;
}

.config-import-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.config-import-file-cell {
  position: relative;
  min-width: 0;
}

.file-picker-label {
  display: flex;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  margin: 0;
}

.config-import-status {
  margin: 0;
  min-width: 0;
  min-height: 40px;
  display: flex;
  align-items: center;
  font-size: 13px;
  line-height: 1.35;
}

.config-import-status-name {
  color: #374151;
  word-break: break-all;
}

.config-import-status-placeholder {
  color: #9ca3af;
}

@media (max-width: 480px) {
  .config-import-grid {
    grid-template-columns: 1fr;
  }
}
</style>
