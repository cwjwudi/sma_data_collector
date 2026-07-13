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

    <div v-if="open" class="ai-drawer-backdrop" @click.self="closeDrawer">
      <aside
        class="ai-drawer"
        role="dialog"
        aria-labelledby="ai-drawer-title"
        aria-modal="true"
        :style="{ width: drawerWidthCss }"
      >
        <div
          class="ai-drawer__resize"
          title="拖拽调整宽度"
          @pointerdown="onResizePointerDown"
        />
        <header class="ai-drawer__head">
          <h2 id="ai-drawer-title" class="ai-drawer__title">
            AI 助手
            <span v-if="statusPhase" class="ai-drawer__phase">{{ statusPhaseLabel }}</span>
          </h2>
          <button type="button" class="ai-drawer__close" aria-label="关闭" @click="closeDrawer">×</button>
        </header>

        <div v-if="!ready" class="ai-drawer__banner">
          <p>请先在 <router-link to="/settings" @click="closeDrawer">设置</router-link> 中启用 AI、配置 LLM Key 并生成 Agent 令牌。</p>
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
            <div class="ai-msg__role">
              {{ m.role === 'user' ? '你' : '助手' }}
              <span v-if="m.status === 'cancelled'" class="ai-msg__badge">已停止</span>
              <span v-else-if="m.status === 'streaming'" class="ai-msg__badge">生成中</span>
            </div>
            <pre v-if="m.role === 'user'" class="ai-msg__body">{{ m.content }}</pre>
            <div
              v-else
              class="ai-msg__body ai-msg__body--md"
              v-html="renderAssistantMarkdown(m.content || (m.status === 'streaming' ? '…' : ''))"
            />
            <details
              v-if="m.role === 'assistant' && m.toolTrace?.length"
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
          </div>
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
          <textarea
            ref="inputEl"
            v-model="input"
            class="ai-drawer__input"
            rows="3"
            placeholder="Enter 发送，Shift+Enter 换行；生成中可继续发送排队"
            :disabled="!composerEnabled"
            @keydown="onInputKeydown"
          />
          <div class="ai-drawer__actions">
            <button type="button" class="ai-drawer__btn ai-drawer__btn--muted" @click="onClearClick">
              清空
            </button>
            <button
              v-if="loading"
              type="button"
              class="ai-drawer__btn ai-drawer__btn--danger"
              @click="stopGeneration"
            >
              停止
            </button>
            <button
              type="submit"
              class="ai-drawer__btn ai-drawer__btn--primary"
              :disabled="!input.trim() || !composerEnabled"
            >
              {{ loading ? '排队发送' : '发送' }}
            </button>
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
  sendAiChatStream,
  type AiChatMessage,
  type AiPageContext,
  type AiToolTraceStep,
} from '@/api/aiSettings'
import {
  clearAiChatPersist,
  clampDrawerWidth,
  loadAiChatPersist,
  saveAiChatPersist,
  type PersistedAiMessage,
} from '@/features/ai-assistant/chat-persist'
import { dequeue, enqueue, removeQueued, type QueuedChatItem } from '@/features/ai-assistant/chat-queue'
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

const drawerWidthCss = computed(() => {
  if (typeof window !== 'undefined' && window.innerWidth < 480) return '100vw'
  return `${clampDrawerWidth(drawerWidthPx.value)}px`
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
  })
}

async function refreshStatus() {
  try {
    const s = await fetchAiSettings()
    ready.value = Boolean(s.ready)
  } catch {
    ready.value = false
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
    if (!window.confirm('清空将停止当前生成并删除全部对话，确定？')) return
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

function onGlobalKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (!open.value) return
  // Pending 对话框自己处理 Esc；此处只关抽屉
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

  const payloadMessages = messages.value
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.status !== 'queued')
    .filter((m) => m.id !== assistantId)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

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
}

watch(open, (v) => {
  if (v) {
    void refreshStatus()
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
  }
  window.addEventListener('report-editor-ai-settings-changed', onSettingsChanged)
  window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('report-editor-ai-settings-changed', onSettingsChanged)
  window.removeEventListener('keydown', onGlobalKeydown)
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
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  justify-content: flex-end;
}

.ai-drawer {
  position: relative;
  width: min(420px, 100vw);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(15, 23, 42, 0.12);
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

.ai-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.ai-drawer__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-drawer__phase {
  font-size: 12px;
  font-weight: 500;
  color: #0f766e;
}

.ai-drawer__close {
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
  padding: 0 4px;
}

.ai-drawer__banner {
  padding: 10px 16px;
  background: #fffbeb;
  border-bottom: 1px solid #fde68a;
  font-size: 13px;
  color: #92400e;
}

.ai-drawer__banner a {
  color: #b45309;
  font-weight: 600;
}

.ai-drawer__banner--lan {
  background: #eff6ff;
  border-bottom-color: #bfdbfe;
  color: #1e3a8a;
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
  border: 1px solid #93c5fd;
  border-radius: 6px;
  font-size: 13px;
}

.ai-drawer__lan-btn {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #3b82f6;
  background: #2563eb;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.ai-drawer__lan-btn--muted {
  background: #fff;
  color: #1e40af;
  border-color: #93c5fd;
}

.ai-drawer__lan-msg {
  margin: 6px 0 0;
  font-size: 12px;
  color: #1d4ed8;
}

.ai-drawer__messages {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-drawer__empty {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}

.ai-msg {
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
}

.ai-msg--user {
  background: #ecfdf5;
  align-self: flex-end;
  max-width: 92%;
}

.ai-msg--assistant {
  background: #f3f4f6;
  align-self: flex-start;
  max-width: 96%;
}

.ai-msg__role {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-msg__badge {
  font-size: 10px;
  font-weight: 600;
  color: #0f766e;
  background: #ccfbf1;
  padding: 1px 6px;
  border-radius: 4px;
}

.ai-msg__cancel-q {
  margin-left: auto;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #9ca3af;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}

.ai-msg__body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  color: #111827;
}

.ai-msg__body--md :deep(p) {
  margin: 0 0 0.5em;
}

.ai-msg__body--md :deep(p:last-child) {
  margin-bottom: 0;
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
  border: 1px solid #d1d5db;
  padding: 3px 6px;
}

.ai-msg__body--md :deep(code) {
  font-size: 12px;
  background: #e5e7eb;
  padding: 0 3px;
  border-radius: 3px;
}

.ai-msg__body--md :deep(pre) {
  overflow: auto;
  background: #e5e7eb;
  padding: 8px;
  border-radius: 6px;
}

.ai-msg__trace {
  margin-top: 8px;
  border-top: 1px solid #e5e7eb;
  padding-top: 6px;
}

.ai-msg__trace-sum {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  user-select: none;
}

.ai-msg__trace-fail {
  margin-left: 6px;
  color: #b91c1c;
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
  border: 1px solid #e5e7eb;
  background: #fff;
}

.ai-msg__trace-item--ok {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.ai-msg__trace-item--err {
  border-color: #fecaca;
  background: #fef2f2;
}

.ai-msg__trace-item--pending {
  border-color: #fde68a;
  background: #fffbeb;
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
  color: #15803d;
}

.ai-msg__trace-item--err .ai-msg__trace-status {
  color: #b91c1c;
}

.ai-msg__trace-name {
  font-size: 11px;
  color: #1f2937;
}

.ai-msg__trace-round {
  font-size: 10px;
  color: #9ca3af;
}

.ai-msg__trace-args,
.ai-msg__trace-msg {
  margin: 4px 0 0;
  font-size: 11px;
  color: #4b5563;
  line-height: 1.35;
  word-break: break-all;
}

.ai-drawer__composer {
  border-top: 1px solid #e5e7eb;
  padding: 12px 16px 16px;
}

.ai-drawer__queue + .ai-drawer__composer {
  border-top: none;
}

.ai-drawer__queue {
  border-top: 1px solid #e5e7eb;
  background: #f8fafc;
  padding: 8px 12px;
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
  color: #334155;
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
  border: 1px solid #e2e8f0;
  background: #fff;
}

.ai-drawer__queue-idx {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-size: 11px;
  font-weight: 650;
  display: grid;
  place-items: center;
}

.ai-drawer__queue-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: #334155;
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
  color: #b91c1c;
}

.ai-drawer__warn--queue {
  margin-top: 6px;
}

.ai-drawer__input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
}

.ai-drawer__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.ai-drawer__btn {
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
}

.ai-drawer__btn--primary {
  background: #0f766e;
  color: #fff;
  border-color: #0f766e;
}

.ai-drawer__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-drawer__btn--muted {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}

.ai-drawer__btn--danger {
  background: #fff;
  border-color: #fca5a5;
  color: #b91c1c;
}

.ai-drawer__error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #b91c1c;
}

.ai-drawer__warn {
  margin: 8px 0 0;
  font-size: 12px;
  color: #92400e;
}

.ai-drawer__link {
  margin-left: 8px;
  border: none;
  background: none;
  color: #0f766e;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  font-size: 12px;
  padding: 0;
}
</style>
