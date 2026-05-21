<template>
  <Teleport to="body">
    <div v-if="visible" class="wiz-backdrop" aria-hidden="false">
      <div class="wiz-dialog" role="dialog" aria-modal="true" aria-labelledby="wiz-title">
        <header class="wiz-head">
          <div class="wiz-head-text">
            <p class="wiz-kicker">快速入门</p>
            <h1 id="wiz-title" class="wiz-title">{{ stepTitle }}</h1>
          </div>
          <button type="button" class="wiz-close" title="稍后再看" aria-label="关闭" @click="onDefer">×</button>
        </header>

        <ol class="wiz-steps" aria-label="快速入门步骤">
          <li
            v-for="(s, idx) in stepDefs"
            :key="s.id"
            :class="{ done: idx < stepIndex, on: idx === stepIndex }"
          >
            <span class="wiz-step-n">{{ idx + 1 }}</span>
            {{ s.short }}
          </li>
        </ol>

        <div class="wiz-body">
          <!-- 欢迎 -->
          <section v-if="stepId === 'welcome'" class="wiz-panel">
            <p class="lead">
              欢迎使用 <strong>SD SMA 报表编辑器</strong>。您可以用它连接生产数据库与现场设备数据，设计报表版式，并导出
              <strong>PDF</strong> 供打印与归档。
            </p>
            <p class="wiz-hint">
              接下来几步大约只需几分钟，帮助您完成常用准备。暂时用不到的步骤可以直接<strong>跳过</strong>，稍后在左侧菜单中随时继续。
            </p>
            <ul class="bullets">
              <li>连接信息保存在<strong>本机</strong>，不会自动上传到互联网。</li>
              <li>可设置默认 PDF 输出文件夹，便于归档与在「历史报表」中查看。</li>
              <li>关闭本窗口不会丢失已保存的配置；需要时在<strong>设置</strong>中可再次打开快速入门。</li>
            </ul>
          </section>

          <!-- 环境 -->
          <section v-else-if="stepId === 'env'" class="wiz-panel wiz-panel-grow">
            <p class="wiz-hint">
              软件将自动检查本机运行是否正常。
              <span v-if="envAudit">出现<strong>需处理</strong>时请先按提示解决；<strong>提示</strong>项可根据现场情况决定是否处理。</span>
            </p>
            <div v-if="envAudit && !envAudit.error" class="audit-row">
              <span v-if="envAudit.fail" class="pill fail">需处理 {{ envAudit.fail }}</span>
              <span v-if="envAudit.warn" class="pill warn">提示 {{ envAudit.warn }}</span>
              <span v-if="!envAudit.fail && !envAudit.warn && envAudit.total" class="pill ok">
                检查通过（{{ envAudit.ok }}/{{ envAudit.total }}）</span>
            </div>
            <div v-else-if="envAudit?.error" class="pill-box fail-soft">{{ envAudit.error }}</div>
            <EnvironmentDiagnostics class="wiz-env-card" compact @after-check="onEnvAudit" />
          </section>

          <!-- 数据库（向导内仅连接表单） -->
          <section v-else-if="stepId === 'db'" class="wiz-panel wiz-panel-db">
            <WizardDatabaseSimple />
          </section>

          <!-- OPC UA -->
          <section v-else-if="stepId === 'opcua'" class="wiz-panel wiz-panel-grow wiz-panel-opc">
            <div class="embed-box opc opc-wizard-shell">
              <OpcUaPanel wizard-layout />
            </div>
          </section>

          <!-- 默认报表输出文件夹 -->
          <section v-else-if="stepId === 'exportdir'" class="wiz-panel">
            <WizardExportDirPicker />
          </section>

          <!-- 版式、模版与签名：向导内介绍，不跳转编辑 -->
          <section v-else-if="stepId === 'artifacts'" class="wiz-panel wiz-panel-artifacts">
            <p class="wiz-hint">
              数据连接完成后，建议按下面顺序了解报表相关功能。此处<strong>仅作介绍</strong>，不会打开编辑页面，也不会打断本向导。
              需要实际操作时，请从左侧菜单进入对应功能。
            </p>

            <div class="artifact-layout">
              <nav class="artifact-tabs" aria-label="功能介绍">
                <button
                  v-for="t in artifactTabs"
                  :key="t.id"
                  type="button"
                  :class="['artifact-tab', { on: artifactTab === t.id }]"
                  @click="artifactTab = t.id"
                >
                  <span class="artifact-tab-icon" aria-hidden="true">{{ t.menuIcon }}</span>
                  {{ t.short }}
                </button>
              </nav>

              <div class="artifact-detail">
                <div class="artifact-menu-hint">
                  <span class="artifact-menu-badge">左侧菜单</span>
                  <strong>{{ activeArtifact.menuLabel }}</strong>
                </div>
                <p class="lead artifact-lead">{{ activeArtifact.lead }}</p>
                <ul class="bullets artifact-points">
                  <li v-for="(point, idx) in activeArtifact.points" :key="idx">{{ point }}</li>
                </ul>
                <p v-if="activeArtifact.tip" class="artifact-tip">{{ activeArtifact.tip }}</p>
              </div>
            </div>

            <div class="artifact-subnav">
              <button type="button" class="btn" :disabled="artifactTabIndex === 0" @click="prevArtifactTab">
                上一项
              </button>
              <span class="artifact-subnav-count">{{ artifactTabIndex + 1 }} / {{ artifactTabs.length }}</span>
              <button
                type="button"
                class="btn"
                :disabled="artifactTabIndex >= artifactTabs.length - 1"
                @click="nextArtifactTab"
              >
                下一项
              </button>
            </div>
          </section>

          <!-- 完成 -->
          <section v-else class="wiz-panel">
            <p class="lead">快速入门已浏览完毕，您可以开始使用了。</p>
            <p class="wiz-hint">
              跳过的步骤可在左侧菜单随时补充。默认 PDF 输出文件夹可在<strong>生成报表</strong>或<strong>历史报表</strong>中修改。
              版式、模版与签名等功能，请关闭本向导后从左侧菜单进入实际操作。
              若运行检查仍有<strong>需处理</strong>项，请先到<strong>设置 › 运行环境诊断</strong>查看说明。
            </p>
          </section>
        </div>

        <footer class="wiz-footer">
          <div class="wiz-footer-note" v-if="stepId !== 'welcome' && stepId !== 'done'">
            <span>暂时不需要此步？</span>
            <button type="button" class="btn linkish" @click="onSkipStep">跳过</button>
          </div>
          <div v-else class="wiz-footer-spacer" />
          <div class="wiz-actions">
            <button type="button" class="btn" :disabled="stepIndex === 0" @click="prev">上一步</button>
            <button v-if="stepId !== 'done'" type="button" class="btn primary" @click="next">下一步</button>
            <button v-else type="button" class="btn primary success" @click="complete">开始使用</button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import EnvironmentDiagnostics from '@/features/settings/environment-diagnostics/EnvironmentDiagnostics.vue'
import WizardDatabaseSimple from '@/features/onboarding/WizardDatabaseSimple.vue'
import WizardExportDirPicker from '@/features/onboarding/WizardExportDirPicker.vue'
import OpcUaPanel from '@/features/datasource/opcua/OpcUaPanel.vue'
import { setupWizardMarkCompleted } from './setupWizardStorage'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const artifactTabs = [
  {
    id: 'layouts',
    short: '版式',
    menuIcon: '📐',
    menuLabel: '版式与页眉页脚',
    lead: '在这里统一设置 PDF 的纸张、页边距，以及封面、正文页、末页的页眉与页脚区域。',
    points: [
      '先确定企业常用的纸张规格与页边距，避免每份报表单独调整。',
      '封面、正文、末页可分别设计页眉页脚，满足正式归档要求。',
      '版式准备好后，新建模版时直接选用，导出 PDF 即保持一致外观。',
    ],
    tip: '建议：在创建具体报表模版之前，先在这里准备好 1～2 套常用版式。',
  },
  {
    id: 'templates',
    short: '模版',
    menuIcon: '📄',
    menuLabel: '模板管理',
    lead: '在这里创建和维护报表模版，把数据库或现场数据绑定到表格、文字等报表元素上。',
    points: [
      '新建模版时可选择已准备好的版式，并拖拽添加表格、文本、图片等组件。',
      '绑定数据源后可在软件内预览，确认数据与排版无误。',
      '模版定稿后，可在「生成报表」中反复使用，批量导出 PDF。',
    ],
    tip: '建议：先完成数据库或现场数据连接，再创建第一份模版并预览验证。',
  },
  {
    id: 'signatures',
    short: '签名',
    menuIcon: '✒️',
    menuLabel: '签名库',
    lead: '在这里预先保存常用签字图片，制作模版时在签字栏位中直接引用。',
    points: [
      '支持录入多位相关人员的签字图片，便于不同报表复用。',
      '模版中的签字栏位可关联签名库条目，导出 PDF 时自动带上对应签字。',
      '签字图片仅保存在本机，由您自行管理更新。',
    ],
    tip: '若报表暂不需要签字栏位，可跳过此功能，稍后再补充。',
  },
]

const artifactTab = ref('layouts')

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const stepDefs = [
  { id: 'welcome', short: '开始' },
  { id: 'env', short: '运行检查' },
  { id: 'db', short: '数据库' },
  { id: 'opcua', short: '现场数据' },
  { id: 'exportdir', short: '输出目录' },
  { id: 'artifacts', short: '报表准备' },
  { id: 'done', short: '完成' },
]

watch(visible, (v) => {
  if (v) {
    stepIndex.value = 0
    envAudit.value = null
    artifactTab.value = 'layouts'
  }
})

const stepIndex = ref(0)
const envAudit = ref(null)

const stepId = computed(() => stepDefs[stepIndex.value]?.id || 'welcome')

watch(stepId, (id) => {
  if (id === 'artifacts') artifactTab.value = 'layouts'
})

const activeArtifact = computed(
  () => artifactTabs.find((t) => t.id === artifactTab.value) || artifactTabs[0],
)
const artifactTabIndex = computed(() =>
  Math.max(0, artifactTabs.findIndex((t) => t.id === artifactTab.value)),
)

function prevArtifactTab() {
  const i = artifactTabIndex.value
  if (i > 0) artifactTab.value = artifactTabs[i - 1].id
}

function nextArtifactTab() {
  const i = artifactTabIndex.value
  if (i < artifactTabs.length - 1) artifactTab.value = artifactTabs[i + 1].id
}

const stepTitle = computed(() => {
  switch (stepId.value) {
    case 'welcome':
      return '欢迎使用 SD SMA 报表编辑器'
    case 'env':
      return '检查软件是否运行正常'
    case 'db':
      return '连接生产数据库'
    case 'opcua':
      return '连接现场设备数据（OPC UA）'
    case 'exportdir':
      return '选择默认报表输出文件夹'
    case 'artifacts':
      return '了解版式、模版与签名'
    default:
      return '可以开始使用了'
  }
})

function onEnvAudit(payload) {
  envAudit.value = payload
}

function next() {
  if (stepIndex.value < stepDefs.length - 1) stepIndex.value += 1
}

function prev() {
  if (stepIndex.value > 0) stepIndex.value -= 1
}

function onSkipStep() {
  next()
}

function onDefer() {
  visible.value = false
}

function complete() {
  setupWizardMarkCompleted(true)
  visible.value = false
}
</script>

<style scoped>
.wiz-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}

.wiz-dialog {
  flex: 1;
  max-width: 980px;
  margin: auto;
  background: #f8fafc;
  border-radius: 14px;
  box-shadow:
    0 25px 50px rgba(15, 23, 42, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
}

.wiz-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
}

.wiz-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6366f1;
  margin-bottom: 4px;
  font-weight: 600;
}

.wiz-title {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}

.wiz-close {
  border: none;
  background: transparent;
  font-size: 28px;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 6px;
}
.wiz-close:hover {
  background: #f1f5f9;
  color: #475569;
}

.wiz-steps {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 24px;
  margin: 0;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
  font-size: 12px;
  color: #64748b;
}

.wiz-steps li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.wiz-steps li.on {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
  font-weight: 600;
}

.wiz-steps li.done {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
}

.wiz-step-n {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.wiz-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 24px;
}

.wiz-panel {
  font-size: 14px;
  line-height: 1.55;
  color: #334155;
}

.wiz-panel-grow {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

@media (min-width: 900px) {
  .wiz-panel-db.wiz-panel {
    max-width: min(100%, 1280px);
  }
}

.lead {
  font-size: 15px;
  margin-bottom: 12px;
  color: #1e293b;
}

.wiz-hint {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
}

.bullets {
  margin-left: 1.1em;
  color: #475569;
}

.bullets li {
  margin-bottom: 6px;
}

.audit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.pill {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
}

.pill.ok {
  background: #dcfce7;
  color: #166534;
}

.pill.warn {
  background: #fef9c3;
  color: #854d0e;
}

.pill.fail {
  background: #fee2e2;
  color: #991b1b;
}

.pill-box.fail-soft {
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  margin-bottom: 8px;
}

.wiz-env-card {
  flex-shrink: 0;
}

.embed-box.opc.opc-wizard-shell {
  max-height: min(680px, 62vh);
  min-height: 400px;
  width: 100%;
}

.embed-box.opc.opc-wizard-shell :deep(.opcua) {
  width: 100%;
  min-width: 0;
  min-height: min(520px, 52vh);
}

.embed-box.opc.opc-wizard-shell :deep(.opcua .cols) {
  min-width: 0;
}

.embed-box.opc {
  flex: 1;
  min-height: 380px;
  max-height: min(560px, 52vh);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.embed-box.opc :deep(.opcua) {
  flex: 1;
  min-height: 520px;
  width: max(100%, 860px);
  box-sizing: border-box;
}

.wiz-panel-artifacts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.artifact-layout {
  display: grid;
  grid-template-columns: minmax(120px, 160px) 1fr;
  gap: 16px;
  align-items: stretch;
}

@media (max-width: 640px) {
  .artifact-layout {
    grid-template-columns: 1fr;
  }
}

.artifact-tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 640px) {
  .artifact-tabs {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

.artifact-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 14px;
  color: #475569;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
}

.artifact-tab.on {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
  font-weight: 600;
}

.artifact-tab-icon {
  font-size: 16px;
  line-height: 1;
}

.artifact-detail {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 18px 20px;
  background: #fff;
}

.artifact-menu-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  color: #334155;
}

.artifact-menu-badge {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6366f1;
  background: #eef2ff;
  padding: 3px 8px;
  border-radius: 6px;
}

.artifact-lead {
  margin-bottom: 10px;
}

.artifact-points {
  margin-bottom: 12px;
}

.artifact-tip {
  font-size: 13px;
  color: #64748b;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.artifact-subnav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.artifact-subnav-count {
  font-size: 13px;
  color: #64748b;
  min-width: 3.5em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.wiz-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px 18px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.wiz-footer-note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #64748b;
}

.wiz-footer-spacer {
  flex: 1;
  min-width: 0;
}

.wiz-actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  color: #334155;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}

.btn.primary.success {
  background: #059669;
  border-color: #059669;
}

.btn.linkish {
  border: none;
  background: transparent;
  color: #4f46e5;
  padding-left: 4px;
  padding-right: 4px;
  text-decoration: underline;
  text-underline-offset: 2px;
}

code {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
