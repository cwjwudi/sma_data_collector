<template>
  <section class="settings-section" :class="{ 'env-diag--compact': compact }">
    <template v-if="!compact">
      <h3 class="settings-section__title">运行环境诊断</h3>
      <p v-if="isPackagedDeployment" class="settings-hint">
        软件会自动检查本机<strong>数据存放位置</strong>、内置服务与<strong>网络端口</strong>是否正常。
        若提示有问题，可点击下方按钮，自动创建或补齐缺失的文件夹与默认设置（不会删除您已保存的报表与连接）。
      </p>
      <p v-else class="settings-hint">
        用于开发或源码运行时的自检与修复：检查端口、数据目录与运行依赖，并尽力自动补齐可安全修复的项目。
        无法自动处理的情况会在下方「运行详情」中说明。
      </p>
      <p v-if="showCachedHint" class="settings-hint settings-hint--cache">
        以下为上次检查结果。点击「{{ primaryActionLabel }}」后将重新检查并更新列表。
      </p>
    </template>
    <div class="settings-actions">
      <button
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="busy"
        @click="runUnifiedEnvironmentFix"
      >
        {{ primaryActionLabel }}
      </button>
    </div>

    <div v-if="busy" class="busy-strip" aria-live="polite">
      <div class="busy-track">
        <div class="busy-bar indeterminate" />
      </div>
      <span class="busy-text">{{ progressLabel }}</span>
    </div>

    <div v-if="logLines.length" class="log-shell">
      <div class="log-head">
        <span>运行详情</span>
        <button type="button" class="btn-mini" :disabled="busy" @click="clearLogs">清空</button>
      </div>
      <pre class="log-pre" ref="logPre">{{ logLines.join('\n') }}<span ref="logAnchor" /></pre>
    </div>

    <div v-if="!isPackagedDeployment && (nodeTools.node || nodeTools.npm)" class="node-tools">
      <span v-if="nodeTools.node">Node {{ nodeTools.node }}</span>
      <span v-if="nodeTools.npm">npm {{ nodeTools.npm }}</span>
    </div>
    <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
    <div v-if="fixResult" class="fix-result">
      <div v-if="fixResult.applied?.length">已执行：{{ fixResult.applied.join('，') }}</div>
      <div v-if="fixResult.errors?.length" class="warn">{{ fixResult.errors.join('；') }}</div>
    </div>
    <table v-if="checks.length" class="table">
      <thead>
        <tr>
          <th>检查项</th>
          <th>状态</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in checks" :key="c.id">
          <td>{{ c.label }}</td>
          <td><span :class="['badge', statusClass(c.status)]">{{ statusLabel(c.status) }}</span></td>
          <td>{{ c.detail }}</td>
        </tr>
      </tbody>
    </table>

  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { apiFetch, apiPostNdjsonStream } from '@/api/client.js'
import {
  clearEnvironmentCheckCache,
  getEnvironmentCheckCache,
  setEnvironmentCheckCache,
} from './environment-check-cache.js'

const props = defineProps({
  /** 嵌入快速入门等场景：隐藏区块标题与说明，仅保留操作与结果 */
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['after-check'])

const loading = ref(false)
const fixing = ref(false)
const rebuilding = ref(false)
const checks = ref([])
const deploymentMode = ref('development')
const nodeTools = ref({ node: null, npm: null })
const errorMsg = ref('')
const fixResult = ref(null)
const logLines = ref([])
const progressLabel = ref('')
const logPre = ref(null)
const logAnchor = ref(null)

const busy = computed(() => loading.value || fixing.value || rebuilding.value)
const isPackagedDeployment = computed(() => deploymentMode.value === 'packaged')
const primaryActionLabel = computed(() =>
  isPackagedDeployment.value ? '自动修复常见问题' : '检查并自动修复',
)
const displayedFromCache = ref(false)
const showCachedHint = computed(
  () => displayedFromCache.value && !busy.value && checks.value.length > 0,
)

function persistCheckCache() {
  setEnvironmentCheckCache({
    checks: checks.value,
    nodeTools: nodeTools.value,
    errorMsg: errorMsg.value,
    deploymentMode: deploymentMode.value,
  })
}

function hydrateFromCache() {
  const cached = getEnvironmentCheckCache()
  if (!cached) return false
  checks.value = cached.checks || []
  nodeTools.value = cached.nodeTools || { node: null, npm: null }
  errorMsg.value = cached.errorMsg || ''
  deploymentMode.value = cached.deploymentMode || 'development'
  return true
}

function appendLog(raw) {
  const s = typeof raw === 'string' ? raw.trim() : String(raw ?? '')
  if (!s) return
  logLines.value = [...logLines.value, s]
}

function clearLogs() {
  logLines.value = []
}

async function scrollLogToEnd() {
  await nextTick()
  logAnchor.value?.scrollIntoView?.({ block: 'end', behavior: 'smooth' })
}

watch(
  () => logLines.value.length,
  () => {
    scrollLogToEnd()
  },
)

function statusClass(s) {
  if (s === 'ok') return 'ok'
  if (s === 'warn') return 'warn'
  return 'fail'
}

function statusLabel(s) {
  if (s === 'ok') return '正常'
  if (s === 'warn') return '提示'
  return '需处理'
}

function summarizeChecks(rows) {
  const list = rows || []
  let ok = 0
  let warn = 0
  let fail = 0
  for (const c of list) {
    if (c.status === 'warn') warn += 1
    else if (c.status === 'fail') fail += 1
    else ok += 1
  }
  return { total: list.length, ok, warn, fail, items: list }
}

async function runCheck(opts = {}) {
  loading.value = true
  errorMsg.value = ''
  if (!opts.reuseProgressLabel) {
    progressLabel.value = '正在检查软件运行状态…'
    appendLog(progressLabel.value)
  }
  try {
    const data = await apiFetch('/environment/check')
    checks.value = data.checks || []
    deploymentMode.value =
      data.deployment_mode === 'packaged' || data.deployment_mode === 'development'
        ? data.deployment_mode
        : 'development'
    nodeTools.value = data.node_tools || {}
    persistCheckCache()
    emit('after-check', summarizeChecks(checks.value))
    if (!opts.reuseProgressLabel) {
      appendLog('检查完成：已刷新上表状态。')
    }
  } catch (e) {
    errorMsg.value = e.message || String(e)
    emit('after-check', { total: 0, ok: 0, warn: 0, fail: 0, items: [], error: errorMsg.value })
    if (!opts.reuseProgressLabel) {
      appendLog(`检查失败：${errorMsg.value}`)
    }
  } finally {
    loading.value = false
    if (!opts.reuseProgressLabel) {
      progressLabel.value = ''
    }
  }
}

async function execFixAllWarningsCore() {
  fixing.value = true
  progressLabel.value = isPackagedDeployment.value
    ? '正在自动修复…'
    : '阶段 2/2：补齐目录与配置…'
  errorMsg.value = ''
  appendLog('── 阶段 2/2：尽力消除剩余告警 ──')
  try {
    const data = await apiFetch('/environment/fix-all-warnings', {
      method: 'POST',
      body: { confirm: true },
    })
    fixResult.value = {
      applied: data.applied || [],
      errors: data.errors || [],
      logs: data.logs || [],
    }
    for (const ln of data.logs || []) {
      appendLog(ln)
    }
    if ((data.skipped || []).length) {
      appendLog('── 仍需您在本机处理（无法由此接口自动消除）──')
      for (const sk of data.skipped) {
        appendLog(`  • ${sk.id}：${sk.hint}`)
      }
    }
    appendLog('── 正在刷新检查表 ──')
    progressLabel.value = '正在刷新检查表…'
    await runCheck({ reuseProgressLabel: true })
  } catch (e) {
    errorMsg.value = e.message || String(e)
    appendLog(`阶段 2 失败：${errorMsg.value}`)
  } finally {
    fixing.value = false
    progressLabel.value = ''
  }
}

async function runUnifiedEnvironmentFix() {
  const ok = window.confirm(
    isPackagedDeployment.value
      ? '将重新检查端口，并自动创建或补齐本机数据目录与默认配置。\n\n确定继续？'
      : '将依次执行检查与自动修复（可能需要一些时间，请勿关闭窗口）。\n\n无法自动处理的项目会在运行详情中说明。\n\n确定继续？',
  )
  if (!ok) return
  clearEnvironmentCheckCache()
  appendLog('')
  appendLog('════════ 开始检查与修复 ════════')
  await runFullRepairStream({ skipFinalCheck: true })
  await execFixAllWarningsCore()
  appendLog('════════ 检查与修复结束 ════════')
}

async function runFullRepairStream(opts = {}) {
  rebuilding.value = true
  progressLabel.value = isPackagedDeployment.value
    ? '正在检查并修复，请稍候…'
    : '正在执行修复任务，请稍候…'
  errorMsg.value = ''
  appendLog('')
  appendLog('════════ 工控环境一键 ════════')
  try {
    await apiPostNdjsonStream(
      '/environment/repair-stream',
      { confirm: true },
      (rec) => {
        if (rec.event === 'log' && rec.line) {
          appendLog(rec.line)
          return
        }
        if (rec.event === 'safe_fix' && rec.result) {
          const r = rec.result
          fixResult.value = { applied: r.applied || [], errors: r.errors || [], logs: [] }
          return
        }
        if (rec.event === 'blocked') {
          appendLog(`[阻塞] ${rec.reason || ''} ${rec.script_path ? `脚本: ${rec.script_path}` : ''}`)
          return
        }
        if (rec.event === 'done') {
          const bits = [`[完成] success=${rec.success}`, `venv=${rec.venv_rebuilt ? '已重建' : '未重建/跳过'}`]
          if (rec.venv_deferred) bits.push('（venv 需退出应用后跑脚本）')
          if (rec.reason) bits.push(`reason=${rec.reason}`)
          appendLog(bits.join(' '))
        }
      },
    )
    appendLog('流式输出已结束。')
    if (!opts.skipFinalCheck) {
      progressLabel.value = '一键任务已完成，正在刷新检查表…'
      await runCheck({ reuseProgressLabel: true })
    }
  } catch (e) {
    errorMsg.value = e.message || String(e)
    appendLog(`流式任务异常：${errorMsg.value}`)
  } finally {
    rebuilding.value = false
    progressLabel.value = ''
  }
}

onMounted(() => {
  if (hydrateFromCache()) {
    displayedFromCache.value = true
    emit('after-check', summarizeChecks(checks.value))
    return
  }
  displayedFromCache.value = false
  void runCheck()
})
</script>

<style scoped>
.busy-strip {
  margin-bottom: 12px;
}
.busy-track {
  height: 6px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
  margin-bottom: 6px;
}
.busy-bar.indeterminate {
  height: 100%;
  width: 38%;
  border-radius: 999px;
  background: linear-gradient(90deg, #6366f1, #818cf8, #6366f1);
  animation: indet-slide 1.15s ease-in-out infinite;
}
@keyframes indet-slide {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(320%);
  }
}
.busy-text {
  font-size: 12px;
  color: #4b5563;
}
.log-shell {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #0b1020;
  color: #e5e7eb;
  overflow: hidden;
}
.log-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  font-size: 12px;
  background: #111827;
  color: #9ca3af;
}
.btn-mini {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #374151;
  background: transparent;
  color: #d1d5db;
  cursor: pointer;
}
.btn-mini:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.log-pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 280px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.45;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table th,
.table td {
  border: 1px solid #e5e7eb;
  padding: 8px;
  text-align: left;
  vertical-align: top;
}

.table th:nth-child(2),
.table td:nth-child(2) {
  width: 1%;
  min-width: 4.2rem;
  white-space: nowrap;
  vertical-align: middle;
  text-align: center;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.4;
}
.badge.ok {
  background: #dcfce7;
  color: #166534;
}
.badge.warn {
  background: #fef9c3;
  color: #854d0e;
}
.badge.fail {
  background: #fee2e2;
  color: #991b1b;
}
.error {
  color: #b91c1c;
  margin-bottom: 8px;
  font-size: 13px;
}
.fix-result {
  font-size: 13px;
  margin-bottom: 8px;
}
.warn {
  color: #92400e;
}
.node-tools {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
  display: flex;
  gap: 12px;
}
.settings-hint--cache {
  color: #4b5563;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
}

.env-diag--compact {
  border: none;
  padding: 0;
  background: transparent;
}

.env-diag--compact .settings-actions {
  margin-bottom: 12px;
}
</style>

<style>
@import '@/features/settings/settings-sections.css';
</style>
