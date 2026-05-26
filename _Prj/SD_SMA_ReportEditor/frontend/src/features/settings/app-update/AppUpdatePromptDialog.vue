<template>
  <div class="update-prompt-backdrop" @click.self="close">
    <div class="update-prompt-dialog" role="dialog" aria-labelledby="update-prompt-title">
      <h2 id="update-prompt-title" class="update-prompt-title">发现新版本</h2>
      <p class="update-prompt-lead">
        当前版本 {{ currentVersion || '—' }}，可升级至
        <strong>{{ appUpdateLatestVersion }}</strong>。
      </p>
      <pre v-if="appUpdateNotes" class="update-prompt-notes">{{ appUpdateNotes }}</pre>
      <div class="update-prompt-actions">
        <button type="button" class="settings-btn settings-btn--primary" @click="downloadNow">
          立即下载
        </button>
        <button type="button" class="settings-btn settings-btn--secondary" @click="goSettings">
          前往设置
        </button>
        <button type="button" class="settings-btn settings-btn--secondary" @click="skipVersion">
          跳过此版本
        </button>
        <button type="button" class="settings-btn settings-btn--secondary" @click="close">
          稍后
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  appUpdateLatestVersion,
  appUpdateNotes,
  appUpdateStartupPromptOpen,
  skipAppUpdateVersion,
  startAppUpdateDownload,
} from './appUpdateState'

const router = useRouter()
const currentVersion = ref('')

onMounted(async () => {
  const api = window.electronAPI
  if (!api?.getAppUpdateConfig) return
  try {
    const c = await api.getAppUpdateConfig()
    currentVersion.value = c.currentVersion || ''
  } catch {
    /* ignore */
  }
})

function close() {
  appUpdateStartupPromptOpen.value = false
}

function goSettings() {
  close()
  void router.push('/settings')
}

async function skipVersion() {
  await skipAppUpdateVersion()
  close()
}

async function downloadNow() {
  close()
  void router.push('/settings')
  await startAppUpdateDownload()
}
</script>

<style scoped>
.update-prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  padding: 24px;
}

.update-prompt-dialog {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
}

.update-prompt-title {
  margin: 0 0 8px;
  font-size: 18px;
  color: #111827;
}

.update-prompt-lead {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.5;
  color: #374151;
}

.update-prompt-notes {
  margin: 0 0 16px;
  max-height: 160px;
  overflow: auto;
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: #374151;
}

.update-prompt-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settings-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.settings-btn--primary {
  background: #6366f1;
  color: #fff;
  border: none;
}

.settings-btn--secondary {
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
}
</style>
