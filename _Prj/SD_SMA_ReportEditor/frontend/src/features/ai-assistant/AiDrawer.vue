<template>
  <Teleport to="body">
    <button
      v-if="!open"
      type="button"
      class="ai-fab"
      title="AI 助手"
      aria-label="打开 AI 助手"
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
    </button>

    <div v-if="open" class="ai-drawer-backdrop" @click.self="closeDrawer">
      <aside class="ai-drawer" role="dialog" aria-labelledby="ai-drawer-title" aria-modal="true">
        <header class="ai-drawer__head">
          <h2 id="ai-drawer-title" class="ai-drawer__title">AI 助手</h2>
          <button type="button" class="ai-drawer__close" aria-label="关闭" @click="closeDrawer">×</button>
        </header>

        <div v-if="!ready" class="ai-drawer__banner">
          <p>请先在 <router-link to="/settings" @click="closeDrawer">设置</router-link> 中启用 AI、配置 LLM Key 并生成 Agent 令牌。</p>
        </div>

        <div ref="scrollEl" class="ai-drawer__messages" @scroll.passive="onMessagesScroll">
          <div v-if="!messages.length && ready" class="ai-drawer__empty">
            可询问：连接探活、最近导出失败、模版列表等。当前页上下文会自动附带。
          </div>
          <div
            v-for="(m, i) in messages"
            :key="i"
            class="ai-msg"
            :class="m.role === 'user' ? 'ai-msg--user' : 'ai-msg--assistant'"
          >
            <div class="ai-msg__role">{{ m.role === 'user' ? '你' : '助手' }}</div>
            <pre class="ai-msg__body">{{ m.content }}</pre>
          </div>
          <div v-if="loading" class="ai-msg ai-msg--assistant">
            <div class="ai-msg__role">助手</div>
            <p class="ai-msg__body ai-msg__body--pending">思考中…</p>
          </div>
        </div>

        <form class="ai-drawer__composer" @submit.prevent="onSend">
          <textarea
            ref="inputEl"
            v-model="input"
            class="ai-drawer__input"
            rows="3"
            placeholder="Enter 发送，Shift+Enter 换行"
            :disabled="loading"
            @keydown="onInputKeydown"
          />
          <div class="ai-drawer__actions">
            <button type="button" class="ai-drawer__btn ai-drawer__btn--muted" :disabled="loading" @click="clearChat">
              清空
            </button>
            <button type="submit" class="ai-drawer__btn ai-drawer__btn--primary" :disabled="loading || !input.trim() || !ready">
              发送
            </button>
          </div>
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
  extractAssistantText,
  fetchAiSettings,
  sendAiChat,
  type AiChatMessage,
  type AiPageContext,
} from '@/api/aiSettings'

defineOptions({ name: 'AiDrawer' })

const open = ref(false)
const ready = ref(false)
const loading = ref(false)
const input = ref('')
const errorMsg = ref('')
const messages = ref<AiChatMessage[]>([])
const scrollEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
let stickToBottom = true

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

function closeDrawer() {
  open.value = false
}

function clearChat() {
  messages.value = []
  errorMsg.value = ''
  stickToBottom = true
  void scrollToBottom(true)
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
  // 二次对齐：思考中占位 / pre 换行后高度可能再变
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

async function onSend() {
  const text = input.value.trim()
  if (!text || loading.value || !ready.value) return
  errorMsg.value = ''
  const userMsg: AiChatMessage = { role: 'user', content: text }
  messages.value = [...messages.value, userMsg]
  input.value = ''
  loading.value = true
  stickToBottom = true
  await scrollToBottom(true)
  try {
    const payloadMessages = messages.value.filter((m) => m.role === 'user' || m.role === 'assistant')
    const data = await sendAiChat({
      messages: payloadMessages,
      pageContext: pageContext.value,
    })
    const reply = extractAssistantText(data) || '（无文本回复）'
    messages.value = [...messages.value, { role: 'assistant', content: reply }]
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    await scrollToBottom(true)
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
  window.addEventListener('report-editor-ai-settings-changed', onSettingsChanged)
})

onUnmounted(() => {
  window.removeEventListener('report-editor-ai-settings-changed', onSettingsChanged)
})
</script>

<style scoped>
.ai-fab {
  position: fixed;
  /* 避开主区右侧滚动条（约 6–16px）与 gutter，避免叠在滑块上 */
  right: max(28px, calc(12px + 16px));
  bottom: 20px;
  z-index: 9000;
  width: 72px;
  height: 72px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #fff;
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
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
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
  width: min(420px, 100vw);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(15, 23, 42, 0.12);
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

.ai-msg__body--pending {
  color: #6b7280;
  font-style: italic;
}

.ai-drawer__composer {
  border-top: 1px solid #e5e7eb;
  padding: 12px 16px 16px;
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

.ai-drawer__error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #b91c1c;
}
</style>
