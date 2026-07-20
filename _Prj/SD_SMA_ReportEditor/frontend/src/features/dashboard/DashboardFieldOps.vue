<template>
  <div class="dash-ops">
    <!-- 1. 结批运行态 -->
    <section class="dash-card" :class="{ 'dash-card--busy': runtime.inProgress > 0, 'dash-card--warn': runtime.todayFail > 0 }">
      <div class="dash-card__head">
        <h3 class="dash-card__title">结批运行态</h3>
        <router-link to="/generate" class="dash-card__link">生成报表 →</router-link>
      </div>
      <p class="dash-card__status" :title="runtime.statusLine || undefined">
        {{ runtime.statusLine || (runtime.autoEnabled ? '监听中…' : '自动结批未启用') }}
      </p>
      <div class="dash-metrics">
        <div class="dash-metric">
          <span class="dash-metric__val">{{ runtime.todayOk }}</span>
          <span class="dash-metric__lbl">今日成功</span>
        </div>
        <div class="dash-metric" :class="{ 'dash-metric--bad': runtime.todayFail > 0 }">
          <span class="dash-metric__val">{{ runtime.todayFail }}</span>
          <span class="dash-metric__lbl">今日失败</span>
        </div>
        <div class="dash-metric">
          <span class="dash-metric__val">{{ runtime.inProgress }}</span>
          <span class="dash-metric__lbl">进行中</span>
        </div>
        <div class="dash-metric">
          <span class="dash-metric__val">{{ runtime.inProgress }}/{{ runtime.maxParallel }}</span>
          <span class="dash-metric__lbl">并行占用</span>
        </div>
      </div>
      <p v-if="runtime.lastExport" class="dash-card__foot">
        最近一次：
        <strong :class="runtime.lastExport.success ? 'ok' : 'bad'">{{ runtime.lastExport.success ? '成功' : '失败' }}</strong>
        · {{ runtime.lastExport.atLabel }}
        <template v-if="runtime.lastExport.fileName"> · {{ runtime.lastExport.fileName }}</template>
        <template v-if="runtime.lastExport.templateName"> · {{ runtime.lastExport.templateName }}</template>
      </p>
      <p v-else class="dash-card__foot muted">尚无本机触发记录（自动结批日志）。</p>
    </section>

    <!-- 2. 自动触发 / 心跳健康度 -->
    <section class="dash-card" :class="{ 'dash-card--warn': trigger.issueCount > 0 }">
      <div class="dash-card__head">
        <h3 class="dash-card__title">触发与心跳</h3>
        <router-link to="/generate" class="dash-card__link">配置 →</router-link>
      </div>
      <p class="dash-card__status">
        自动结批
        <strong>{{ trigger.autoEnabled ? '开' : '关' }}</strong>
        · 绑定 {{ trigger.active }}/{{ trigger.total }} 可用
        <span v-if="trigger.incomplete" class="bad"> · {{ trigger.incomplete }} 项配置不完整</span>
      </p>
      <p class="dash-card__status">
        PLC 心跳
        <strong :class="heartbeatClass">{{ heartbeatLabel }}</strong>
        <span v-if="heartbeatStatus" class="muted"> · {{ heartbeatStatus }}</span>
      </p>
      <ul v-if="trigger.rows.length" class="dash-bind-list">
        <li v-for="row in trigger.rows" :key="row.id" class="dash-bind">
          <div class="dash-bind__meta">
            <span class="dash-bind__name">{{ row.label }}</span>
            <span class="dash-bind__state" :class="row.stateClass">{{ row.stateLabel }}</span>
          </div>
          <AutoTriggerValueSparkline
            v-if="row.samples.length >= 2"
            class="dash-bind__spark"
            :samples="row.samples"
            :width="220"
            :height="36"
          />
          <span v-else class="dash-bind__spark-ph muted">暂无采样</span>
        </li>
      </ul>
      <p v-else class="dash-card__foot muted">未配置触发绑定。可在「生成报表」中添加 OPC 触发。</p>
    </section>

    <div class="dash-ops__split">
      <!-- 3. 最近失败 -->
      <section class="dash-card dash-card--fill" :class="{ 'dash-card--warn': failures.length > 0 }">
        <div class="dash-card__head">
          <h3 class="dash-card__title">最近结批失败</h3>
          <router-link to="/audit" class="dash-card__link">操作审计 →</router-link>
        </div>
        <p v-if="failuresLoading" class="dash-card__foot muted">加载中…</p>
        <p v-else-if="failuresError" class="dash-card__foot bad">{{ failuresError }}</p>
        <p v-else-if="!failures.length" class="dash-card__foot muted">近期无导出失败记录。</p>
        <ul v-else class="dash-list">
          <li v-for="f in failures" :key="f.id" class="dash-list__item">
            <div class="dash-list__main">
              <span class="dash-list__title">{{ f.summary || f.action }}</span>
              <span class="dash-list__meta">{{ f.timeLabel }} · {{ f.action }}</span>
            </div>
            <router-link class="dash-list__act" :to="f.to">查看</router-link>
          </li>
        </ul>
      </section>

      <!-- 4. 最近导出 PDF -->
      <section class="dash-card dash-card--fill">
        <div class="dash-card__head">
          <h3 class="dash-card__title">最近导出 PDF</h3>
          <router-link to="/history" class="dash-card__link">历史报表 →</router-link>
        </div>
        <p v-if="!electronShell" class="dash-card__foot muted">需桌面端才能列出本地导出文件夹。</p>
        <p v-else-if="!pdfDir" class="dash-card__foot muted">未绑定导出文件夹，请到「历史报表」或「生成报表」选择。</p>
        <p v-else-if="pdfsLoading" class="dash-card__foot muted">扫描中…</p>
        <p v-else-if="pdfsError" class="dash-card__foot bad">{{ pdfsError }}</p>
        <p v-else-if="!pdfs.length" class="dash-card__foot muted">文件夹内暂无 PDF。</p>
        <ul v-else class="dash-list">
          <li v-for="p in pdfs" :key="p.filePath" class="dash-list__item">
            <div class="dash-list__main">
              <span class="dash-list__title" :title="p.filePath">{{ p.name }}</span>
              <span class="dash-list__meta">{{ p.sizeLabel }} · {{ p.timeLabel }}</span>
            </div>
            <div class="dash-list__acts">
              <button type="button" class="dash-list__act btn" @click="openPdf(p.filePath)">打开</button>
              <button type="button" class="dash-list__act btn" @click="revealPdf(p.filePath)">位置</button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref } from 'vue'
import AutoTriggerValueSparkline from '@/components/AutoTriggerValueSparkline.vue'
import { fetchAuditEntries, formatAuditTime, type AuditEntry } from '@/lib/auditLog'
import {
  AUTO_EXPORT_STATUS,
  autoExportStatusLabel,
} from '@/lib/auto-export-status-codes'
import { resolveAutoExportMaxParallel } from '@/lib/export-cpu-budget'
import {
  isTriggerBindingActive,
  isTriggerBindingComplete,
  isTriggerBindingEnabled,
  type AutoTriggerBinding,
} from '@/lib/auto-trigger-bindings'
import { formatTriggerLogTime, type AutoTriggerLogEntry } from '@/lib/auto-trigger-log'
import { plcHeartbeatState } from '@/lib/plc-heartbeat-service'
import {
  getReportAutoExportBindingRuntime,
  reportAutoExportStatus,
} from '@/lib/report-auto-export-trigger-service'
import { loadReportExportPrefs } from '@/lib/report-export-prefs'
import { loadReportGeneratorPrefs } from '@/lib/report-generator-prefs'
import { listTemplateSummaries } from '@/api/templates'

defineOptions({ name: 'DashboardFieldOps' })

const electronShell = typeof window !== 'undefined' && Boolean(window.electronAPI?.scanExportPdfs)

const tick = ref(0)
const templateNameById = ref<Record<string, string>>({})

const failures = ref<Array<{ id: string; summary: string; action: string; timeLabel: string; to: string }>>([])
const failuresLoading = ref(false)
const failuresError = ref('')

type PdfRow = { name: string; filePath: string; sizeLabel: string; timeLabel: string }
const pdfs = ref<PdfRow[]>([])
const pdfsLoading = ref(false)
const pdfsError = ref('')
const pdfDir = ref('')

let pollTimer: ReturnType<typeof setInterval> | null = null

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function isInProgressCode(code: number): boolean {
  return code >= AUTO_EXPORT_STATUS.QUEUED && code <= AUTO_EXPORT_STATUS.WRITING_PLC
}

function formatSize(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function bindingLabel(b: AutoTriggerBinding, index: number): string {
  const tpl = b.templateId ? templateNameById.value[b.templateId] : ''
  if (tpl) return tpl
  const node = (b.nodeId || '').trim()
  if (node) return node.length > 28 ? `…${node.slice(-28)}` : node
  return `绑定 ${index + 1}`
}

const runtime = computed(() => {
  void tick.value
  const prefs = loadReportGeneratorPrefs()
  const bindings = prefs.auto.bindings || []
  const active = bindings.filter(isTriggerBindingActive)
  const configured = resolveAutoExportMaxParallel(prefs.auto.maxParallelExports)
  const maxParallel = Math.min(configured, Math.max(1, active.length || 1))

  const today0 = startOfTodayMs()
  let todayOk = 0
  let todayFail = 0
  type LogWithTpl = AutoTriggerLogEntry & { templateId: string | null }
  const allLogs: LogWithTpl[] = []
  for (const b of bindings) {
    for (const e of b.triggerLog || []) {
      allLogs.push({ ...e, templateId: b.templateId })
      const t = Date.parse(e.at)
      if (!Number.isFinite(t) || t < today0) continue
      if (e.success) todayOk += 1
      else todayFail += 1
    }
  }
  const newest = [...allLogs].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  let lastExport: null | {
    success: boolean
    atLabel: string
    fileName: string
    templateName: string
  } = null
  if (newest) {
    lastExport = {
      success: newest.success,
      atLabel: formatTriggerLogTime(newest.at),
      fileName: newest.fileName || '',
      templateName: newest.templateId ? templateNameById.value[newest.templateId] || '' : '',
    }
  }

  let inProgress = 0
  for (const b of active) {
    const code = getReportAutoExportBindingRuntime(b.id).lastStatusCode
    if (isInProgressCode(code)) inProgress += 1
  }

  return {
    autoEnabled: prefs.auto.enabled,
    statusLine: reportAutoExportStatus.value || '',
    todayOk,
    todayFail,
    inProgress,
    maxParallel,
    lastExport,
  }
})

const trigger = computed(() => {
  void tick.value
  const prefs = loadReportGeneratorPrefs()
  const bindings = prefs.auto.bindings || []
  const active = bindings.filter(isTriggerBindingActive).length
  const incomplete = bindings.filter((b) => isTriggerBindingEnabled(b) && !isTriggerBindingComplete(b)).length
  const rows = bindings.slice(0, 6).map((b, i) => {
    const rt = getReportAutoExportBindingRuntime(b.id)
    const samples = rt.chartEligible === false ? [] : rt.history.toArray().slice(-60)
    const enabled = isTriggerBindingEnabled(b)
    const complete = isTriggerBindingComplete(b)
    let stateLabel = autoExportStatusLabel(rt.lastStatusCode)
    let stateClass = 'neutral'
    if (!enabled) {
      stateLabel = '已停用'
      stateClass = 'muted'
    } else if (!complete) {
      stateLabel = '配置不完整'
      stateClass = 'bad'
    } else if (isInProgressCode(rt.lastStatusCode)) {
      stateClass = 'busy'
    } else if (rt.lastStatusCode === AUTO_EXPORT_STATUS.FAILED) {
      stateClass = 'bad'
    } else if (rt.lastStatusCode === AUTO_EXPORT_STATUS.SUCCESS) {
      stateClass = 'ok'
    }
    return {
      id: b.id,
      label: bindingLabel(b, i),
      samples,
      stateLabel,
      stateClass,
    }
  })
  return {
    autoEnabled: prefs.auto.enabled,
    total: bindings.length,
    active,
    incomplete,
    issueCount: incomplete + (prefs.auto.enabled && active === 0 && bindings.length > 0 ? 1 : 0),
    rows,
  }
})

const heartbeatStatus = computed(() => plcHeartbeatState.status.value)
const heartbeatLastOk = computed(() => plcHeartbeatState.lastOk.value)
const heartbeatLabel = computed(() => {
  const prefs = loadReportGeneratorPrefs()
  if (!prefs.heartbeat?.enabled) return '未启用'
  if (heartbeatLastOk.value === true) return '正常'
  if (heartbeatLastOk.value === false) return '写入失败'
  return '等待首次写入'
})
const heartbeatClass = computed(() => {
  if (heartbeatLastOk.value === true) return 'ok'
  if (heartbeatLastOk.value === false) return 'bad'
  return ''
})

async function loadTemplateNames() {
  try {
    const list = await listTemplateSummaries()
    const map: Record<string, string> = {}
    for (const t of list || []) {
      if (t?.id) map[t.id] = t.name || t.id
    }
    templateNameById.value = map
  } catch {
    /* ignore */
  }
}

async function loadFailures() {
  failuresLoading.value = true
  failuresError.value = ''
  try {
    const res = await fetchAuditEntries({ limit: 40, offset: 0, result: 'fail' })
    const exportFails = (res.entries || []).filter((e: AuditEntry) => String(e.action || '').startsWith('export.')).slice(0, 5)
    failures.value = exportFails.map((e) => ({
      id: e.id,
      summary: (e.summary || '').trim() || e.action,
      action: e.action,
      timeLabel: formatAuditTime(e.ts),
      to: '/audit',
    }))
  } catch (err) {
    failuresError.value = err instanceof Error ? err.message : '加载失败记录失败'
    failures.value = []
  } finally {
    failuresLoading.value = false
  }
}

async function loadPdfs() {
  if (!electronShell) return
  pdfsLoading.value = true
  pdfsError.value = ''
  try {
    const watch = (loadReportExportPrefs().watchDir || '').trim()
    const autoDir = (loadReportGeneratorPrefs().autoExportDir || '').trim()
    const dir = watch || autoDir
    pdfDir.value = dir
    if (!dir) {
      pdfs.value = []
      return
    }
    const res = await window.electronAPI!.scanExportPdfs!({ dir, limit: 5 })
    const files = (res?.files || []).slice(0, 5)
    pdfs.value = files.map((f) => ({
      name: f.name,
      filePath: f.filePath,
      sizeLabel: formatSize(f.sizeBytes),
      timeLabel: (() => {
        const d = new Date(f.modifiedAt)
        return Number.isNaN(d.getTime()) ? f.modifiedAt : d.toLocaleString('zh-CN', { hour12: false })
      })(),
    }))
  } catch (err) {
    pdfsError.value = err instanceof Error ? err.message : '扫描 PDF 失败'
    pdfs.value = []
  } finally {
    pdfsLoading.value = false
  }
}

async function openPdf(filePath: string) {
  try {
    await window.electronAPI?.shellOpenPath?.(filePath)
  } catch {
    /* ignore */
  }
}

async function revealPdf(filePath: string) {
  try {
    await window.electronAPI?.showItemInFolder?.(filePath)
  } catch {
    /* ignore */
  }
}

function refreshLocal() {
  tick.value += 1
}

async function refreshAll() {
  refreshLocal()
  await Promise.all([loadFailures(), loadPdfs(), loadTemplateNames()])
}

function onPrefsUpdated() {
  refreshLocal()
  void loadPdfs()
}

function onConfigImported() {
  void refreshAll()
}

onMounted(() => {
  void refreshAll()
  pollTimer = setInterval(refreshLocal, 1000)
  window.addEventListener('report-generator-prefs-updated', onPrefsUpdated)
  window.addEventListener('report-generator-auto-export-changed', onPrefsUpdated)
  window.addEventListener('report-editor-config-imported', onConfigImported)
})

onActivated(() => {
  void refreshAll()
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  window.removeEventListener('report-generator-prefs-updated', onPrefsUpdated)
  window.removeEventListener('report-generator-auto-export-changed', onPrefsUpdated)
  window.removeEventListener('report-editor-config-imported', onConfigImported)
})
</script>

<style scoped>
.dash-ops {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
}

.dash-ops__split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 960px) {
  .dash-ops__split {
    grid-template-columns: 1fr;
  }
}

.dash-card {
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid rgb(228 228 231 / 0.95);
  background: rgb(255 255 255 / 0.92);
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.05);
}

.dash-card--fill {
  min-width: 0;
}

.dash-card--warn {
  border-color: #fecaca;
  background: linear-gradient(180deg, #fff7f7 0%, rgb(255 255 255 / 0.95) 100%);
}

.dash-card--busy {
  border-color: #c7d2fe;
  background: linear-gradient(180deg, #eef2ff 0%, rgb(255 255 255 / 0.95) 100%);
}

.dash-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.dash-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.dash-card__link {
  font-size: 12px;
  font-weight: 600;
  color: #4f46e5;
  text-decoration: none;
  white-space: nowrap;
}

.dash-card__link:hover {
  text-decoration: underline;
}

.dash-card__status {
  margin: 0 0 10px;
  font-size: 13px;
  color: #475569;
  line-height: 1.45;
  word-break: break-word;
}

.dash-card__foot {
  margin: 10px 0 0;
  font-size: 12px;
  color: #475569;
  line-height: 1.45;
}

.dash-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 640px) {
  .dash-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.dash-metric {
  padding: 10px 8px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  text-align: center;
}

.dash-metric--bad {
  background: #fef2f2;
  border-color: #fecaca;
}

.dash-metric__val {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.dash-metric--bad .dash-metric__val {
  color: #b91c1c;
}

.dash-metric__lbl {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #64748b;
}

.dash-bind-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dash-bind {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.dash-bind__meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dash-bind__name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-bind__state {
  font-size: 11px;
  font-weight: 600;
}

.dash-bind__state.ok,
.ok {
  color: #15803d;
}

.dash-bind__state.bad,
.bad {
  color: #b91c1c;
}

.dash-bind__state.busy {
  color: #4338ca;
}

.dash-bind__state.muted,
.muted {
  color: #94a3b8;
}

.dash-bind__state.neutral {
  color: #64748b;
}

.dash-bind__spark {
  flex-shrink: 0;
  width: 140px;
}

.dash-bind__spark :deep(.ats-svg) {
  height: 36px;
}

.dash-bind__spark-ph {
  flex-shrink: 0;
  font-size: 11px;
  min-width: 72px;
  text-align: right;
}

.dash-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dash-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
  background: #f8fafc;
}

.dash-list__main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dash-list__title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-list__meta {
  font-size: 11px;
  color: #64748b;
}

.dash-list__acts {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.dash-list__act {
  font-size: 12px;
  font-weight: 600;
  color: #4f46e5;
  text-decoration: none;
  white-space: nowrap;
}

.dash-list__act.btn {
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  color: #475569;
}

.dash-list__act.btn:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.dash-list__act:hover {
  text-decoration: underline;
}
</style>
