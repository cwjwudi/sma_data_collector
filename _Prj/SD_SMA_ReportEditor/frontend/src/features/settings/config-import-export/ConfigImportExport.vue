<template>
  <section class="card">
    <h3>配置导入 / 导出</h3>
    <p class="muted">
      <strong>脱敏导出</strong>：不含 <code>password_enc</code>，可给同事对齐结构；仍可能含主机名、库名等业务信息，请自行审查。<strong>本机备份</strong>：含密文，勿上传网盘或提交 Git；跨机器还原需同目录下的密钥文件，否则请重新录入密码。
    </p>
    <div class="actions">
      <button type="button" class="btn primary sm" :disabled="busy" @click="exportShare">导出（脱敏）</button>
      <button type="button" class="btn sm" :disabled="busy" @click="exportBackup">导出（本机备份）</button>
    </div>
    <div class="import-block">
      <label class="file">
        <input ref="fileRef" type="file" accept="application/json,.json" @change="onFile" />
        <span>选择 JSON 文件</span>
      </label>
      <div class="row">
        <button type="button" class="btn sm" :disabled="busy || !pendingJson" @click="doImport('merge')">合并导入</button>
        <button type="button" class="btn danger sm" :disabled="busy || !pendingJson" @click="confirmReplace">
          覆盖导入
        </button>
      </div>
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
    msg.value = '已下载脱敏配置。'
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
    msg.value = '已下载本机备份（含密文，请妥善保管）。'
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
  msg.value = ''
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const text = String(reader.result || '')
      pendingJson.value = JSON.parse(text)
      msg.value = '已读取文件，请选择合并或覆盖导入。'
      msgTone.value = 'ok'
    } catch (e) {
      msg.value = e.message || 'JSON 解析失败'
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
    msg.value =
      mode === 'replace'
        ? '已覆盖导入。请刷新或重新进入「数据源」页以加载最新连接列表。'
        : '已合并导入。已通知界面重新加载配置。'
    msgTone.value = 'ok'
    if (fileRef.value) fileRef.value.value = ''
    pendingJson.value = null
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
      '覆盖导入将用文件中的连接与 OPC UA 列表替换当前配置（合并策略不同）。确定继续？',
    )
  ) {
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
.muted {
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 12px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.import-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
.btn.danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.file input {
  display: none;
}
.file span {
  font-size: 13px;
  color: #2563eb;
  cursor: pointer;
  text-decoration: underline;
}
.msg {
  font-size: 13px;
  margin-top: 8px;
}
.msg.ok {
  color: #166534;
}
.msg.err {
  color: #b91c1c;
}
</style>
