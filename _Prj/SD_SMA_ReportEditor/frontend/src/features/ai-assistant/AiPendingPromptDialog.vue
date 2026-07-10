<template>
  <Teleport to="body">
    <div
      v-if="activePrompt"
      class="ai-pending-backdrop"
      @click.self="onCancel"
      @keydown.esc.prevent="onCancel"
    >
      <div
        class="ai-pending-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="dialogTitleId"
      >
        <h2 :id="dialogTitleId" class="ai-pending-title">{{ activePrompt.title }}</h2>
        <p class="ai-pending-message">{{ activePrompt.message }}</p>
        <p v-if="activePrompt.username_hint" class="ai-pending-hint">
          用户名：{{ activePrompt.username_hint }}
        </p>

        <template v-if="activePrompt.kind === 'credential'">
          <label class="ai-pending-label" :for="passwordInputId">密码</label>
          <input
            :id="passwordInputId"
            ref="passwordInput"
            v-model="password"
            type="password"
            class="ai-pending-input"
            autocomplete="off"
            @keydown.enter.prevent="onSubmitCredential"
          />
          <div class="ai-pending-actions">
            <button type="button" class="ai-pending-btn" :disabled="submitting" @click="onCancel">
              取消
            </button>
            <button
              type="button"
              class="ai-pending-btn ai-pending-btn--primary"
              :disabled="submitting || !password"
              @click="onSubmitCredential"
            >
              {{ submitting ? '保存中…' : '保存密码' }}
            </button>
          </div>
        </template>

        <template v-else-if="activePrompt.kind === 'confirm_delete'">
          <p class="ai-pending-warning">此操作不可撤销。</p>
          <div class="ai-pending-actions">
            <button type="button" class="ai-pending-btn" :disabled="submitting" @click="onCancel">
              取消
            </button>
            <button
              type="button"
              class="ai-pending-btn ai-pending-btn--danger"
              :disabled="submitting"
              @click="onSubmitConfirm(true)"
            >
              {{ submitting ? '删除中…' : '确认删除' }}
            </button>
          </div>
        </template>

        <p v-if="errorMsg" class="ai-pending-error">{{ errorMsg }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { apiFetch } from '@/api/client.js'
import {
  cancelAiPendingPrompt,
  fetchAiPendingPrompts,
  submitAiPendingConfirm,
  submitAiPendingCredential,
  type AiPendingPrompt,
} from '@/api/aiSettings'
import {
  fingerprintDatasourceLists,
  notifyDatasourceChanged,
  type DatasourceSyncScope,
} from '@/lib/datasource-sync-events'

defineOptions({ name: 'AiPendingPromptDialog' })

const POLL_MS = 2500

const activePrompt = ref<AiPendingPrompt | null>(null)
const password = ref('')
const submitting = ref(false)
const errorMsg = ref('')
const passwordInput = ref<HTMLInputElement | null>(null)
const dialogTitleId = 'ai-pending-title'
const passwordInputId = 'ai-pending-password'

let pollTimer: ReturnType<typeof setInterval> | null = null
let listFingerprint = ''

function scopeFromPrompt(prompt: AiPendingPrompt | null): DatasourceSyncScope {
  if (prompt?.target_kind === 'db') return 'db'
  if (prompt?.target_kind === 'opcua') return 'opcua'
  return 'all'
}

async function syncDatasourceFingerprint(reason: string) {
  try {
    const [dbData, opcData] = await Promise.all([
      apiFetch('/database/connections') as Promise<{ connections?: Array<{ id?: string }> }>,
      apiFetch('/opcua/servers') as Promise<{ servers?: Array<{ id?: string }> }>,
    ])
    const fp = fingerprintDatasourceLists(dbData.connections || [], opcData.servers || [])
    if (listFingerprint && fp !== listFingerprint) {
      notifyDatasourceChanged('all', reason)
    }
    listFingerprint = fp
  } catch {
    /* 后端未起时静默 */
  }
}

async function poll() {
  if (submitting.value) return
  try {
    const data = await fetchAiPendingPrompts()
    await syncDatasourceFingerprint('config_poll')
    const pending = (data.prompts || []).filter((p) => p.status === 'pending')
    if (!pending.length) {
      activePrompt.value = null
      password.value = ''
      errorMsg.value = ''
      return
    }
    const next = pending[0]
    if (!activePrompt.value || activePrompt.value.id !== next.id) {
      activePrompt.value = next
      password.value = ''
      errorMsg.value = ''
      await nextTick()
      passwordInput.value?.focus({ preventScroll: true })
    }
  } catch {
    /* 后端未起时静默 */
  }
}

async function onSubmitCredential() {
  if (!activePrompt.value || !password.value) return
  submitting.value = true
  errorMsg.value = ''
  const scope = scopeFromPrompt(activePrompt.value)
  try {
    await submitAiPendingCredential(activePrompt.value.id, password.value)
    notifyDatasourceChanged(scope, 'ai_pending_credential')
    password.value = ''
    activePrompt.value = null
    await poll()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    submitting.value = false
  }
}

async function onSubmitConfirm(confirmed: boolean) {
  if (!activePrompt.value) return
  submitting.value = true
  errorMsg.value = ''
  const scope = scopeFromPrompt(activePrompt.value)
  try {
    await submitAiPendingConfirm(activePrompt.value.id, confirmed)
    if (confirmed) notifyDatasourceChanged(scope, 'ai_pending_delete')
    activePrompt.value = null
    await poll()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    submitting.value = false
  }
}

async function onCancel() {
  if (!activePrompt.value || submitting.value) return
  try {
    await cancelAiPendingPrompt(activePrompt.value.id)
  } catch {
    /* ignore */
  }
  activePrompt.value = null
  password.value = ''
  errorMsg.value = ''
  await poll()
}

onMounted(() => {
  void syncDatasourceFingerprint('init')
  void poll()
  pollTimer = setInterval(() => void poll(), POLL_MS)
})

onUnmounted(() => {
  if (pollTimer != null) clearInterval(pollTimer)
})
</script>

<style scoped>
.ai-pending-backdrop {
  position: fixed;
  inset: 0;
  z-index: 14000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.5);
}

.ai-pending-dialog {
  width: min(440px, calc(100vw - 40px));
  padding: 22px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
}

.ai-pending-title {
  margin: 0 0 10px;
  color: #111827;
  font: 700 18px/1.3 system-ui, sans-serif;
}

.ai-pending-message {
  margin: 0 0 12px;
  color: #4b5563;
  font: 14px/1.5 system-ui, sans-serif;
  white-space: pre-wrap;
}

.ai-pending-hint {
  margin: 0 0 12px;
  color: #6b7280;
  font: 13px/1.4 system-ui, sans-serif;
}

.ai-pending-warning {
  margin: 0 0 14px;
  color: #b45309;
  font: 13px/1.4 system-ui, sans-serif;
}

.ai-pending-label {
  display: block;
  margin-bottom: 6px;
  color: #374151;
  font: 600 13px/1.3 system-ui, sans-serif;
}

.ai-pending-input {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font: 14px/1.4 system-ui, sans-serif;
}

.ai-pending-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.ai-pending-btn {
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font: 600 13px/1 system-ui, sans-serif;
  cursor: pointer;
}

.ai-pending-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ai-pending-btn--primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.ai-pending-btn--danger {
  border-color: #dc2626;
  background: #dc2626;
  color: #fff;
}

.ai-pending-error {
  margin: 12px 0 0;
  color: #dc2626;
  font: 13px/1.4 system-ui, sans-serif;
}
</style>
