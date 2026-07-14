<template>
  <Teleport to="body">
    <button
      v-if="!open"
      type="button"
      class="ai-fab"
      :class="{ 'ai-fab--busy': loading }"
      title="AI 助手"
      :aria-label="loading ? '打开 AI 助手（生成中）' : '打开 AI 助手'"
      @click="openDrawer"
    >
      <svg
        class="ai-fab__neon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 800"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="ai-fab-grad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop stop-color="hsl(353, 98%, 41%)" offset="0%" />
            <stop stop-color="hsl(37, 91%, 55%)" offset="100%" />
          </linearGradient>
          <filter
            id="ai-fab-blur"
            x="-100%"
            y="-100%"
            width="400%"
            height="400%"
            color-interpolation-filters="sRGB"
          >
            <feGaussianBlur stdDeviation="27" in="SourceGraphic" result="blur" />
          </filter>
          <filter
            id="ai-fab-blur2"
            x="-100%"
            y="-100%"
            width="400%"
            height="400%"
            color-interpolation-filters="sRGB"
          >
            <feGaussianBlur stdDeviation="10 17" in="SourceGraphic" result="blur" />
          </filter>
        </defs>
        <g class="ai-fab__stroke" stroke="url(#ai-fab-grad)" fill="none" stroke-width="44">
          <path
            class="ai-fab__core-glow"
            d="M381.14 127.99C392.81 121.25 407.19 121.25 418.86 127.99L626.14 247.66C637.81 254.4 645 266.85 645 280.33V519.67C645 533.15 637.81 545.6 626.14 552.34L418.86 672.01C407.19 678.75 392.81 678.75 381.14 672.01L173.86 552.34C162.19 545.6 155 533.15 155 519.67V280.33C155 266.85 162.19 254.4 173.86 247.66L381.14 127.99Z"
            filter="url(#ai-fab-blur)"
          />
          <path
            class="ai-fab__ghost ai-fab__ghost--right"
            d="M381.14 127.99C392.81 121.25 407.19 121.25 418.86 127.99L626.14 247.66C637.81 254.4 645 266.85 645 280.33V519.67C645 533.15 637.81 545.6 626.14 552.34L418.86 672.01C407.19 678.75 392.81 678.75 381.14 672.01L173.86 552.34C162.19 545.6 155 533.15 155 519.67V280.33C155 266.85 162.19 254.4 173.86 247.66L381.14 127.99Z"
            filter="url(#ai-fab-blur2)"
            opacity="0.48"
          />
          <path
            class="ai-fab__ghost ai-fab__ghost--left"
            d="M381.14 127.99C392.81 121.25 407.19 121.25 418.86 127.99L626.14 247.66C637.81 254.4 645 266.85 645 280.33V519.67C645 533.15 637.81 545.6 626.14 552.34L418.86 672.01C407.19 678.75 392.81 678.75 381.14 672.01L173.86 552.34C162.19 545.6 155 533.15 155 519.67V280.33C155 266.85 162.19 254.4 173.86 247.66L381.14 127.99Z"
            filter="url(#ai-fab-blur2)"
            opacity="0.48"
          />
          <path
            class="ai-fab__core"
            d="M381.14 127.99C392.81 121.25 407.19 121.25 418.86 127.99L626.14 247.66C637.81 254.4 645 266.85 645 280.33V519.67C645 533.15 637.81 545.6 626.14 552.34L418.86 672.01C407.19 678.75 392.81 678.75 381.14 672.01L173.86 552.34C162.19 545.6 155 533.15 155 519.67V280.33C155 266.85 162.19 254.4 173.86 247.66L381.14 127.99Z"
          />
        </g>
      </svg>
      <span class="ai-fab__label">AI</span>
      <span v-if="loading" class="ai-fab__badge" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      class="ai-drawer-backdrop"
      :class="{ 'ai-drawer-backdrop--expanded': expanded }"
      @click.self="closeDrawer"
    >
      <aside
        class="ai-drawer"
        :class="{ 'ai-drawer--expanded': expanded }"
        role="dialog"
        aria-labelledby="ai-drawer-title"
        aria-modal="true"
        :style="drawerPanelStyle"
      >
        <div
          v-if="!expanded"
          class="ai-drawer__resize"
          title="拖拽调整宽度"
          @pointerdown="onResizePointerDown"
        />
        <template v-else>
          <div
            v-for="edge in expandedResizeEdges"
            :key="edge"
            class="ai-drawer__grip"
            :class="`ai-drawer__grip--${edge}`"
            :title="'拖拽调整大小'"
            @pointerdown="onExpandedResizePointerDown($event, edge)"
          />
        </template>
        <header class="ai-drawer__head">
          <div class="ai-drawer__head-left">
            <label class="ai-drawer__model-wrap" title="切换模型">
              <span class="ai-drawer__model-ico" aria-hidden="true">✦</span>
              <select
                id="ai-drawer-title"
                v-model="llmModel"
                class="ai-drawer__model"
                :disabled="!ready || modelBusy"
                @change="onModelChange"
              >
                <option v-if="!modelOptions.includes(llmModel) && llmModel" :value="llmModel">
                  {{ llmModel }}
                </option>
                <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
              </select>
            </label>
            <span v-if="statusPhase" class="ai-drawer__phase">{{ statusPhaseLabel }}</span>
          </div>
          <div class="ai-drawer__head-right">
            <button
              type="button"
              class="ai-drawer__icon-btn"
              title="新对话"
              @click="onClearClick"
            >
              新对话
            </button>
            <button
              type="button"
              class="ai-drawer__icon-btn"
              :title="expanded ? '收起为侧栏' : '展开近全屏'"
              :aria-pressed="expanded"
              @click="toggleExpanded"
            >
              {{ expanded ? '收起' : '展开' }}
            </button>
            <button type="button" class="ai-drawer__close" aria-label="关闭" @click="closeDrawer">
              ×
            </button>
          </div>
        </header>

        <div v-if="!ready" class="ai-drawer__banner">
          <p>
            请先在
            <router-link to="/settings" @click="closeDrawer">设置</router-link>
            中启用 AI、配置 LLM Key 并生成 Agent 令牌。
          </p>
        </div>

        <div v-if="showLanAuthBanner" class="ai-drawer__banner ai-drawer__banner--lan">
          <p>
            当前为局域网访问：请先在本机桌面「设置 › AI」开启「允许局域网访问 Agent API 与应用内 AI」，并粘贴 Agent 令牌。
          </p>
          <div class="ai-drawer__lan-row">
            <input
              v-model="lanTokenInput"
              class="ai-drawer__lan-input"
              type="password"
              autocomplete="off"
              placeholder="粘贴 Agent Token"
              @keydown.enter.prevent="saveLanToken"
            />
            <button type="button" class="ai-drawer__lan-btn" @click="saveLanToken">保存</button>
            <button
              v-if="hasLanToken"
              type="button"
              class="ai-drawer__lan-btn ai-drawer__lan-btn--muted"
              @click="clearLanToken"
            >
              清除
            </button>
          </div>
          <p v-if="lanTokenMsg" class="ai-drawer__lan-msg">{{ lanTokenMsg }}</p>
        </div>

        <div
          ref="scrollEl"
          class="ai-drawer__messages"
          aria-live="polite"
          @scroll.passive="onMessagesScroll"
        >
          <div v-if="!messages.length && ready" class="ai-drawer__empty">
            可询问：连接探活、最近导出失败、模版列表等。当前页上下文会自动附带。
          </div>
          <div
            v-for="m in messages"
            :key="m.id"
            class="ai-msg"
            :class="m.role === 'user' ? 'ai-msg--user' : 'ai-msg--assistant'"
          >
            <template v-if="m.role === 'user'">
              <div class="ai-msg__user-row">
                <pre class="ai-msg__bubble">{{ m.content }}</pre>
                <div class="ai-msg__avatar" aria-hidden="true">我</div>
              </div>
            </template>
            <template v-else>
              <div class="ai-msg__agent">
                <span class="ai-msg__agent-ico" aria-hidden="true">✦</span>
                <span class="ai-msg__agent-name">Report Editor Agent</span>
                <span v-if="m.status === 'cancelled'" class="ai-msg__badge">已停止</span>
                <span v-else-if="m.status === 'streaming'" class="ai-msg__badge">生成中</span>
              </div>
              <div
                class="ai-msg__body ai-msg__body--md"
                v-html="renderAssistantMarkdown(m.content || (m.status === 'streaming' ? '…' : ''))"
              ></div>
              <div v-if="m.content && m.status !== 'streaming'" class="ai-msg__actions">
                <button
                  type="button"
                  class="ai-msg__copy"
                  :title="copiedId === m.id ? '已复制' : '复制'"
                  @click="copyAssistant(m)"
                >
                  {{ copiedId === m.id ? '已复制' : '复制' }}
                </button>
              </div>
              <details
                v-if="m.toolTrace?.length"
                class="ai-msg__trace"
                :open="traceShouldOpen(m.toolTrace)"
              >
                <summary class="ai-msg__trace-sum">
                  工具调用 {{ m.toolTrace.length }} 步
                  <span v-if="traceHasFailure(m.toolTrace)" class="ai-msg__trace-fail">含失败</span>
                </summary>
                <ul class="ai-msg__trace-list">
                  <li
                    v-for="(step, si) in m.toolTrace"
                    :key="si"
                    class="ai-msg__trace-item"
                    :class="
                      step.ok === false
                        ? 'ai-msg__trace-item--err'
                        : step.pending
                          ? 'ai-msg__trace-item--pending'
                          : 'ai-msg__trace-item--ok'
                    "
                  >
                    <div class="ai-msg__trace-head">
                      <span class="ai-msg__trace-status">
                        {{ step.pending ? '调用中' : step.ok ? '成功' : '失败' }}
                      </span>
                      <code class="ai-msg__trace-name">{{ step.name }}</code>
                      <span v-if="step.round" class="ai-msg__trace-round">#{{ step.round }}</span>
                    </div>
                    <p v-if="formatArgsSummary(step.args_summary)" class="ai-msg__trace-args">
                      {{ formatArgsSummary(step.args_summary) }}
                    </p>
                    <p v-if="step.message" class="ai-msg__trace-msg">{{ step.message }}</p>
                  </li>
                </ul>
              </details>
            </template>
          </div>
        </div>

        <div v-if="queue.length" class="ai-drawer__queue">
          <button
            type="button"
            class="ai-drawer__queue-toggle"
            :aria-expanded="queueTrayOpen"
            @click="queueTrayOpen = !queueTrayOpen"
          >
            <span class="ai-drawer__queue-title">排队 {{ queue.length }}</span>
            <span class="ai-drawer__queue-chev" aria-hidden="true">{{ queueTrayOpen ? '▾' : '▸' }}</span>
          </button>
          <ul v-if="queueTrayOpen" class="ai-drawer__queue-list">
            <li v-for="(item, qi) in queue" :key="item.id" class="ai-drawer__queue-item">
              <span class="ai-drawer__queue-idx">{{ qi + 1 }}</span>
              <span class="ai-drawer__queue-text" :title="item.content">{{ queuePreview(item.content) }}</span>
              <button
                type="button"
                class="ai-drawer__queue-cancel"
                title="取消排队"
                @click="cancelQueued(item.id)"
              >
                ×
              </button>
            </li>
          </ul>
          <p v-if="queuePaused" class="ai-drawer__warn ai-drawer__warn--queue">
            后续排队已暂停
            <button type="button" class="ai-drawer__link" @click="resumeQueue">继续排队</button>
          </p>
        </div>

        <form class="ai-drawer__composer" @submit.prevent="onSend">
          <div class="ai-drawer__composer-shell">
            <textarea
              ref="inputEl"
              v-model="input"
              class="ai-drawer__input"
              rows="3"
              placeholder="输入消息… Enter 发送，Shift+Enter 换行"
              :disabled="!composerEnabled"
              @keydown="onInputKeydown"
            />
            <div class="ai-drawer__composer-bar">
              <button
                v-if="loading"
                type="button"
                class="ai-drawer__btn ai-drawer__btn--danger"
                @click="stopGeneration"
              >
                停止
              </button>
              <span v-else class="ai-drawer__composer-spacer" />
              <button
                type="submit"
                class="ai-drawer__btn ai-drawer__btn--primary"
                :disabled="!input.trim() || !composerEnabled"
              >
                {{ loading ? '排队' : '发送' }}
              </button>
            </div>
          </div>
          <p v-if="queuePaused && !queue.length" class="ai-drawer__warn">
            后续排队已暂停
            <button type="button" class="ai-drawer__link" @click="resumeQueue">继续排队</button>
          </p>
          <p v-if="errorMsg" class="ai-drawer__error">{{ errorMsg }}</p>
        </form>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  cancelAiPendingPrompt,
  extractToolTrace,
  fetchAiPendingPrompts,
  fetchAiSettings,
  fetchAiUpstreamModels,
  patchAiSettings,
  sendAiChatStream,
  type AiChatMessage,
  type AiPageContext,
  type AiToolTraceStep,
} from '@/api/aiSettings'
import {
  clearAiChatPersist,
  clampDrawerWidth,
  clampExpandedHeight,
  clampExpandedWidth,
  defaultExpandedSize,
  loadAiChatPersist,
  saveAiChatPersist,
  type PersistedAiMessage,
} from '@/features/ai-assistant/chat-persist'
import { dequeue, enqueue, removeQueued, type QueuedChatItem } from '@/features/ai-assistant/chat-queue'
import { sliceRecentChatMessages } from '@/features/ai-assistant/chat-history-window'
import { renderAssistantMarkdown } from '@/features/ai-assistant/render-md'
import type { AiStreamEvent } from '@/features/ai-assistant/sse-parse'
import {
  clearLanAiAgentToken,
  getLanAiAgentToken,
  needsRemoteAiAuth,
  setLanAiAgentToken,
} from '@/lib/runtimeEnv'

defineOptions({ name: 'AiDrawer' })

type UiToolStep = AiToolTraceStep & { pending?: boolean }
type UiMessage = AiChatMessage & { id: string; toolTrace?: UiToolStep[] }

const open = ref(false)
const ready = ref(false)
const loading = ref(false)
const input = ref('')
const errorMsg = ref('')
const messages = ref<UiMessage[]>([])
const scrollEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const statusPhase = ref('')
const queuePaused = ref(false)
const queue = ref<QueuedChatItem[]>([])
const queueTrayOpen = ref(true)
const drawerWidthPx = ref(420)
const expanded = ref(false)
const expandedWidthPx = ref(defaultExpandedSize().width)
const expandedHeightPx = ref(defaultExpandedSize().height)
const expandedResizeEdges = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
type ExpandedResizeEdge = (typeof expandedResizeEdges)[number]
const llmModel = ref('')
const modelOptions = ref<string[]>(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'])
const modelBusy = ref(false)
const copiedId = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const lanTokenInput = ref('')
const lanTokenMsg = ref('')
const lanTokenTick = ref(0)
const showLanAuthBanner = computed(() => needsRemoteAiAuth())
const hasLanToken = computed(() => {
  lanTokenTick.value
  return Boolean(getLanAiAgentToken())
})
const lanAiReady = computed(() => !needsRemoteAiAuth() || hasLanToken.value)
const composerEnabled = computed(() => ready.value && lanAiReady.value)

function saveLanToken() {
  const t = lanTokenInput.value.trim()
  if (!t) {
    lanTokenMsg.value = '请粘贴 Agent Token'
    return
  }
  setLanAiAgentToken(t)
  lanTokenInput.value = ''
  lanTokenTick.value += 1
  lanTokenMsg.value = '已保存到本会话（关闭标签页后需重新粘贴）'
}

function clearLanToken() {
  clearLanAiAgentToken()
  lanTokenTick.value += 1
  lanTokenMsg.value = '已清除令牌'
}
let stickToBottom = true
let abortCtrl: AbortController | null = null
let resizing = false

function queuePreview(text: string, max = 72): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

const route = useRoute()

const pageContext = computed((): AiPageContext => {
  const q = route.query || {}
  return {
    route: route.fullPath,
    routeName: String(route.name || ''),
    templateId: typeof q.templateId === 'string' ? q.templateId : typeof q.id === 'string' ? q.id : null,
    recentError: null,
  }
})

const drawerPanelStyle = computed(() => {
  if (expanded.value) {
    return {
      width: `${clampExpandedWidth(expandedWidthPx.value)}px`,
      height: `${clampExpandedHeight(expandedHeightPx.value)}px`,
    }
  }
  if (typeof window !== 'undefined' && window.innerWidth < 480) return { width: '100vw' }
  return { width: `${clampDrawerWidth(drawerWidthPx.value)}px` }
})

const statusPhaseLabel = computed(() => {
  if (statusPhase.value === 'tools') return '工具调用中'
  if (statusPhase.value === 'writing') return '撰写中'
  if (statusPhase.value === 'thinking') return '思考中'
  return ''
})

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function persistNow() {
  saveAiChatPersist({
    messages: messages.value as PersistedAiMessage[],
    drawerWidthPx: drawerWidthPx.value,
    expanded: expanded.value,
    expandedWidthPx: expandedWidthPx.value,
    expandedHeightPx: expandedHeightPx.value,
  })
}

async function refreshStatus() {
  try {
    const s = await fetchAiSettings()
    ready.value = Boolean(s.ready)
    if (s.llm_model) llmModel.value = s.llm_model
  } catch {
    ready.value = false
  }
}

async function refreshModels() {
  modelBusy.value = true
  try {
    const res = await fetchAiUpstreamModels()
    if (res.models?.length) modelOptions.value = res.models
    if (res.current && !llmModel.value) llmModel.value = res.current
  } catch {
    /* keep fallback list */
  } finally {
    modelBusy.value = false
  }
}

async function onModelChange() {
  const next = llmModel.value.trim()
  if (!next) return
  try {
    await patchAiSettings({ llm_model: next })
    window.dispatchEvent(new CustomEvent('report-editor-ai-settings-changed'))
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
    void refreshStatus()
  }
}

function toggleExpanded() {
  if (!expanded.value) {
    // 进入展开：若尺寸偏小则拉到默认大窗
    const defs = defaultExpandedSize()
    if (expandedWidthPx.value < defs.width * 0.85) expandedWidthPx.value = defs.width
    if (expandedHeightPx.value < defs.height * 0.85) expandedHeightPx.value = defs.height
    expandedWidthPx.value = clampExpandedWidth(expandedWidthPx.value)
    expandedHeightPx.value = clampExpandedHeight(expandedHeightPx.value)
  }
  expanded.value = !expanded.value
  persistNow()
}

async function copyAssistant(m: UiMessage) {
  const text = m.content || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = m.id
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      if (copiedId.value === m.id) copiedId.value = ''
    }, 1600)
  } catch {
    errorMsg.value = '复制失败'
  }
}

function openDrawer() {
  open.value = true
  void refreshStatus()
  void nextTick(async () => {
    stickToBottom = true
    await scrollToBottom(true)
    inputEl.value?.focus({ preventScroll: true })
  })
}

/** 关抽屉：不 Abort、不清队 */
function closeDrawer() {
  open.value = false
}

function cancelQueued(id: string) {
  queue.value = removeQueued(queue.value, id)
}

async function cancelActivePending() {
  try {
    const { prompts } = await fetchAiPendingPrompts()
    for (const p of prompts || []) {
      if (p?.id) await cancelAiPendingPrompt(p.id)
    }
  } catch {
    /* ignore */
  }
}

function stopGeneration() {
  abortCtrl?.abort()
  abortCtrl = null
  void cancelActivePending()
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant' && last.status === 'streaming') {
    last.status = 'cancelled'
    if (!last.content) last.content = '（已停止）'
  }
  loading.value = false
  statusPhase.value = ''
  persistNow()
  // 队列续跑由 runOneTurn finally → pumpQueue
}

function onClearClick() {
  if (loading.value || queue.value.length) {
    if (!window.confirm('新对话将停止当前生成并删除全部消息，确定？')) return
  }
  abortCtrl?.abort()
  abortCtrl = null
  void cancelActivePending()
  queue.value = []
  queuePaused.value = false
  messages.value = []
  errorMsg.value = ''
  statusPhase.value = ''
  loading.value = false
  clearAiChatPersist()
  persistNow()
  stickToBottom = true
  void scrollToBottom(true)
}

function resumeQueue() {
  queuePaused.value = false
  void pumpQueue()
}

function traceHasFailure(steps: UiToolStep[] | undefined): boolean {
  return Boolean(steps?.some((s) => s.ok === false && !s.pending))
}

function traceShouldOpen(steps: UiToolStep[] | undefined): boolean {
  return traceHasFailure(steps)
}

function formatArgsSummary(args: Record<string, unknown> | undefined): string {
  if (!args || !Object.keys(args).length) return ''
  try {
    return JSON.stringify(args)
  } catch {
    return ''
  }
}

function onMessagesScroll() {
  const el = scrollEl.value
  if (!el) return
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom = gap < 48
}

async function scrollToBottom(force = false) {
  await nextTick()
  const el = scrollEl.value
  if (!el) return
  if (!force && !stickToBottom) return
  el.scrollTop = el.scrollHeight
  requestAnimationFrame(() => {
    if (force || stickToBottom) el.scrollTop = el.scrollHeight
  })
}

function onInputKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Enter') return
  if (ev.shiftKey || ev.isComposing) return
  ev.preventDefault()
  void onSend()
}

function onResizePointerDown(ev: PointerEvent) {
  resizing = true
  const startX = ev.clientX
  const startW = drawerWidthPx.value
  const target = ev.currentTarget as HTMLElement
  target.setPointerCapture(ev.pointerId)
  const onMove = (e: PointerEvent) => {
    if (!resizing) return
    const dx = startX - e.clientX
    drawerWidthPx.value = clampDrawerWidth(startW + dx)
  }
  const onUp = () => {
    resizing = false
    target.releasePointerCapture(ev.pointerId)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    persistNow()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onExpandedResizePointerDown(ev: PointerEvent, edge: ExpandedResizeEdge) {
  ev.preventDefault()
  ev.stopPropagation()
  resizing = true
  const startX = ev.clientX
  const startY = ev.clientY
  const startW = expandedWidthPx.value
  const startH = expandedHeightPx.value
  const target = ev.currentTarget as HTMLElement
  target.setPointerCapture(ev.pointerId)
  const onMove = (e: PointerEvent) => {
    if (!resizing) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    let nextW = startW
    let nextH = startH
    if (edge.includes('e')) nextW = startW + dx
    if (edge.includes('w')) nextW = startW - dx
    if (edge.includes('s')) nextH = startH + dy
    if (edge.includes('n')) nextH = startH - dy
    expandedWidthPx.value = clampExpandedWidth(nextW)
    expandedHeightPx.value = clampExpandedHeight(nextH)
  }
  const onUp = () => {
    resizing = false
    try {
      target.releasePointerCapture(ev.pointerId)
    } catch {
      /* ignore */
    }
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    persistNow()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onWindowResize() {
  expandedWidthPx.value = clampExpandedWidth(expandedWidthPx.value)
  expandedHeightPx.value = clampExpandedHeight(expandedHeightPx.value)
}

function onGlobalKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (!open.value) return
  if (expanded.value) {
    expanded.value = false
    persistNow()
    return
  }
  closeDrawer()
}

async function onSend() {
  const text = input.value.trim()
  if (!text || !ready.value) return
  if (!lanAiReady.value) {
    errorMsg.value = '请先粘贴并保存局域网 Agent Token'
    return
  }
  errorMsg.value = ''
  input.value = ''

  if (loading.value) {
    const id = newId()
    const r = enqueue(queue.value, { id, content: text })
    if (!r.ok) {
      errorMsg.value = r.reason
      input.value = text
      return
    }
    queue.value = r.queue
    queueTrayOpen.value = true
    return
  }

  await runOneTurn(text)
}

async function pumpQueue() {
  if (loading.value || queuePaused.value) return
  const { next, rest } = dequeue(queue.value)
  queue.value = rest
  if (!next) return
  await runOneTurn(next.content)
}

async function runOneTurn(text: string) {
  const userId = newId()
  messages.value = [...messages.value, { id: userId, role: 'user', content: text, status: 'done' }]
  const assistantId = newId()
  messages.value = [
    ...messages.value,
    { id: assistantId, role: 'assistant', content: '', status: 'streaming', toolTrace: [] },
  ]
  loading.value = true
  statusPhase.value = 'thinking'
  stickToBottom = true
  await scrollToBottom(true)

  const payloadMessages = sliceRecentChatMessages(
    messages.value
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => m.status !== 'queued')
      .filter((m) => m.id !== assistantId)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  )

  abortCtrl = new AbortController()
  const assistant = () => messages.value.find((m) => m.id === assistantId)

  try {
    await sendAiChatStream({
      messages: payloadMessages,
      pageContext: pageContext.value,
      signal: abortCtrl.signal,
      onEvent: (ev: AiStreamEvent) => {
        const a = assistant()
        if (!a) return
        if (ev.event === 'status') {
          statusPhase.value = ev.phase || ''
        } else if (ev.event === 'delta') {
          a.content = (a.content || '') + (ev.text || '')
          void scrollToBottom()
        } else if (ev.event === 'replace') {
          a.content = ev.text || ''
          void scrollToBottom()
        } else if (ev.event === 'tool') {
          const step = ev.step as UiToolStep
          const name = typeof step.name === 'string' ? step.name : ''
          if (!name) return
          const normalized: UiToolStep = {
            round: typeof step.round === 'number' ? step.round : undefined,
            name,
            args_summary:
              step.args_summary && typeof step.args_summary === 'object'
                ? (step.args_summary as Record<string, unknown>)
                : undefined,
            ok: Boolean(step.ok),
            message: typeof step.message === 'string' ? step.message : undefined,
            pending: false,
          }
          a.toolTrace = [...(a.toolTrace || []), normalized]
          void scrollToBottom()
          if (normalized.ok) {
            void import('@/lib/client-prefs-mirror').then(({ syncPendingClientPrefsFromBackend }) =>
              syncPendingClientPrefsFromBackend(),
            )
          }
        } else if (ev.event === 'done') {
          const trace = extractToolTrace({ report_editor_tool_trace: ev.tool_trace })
          if (trace.length) a.toolTrace = trace
          a.status = 'done'
        } else if (ev.event === 'error') {
          errorMsg.value = ev.message
          a.status = a.content ? 'error' : 'error'
          if (!a.content) a.content = ev.message
          queuePaused.value = queue.value.length > 0
        }
      },
    })
    const a = assistant()
    if (a && a.status === 'streaming') a.status = 'done'
    const { syncPendingClientPrefsFromBackend } = await import('@/lib/client-prefs-mirror')
    await syncPendingClientPrefsFromBackend()
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'AbortError') {
      /* stopGeneration 已处理 */
    } else {
      errorMsg.value = e instanceof Error ? e.message : String(e)
      const a = assistant()
      if (a) {
        a.status = 'error'
        if (!a.content) a.content = errorMsg.value
      }
      queuePaused.value = queue.value.length > 0
    }
  } finally {
    loading.value = false
    statusPhase.value = ''
    abortCtrl = null
    persistNow()
    await scrollToBottom(true)
    if (!queuePaused.value) void pumpQueue()
  }
}

function onSettingsChanged() {
  void refreshStatus()
  void refreshModels()
}

watch(open, (v) => {
  if (v) {
    void refreshStatus()
    void refreshModels()
    void scrollToBottom(true)
  }
})

watch(
  () => [messages.value.length, loading.value] as const,
  () => {
    void scrollToBottom()
  },
)

onMounted(() => {
  const saved = loadAiChatPersist()
  if (saved) {
    messages.value = saved.messages
      .filter((m) => m.status !== 'queued')
      .map((m) => ({
        ...m,
        status: m.status === 'streaming' ? 'done' : m.status,
      })) as UiMessage[]
    drawerWidthPx.value = saved.drawerWidthPx
    expanded.value = saved.expanded
    expandedWidthPx.value = saved.expandedWidthPx
    expandedHeightPx.value = saved.expandedHeightPx
  } else {
    const defs = defaultExpandedSize()
    expandedWidthPx.value = defs.width
    expandedHeightPx.value = defs.height
  }
  window.addEventListener('report-editor-ai-settings-changed', onSettingsChanged)
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
  window.removeEventListener('report-editor-ai-settings-changed', onSettingsChanged)
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('resize', onWindowResize)
})
</script>

<style scoped>
.ai-fab {
  position: fixed;
  right: max(28px, calc(12px + 16px));
  bottom: 20px;
  z-index: 9000;
  width: 72px;
  height: 72px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.06em;
  cursor: pointer;
  display: grid;
  place-items: center;
  overflow: visible;
  filter: drop-shadow(0 10px 18px rgba(220, 38, 38, 0.28));
  transition: transform 0.15s ease, filter 0.15s ease;
}

.ai-fab__neon {
  position: absolute;
  inset: -10px;
  width: calc(100% + 20px);
  height: calc(100% + 20px);
  pointer-events: none;
  overflow: visible;
}

.ai-fab__ghost--right {
  transform-origin: 400px 400px;
  animation: ai-fab-ghost-right 2.8s ease-in-out infinite;
}

.ai-fab__ghost--left {
  transform-origin: 400px 400px;
  animation: ai-fab-ghost-left 2.8s ease-in-out infinite;
}

.ai-fab__core-glow {
  animation: ai-fab-core-breathe 2.8s ease-in-out infinite;
}

@keyframes ai-fab-ghost-right {
  0%,
  100% {
    transform: translateX(52px);
    opacity: 0.32;
  }
  50% {
    transform: translateX(108px);
    opacity: 0.55;
  }
}

@keyframes ai-fab-ghost-left {
  0%,
  100% {
    transform: translateX(-52px);
    opacity: 0.32;
  }
  50% {
    transform: translateX(-108px);
    opacity: 0.55;
  }
}

@keyframes ai-fab-core-breathe {
  0%,
  100% {
    opacity: 0.72;
  }
  50% {
    opacity: 1;
  }
}

.ai-fab__label {
  position: relative;
  z-index: 1;
  background: linear-gradient(180deg, hsl(353, 98%, 41%) 0%, hsl(37, 91%, 55%) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 1px 1px rgba(127, 29, 29, 0.35));
}

.ai-fab__badge {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #0f766e;
  box-shadow: 0 0 0 2px #fff;
  z-index: 2;
}

.ai-fab:hover {
  transform: scale(1.06);
  filter: drop-shadow(0 12px 22px rgba(249, 115, 22, 0.4)) brightness(1.06);
}

.ai-fab:hover .ai-fab__ghost--right,
.ai-fab:hover .ai-fab__ghost--left,
.ai-fab:hover .ai-fab__core-glow {
  animation-duration: 1.6s;
}

@media (prefers-reduced-motion: reduce) {
  .ai-fab__ghost--right,
  .ai-fab__ghost--left,
  .ai-fab__core-glow {
    animation: none;
  }
  .ai-fab__ghost--right {
    transform: translateX(80px);
    opacity: 0.48;
  }
  .ai-fab__ghost--left {
    transform: translateX(-80px);
    opacity: 0.48;
  }
}

.ai-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9100;
  background: rgba(8, 12, 24, 0.45);
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.ai-drawer-backdrop--expanded {
  justify-content: center;
  align-items: center;
  padding: 12px;
  background: rgba(6, 10, 20, 0.55);
}

.ai-drawer {
  --ai-glass-bg: rgba(28, 32, 44, 0.82);
  --ai-glass-border: rgba(255, 255, 255, 0.1);
  --ai-text: #e8eaef;
  --ai-muted: #9aa3b5;
  --ai-accent: #5b8cff;
  --ai-user-bubble: rgba(55, 72, 120, 0.88);
  position: relative;
  width: min(420px, 100vw);
  height: 100%;
  background: var(--ai-glass-bg);
  color: var(--ai-text);
  display: flex;
  flex-direction: column;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.35);
  border-left: 1px solid var(--ai-glass-border);
  backdrop-filter: blur(22px) saturate(1.2);
  -webkit-backdrop-filter: blur(22px) saturate(1.2);
}

.ai-drawer--expanded {
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  border-radius: 20px;
  border: 1px solid var(--ai-glass-border);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  border-left: 1px solid var(--ai-glass-border);
}

.ai-drawer__resize {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 2;
}

.ai-drawer__grip {
  position: absolute;
  z-index: 4;
  touch-action: none;
}

.ai-drawer__grip--n {
  top: -2px;
  left: 14px;
  right: 14px;
  height: 10px;
  cursor: ns-resize;
}

.ai-drawer__grip--s {
  bottom: -2px;
  left: 14px;
  right: 14px;
  height: 10px;
  cursor: ns-resize;
}

.ai-drawer__grip--e {
  right: -2px;
  top: 14px;
  bottom: 14px;
  width: 10px;
  cursor: ew-resize;
}

.ai-drawer__grip--w {
  left: -2px;
  top: 14px;
  bottom: 14px;
  width: 10px;
  cursor: ew-resize;
}

.ai-drawer__grip--ne {
  top: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  cursor: nesw-resize;
}

.ai-drawer__grip--nw {
  top: -2px;
  left: -2px;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
}

.ai-drawer__grip--se {
  bottom: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
}

.ai-drawer__grip--sw {
  bottom: -2px;
  left: -2px;
  width: 18px;
  height: 18px;
  cursor: nesw-resize;
}

.ai-drawer__grip--se::after {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 10px;
  height: 10px;
  border-right: 2px solid rgba(255, 255, 255, 0.35);
  border-bottom: 2px solid rgba(255, 255, 255, 0.35);
  border-radius: 1px;
  pointer-events: none;
}

.ai-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ai-glass-border);
  flex-shrink: 0;
}

.ai-drawer__head-left,
.ai-drawer__head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ai-drawer__head-right {
  flex-shrink: 0;
}

.ai-drawer__model-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 220px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--ai-glass-border);
}

.ai-drawer__model-ico {
  color: #a5b4fc;
  font-size: 12px;
  flex-shrink: 0;
}

.ai-drawer__model {
  min-width: 0;
  max-width: 180px;
  border: none;
  background: transparent;
  color: var(--ai-text);
  font-size: 13px;
  font-weight: 600;
  outline: none;
  cursor: pointer;
}

.ai-drawer__model option {
  color: #111827;
  background: #fff;
}

.ai-drawer__phase {
  font-size: 11px;
  font-weight: 500;
  color: #7dd3c0;
  white-space: nowrap;
}

.ai-drawer__icon-btn {
  border: 1px solid var(--ai-glass-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--ai-text);
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
}

.ai-drawer__icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.ai-drawer__close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: var(--ai-muted);
  padding: 0 4px;
}

.ai-drawer__close:hover {
  color: #fff;
}

.ai-drawer__banner {
  padding: 10px 16px;
  background: rgba(251, 191, 36, 0.12);
  border-bottom: 1px solid rgba(251, 191, 36, 0.28);
  font-size: 13px;
  color: #fde68a;
  flex-shrink: 0;
}

.ai-drawer__banner a {
  color: #fbbf24;
  font-weight: 600;
}

.ai-drawer__banner--lan {
  background: rgba(59, 130, 246, 0.14);
  border-bottom-color: rgba(147, 197, 253, 0.35);
  color: #bfdbfe;
}

.ai-drawer__lan-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.ai-drawer__lan-input {
  flex: 1;
  min-width: 140px;
  padding: 6px 8px;
  border: 1px solid rgba(147, 197, 253, 0.4);
  border-radius: 8px;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.25);
  color: var(--ai-text);
}

.ai-drawer__lan-btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--ai-accent);
  background: var(--ai-accent);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.ai-drawer__lan-btn--muted {
  background: transparent;
  color: #bfdbfe;
  border-color: rgba(147, 197, 253, 0.45);
}

.ai-drawer__lan-msg {
  margin: 6px 0 0;
  font-size: 12px;
  color: #93c5fd;
}

.ai-drawer__messages {
  flex: 1;
  overflow: auto;
  padding: 16px 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-drawer__empty {
  font-size: 13px;
  color: var(--ai-muted);
  line-height: 1.55;
  max-width: 36em;
  margin: 12px auto;
  text-align: center;
}

.ai-msg {
  font-size: 13px;
  max-width: 100%;
}

.ai-msg--user {
  align-self: stretch;
}

.ai-msg--assistant {
  align-self: stretch;
  max-width: min(100%, 44rem);
}

.ai-msg__user-row {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 10px;
}

.ai-msg__bubble {
  margin: 0;
  max-width: min(88%, 36rem);
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  background: var(--ai-user-bubble);
  color: #f4f6fb;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.ai-msg__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(145deg, #5b8cff, #7c5cff);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.ai-msg__agent {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.ai-msg__agent-ico {
  color: #a5b4fc;
  font-size: 12px;
}

.ai-msg__agent-name {
  font-size: 12px;
  font-weight: 650;
  color: #c7d2fe;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(165, 180, 252, 0.12);
  border: 1px solid rgba(165, 180, 252, 0.22);
}

.ai-msg__badge {
  font-size: 10px;
  font-weight: 600;
  color: #7dd3c0;
  background: rgba(45, 212, 191, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
}

.ai-msg__body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--ai-text);
}

.ai-msg__body--md :deep(p) {
  margin: 0 0 0.55em;
}

.ai-msg__body--md :deep(p:last-child) {
  margin-bottom: 0;
}

.ai-msg__body--md :deep(h1),
.ai-msg__body--md :deep(h2),
.ai-msg__body--md :deep(h3) {
  margin: 0.7em 0 0.35em;
  font-size: 1.05em;
  color: #f1f5f9;
}

.ai-msg__body--md :deep(ul),
.ai-msg__body--md :deep(ol) {
  margin: 0.25em 0;
  padding-left: 1.25em;
}

.ai-msg__body--md :deep(table) {
  border-collapse: collapse;
  font-size: 12px;
  margin: 0.4em 0;
  max-width: 100%;
}

.ai-msg__body--md :deep(th),
.ai-msg__body--md :deep(td) {
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 3px 6px;
}

.ai-msg__body--md :deep(code) {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.08);
  padding: 0 3px;
  border-radius: 3px;
}

.ai-msg__body--md :deep(pre) {
  overflow: auto;
  background: rgba(0, 0, 0, 0.35);
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--ai-glass-border);
}

.ai-msg__actions {
  margin-top: 8px;
}

.ai-msg__copy {
  border: none;
  background: transparent;
  color: var(--ai-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 0;
}

.ai-msg__copy:hover {
  color: #c7d2fe;
}

.ai-msg__trace {
  margin-top: 10px;
  border-top: 1px solid var(--ai-glass-border);
  padding-top: 8px;
}

.ai-msg__trace-sum {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--ai-muted);
  user-select: none;
}

.ai-msg__trace-fail {
  margin-left: 6px;
  color: #fca5a5;
  font-weight: 700;
}

.ai-msg__trace-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-msg__trace-item {
  border-radius: 8px;
  padding: 6px 8px;
  border: 1px solid var(--ai-glass-border);
  background: rgba(0, 0, 0, 0.22);
}

.ai-msg__trace-item--ok {
  border-color: rgba(74, 222, 128, 0.28);
  background: rgba(22, 101, 52, 0.22);
}

.ai-msg__trace-item--err {
  border-color: rgba(252, 165, 165, 0.35);
  background: rgba(127, 29, 29, 0.28);
}

.ai-msg__trace-item--pending {
  border-color: rgba(251, 191, 36, 0.35);
  background: rgba(120, 53, 15, 0.28);
}

.ai-msg__trace-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ai-msg__trace-status {
  font-size: 11px;
  font-weight: 700;
}

.ai-msg__trace-item--ok .ai-msg__trace-status {
  color: #86efac;
}

.ai-msg__trace-item--err .ai-msg__trace-status {
  color: #fca5a5;
}

.ai-msg__trace-name {
  font-size: 11px;
  color: #e2e8f0;
}

.ai-msg__trace-round {
  font-size: 10px;
  color: #94a3b8;
}

.ai-msg__trace-args,
.ai-msg__trace-msg {
  margin: 4px 0 0;
  font-size: 11px;
  color: #cbd5e1;
  line-height: 1.35;
  word-break: break-all;
}

.ai-drawer__composer {
  padding: 10px 14px 16px;
  flex-shrink: 0;
}

.ai-drawer__composer-shell {
  border-radius: 18px;
  border: 1px solid var(--ai-glass-border);
  background: rgba(0, 0, 0, 0.28);
  padding: 10px 12px 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.ai-drawer__composer-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.ai-drawer__composer-spacer {
  flex: 1;
}

.ai-drawer__queue {
  border-top: 1px solid var(--ai-glass-border);
  background: rgba(0, 0, 0, 0.18);
  padding: 8px 12px;
  flex-shrink: 0;
}

.ai-drawer__queue-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: none;
  background: transparent;
  padding: 4px 2px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  color: #cbd5e1;
}

.ai-drawer__queue-chev {
  color: #94a3b8;
  font-size: 11px;
}

.ai-drawer__queue-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 140px;
  overflow: auto;
}

.ai-drawer__queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--ai-glass-border);
  background: rgba(255, 255, 255, 0.04);
}

.ai-drawer__queue-idx {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 650;
  display: grid;
  place-items: center;
}

.ai-drawer__queue-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-drawer__queue-cancel {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.ai-drawer__queue-cancel:hover {
  color: #fca5a5;
}

.ai-drawer__warn--queue {
  margin-top: 6px;
}

.ai-drawer__input {
  width: 100%;
  box-sizing: border-box;
  border: none;
  background: transparent;
  padding: 4px 2px;
  font-size: 14px;
  resize: none;
  min-height: 64px;
  max-height: 180px;
  font-family: inherit;
  color: var(--ai-text);
  outline: none;
  line-height: 1.45;
}

.ai-drawer__input::placeholder {
  color: #6b7280;
}

.ai-drawer__btn {
  border-radius: 999px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid transparent;
}

.ai-drawer__btn--primary {
  background: var(--ai-accent);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 6px 16px rgba(91, 140, 255, 0.35);
}

.ai-drawer__btn--primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.ai-drawer__btn--danger {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.ai-drawer__error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #fca5a5;
}

.ai-drawer__warn {
  margin: 8px 0 0;
  font-size: 12px;
  color: #fde68a;
}

.ai-drawer__link {
  margin-left: 8px;
  border: none;
  background: none;
  color: #93c5fd;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  font-size: 12px;
  padding: 0;
}
</style>
