<template>
  <Teleport to="body">
    <div v-if="visible" class="wiz-backdrop" aria-hidden="false">
      <div class="wiz-dialog" role="dialog" aria-modal="true" aria-labelledby="wiz-title">
        <header class="wiz-head">
          <div class="wiz-head-text">
            <p class="wiz-kicker">初次使用</p>
            <h1 id="wiz-title" class="wiz-title">{{ stepTitle }}</h1>
          </div>
          <button type="button" class="wiz-close" title="稍后继续" aria-label="关闭向导" @click="onDefer">×</button>
        </header>

        <ol class="wiz-steps" aria-label="向导步骤">
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
              本向导会像安装向导一样带您完成：<strong>环境检查</strong>、<strong>数据库</strong>与
              <strong>OPC&nbsp;UA</strong>接入，以及如何准备<strong>版式／页眉页脚／正文模版／签名</strong>。
              任一步可随时<strong>跳过</strong>稍后在侧边栏逐项配置。
            </p>
            <ul class="bullets">
              <li>不会代替您录入真实口令；敏感信息仍会加密保存在本机的数据目录。</li>
              <li>关闭窗口不会丢失已保存的配置；可随时在<strong>设置</strong>中再次打开向导。</li>
            </ul>
          </section>

          <!-- 环境 -->
          <section v-else-if="stepId === 'env'" class="wiz-panel wiz-panel-grow">
            <p class="wiz-hint">
              自动执行一次环境与目录检查。<span v-if="envAudit">若出现 <strong>warn</strong> 请评估风险，
              <strong>fail</strong> 时需先解决问题再继续业务配置。</span>
            </p>
            <div v-if="envAudit && !envAudit.error" class="audit-row">
              <span v-if="envAudit.fail" class="pill fail">异常 {{ envAudit.fail }}</span>
              <span v-if="envAudit.warn" class="pill warn">提示 {{ envAudit.warn }}</span>
              <span v-if="!envAudit.fail && !envAudit.warn && envAudit.total" class="pill ok">
                检查项已全部通过（{{ envAudit.ok }}/{{ envAudit.total }}）</span>
            </div>
            <div v-else-if="envAudit?.error" class="pill-box fail-soft">{{ envAudit.error }}</div>
            <EnvironmentDiagnostics class="wiz-env-card" @after-check="onEnvAudit" />
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

          <!-- 版面与签名指引 -->
          <section v-else-if="stepId === 'artifacts'" class="wiz-panel">
            <p class="wiz-hint">以下模块可按顺序准备；均需进入对应页面编辑，点击链接将关闭本向导。</p>
            <div class="cards">
              <div class="art-card">
                <h4>版式 · 页眉 · 页脚</h4>
                <p>在「版式与页眉页脚」中分别维护封面、正文页、末页的区域（页眉／页脚带等）。</p>
                <button type="button" class="btn primary" @click="goLayouts">打开「版式与页眉页脚」</button>
              </div>
              <div class="art-card">
                <h4>正文模版</h4>
                <p>在「模板管理」新建报表模版，拖拽元素并完成数据源绑定。</p>
                <button type="button" class="btn primary" @click="goTemplates">打开「模板管理」</button>
              </div>
              <div class="art-card">
                <h4>签名库</h4>
                <p>预设签名占位图或扫描件，供模版引用。</p>
                <button type="button" class="btn primary" @click="goSignatures">打开「签名库」</button>
              </div>
            </div>
          </section>

          <!-- 完成 -->
          <section v-else class="wiz-panel">
            <p class="lead">向导内容已浏览完毕。</p>
            <p class="wiz-hint">
              已跳过的步骤随时可在侧边栏相应菜单补齐。若环境问题未解决，请先在<strong>设置 › 运行环境诊断</strong>排查。
            </p>
          </section>
        </div>

        <footer class="wiz-footer">
          <div class="wiz-footer-note" v-if="stepId !== 'welcome' && stepId !== 'done'">
            <span>此步可随时略过：</span>
            <button type="button" class="btn linkish" @click="onSkipStep">跳过此步</button>
          </div>
          <div v-else class="wiz-footer-spacer" />
          <div class="wiz-actions">
            <button type="button" class="btn" :disabled="stepIndex === 0" @click="prev">上一步</button>
            <button v-if="stepId !== 'done'" type="button" class="btn primary" @click="next">下一步</button>
            <button v-else type="button" class="btn primary success" @click="complete">完成并使用</button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import EnvironmentDiagnostics from '@/features/settings/environment-diagnostics/EnvironmentDiagnostics.vue'
import WizardDatabaseSimple from '@/features/onboarding/WizardDatabaseSimple.vue'
import OpcUaPanel from '@/features/datasource/opcua/OpcUaPanel.vue'
import { setupWizardMarkCompleted } from './setupWizardStorage'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const router = useRouter()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const stepDefs = [
  { id: 'welcome', short: '欢迎' },
  { id: 'env', short: '环境与风险' },
  { id: 'db', short: '数据库' },
  { id: 'opcua', short: 'OPC UA' },
  { id: 'artifacts', short: '模版与签名' },
  { id: 'done', short: '完成' },
]

const stepIndex = ref(0)
const envAudit = ref(null)

watch(visible, (v) => {
  if (v) {
    stepIndex.value = 0
    envAudit.value = null
  }
})

const stepId = computed(() => stepDefs[stepIndex.value]?.id || 'welcome')

const stepTitle = computed(() => {
  switch (stepId.value) {
    case 'welcome':
      return '欢迎使用报表编辑器'
    case 'env':
      return '环境与风险提示'
    case 'db':
      return '连接数据库'
    case 'opcua':
      return '连接 OPC UA'
    case 'artifacts':
      return '版式 · 模版 · 签名'
    default:
      return '准备就绪'
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

function goLayouts() {
  visible.value = false
  router.push('/layouts')
}

function goTemplates() {
  visible.value = false
  router.push('/templates')
}

function goSignatures() {
  visible.value = false
  router.push('/signatures')
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

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  margin-top: 8px;
}

.art-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  background: #fff;
}

.art-card h4 {
  font-size: 15px;
  margin-bottom: 8px;
  color: #0f172a;
}

.art-card p {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 14px;
  min-height: 3lh;
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
