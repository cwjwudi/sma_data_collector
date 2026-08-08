<template>
  <section class="settings-section settings-section--featured support-pack">
    <h3 class="settings-section__title">问题反馈包</h3>
    <p class="settings-hint">
      一键打出给开发 / Cursor Agent 用的排障 zip（Markdown 说明 + 模版 JSON + 结批配置 + 审计切片 + 可选失败
      PDF）。<strong>不是</strong>完整备份（完整备份请用上方「备份与恢复」）。包内不含数据库 / OPC / AI
      明文密钥。
    </p>

    <div class="settings-field-row">
      <span class="settings-field-label">标题</span>
      <input
        v-model="draft.title"
        class="settings-input"
        type="text"
        placeholder="例如：非批次导出闪退"
      />
    </div>

    <div class="settings-field-row">
      <span class="settings-field-label">现象</span>
      <textarea
        v-model="draft.symptom"
        class="settings-input sp-textarea"
        rows="3"
        placeholder="实际看到了什么"
      />
    </div>

    <div class="settings-field-row">
      <span class="settings-field-label">期望</span>
      <textarea
        v-model="draft.expected"
        class="settings-input sp-textarea"
        rows="2"
        placeholder="期望出现什么结果"
      />
    </div>

    <div class="settings-field-row">
      <span class="settings-field-label">复现步骤</span>
      <textarea
        v-model="draft.steps"
        class="settings-input sp-textarea"
        rows="4"
        placeholder="1. …&#10;2. …"
      />
    </div>

    <div class="settings-field-row">
      <span class="settings-field-label">发生时间</span>
      <input v-model="draft.occurredAt" class="settings-input" type="text" />
    </div>

    <div class="settings-field-row sp-templates-row">
      <span class="settings-field-label">相关模版（近失败已预勾，可改）</span>
      <p v-if="!templates.length" class="settings-hint" style="margin: 0">暂无模版。</p>
      <ul v-else class="sp-template-list">
        <li v-for="t in templates" :key="t.id">
          <label class="sp-check">
            <input
              type="checkbox"
              :checked="draft.templateIds.includes(t.id)"
              @change="toggleTemplate(t.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="sp-check__name">{{ t.name || t.id }}</span>
            <span v-if="t.reportKind === 'nonBatch'" class="sp-tag">非批次</span>
          </label>
        </li>
      </ul>
    </div>

    <label class="sp-check sp-check--block">
      <input v-model="draft.includeFailedPdf" type="checkbox" />
      <span>附带最近失败 / 相关 PDF（默认开）</span>
    </label>

    <div class="settings-actions settings-actions--spaced">
      <button type="button" class="settings-btn settings-btn--primary" :disabled="busy" @click="doExport">
        {{ busy ? "正在打包…" : "导出问题反馈包" }}
      </button>
      <button type="button" class="settings-btn" :disabled="busy" @click="reloadSuggestions">
        按失败审计重新预勾
      </button>
    </div>

    <p
      v-if="msg"
      class="settings-msg"
      :class="{ 'settings-msg--ok': msgTone === 'ok', 'settings-msg--err': msgTone === 'err' }"
    >
      {{ msg }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import type { TemplateSummary } from "@/api/templates";
import {
  defaultSupportPackDraft,
  draftFromExportFailure,
  exportSupportPackZip,
  fetchSupportPackSuggestions,
  loadTemplateChoices,
  type SupportPackDraft,
} from "./support-pack-client";

defineOptions({ name: "SupportPackSection" });

const props = defineProps<{
  /** 从审计/导出失败旁路预填 */
  seed?: {
    templateId?: string | null;
    summary?: string | null;
    filePath?: string | null;
  } | null;
}>();

const draft = reactive<SupportPackDraft>(defaultSupportPackDraft());
const templates = ref<TemplateSummary[]>([]);
const busy = ref(false);
const msg = ref("");
const msgTone = ref<"ok" | "err" | "">("");

function toggleTemplate(id: string, on: boolean) {
  const set = new Set(draft.templateIds);
  if (on) set.add(id);
  else set.delete(id);
  draft.templateIds = [...set];
}

async function reloadSuggestions() {
  const sug = await fetchSupportPackSuggestions();
  if (sug.templateIds.length) {
    draft.templateIds = [...new Set([...draft.templateIds, ...sug.templateIds])];
  }
  if (sug.pdfPaths.length) {
    draft.pdfPaths = [...new Set([...draft.pdfPaths, ...sug.pdfPaths])];
  }
}

function applySeed() {
  if (!props.seed) return;
  const pre = draftFromExportFailure(props.seed);
  draft.title = pre.title;
  draft.symptom = pre.symptom;
  draft.expected = pre.expected;
  draft.steps = pre.steps;
  draft.templateIds = [...new Set([...draft.templateIds, ...pre.templateIds])];
  draft.pdfPaths = [...new Set([...draft.pdfPaths, ...pre.pdfPaths])];
  draft.includeFailedPdf = true;
}

async function doExport() {
  busy.value = true;
  msg.value = "";
  msgTone.value = "";
  try {
    const { filename } = await exportSupportPackZip({ ...draft });
    msg.value = `已下载 ${filename}`;
    msgTone.value = "ok";
  } catch (e) {
    msg.value = e instanceof Error ? e.message : String(e);
    msgTone.value = "err";
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  templates.value = await loadTemplateChoices();
  await reloadSuggestions();
  applySeed();
});

watch(
  () => props.seed,
  () => applySeed(),
  { deep: true },
);
</script>

<style scoped>
.support-pack .settings-field-row {
  max-width: none;
}

.sp-textarea {
  display: block;
  width: 100%;
  max-width: none;
  resize: vertical;
  min-height: 4.5rem;
  line-height: 1.45;
  font-family: inherit;
}

.sp-templates-row {
  margin-top: 4px;
}

.sp-template-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.sp-template-list li {
  padding: 8px 12px;
  border-bottom: 1px solid #f3f4f6;
}

.sp-template-list li:last-child {
  border-bottom: none;
}

.sp-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 14px;
  color: #111827;
  cursor: pointer;
  line-height: 1.4;
}

.sp-check input {
  margin-top: 2px;
  flex: 0 0 auto;
}

.sp-check__name {
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
}

.sp-check--block {
  margin: 14px 0 4px;
  align-items: center;
}

.sp-tag {
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 1.2;
  color: #1d4ed8;
  background: #eff6ff;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
</style>
