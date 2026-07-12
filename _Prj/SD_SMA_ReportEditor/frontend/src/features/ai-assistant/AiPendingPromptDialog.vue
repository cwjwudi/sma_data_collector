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

        <template v-else-if="isConfirmKind">
          <p v-if="activePrompt.kind === 'confirm_unlock_datasource'" class="ai-pending-warning">确认后将解锁数据源，之后 AI 与人工均可修改连接配置。</p>
          <p v-else-if="activePrompt.kind === 'confirm_reset'" class="ai-pending-warning">将清空数据源、模版、版式与审计，不可撤销。</p>
          <p v-else-if="activePrompt.kind === 'confirm_import_merge'" class="ai-pending-warning">将 merge 合并配置，可能覆盖同名连接与资产。</p>
          <p v-else-if="activePrompt.kind === 'confirm_manual_export'" class="ai-pending-warning">将执行一次模拟结批 PDF 导出。</p>
          <p v-else class="ai-pending-warning">此操作不可撤销。</p>
          <div class="ai-pending-actions">
            <button type="button" class="ai-pending-btn" :disabled="submitting" @click="onCancel">取消</button>
            <button
              type="button"
              class="ai-pending-btn"
              :class="confirmDanger ? 'ai-pending-btn--danger' : 'ai-pending-btn--primary'"
              :disabled="submitting"
              @click="onSubmitConfirm(true)"
            >
              {{ confirmButtonLabel }}
            </button>
          </div>
        </template>

        <template v-else-if="activePrompt.kind === 'pick_export_dir'">
          <div class="ai-pending-actions">
            <button type="button" class="ai-pending-btn" :disabled="submitting" @click="onCancel">取消</button>
            <button type="button" class="ai-pending-btn ai-pending-btn--primary" :disabled="submitting" @click="onPickExportDir">
              {{ pickDirButtonLabel }}
            </button>
          </div>
        </template>

        <template v-else-if="activePrompt.kind === 'check_update'">
          <div class="ai-pending-actions">
            <button type="button" class="ai-pending-btn" :disabled="submitting" @click="onCancel">取消</button>
            <button type="button" class="ai-pending-btn ai-pending-btn--primary" :disabled="submitting" @click="onSubmitConfirm(true)">
              检查更新
            </button>
          </div>
        </template>

        <template v-else-if="activePrompt.kind === 'open_editor'">
          <div class="ai-pending-actions">
            <button type="button" class="ai-pending-btn" :disabled="submitting" @click="onCancel">取消</button>
            <button type="button" class="ai-pending-btn ai-pending-btn--primary" :disabled="submitting" @click="onSubmitConfirm(true)">
              打开
            </button>
          </div>
        </template>

        <p v-if="errorMsg" class="ai-pending-error">{{ errorMsg }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '@/api/client.js'
import { resolveApiHref } from '@/api/apiBase.js'
import {
  cancelAiPendingPrompt,
  fetchAiPendingPrompts,
  submitAiPendingConfirm,
  submitAiPendingCredential,
  type AiPendingPrompt,
} from '@/api/aiSettings'
import { checkAppUpdateManual } from '@/features/settings/app-update/appUpdateState'
import {
  collectClientPrefs,
  notifyReportEditorConfigRestored,
} from '@/features/settings/config-import-export/config-bundle-client'
import { mirrorClientPrefsToBackend, applyPendingMirrorFromBackend } from '@/lib/client-prefs-mirror'
import {
  fingerprintDatasourceLists,
  notifyAssetsChanged,
  notifyDatasourceChanged,
  type DatasourceSyncScope,
} from '@/lib/datasource-sync-events'
import { loadReportGeneratorPrefs } from '@/lib/report-generator-prefs'

defineOptions({ name: 'AiPendingPromptDialog' })

const router = useRouter()
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

const CONFIRM_KINDS = new Set([
  'confirm_delete',
  'confirm_unlock_datasource',
  'confirm_reset',
  'confirm_import_merge',
  'confirm_manual_export',
])

const isConfirmKind = computed(() => CONFIRM_KINDS.has(String(activePrompt.value?.kind || '')))
const confirmDanger = computed(() => {
  const k = activePrompt.value?.kind
  return k === 'confirm_delete' || k === 'confirm_reset'
})
const confirmButtonLabel = computed(() => {
  if (submitting.value) return '处理中…'
  const k = activePrompt.value?.kind
  if (k === 'confirm_unlock_datasource') return '确认解锁'
  if (k === 'confirm_reset') return '确认复位'
  if (k === 'confirm_import_merge') return '确认导入'
  if (k === 'confirm_manual_export') return '开始导出'
  return '确认删除'
})
const pickDirButtonLabel = computed(() => {
  const action = activePrompt.value?.payload?.action
  return action === 'backup_export' ? '选择备份保存位置' : '选择输出目录'
})

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
    await mirrorClientPrefsToBackend()
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

async function handleClientAction(action: string, payload: Record<string, unknown>, prompt: AiPendingPrompt) {
  if (action === 'confirm_manual_export') {
    const tid = String(payload.template_id || prompt.payload?.template_id || prompt.connection_id || '')
    const api = window.electronAPI
    if (!api?.runPdfExport || !api.pathJoin) {
      throw new Error('模拟结批需要 Electron 桌面版')
    }
    const prefs = loadReportGeneratorPrefs()
    let exportDir = prefs.autoExportDir || ''
    if (!exportDir && api.pickExportDirectory) {
      exportDir = (await api.pickExportDirectory({ title: '选择 PDF 输出目录' })) || ''
    }
    if (!exportDir) throw new Error('未设置输出目录')
    const name = String(payload.template_name || prompt.connection_name || tid)
    const safe = name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
    const filePath = await api.pathJoin(exportDir, `${safe}_${Date.now()}.pdf`)
    await api.runPdfExport({ templateId: tid, filePath, openAfter: false })
    notifyAssetsChanged('manual_export')
    return
  }
  if (action === 'check_update') {
    await checkAppUpdateManual()
    return
  }
  if (action === 'open_editor') {
    const editor = String(payload.editor || prompt.payload?.editor || '')
    const id = String(payload.id || prompt.payload?.id || prompt.connection_id || '')
    if (!id) throw new Error('缺少编辑目标 id')
    if (editor === 'layout') {
      await router.push({ name: 'LayoutPresetEditor', params: { id } })
    } else {
      await router.push({ name: 'TemplateEditor', params: { id } })
    }
    return
  }
  if (action === 'pick_export_dir') {
    await onPickExportDir()
  }
}

async function onSubmitConfirm(confirmed: boolean) {
  if (!activePrompt.value) return
  submitting.value = true
  errorMsg.value = ''
  const prompt = activePrompt.value
  const scope = scopeFromPrompt(prompt)
  try {
    const res = (await submitAiPendingConfirm(prompt.id, confirmed)) as {
      client_action?: string
      payload?: Record<string, unknown>
    }
    if (confirmed) {
      if (res.client_action) {
        await handleClientAction(res.client_action, res.payload || {}, prompt)
      }
      if (prompt.kind === 'confirm_reset' || prompt.kind === 'confirm_import_merge') {
        notifyReportEditorConfigRestored()
        window.dispatchEvent(new CustomEvent('report-editor-config-imported'))
        notifyDatasourceChanged('all', 'config_reset')
        notifyAssetsChanged('config_change')
      } else if (prompt.kind === 'confirm_unlock_datasource') {
        window.dispatchEvent(
          new CustomEvent('report-editor-datasource-lock-changed', { detail: { locked: false } }),
        )
        notifyDatasourceChanged('all', 'ai_pending_unlock')
      } else if (prompt.kind === 'confirm_delete') {
        if (prompt.target_kind === 'template' || prompt.target_kind === 'layout') {
          notifyAssetsChanged('delete')
        } else {
          notifyDatasourceChanged(scope, 'ai_pending_delete')
        }
      }
    }
    activePrompt.value = null
    await poll()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    submitting.value = false
  }
}

async function onPickExportDir() {
  if (!activePrompt.value) return
  submitting.value = true
  errorMsg.value = ''
  const prompt = activePrompt.value
  const action = prompt.payload?.action
  try {
    const api = window.electronAPI
    if (action === 'backup_export') {
      const res = await fetch(resolveApiHref('/settings/config/export'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'backup',
          format: 'encrypted',
          client_prefs: collectClientPrefs(),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const stamp = new Date().toISOString().slice(0, 10)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-editor-backup-${stamp}.rebak`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      if (!api?.pickExportDirectory) throw new Error('需要 Electron 目录选择')
      const dir = await api.pickExportDirectory({ title: '选择 PDF 输出目录' })
      if (!dir) throw new Error('未选择目录')
      await apiFetch('/settings/client_prefs/mirror', {
        method: 'POST',
        body: {
          report_generator: { ...loadReportGeneratorPrefs(), autoExportDir: dir, autoExportDirSource: 'default' },
          report_export: { watchDir: dir },
          pending_apply: true,
        },
      })
      applyPendingMirrorFromBackend({
        report_generator: { autoExportDir: dir, autoExportDirSource: 'default' },
        report_export: { watchDir: dir },
        pending_apply: true,
      })
    }
    await cancelAiPendingPrompt(prompt.id)
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
