<template>
  <div class="wiz-export-dir">
    <p class="wiz-export-lead">
      请选择生成报表时<strong>默认保存 PDF 的文件夹</strong>。之后可在「生成报表」或「历史报表」中修改。
    </p>

    <div v-if="!electronShell" class="wiz-export-banner">
      文件夹选择需在<strong>桌面版</strong>中使用。当前为浏览器预览模式，请安装桌面版后再设置，或稍后在「生成报表」页配置。
    </div>

    <div class="wiz-export-path-card">
      <span class="wiz-export-path-label">当前文件夹</span>
      <p v-if="watchDir" class="wiz-export-path-value" :title="watchDir">{{ watchDir }}</p>
      <p v-else class="wiz-export-path-empty">尚未选择（可跳过，稍后再设）</p>
    </div>

    <div class="settings-actions">
      <button
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="!electronShell || picking"
        @click="onPickDir"
      >
        {{ picking ? '正在打开…' : watchDir ? '更换文件夹' : '选择文件夹' }}
      </button>
      <button
        v-if="watchDir"
        type="button"
        class="settings-btn"
        :disabled="picking"
        @click="onClearDir"
      >
        清除选择
      </button>
    </div>

    <ul class="wiz-export-notes">
      <li>该文件夹同时用于<strong>历史报表</strong>列表，方便查看最近导出的 PDF。</li>
      <li>请确保本机对该文件夹有读写权限；网络共享盘路径需能稳定访问。</li>
    </ul>

    <p v-if="msg" :class="['wiz-export-msg', msgOk ? 'ok' : 'err']">{{ msg }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  loadReportExportPrefs,
  setDefaultReportExportDir,
} from '@/lib/report-export-prefs'

const watchDir = ref(null)
const picking = ref(false)
const msg = ref('')
const msgOk = ref(true)

const electronShell = computed(
  () => typeof window !== 'undefined' && Boolean(window.electronAPI?.pickExportDirectory),
)

function hydrate() {
  watchDir.value = loadReportExportPrefs().watchDir
}

async function onPickDir() {
  msg.value = ''
  picking.value = true
  try {
    const picked = await window.electronAPI?.pickExportDirectory?.({
      title: '选择默认报表输出文件夹',
      defaultPath: watchDir.value || undefined,
    })
    if (!picked) {
      msg.value = '未选择文件夹。'
      msgOk.value = true
      return
    }
    watchDir.value = picked
    setDefaultReportExportDir(picked)
    msg.value = '已保存默认输出文件夹。'
    msgOk.value = true
  } catch (e) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgOk.value = false
  } finally {
    picking.value = false
  }
}

function onClearDir() {
  watchDir.value = null
  setDefaultReportExportDir(null)
  msg.value = '已清除；导出时将提示您选择保存位置。'
  msgOk.value = true
}

onMounted(() => {
  hydrate()
})
</script>

<style scoped>
.wiz-export-dir {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wiz-export-lead {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: #334155;
}

.wiz-export-banner {
  font-size: 13px;
  line-height: 1.5;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 10px 12px;
}

.wiz-export-path-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  background: #fff;
}

.wiz-export-path-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 6px;
}

.wiz-export-path-value {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: #0f172a;
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.wiz-export-path-empty {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.wiz-export-notes {
  margin: 0;
  padding-left: 1.2em;
  font-size: 13px;
  line-height: 1.55;
  color: #64748b;
}

.wiz-export-notes li + li {
  margin-top: 6px;
}

.wiz-export-msg {
  margin: 0;
  font-size: 13px;
}

.wiz-export-msg.ok {
  color: #047857;
}

.wiz-export-msg.err {
  color: #b91c1c;
}
</style>

<style>
@import '@/features/settings/settings-sections.css';
</style>
