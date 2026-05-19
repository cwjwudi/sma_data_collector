<template>
  <section class="settings-section">
    <h3 class="settings-section__title">运行环境诊断</h3>
    <p class="settings-hint">
      <strong>一键环境与风险修复</strong>会顺序执行：<strong>流式</strong>端口诊断与安全目录／venv 条件允许时的重装，
      再执行告警尽力消除（目录、默认配置、按需 <code>pip install</code>）。
      不会在后台擅自杀端口进程。
      Python 过低、npm 缺失、需退出后用脚本处理的 venv 等，仅在日志末尾说明办法。
    </p>
    <p v-if="showCachedHint" class="settings-hint settings-hint--cache">
      以下为上次检测结果；再次进入本页不会重复扫描。点击「一键环境与风险修复」后将重新检测并更新上表。
    </p>
    <div class="settings-actions">
      <button
        type="button"
        class="settings-btn settings-btn--primary"
        :disabled="busy"
        @click="runUnifiedEnvironmentFix"
      >
        一键环境与风险修复
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
        <span>后台输出</span>
        <button type="button" class="btn-mini" :disabled="busy" @click="clearLogs">清空</button>
      </div>
      <pre class="log-pre" ref="logPre">{{ logLines.join('\n') }}<span ref="logAnchor" /></pre>
    </div>

    <div v-if="nodeTools.node || nodeTools.npm" class="node-tools">
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
          <td><span :class="['badge', statusClass(c.status)]">{{ c.status }}</span></td>
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

const emit = defineEmits(['after-check'])

const loading = ref(false)
const fixing = ref(false)
const rebuilding = ref(false)
const checks = ref([])
const nodeTools = ref({ node: null, npm: null })
const errorMsg = ref('')
const fixResult = ref(null)
const logLines = ref([])
const progressLabel = ref('')
const logPre = ref(null)
const logAnchor = ref(null)

const busy = computed(() => loading.value || fixing.value || rebuilding.value)
const displayedFromCache = ref(false)
const showCachedHint = computed(
  () => displayedFromCache.value && !busy.value && checks.value.length > 0,
)

function persistCheckCache() {
  setEnvironmentCheckCache({
    checks: checks.value,
    nodeTools: nodeTools.value,
    errorMsg: errorMsg.value,
  })
}

function hydrateFromCache() {
  const cached = getEnvironmentCheckCache()
  if (!cached) return false
  checks.value = cached.checks || []
  nodeTools.value = cached.nodeTools || { node: null, npm: null }
  errorMsg.value = cached.errorMsg || ''
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
    progressLabel.value = '正在扫描环境、端口与目录…'
    appendLog(progressLabel.value)
  }
  try {
    const data = await apiFetch('/environment/check')
    checks.value = data.checks || []
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
  progressLabel.value = '阶段 2/2：目录、配置与 venv 补齐…'
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
    '将一键执行两个阶段（可能较慢，请勿刷新页面）：\n' +
      '1）流式：8000/5173 诊断（推断 PID，不杀进程）、安全目录、条件允许时重装 backend/venv 并 pip；\n' +
      '2）尽力消除剩余告警（目录与默认配置、按需补 venv）。\n\n' +
      '若正以本仓库 venv 独占运行后端，无法在进程内删掉同一 venv，日志里会给出退出后执行的脚本。\n' +
      'Python 过低、npm 缺失等只能在本机安装后重试。\n\n' +
      '确定继续？',
  )
  if (!ok) return
  clearEnvironmentCheckCache()
  appendLog('')
  appendLog('════════ 环境与风险 · 一键修复（阶段 1/2 → 阶段 2/2）════════')
  await runFullRepairStream({ skipFinalCheck: true })
  await execFixAllWarningsCore()
  appendLog('════════ 环境与风险 · 一键流程结束 ════════')
}

async function runFullRepairStream(opts = {}) {
  rebuilding.value = true
  progressLabel.value = '流式任务进行中：端口诊断与安全修复已完成前请勿中断…'
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
}
.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  text-transform: uppercase;
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
</style>
