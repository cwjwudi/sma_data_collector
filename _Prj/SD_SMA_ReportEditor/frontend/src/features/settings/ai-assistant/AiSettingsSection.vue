<template>
  <section class="settings-section">
    <h3 class="settings-section__title">AI 助手与 Cursor 接入</h3>
    <p class="settings-hint">
      配置 OpenAI 兼容 LLM 后，可在任意页面使用 AI 助手诊断连接与导出问题。
      <strong>本机 Cursor / Codex</strong> 可像接 LM Studio 一样：只需把 Base URL 指到下方「Chat API（本机）」，
      API Key 可填任意占位（本机不校验令牌）。局域网接入才需要 Agent 令牌。详见
      <a class="ai-doc-link" href="#" @click.prevent="openDocHint">接入说明</a>。
    </p>
    <p class="settings-hint settings-hint--warn">
      此处填写的是 <strong>API Key + Base URL</strong>（按量/预付额度），与 ChatGPT 网页/App 订阅<strong>不互通</strong>。
      换硅基流动等上游后，请「刷新模型列表」并改选该平台模型 ID，不要沿用 gpt-* 名。
    </p>

    <div class="settings-switch-row">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="form.enabled ? 'true' : 'false'"
        @click="toggleEnabled"
      >
        <span class="settings-switch-track" :class="{ on: form.enabled }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">启用 AI 助手</span>
      </button>
    </div>

    <div class="settings-field-row" :class="{ 'settings-field-row--muted': !form.enabled }">
      <span class="settings-field-label">LLM Base URL</span>
      <input v-model="form.llm_base_url" class="settings-input" type="url" :disabled="busy || !form.enabled" />
    </div>
    <div
      class="settings-field-row ai-model-field"
      :class="{ 'settings-field-row--muted': !form.enabled, 'ai-model-field--mismatch': modelMismatch }"
    >
      <span class="settings-field-label">模型</span>
      <div class="ai-model-row">
        <SuggestCombobox
          v-model="form.llm_model"
          class="ai-model-combobox"
          input-class="ai-model-combobox-inp"
          :options="modelOptions"
          :disabled="busy || !form.enabled"
          :max-list-height="320"
          :min-list-width="420"
          placeholder="选择或输入模型名"
        />
        <button
          type="button"
          class="settings-btn settings-btn--muted"
          :disabled="busy || !form.enabled || modelsBusy"
          @click="refreshModels"
        >
          {{ modelsBusy ? '拉取中…' : '刷新模型列表' }}
        </button>
      </div>
    </div>
    <p v-if="modelsHint" class="settings-hint ai-models-hint" :class="{ 'settings-hint--warn': modelMismatch }">
      {{ modelsHint }}
    </p>
    <p v-if="modelMismatch" class="settings-hint settings-hint--warn">
      当前模型不在上游列表中（换 Base URL 后常见）。请下拉改选，或
      <button type="button" class="ai-doc-link" :disabled="busy || !form.enabled" @click="usePreferredUpstreamModel">
        改用列表首个聊天模型
      </button>
      。
    </p>
    <div class="settings-field-row" :class="{ 'settings-field-row--muted': !form.enabled }">
      <span class="settings-field-label">LLM API Key</span>
      <input
        v-model="llmKeyInput"
        class="settings-input"
        type="password"
        autocomplete="off"
        :placeholder="settings.has_llm_api_key ? '已保存密钥（留空保存不会覆盖）' : 'sk-…'"
        :disabled="busy || !form.enabled"
      />
    </div>
    <p v-if="settings.has_llm_api_key" class="settings-hint">已保存密钥 · 留空保存不会覆盖；仅在需要更换时填写新 Key。</p>

    <div class="settings-switch-row" :class="{ 'settings-field-row--muted': !form.enabled }">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="form.allow_lan_access ? 'true' : 'false'"
        :disabled="!form.enabled || busy"
        @click="form.allow_lan_access = !form.allow_lan_access"
      >
        <span class="settings-switch-track" :class="{ on: form.allow_lan_access }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">允许局域网访问 Agent API（Cursor）</span>
      </button>
    </div>

    <div class="settings-switch-row" :class="{ 'settings-field-row--muted': !form.enabled }">
      <button
        type="button"
        class="settings-switch"
        role="switch"
        :aria-checked="form.write_tools_enabled ? 'true' : 'false'"
        :disabled="!form.enabled || busy"
        @click="form.write_tools_enabled = !form.write_tools_enabled"
      >
        <span class="settings-switch-track" :class="{ on: form.write_tools_enabled }">
          <span class="settings-switch-thumb" />
        </span>
        <span class="settings-switch-label">允许 AI 写入工具（0.3.2 · 探活间隔等）</span>
      </button>
    </div>

    <p class="settings-hint">
      <router-link class="ai-doc-link" to="/ai-tools">管理单个工具开关 →</router-link>
    </p>

    <div class="ai-token-row">
      <button type="button" class="settings-btn settings-btn--primary" :disabled="busy || !form.enabled" @click="onSave">
        保存 AI 设置
      </button>
      <button type="button" class="settings-btn settings-btn--muted" :disabled="busy || !form.enabled" @click="onRegenerate">
        生成 Agent 令牌
      </button>
    </div>

    <div v-if="settings.has_agent_token" class="settings-note">
      当前 Agent 令牌尾号：<code>{{ settings.agent_token_hint || '****' }}</code>
    </div>
    <div v-if="newAgentToken" class="ai-token-box">
      <p class="settings-note">新 Agent 令牌（仅显示一次，请立即复制）：</p>
      <code class="ai-token-value">{{ newAgentToken }}</code>
      <button type="button" class="settings-btn settings-btn--muted" @click="copyToken">复制令牌</button>
    </div>

    <div class="ep-list ai-endpoints">
      <div class="ep-row">
        <div class="ep-row__label">Chat API（本机）</div>
        <div class="ep-row__value">
          <code class="ep-row__addr">{{ settings.agent_chat_url_loopback || '—' }}</code>
          <button type="button" class="settings-btn settings-btn--muted ep-copy" @click="copyUrl(settings.agent_chat_url_loopback)">
            复制
          </button>
        </div>
      </div>
      <div v-if="settings.agent_chat_url_lan" class="ep-row">
        <div class="ep-row__label">Chat API（局域网）</div>
        <div class="ep-row__value">
          <code class="ep-row__addr">{{ settings.agent_chat_url_lan }}</code>
          <button type="button" class="settings-btn settings-btn--muted ep-copy" @click="copyUrl(settings.agent_chat_url_lan)">
            复制
          </button>
        </div>
      </div>
    </div>

    <p v-if="settings.ready" class="settings-msg settings-msg--ok">
      AI 已就绪：本机 Cursor 只需 Base URL（无需令牌）；应用内助手可用。
    </p>
    <p v-else-if="form.enabled" class="settings-hint settings-hint--warn">请保存 LLM Key 以完成配置。</p>

    <p v-if="msg" class="settings-msg" :class="{ 'settings-msg--ok': msgTone === 'ok', 'settings-msg--err': msgTone === 'err' }">
      {{ msg }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  fetchAiSettings,
  fetchAiUpstreamModels,
  patchAiSettings,
  regenerateAgentToken,
  type AiSettingsPublic,
} from '@/api/aiSettings'
import SuggestCombobox from '@/components/report-template/SuggestCombobox.vue'
import { isModelInUpstreamList, pickPreferredChatModel } from '@/lib/ai-model-list'

defineOptions({ name: 'AiSettingsSection' })

const settings = ref<AiSettingsPublic>({
  enabled: false,
  llm_base_url: 'https://api.openai.com/v1',
  llm_model: 'gpt-4o-mini',
  has_llm_api_key: false,
  has_agent_token: false,
  agent_token_hint: '',
  allow_lan_access: false,
  write_tools_enabled: false,
  agent_chat_url_loopback: 'http://127.0.0.1:8000/v1',
  agent_chat_url_lan: null,
  ready: false,
})

const form = reactive({
  enabled: false,
  llm_base_url: 'https://api.openai.com/v1',
  llm_model: 'gpt-4o-mini',
  allow_lan_access: false,
  write_tools_enabled: false,
})

const llmKeyInput = ref('')
const busy = ref(false)
const msg = ref('')
const msgTone = ref<'ok' | 'err' | ''>('')
const newAgentToken = ref('')
const modelOptions = ref<string[]>(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'])
const modelsBusy = ref(false)
const modelsHint = ref('')
const upstreamListReady = ref(false)

const modelMismatch = computed(() => {
  if (!upstreamListReady.value || !modelOptions.value.length) return false
  return !isModelInUpstreamList(form.llm_model, modelOptions.value)
})

function applyPublic(s: AiSettingsPublic) {
  settings.value = s
  form.enabled = s.enabled
  form.llm_base_url = s.llm_base_url
  form.llm_model = s.llm_model
  form.allow_lan_access = s.allow_lan_access
  form.write_tools_enabled = s.write_tools_enabled
}

async function refreshModels() {
  modelsBusy.value = true
  modelsHint.value = ''
  try {
    const res = await fetchAiUpstreamModels()
    modelOptions.value = res.models?.length ? res.models : modelOptions.value
    upstreamListReady.value = Boolean(res.models?.length)
    if (res.ok) {
      modelsHint.value = `已从上游拉取 ${res.models.length} 个模型（可下拉选择或手输）`
    } else {
      modelsHint.value = res.error || '已使用常用模型列表'
    }
    if (upstreamListReady.value && !isModelInUpstreamList(form.llm_model, modelOptions.value)) {
      const preferred = pickPreferredChatModel(modelOptions.value)
      modelsHint.value += preferred
        ? `。当前「${form.llm_model}」不在列表中，建议改为「${preferred}」。`
        : `。当前「${form.llm_model}」不在列表中，请改选。`
    }
  } catch (e: unknown) {
    modelsHint.value = e instanceof Error ? e.message : String(e)
    upstreamListReady.value = false
  } finally {
    modelsBusy.value = false
  }
}

function usePreferredUpstreamModel() {
  const preferred = pickPreferredChatModel(modelOptions.value)
  if (!preferred) return
  form.llm_model = preferred
  modelsHint.value = `已改为上游列表模型「${preferred}」，请保存 AI 设置。`
}

async function load() {
  try {
    applyPublic(await fetchAiSettings())
    if (settings.value.has_llm_api_key) {
      void refreshModels()
    }
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  }
}

function toggleEnabled() {
  form.enabled = !form.enabled
}

async function onSave() {
  busy.value = true
  msg.value = ''
  msgTone.value = ''
  try {
    const patch: Record<string, unknown> = {
      enabled: form.enabled,
      llm_base_url: form.llm_base_url.trim(),
      llm_model: form.llm_model.trim(),
      allow_lan_access: form.allow_lan_access,
      write_tools_enabled: form.write_tools_enabled,
    }
    if (llmKeyInput.value.trim()) {
      patch.llm_api_key = llmKeyInput.value.trim()
    }
    applyPublic(await patchAiSettings(patch))
    llmKeyInput.value = ''
    msg.value = '已保存'
    msgTone.value = 'ok'
    window.dispatchEvent(new CustomEvent('report-editor-ai-settings-changed'))
    if (settings.value.has_llm_api_key) {
      void refreshModels()
    }
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

async function onRegenerate() {
  busy.value = true
  msg.value = ''
  msgTone.value = ''
  newAgentToken.value = ''
  try {
    const res = await regenerateAgentToken()
    applyPublic(res)
    newAgentToken.value = res.agent_token || ''
    msg.value = res.note || '已生成新 Agent 令牌'
    msgTone.value = 'ok'
    window.dispatchEvent(new CustomEvent('report-editor-ai-settings-changed'))
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

async function copyToken() {
  if (!newAgentToken.value) return
  await copyUrl(newAgentToken.value)
}

async function copyUrl(text: string | null | undefined) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    msg.value = '已复制'
    msgTone.value = 'ok'
  } catch {
    msg.value = '复制失败'
    msgTone.value = 'err'
  }
}

function openDocHint() {
  msg.value = '完整说明见仓库 _Doc/008_Cursor与OpenAI接入.md'
  msgTone.value = 'ok'
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
.ai-model-field {
  max-width: 720px;
}

.ai-model-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.ai-model-combobox {
  flex: 1 1 280px;
  min-width: 0;
}

.ai-model-row :deep(.ai-model-combobox-inp) {
  min-height: 40px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.ai-models-hint {
  margin: -4px 0 8px;
  padding-left: 0;
}

.ai-model-field--mismatch :deep(.ai-model-combobox-inp) {
  border-color: #d97706;
  box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.25);
}

.ai-model-field--mismatch .settings-btn {
  border-color: #d97706;
}

.ai-token-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ai-token-box {
  margin-top: 12px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.ai-token-value {
  display: block;
  word-break: break-all;
  font-size: 12px;
  margin: 8px 0;
}

.ai-doc-link {
  color: #2563eb;
}

.ai-endpoints {
  margin-top: 16px;
}

.ep-list {
  display: grid;
  gap: 8px;
}

.ep-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ep-row__label {
  min-width: 140px;
  font-size: 13px;
  color: #6b7280;
}

.ep-row__value {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.ep-row__addr {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  background: #f3f4f6;
  color: #111827;
  padding: 4px 8px;
  border-radius: 6px;
  word-break: break-all;
}

.ep-copy {
  min-height: 30px;
  padding: 4px 12px;
  font-size: 13px;
}
</style>

<style>
@import '@/features/settings/settings-sections.css';
</style>
