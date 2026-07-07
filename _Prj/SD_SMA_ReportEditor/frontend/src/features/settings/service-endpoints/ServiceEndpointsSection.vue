<template>
  <section class="settings-section">
    <h3 class="settings-section__title">服务地址</h3>
    <p class="settings-hint">
      本机后端服务已对<strong>局域网开放</strong>。「前端」地址可直接在<strong>浏览器中打开</strong>使用网页版
      （本机或同一网络下的其它电脑均可）；「后端」地址供接口调用。点击地址右侧的<strong>复制</strong>按钮即可复制。
    </p>

    <div class="ep-list">
      <div v-for="row in rows" :key="row.key" class="ep-row">
        <div class="ep-row__label">{{ row.label }}</div>
        <div class="ep-row__value">
          <code class="ep-row__addr" :title="row.value">{{ row.value }}</code>
          <button
            v-if="row.copyable"
            type="button"
            class="settings-btn settings-btn--muted ep-copy"
            @click="copy(row.value, row.key)"
          >
            {{ copiedKey === row.key ? '已复制' : '复制' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="extraLanIps.length" class="ep-extra">
      <p class="settings-note">本机其它网卡地址：</p>
      <div v-for="ip in extraLanIps" :key="ip.address" class="ep-row ep-row--compact">
        <div class="ep-row__value">
          <code class="ep-row__addr">http://{{ ip.address }}:{{ backendPort }}</code>
          <span class="ep-iface">{{ ip.iface }}</span>
          <button
            type="button"
            class="settings-btn settings-btn--muted ep-copy"
            @click="copy(`http://${ip.address}:${backendPort}`, `lan-${ip.address}`)"
          >
            {{ copiedKey === `lan-${ip.address}` ? '已复制' : '复制' }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="!hasLan" class="settings-hint settings-hint--warn">
      未检测到局域网地址（可能未连接网络或仅有回环网卡）。其它电脑暂时无法访问本机后端。
    </p>

    <p v-if="errorMsg" class="settings-msg settings-msg--err">{{ errorMsg }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getApiOrigin } from '@/api/apiBase.js'

defineOptions({ name: 'ServiceEndpointsSection' })

type LanIp = { address: string; iface: string }

const backendPort = ref<number>(8000)
const backendLanUrl = ref<string | null>(null)
const backendLoopbackUrl = ref<string>('http://127.0.0.1:8000')
const rendererUrl = ref<string>('')
const rendererLanUrl = ref<string | null>(null)
const appVersion = ref<string>('')
const lanIps = ref<LanIp[]>([])
const errorMsg = ref('')
const copiedKey = ref('')

const hasLan = computed(() => Boolean(backendLanUrl.value) || lanIps.value.length > 0)
const primaryLanAddress = computed(() => (lanIps.value.length ? lanIps.value[0].address : null))
const extraLanIps = computed(() => lanIps.value.slice(1))

const rows = computed(() => {
  const list: { key: string; label: string; value: string; copyable: boolean }[] = []
  list.push({
    key: 'backend-lan',
    label: '后端（局域网访问）',
    value: backendLanUrl.value || '不可用（无局域网地址）',
    copyable: Boolean(backendLanUrl.value),
  })
  list.push({
    key: 'backend-local',
    label: '后端（本机）',
    value: backendLoopbackUrl.value,
    copyable: true,
  })
  if (rendererLanUrl.value) {
    list.push({
      key: 'frontend-lan',
      label: '前端（局域网·浏览器可开）',
      value: rendererLanUrl.value,
      copyable: true,
    })
  }
  list.push({
    key: 'frontend',
    label: '前端（本机·浏览器可开）',
    value: rendererUrl.value || '本地页面',
    copyable: /^https?:\/\//i.test(rendererUrl.value),
  })
  if (appVersion.value) {
    list.push({ key: 'version', label: '软件版本', value: appVersion.value, copyable: true })
  }
  return list
})

async function copy(text: string, key: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch {
      errorMsg.value = '复制失败，请手动选择文本复制。'
      return
    }
  }
  copiedKey.value = key
  window.setTimeout(() => {
    if (copiedKey.value === key) copiedKey.value = ''
  }, 1500)
}

function loadBrowserFallback() {
  // 浏览器（非 Electron）：后端地址取自 API origin，前端取自当前页面
  const origin = getApiOrigin()
  const loc = typeof window !== 'undefined' ? window.location : null
  const backendBase = origin || (loc ? `${loc.protocol}//${loc.hostname}:8000` : 'http://127.0.0.1:8000')
  backendLoopbackUrl.value = backendBase
  if (loc && loc.hostname && loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1') {
    backendLanUrl.value = `${loc.protocol}//${loc.hostname}:8000`
    lanIps.value = [{ address: loc.hostname, iface: '当前主机' }]
  }
  rendererUrl.value = loc ? loc.origin : ''
}

onMounted(async () => {
  const api = window.electronAPI
  if (api?.getServiceEndpoints) {
    try {
      const ep = await api.getServiceEndpoints()
      backendPort.value = ep.backendPort ?? 8000
      backendLanUrl.value = ep.backendLanUrl ?? null
      backendLoopbackUrl.value = ep.backendLoopbackUrl || 'http://127.0.0.1:8000'
      rendererUrl.value = ep.rendererUrl || ''
      rendererLanUrl.value = ep.rendererLanUrl ?? null
      appVersion.value = ep.appVersion || ''
      lanIps.value = Array.isArray(ep.lanIps) ? ep.lanIps : []
    } catch (e: unknown) {
      errorMsg.value = e instanceof Error ? e.message : '无法读取服务地址'
    }
    return
  }
  loadBrowserFallback()
})

// primaryLanAddress 供潜在扩展使用（避免未使用告警）
void primaryLanAddress
</script>

<style scoped>
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

.ep-row--compact {
  margin-top: 4px;
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

.ep-iface {
  font-size: 12px;
  color: #9ca3af;
}

.ep-copy {
  min-height: 30px;
  padding: 4px 12px;
  font-size: 13px;
}

.ep-extra {
  margin-top: 12px;
}
</style>

<style>
@import '@/features/settings/settings-sections.css';
</style>
