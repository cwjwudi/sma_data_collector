<template>
  <div class="page settings-page ai-tools-page">
    <h2 class="page-title">AI 工具</h2>

    <section class="settings-section settings-section--featured">
      <h3 class="settings-section__title">总闸</h3>
      <p class="settings-hint">
        写入类与需确认类工具依赖设置中的
        <router-link class="ai-tools-link" to="/settings">「允许 AI 写入工具」</router-link>
        。关闭总闸后，下方写入/确认类开关将灰显且不可单独开启。
      </p>
      <p class="settings-hint">
        当前写入总闸：
        <strong>{{ writeToolsEnabled ? '已开启' : '已关闭' }}</strong>
      </p>
    </section>

    <section v-for="group in groupedTools" :key="group.id" class="settings-section">
      <h3 class="settings-section__title">{{ group.label }}</h3>
      <ul class="ai-tools-list">
        <li v-for="tool in group.tools" :key="tool.name" class="ai-tools-row">
          <div class="ai-tools-row__main">
            <div class="ai-tools-row__head">
              <code class="ai-tools-row__id">{{ tool.name }}</code>
              <span class="ai-tools-row__risk" :data-risk="tool.risk">{{ riskLabel(tool.risk) }}</span>
            </div>
            <div class="ai-tools-row__title">{{ tool.title_zh }}</div>
            <p class="ai-tools-row__desc">{{ tool.description_zh }}</p>
            <p v-if="!tool.enabled" class="settings-hint settings-hint--warn">已禁用：Cursor 无法调用此工具</p>
            <p v-if="tool.toggle_disabled_reason" class="settings-hint">{{ tool.toggle_disabled_reason }}</p>
          </div>
          <button
            type="button"
            class="settings-switch ai-tools-switch"
            role="switch"
            :aria-checked="tool.enabled ? 'true' : 'false'"
            :disabled="busy || Boolean(tool.toggle_disabled_reason)"
            @click="toggleTool(tool)"
          >
            <span class="settings-switch-track" :class="{ on: tool.enabled }">
              <span class="settings-switch-thumb" />
            </span>
          </button>
        </li>
      </ul>
    </section>

    <p v-if="msg" class="settings-msg" :class="{ 'settings-msg--ok': msgTone === 'ok', 'settings-msg--err': msgTone === 'err' }">
      {{ msg }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  fetchAiToolsCatalog,
  patchAiToolToggle,
  type AiToolCatalogEntry,
  type AiToolRisk,
} from '@/api/aiSettings'

defineOptions({ name: 'AiToolsPage' })

const tools = ref<AiToolCatalogEntry[]>([])
const categories = ref<Record<string, string>>({})
const writeToolsEnabled = ref(false)
const busy = ref(false)
const msg = ref('')
const msgTone = ref<'ok' | 'err' | ''>('')

const CATEGORY_ORDER = ['diagnostic', 'datasource', 'assets', 'config', 'export', 'system']

function riskLabel(risk: AiToolRisk): string {
  if (risk === 'write') return '写入'
  if (risk === 'confirm') return '需确认'
  return '只读'
}

const groupedTools = computed(() => {
  const byCat = new Map<string, AiToolCatalogEntry[]>()
  for (const t of tools.value) {
    const cat = t.category || 'system'
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat)!.push(t)
  }
  const order = [...CATEGORY_ORDER, ...Object.keys(categories.value).filter((k) => !CATEGORY_ORDER.includes(k))]
  const seen = new Set<string>()
  const groups: { id: string; label: string; tools: AiToolCatalogEntry[] }[] = []
  for (const id of order) {
    if (seen.has(id)) continue
    seen.add(id)
    const list = byCat.get(id)
    if (!list?.length) continue
    groups.push({
      id,
      label: categories.value[id] || list[0]?.category_label || id,
      tools: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    })
  }
  return groups
})

async function load() {
  try {
    const data = await fetchAiToolsCatalog()
    tools.value = data.tools || []
    categories.value = data.categories || {}
    writeToolsEnabled.value = Boolean(data.write_tools_enabled)
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  }
}

async function toggleTool(tool: AiToolCatalogEntry) {
  if (busy.value || tool.toggle_disabled_reason) return
  busy.value = true
  msg.value = ''
  msgTone.value = ''
  try {
    const nextEnabled = !tool.enabled
    const res = await patchAiToolToggle(tool.name, nextEnabled)
    tools.value = res.tools || []
    msg.value = `${tool.title_zh} 已${nextEnabled ? '启用' : '禁用'}`
    msgTone.value = 'ok'
  } catch (e: unknown) {
    msg.value = e instanceof Error ? e.message : String(e)
    msgTone.value = 'err'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void load()
  window.addEventListener('report-editor-ai-settings-changed', load)
})

onUnmounted(() => {
  window.removeEventListener('report-editor-ai-settings-changed', load)
})
</script>

<style scoped>
.ai-tools-link {
  color: #2563eb;
  text-decoration: none;
}

.ai-tools-link:hover {
  text-decoration: underline;
}

.ai-tools-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ai-tools-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
}

.ai-tools-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.ai-tools-row__main {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
}

.ai-tools-row__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.ai-tools-row__id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
  padding: 2px 6px;
  border-radius: 4px;
}

.ai-tools-row__risk {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
}

.ai-tools-row__risk[data-risk='write'] {
  background: #fff7ed;
  color: #c2410c;
}

.ai-tools-row__risk[data-risk='confirm'] {
  background: #fef2f2;
  color: #b91c1c;
}

.ai-tools-row__title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

.ai-tools-row__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: #6b7280;
  white-space: normal;
  overflow-wrap: anywhere;
}

/* 覆盖 settings-switch 的 width:100%，避免把左侧文案挤成竖排 */
.ai-tools-switch.settings-switch {
  flex: 0 0 auto;
  width: auto;
  min-width: 52px;
  min-height: 32px;
  margin-top: 4px;
}
</style>

<style>
@import '@/features/settings/settings-sections.css';
</style>
