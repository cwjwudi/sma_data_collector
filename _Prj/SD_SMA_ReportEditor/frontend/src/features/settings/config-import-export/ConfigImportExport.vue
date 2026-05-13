<template>
  <section class="card">
    <h3>配置导入 / 导出</h3>
    <div class="actions">
      <button type="button" class="btn-touch primary" :disabled="busy" @click="exportShare">导出（脱敏）</button>
      <button type="button" class="btn-touch" :disabled="busy" @click="exportBackup">导出（本机备份）</button>
    </div>
    <div class="import-row">
      <input
        id="config-file-input"
        ref="fileRef"
        type="file"
        class="file-input"
        accept="application/json,.json"
        @change="onFile"
      />
      <label for="config-file-input" class="btn-touch file-label">选择配置文件</label>
      <span v-if="pendingFileName" class="file-name">{{ pendingFileName }}</span>
      <span v-else class="file-hint">未选择文件</span>
    </div>
    <div class="import-actions">
      <button type="button" class="btn-touch" :disabled="busy || !pendingJson" @click="doImport('merge')">
        合并导入
      </button>
      <button type="button" class="btn-touch danger" :disabled="busy || !pendingJson" @click="confirmReplace">
        覆盖导入
      </button>
    </div>
    <p v-if="msg" :class="['msg', msgTone]">{{ msg }}</p>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { apiFetch } from '@/api/client.js'

const busy = ref(false)
const msg = ref('')
const msgTone = ref('')
const fileRef = ref(null)
const pendingJson = ref(null)
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
    const data = await apiFetch('/settings/config/export?mode=share')
    downloadJson(data, 'report-editor-config-share.json')
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
    const data = await apiFetch('/settings/config/export?mode=backup')
    downloadJson(data, 'report-editor-config-backup.json')
    msg.value = '已下载。'
    msgTone.value = 'ok'
  } catch (e) {
    msg.value = e.message || String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

function onFile(ev) {
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
    await apiFetch('/settings/config/import', {
      method: 'POST',
      body: { mode, data: pendingJson.value },
    })
    window.dispatchEvent(new CustomEvent('report-editor-config-imported'))
    msg.value = mode === 'replace' ? '已完成覆盖导入。' : '已完成合并导入。'
    msgTone.value = 'ok'
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
  if (!window.confirm('覆盖导入将替换当前连接与 OPC UA 列表。确定继续？')) {
    return
  }
  doImport('replace')
}
</script>

<style scoped>
.card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  margin-top: 16px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 18px;
}
.import-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
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
.file-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #f3f4f6;
  border-color: #d1d5db;
  -webkit-tap-highlight-color: transparent;
}
.file-name {
  font-size: 15px;
  color: #374151;
  word-break: break-all;
}
.file-hint {
  font-size: 14px;
  color: #9ca3af;
}
.import-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.btn-touch {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 20px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 16px;
  -webkit-tap-highlight-color: transparent;
}
.btn-touch.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
.btn-touch.danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
.btn-touch:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.msg {
  font-size: 14px;
  margin-top: 12px;
}
.msg.ok {
  color: #166534;
}
.msg.err {
  color: #b91c1c;
}
</style>
