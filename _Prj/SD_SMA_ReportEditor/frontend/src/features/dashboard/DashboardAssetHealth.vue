<template>
  <section
    class="dash-card dash-asset"
    :class="{
      'dash-card--warn': hasErrors || hasWarns,
      'dash-card--busy': loading,
      'dash-asset--ok': !loading && result && result.ok && !hasWarns && !hasInfos,
    }"
  >
    <div class="dash-card__head">
      <h3 class="dash-card__title">模版与版式健康</h3>
      <div class="dash-asset-actions">
        <button type="button" class="dash-asset-refresh" :disabled="loading" @click="refresh">
          {{ loading ? "扫描中…" : "重新扫描" }}
        </button>
        <router-link to="/templates" class="dash-card__link">模版管理 →</router-link>
      </div>
    </div>

    <p v-if="error" class="dash-asset-err">{{ error }}</p>

    <template v-else-if="result">
      <div class="dash-metrics dash-metrics--3">
        <div class="dash-metric">
          <span class="dash-metric__label">模版</span>
          <strong class="dash-metric__value">{{ result.templateCount }}</strong>
          <span v-if="result.templatesWithIssues" class="dash-metric__sub bad">
            {{ result.templatesWithIssues }} 份有问题
          </span>
        </div>
        <div class="dash-metric">
          <span class="dash-metric__label">版式</span>
          <strong class="dash-metric__value">{{ result.layoutCount }}</strong>
          <span v-if="result.layoutsWithIssues" class="dash-metric__sub bad">
            {{ result.layoutsWithIssues }} 份有问题
          </span>
        </div>
        <div class="dash-metric">
          <span class="dash-metric__label">问题</span>
          <strong class="dash-metric__value" :class="{ bad: hasErrors, warn: !hasErrors && hasWarns }">
            {{ result.issueCount }}
          </strong>
          <span class="dash-metric__sub muted">
            {{ result.errorCount }} 错误 · {{ result.warnCount }} 警告 · {{ result.infoCount }} 提示
          </span>
        </div>
      </div>

      <p v-if="result.issueCount === 0" class="dash-card__status ok">
        未发现潜在问题（已检查绑定语法、连接引用、版式、schema 与文件完整性）。
      </p>
      <p v-else class="dash-card__status">
        以下含绑定语法/配置问题（不探活数据源）。优先处理标红项。
      </p>

      <ul v-if="visibleIssues.length" class="dash-list">
        <li v-for="(it, idx) in visibleIssues" :key="idx" class="dash-list__item">
          <div class="dash-list__row">
            <span class="sev" :class="'sev--' + it.severity">{{ severityLabel(it.severity) }}</span>
            <span class="dash-list__title">
              <template v-if="it.assetKind === 'template'">
                <router-link class="dash-asset-link" :to="{ name: 'TemplateEditor', params: { id: it.assetId } }">
                  {{ it.assetName || it.assetId }}
                </router-link>
              </template>
              <template v-else>
                <router-link class="dash-asset-link" to="/layouts">{{ it.assetName || it.assetId }}</router-link>
                <span class="muted">（版式）</span>
              </template>
            </span>
          </div>
          <p class="dash-list__msg">{{ it.message }}</p>
          <p v-if="it.hint" class="dash-list__hint">{{ it.hint }}</p>
        </li>
      </ul>
      <button
        v-if="result.issues.length > maxVisible"
        type="button"
        class="dash-asset-more"
        @click="expanded = !expanded"
      >
        {{ expanded ? "收起" : `显示全部 ${result.issues.length} 条` }}
      </button>
      <p v-if="result.scannedAt" class="dash-card__foot">上次扫描 {{ formatTime(result.scannedAt) }}</p>
    </template>

    <p v-else-if="loading" class="dash-card__status muted">正在扫描模版与版式…</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref } from "vue";
import {
  fetchAssetHealthScan,
  type AssetHealthScanResult,
  type AssetHealthSeverity,
} from "@/api/assets";

defineOptions({ name: "DashboardAssetHealth" });

const loading = ref(false);
const error = ref("");
const result = ref<AssetHealthScanResult | null>(null);
const expanded = ref(false);
const maxVisible = 8;

const hasErrors = computed(() => (result.value?.errorCount ?? 0) > 0);
const hasWarns = computed(() => (result.value?.warnCount ?? 0) > 0);
const hasInfos = computed(() => (result.value?.infoCount ?? 0) > 0);

const visibleIssues = computed(() => {
  const list = result.value?.issues || [];
  if (expanded.value) return list;
  return list.slice(0, maxVisible);
});

function severityLabel(s: AssetHealthSeverity | string): string {
  if (s === "error") return "错误";
  if (s === "warn") return "警告";
  return "提示";
}

function formatTime(iso: string): string {
  const t = iso.replace("T", " ").replace("Z", " UTC");
  return t.length > 22 ? t.slice(0, 19) : t;
}

let gen = 0;

async function refresh() {
  const token = ++gen;
  loading.value = true;
  error.value = "";
  try {
    const data = await fetchAssetHealthScan();
    if (token !== gen) return;
    result.value = data;
  } catch (e) {
    if (token !== gen) return;
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (token === gen) loading.value = false;
  }
}

function onConfigImported() {
  void refresh();
}

function onAssetsChanged() {
  void refresh();
}

onMounted(() => {
  void refresh();
  window.addEventListener("report-editor-config-imported", onConfigImported);
  window.addEventListener("report-editor-assets-changed", onAssetsChanged);
});

onActivated(() => {
  void refresh();
});

onUnmounted(() => {
  gen += 1;
  window.removeEventListener("report-editor-config-imported", onConfigImported);
  window.removeEventListener("report-editor-assets-changed", onAssetsChanged);
});
</script>

<style scoped>
.dash-asset {
  margin-bottom: 20px;
}

.dash-asset--ok {
  border-color: #bbf7d0;
  background: linear-gradient(180deg, #f0fdf4 0%, rgb(255 255 255 / 0.95) 100%);
}

.dash-asset-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.dash-asset-refresh {
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
}

.dash-asset-refresh:hover:not(:disabled) {
  background: #f9fafb;
}

.dash-asset-refresh:disabled {
  opacity: 0.6;
  cursor: default;
}

.dash-card {
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid rgb(228 228 231 / 0.95);
  background: rgb(255 255 255 / 0.92);
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.05);
}

.dash-card--warn {
  border-color: #fecaca;
  background: linear-gradient(180deg, #fff7f7 0%, rgb(255 255 255 / 0.95) 100%);
}

.dash-card--busy {
  border-color: #c7d2fe;
}

.dash-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
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
  margin: 10px 0 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.45;
}

.dash-card__status.ok {
  color: #15803d;
}

.dash-card__foot {
  margin: 10px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.dash-asset-err {
  margin: 0;
  font-size: 13px;
  color: #dc2626;
}

.dash-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 640px) {
  .dash-metrics {
    grid-template-columns: 1fr;
  }
}

.dash-metric {
  padding: 10px 8px;
  border-radius: 10px;
  background: rgb(248 250 252 / 0.9);
  border: 1px solid #e2e8f0;
  text-align: center;
}

.dash-metric__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.dash-metric__value {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
}

.dash-metric__value.bad {
  color: #dc2626;
}

.dash-metric__value.warn {
  color: #c2410c;
}

.dash-metric__sub {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #64748b;
}

.dash-metric__sub.bad {
  color: #dc2626;
  font-weight: 600;
}

.dash-metric__sub.muted,
.muted {
  color: #94a3b8;
}

.dash-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dash-list__item {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
}

.dash-list__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sev {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  line-height: 1.3;
}

.sev--error {
  color: #991b1b;
  background: #fee2e2;
}

.sev--warn {
  color: #9a3412;
  background: #ffedd5;
}

.sev--info {
  color: #1e40af;
  background: #dbeafe;
}

.dash-list__title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.dash-asset-link {
  color: #4f46e5;
  text-decoration: none;
}

.dash-asset-link:hover {
  text-decoration: underline;
}

.dash-list__msg {
  margin: 6px 0 0;
  font-size: 13px;
  color: #334155;
  line-height: 1.4;
}

.dash-list__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.dash-asset-more {
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}

.dash-asset-more:hover {
  background: #f9fafb;
}
</style>
