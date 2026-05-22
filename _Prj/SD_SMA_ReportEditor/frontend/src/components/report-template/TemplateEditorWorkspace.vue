<template>
  <div class="ted" v-if="editing">
    <div class="ted-top">
      <header class="bar bar--sticky">
        <div class="bar-start">
          <button type="button" class="link" @click="back">← 模板列表</button>
          <input v-model.trim="editing.name" class="bar-name-inp" aria-label="模版名称" />
          <span class="muted-inline">{{ templateDimLabel }}</span>
        </div>
        <div class="bar-actions">
          <button type="button" class="b primary" :disabled="saving" @click="save">
            {{ saving ? "保存中…" : "保存模版" }}
          </button>
        </div>
      </header>
      <p v-if="hint" class="msg">{{ hint }}</p>
      <div class="ted-meta">
        <label class="ted-meta-field"
          >纸张
          <select v-model="editing.paperKind" class="inp" @change="reclamp">
            <option v-for="pk in pkList" :key="pk" :value="pk">{{ paperLabel[pk] }}</option>
          </select>
        </label>
        <label class="ted-meta-field"
          >方向
          <select v-model="editing.orientation" class="inp" @change="reclamp">
            <option value="portrait">纵向</option>
            <option value="landscape">横向</option>
          </select>
        </label>
      </div>
      <div class="preset-bar">
        <template v-if="sh === 'body'">
          <span class="preset-bar-label">正文版式</span>
          <template v-if="layoutPresetsAll.length">
            <label class="preset-lbl"
              >选用版式
              <select
                class="preset-ddl"
                :value="editing.layoutPresetId || ''"
                @change="onPresetBind('body', $event)"
              >
                <option value="">不绑定 ID（仅占位）</option>
                <option
                  v-for="row in bodyPresetRows"
                  :key="'b' + row.preset.id"
                  :value="row.preset.id"
                >
                  {{ layoutPresetSelectLabel(row.seq, row.preset.name) }}
                </option>
              </select>
            </label>
          </template>
          <span v-else class="preset-empty">暂无正文版式列表（离线或需在「版式与页眉页脚」中建库）。仍可编辑当前纸上快照。</span>
        </template>
        <template v-else-if="sh === 'cover'">
          <span class="preset-bar-label">封面版式</span>
          <template v-if="layoutPresetsAll.length">
            <label class="preset-lbl"
              >选用版式
              <select
                class="preset-ddl"
                :value="editing.coverLayoutPresetId || ''"
                @change="onPresetBind('cover', $event)"
              >
                <option value="">不绑定 ID（仅占位）</option>
                <option
                  v-for="row in coverPresetRows"
                  :key="'c' + row.preset.id"
                  :value="row.preset.id"
                >
                  {{ layoutPresetSelectLabel(row.seq, row.preset.name) }}
                </option>
              </select>
            </label>
          </template>
          <span v-else class="preset-empty">暂无封面版式列表。</span>
        </template>
        <template v-else>
          <span class="preset-bar-label">末页版式</span>
          <template v-if="layoutPresetsAll.length">
            <label class="preset-lbl"
              >选用版式
              <select
                class="preset-ddl"
                :value="editing.backLayoutPresetId || ''"
                @change="onPresetBind('back', $event)"
              >
                <option value="">不绑定 ID（仅占位）</option>
                <option
                  v-for="row in backPresetRows"
                  :key="'k' + row.preset.id"
                  :value="row.preset.id"
                >
                  {{ layoutPresetSelectLabel(row.seq, row.preset.name) }}
                </option>
              </select>
            </label>
          </template>
          <span v-else class="preset-empty">暂无末页版式列表。</span>
        </template>
        <span class="preset-hint"
          >正文支持<strong>多页独立画布</strong>。「导出预览」按封面→各正文页→末页排列。「编辑画布」时正文页<strong>纵向连续</strong>编排；封面/末页为单页画布。</span
        >
      </div>
    </div>
    <div class="cols">
      <aside class="left">
        <h5>拖拽到画布</h5>
        <button
          v-for="tp in toolbox"
          :key="tp"
          draggable="true"
          class="tool"
          type="button"
          @dragstart="dragStart($event, tp)"
        >
          {{ toolNames[tp] }}
        </button>
        <h5>编辑页面</h5>
        <div class="sheet-tabs" role="tablist" aria-label="模版页面">
          <button
            type="button"
            class="sheet-tab"
            role="tab"
            :aria-selected="sh === 'body'"
            :class="{ active: sh === 'body' }"
            @click="setSheet('body')"
          >
            正文页
          </button>
          <button
            type="button"
            class="sheet-tab"
            role="tab"
            :aria-selected="sh === 'cover'"
            :class="{ active: sh === 'cover' }"
            @click="setSheet('cover')"
          >
            封面
          </button>
          <button
            type="button"
            class="sheet-tab"
            role="tab"
            :aria-selected="sh === 'back'"
            :class="{ active: sh === 'back' }"
            @click="setSheet('back')"
          >
            末页
          </button>
        </div>
        <h5 class="left-view-h">画布视图</h5>
        <div class="view-tabs" role="tablist" aria-label="中间画布">
          <button
            type="button"
            role="tab"
            class="view-tab"
            :aria-selected="midMode === 'preview'"
            :class="{ active: midMode === 'preview' }"
            @click="midMode = 'preview'"
          >
            导出预览
          </button>
          <button
            type="button"
            role="tab"
            class="view-tab"
            :aria-selected="midMode === 'edit'"
            :class="{ active: midMode === 'edit' }"
            @click="midMode = 'edit'"
          >
            编辑画布
          </button>
        </div>
        <h5 class="left-view-h">绑定预览</h5>
        <div class="opc-live-box">
          <label class="opc-live-lbl">
            <input v-model="opcUaLiveRefreshEnabled" type="checkbox" class="opc-live-chk" />
            <span>OPC UA 实时刷新</span>
          </label>
          <label class="opc-live-lbl">
            <input v-model="dbLiveRefreshEnabled" type="checkbox" class="opc-live-chk" />
            <span>数据库实时刷新</span>
          </label>
          <div v-if="opcUaLiveRefreshEnabled || dbLiveRefreshEnabled" class="opc-live-interval">
            <label class="opc-live-interval-lbl" for="ted-binding-poll-interval">轮询间隔（秒）</label>
            <input
              id="ted-binding-poll-interval"
              v-model.number="bindingPollIntervalSeconds"
              type="number"
              min="0.5"
              max="300"
              step="0.5"
              class="preview-side-inp opc-live-interval-inp"
            />
          </div>
          <p class="preview-side-hint opc-live-hint">
            <strong>轮询</strong>仅在对勾开启时生效。两者皆关时，编辑画布过程中<strong>不会</strong>再请求 OPC/数据库；载入模版、切换「导出预览/编辑画布」或撤销/重做仍会刷新一次预览。SQL 整表填充归入「数据库」项。
          </p>
        </div>
        <template v-if="midMode === 'preview'">
          <div class="preview-opts-side">
            <label class="preview-side-lbl">
              正文页数
              <input
                :value="bodyPageCount"
                type="number"
                min="1"
                max="30"
                class="preview-side-inp"
                aria-label="正文分页数量"
                @change="onBodyPageCountInput"
              />
            </label>
            <p class="preview-side-hint">与左侧「正文画布」分页一致；顺序为封面→正文各页→末页。数据库整表填充结果过高时，正文会自动拆成多张「SQL 续表」预览卡片。</p>
            <p class="preview-side-dblhint">单击预览卡片可选中对应页（含正文分页）；双击进入编辑画布并自动滚到该页。</p>
          </div>
        </template>
        <p v-else class="view-mode-edit-hint sheet-hint">
          与预览相同的纵向卡片栈（封面→正文各页→末页）；单击某一页画布即可切换顶部「选用版式」对应的段落。Ctrl/⌘+滚轮缩放画布；靠近中线或其它控件边缘时会轻微吸附（按住 Shift 关闭）。
        </p>
        <template v-if="sh === 'body'">
          <div class="body-pages-bar">
            <label class="body-pages-lbl" for="ted-body-page-sel">正文画布</label>
            <select
              id="ted-body-page-sel"
              v-model.number="bodyPageIdx"
              class="body-pages-sel"
              @change="scrollActiveBodyPageIntoView"
            >
              <option v-for="i in bodyPageCount" :key="'bp-' + i" :value="i - 1">第 {{ i }} 页</option>
            </select>
            <button type="button" class="btn btn-mini" @click="addBodyPageRow">＋页</button>
            <button type="button" class="btn btn-mini" :disabled="bodyPageCount <= 1" @click="removeBodyPageRow">
              −删本页
            </button>
          </div>
        </template>
        <p class="sheet-hint">
          <template v-if="sh === 'body'"
            ><strong>正文页</strong>：编辑画布中与预览一致为封面→正文各页→末页纵向排列；点左侧标签或正文下拉可滚动到对应卡片。页眉页脚请在「版式与页眉页脚」中维护。</template
          >
          <template v-else-if="sh === 'cover'"
            ><strong>封面</strong>：导出首页整页；此处编辑封面画布。页眉页脚请在版式编辑器维护。</template
          >
          <template v-else><strong>末页</strong>：导出最后一页整页；此处编辑末页画布。页眉页脚请在版式编辑器维护。</template>
        </p>
      </aside>
      <main class="mid">
        <div class="mid-body">
          <template v-if="midMode === 'preview'">
            <div class="mid-preview-wrap">
              <TemplateExportPreviewStack
                :tmpl="editing"
                :active-sheet="sh"
                :active-body-page-index="bodyPageIdx"
                :preview-binding-values="bindingPreview.values.value"
                class="mid-preview-stack"
                @preview-navigate="onExportPreviewNavigate"
                @request-edit="onExportPreviewRequestEdit"
              />
            </div>
          </template>
          <template v-else>
            <div class="mid-edit-stack">
              <div ref="editScrollRootRef" class="tee-root">
                <section
                  class="tee-card"
                  :class="{ 'tee-card--hl': sh === 'cover' }"
                  :ref="(el) => setEditAnchor('cover', el)"
                  @pointerdown.capture="onEditCardActivate('cover')"
                >
                  <div class="tee-cap">封面 · 第 1 / {{ totalEditPages }} 页</div>
                  <TemplateBodyCanvas
                    v-model:selected-id="selId"
                    :tmpl="editing"
                    sheet="cover"
                    :embed-in-parent-scroll="true"
                    :zone-preview-page="1"
                    :zone-preview-total-pages="totalEditPages"
                  />
                </section>
                <section
                  v-for="bp in bodySlots"
                  :key="'body-edit-' + bp"
                  class="tee-card"
                  :class="{ 'tee-card--hl': sh === 'body' && bodyPageIdx === bp }"
                  :ref="(el) => setEditAnchor('body-' + bp, el)"
                  @pointerdown.capture="onEditCardActivate('body', bp)"
                >
                  <div class="tee-cap">
                    正文 · 第 {{ bp + 2 }} / {{ totalEditPages }} 页（画布 {{ bp + 1 }} / {{ bodyPageCount }}）
                  </div>
                  <TemplateBodyCanvas
                    v-model:selected-id="selId"
                    :tmpl="editing"
                    sheet="body"
                    :body-page-index="bp"
                    :embed-in-parent-scroll="true"
                    :zone-preview-page="bp + 2"
                    :zone-preview-total-pages="totalEditPages"
                  />
                </section>
                <section
                  class="tee-card"
                  :class="{ 'tee-card--hl': sh === 'back' }"
                  :ref="(el) => setEditAnchor('back', el)"
                  @pointerdown.capture="onEditCardActivate('back')"
                >
                  <div class="tee-cap">末页 · 第 {{ totalEditPages }} / {{ totalEditPages }} 页</div>
                  <TemplateBodyCanvas
                    v-model:selected-id="selId"
                    :tmpl="editing"
                    sheet="back"
                    :embed-in-parent-scroll="true"
                    :zone-preview-page="totalEditPages"
                    :zone-preview-total-pages="totalEditPages"
                  />
                </section>
              </div>
            </div>
          </template>
        </div>
      </main>
      <aside class="right ted-props" v-if="sel">
        <TemplateElementProps
          :el="sel"
          :table-cell-pick="tableCellPick"
          :sig-choices="sigChoices"
          @remove="delSel"
          @pick-sig-library="onPickSigLibrary"
          @open-signature-pad="dlgSig = true"
        />
      </aside>
      <aside v-else class="right ted-props ted-props--empty"><p class="ted-props-placeholder">点选画布控件后在此编辑属性。</p></aside>
    </div>

    <SignaturePadDialog
      v-model="dlgSig"
      :subtitle="sigPadGuideLabel"
      :guide-outline-text="sigPadGuideLabel"
      :guide-image-src="sigPadGuideImageSrc"
      @confirm="sigOk"
    />
  </div>
  <div v-else class="wait">载入中…</div>
</template>

<script setup>
import TemplateBodyCanvas from "@/components/report-template/TemplateBodyCanvas.vue";
import TemplateExportPreviewStack from "@/components/report-template/TemplateExportPreviewStack.vue";
import TemplateElementProps from "@/components/report-template/TemplateElementProps.vue";
import SignaturePadDialog from "@/components/report-template/SignaturePadDialog.vue";
import * as api from "@/api/templates";
import * as sigApi from "@/api/signatures";
import { ref, computed, watch, nextTick, onMounted, onUnmounted, provide } from "vue";
import { useRoute, useRouter } from "vue-router";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import { bodyElementsRef, metricsForSheet } from "@/lib/report-template/editor-sheet";
import {
  clampElementToLayout,
  cloneDeepTemplate,
  stableFingerprintPart,
} from "@/lib/report-template/snapshot-fingerprint";
import {
  layoutPresetSelectLabel,
  layoutPresetSelectRows,
} from "@/lib/layout-display-order";
import { refreshLayoutPresets } from "@/lib/report-template/layout-registry";
import { applyLayoutPresetToTemplate, resyncTemplateBoundPresets } from "@/lib/report-template/layout-apply";
import {
  ensureBodyPages,
  syncLegacyElementsAlias,
  TEMPLATE_SCHEMA_VERSION,
} from "@/lib/report-template/model";
import { templateTableCellPickKey, reportBindingPreviewKey } from "@/lib/report-template/template-editor-context";
import { useReportBindingPreview } from "@/composables/useReportBindingPreview";
import { useStaleGuard } from "@/composables/useStaleGuard";
import { watchDebounced } from "@vueuse/core";

const OPC_LIVE_LS_ENABLED = "reportTplOpcUaLiveRefresh";
const DB_LIVE_LS_ENABLED = "reportTplDbLiveRefresh";
const BINDING_POLL_LS_INTERVAL_SEC = "reportTplBindingPollIntervalSec";
/** 旧版仅 OPC 轮询时使用的间隔键，迁移读取 */
const LEGACY_OPC_POLL_INTERVAL_SEC = "reportTplOpcUaLiveIntervalSec";

/** @param {unknown} v */
function clampOpcUaLivePollSeconds(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 2;
  return Math.min(300, Math.max(0.5, Math.round(n * 2) / 2));
}

const pkList = /** @type {const} */ (["A5", "A4", "A3", "Letter"]);
const paperLabel = PAPER_LABEL;
const toolbox = /** @type {const} */ (["text", "box", "image", "date", "table", "chart", "parameter", "signature"]);
/** @type {Record<string,string>} */
const toolNames = {
  text: "文本",
  box: "色块",
  image: "图片",
  date: "日期时间",
  table: "表格(SQL)",
  chart: "图表",
  parameter: "数据参数",
  signature: "电子签名",
};

const route = useRoute();
const router = useRouter();
const { begin: beginLoad, isStale: isLoadStale } = useStaleGuard();

const editing = ref(null);
const bindingPreview = useReportBindingPreview(editing);
provide(reportBindingPreviewKey, bindingPreview);
const selId = ref(null);
const sh = ref("body");
const dlgSig = ref(false);
/** @type {import('vue').Ref<'preview'|'edit'>} */
const midMode = ref("preview");
/** 正文分页编辑：当前画布索引（0-based） */
const bodyPageIdx = ref(0);
const hint = ref("");
const saving = ref(false);
/** @type {import('vue').Ref<import('@/lib/report-template/model').ReportTemplate[]>} */
const tplUndoStack = ref([]);
/** @type {import('vue').Ref<import('@/lib/report-template/model').ReportTemplate[]>} */
const tplRedoStack = ref([]);
/** @type {import('vue').Ref<import('@/lib/report-template/model').ReportTemplate | null>} */
const tplHistoryLastRecorded = ref(null);
const tplHistoryReady = ref(false);
const tplApplyingHistory = ref(false);
const TPL_UNDO_CAP = 80;
const sigChoices = ref([]);
/** @type {import('vue').Ref<import('@/lib/report-template/layout-model').LayoutPreset[]>} */
const layoutPresetsAll = ref([]);

/** @type {import('vue').Ref<import('@/lib/report-template/template-editor-context').TemplateTableCellPick | null>} */
const tableCellPick = ref(null);
provide(templateTableCellPickKey, tableCellPick);

const opcUaLiveRefreshEnabled = ref(false);
const dbLiveRefreshEnabled = ref(false);
const bindingPollIntervalSeconds = ref(2);
/** @type {number | null} */
let bindingPollTimerId = null;

function stopBindingPollTimer() {
  if (bindingPollTimerId != null) {
    clearInterval(bindingPollTimerId);
    bindingPollTimerId = null;
  }
}

function runBindingPollTick() {
  if (!editing.value) return;
  const opc = opcUaLiveRefreshEnabled.value;
  const db = dbLiveRefreshEnabled.value;
  if (!opc && !db) return;
  void bindingPreview.refresh({ opc, sql: db, silent: true });
}

function startBindingPollTimer() {
  stopBindingPollTimer();
  if ((!opcUaLiveRefreshEnabled.value && !dbLiveRefreshEnabled.value) || !editing.value) return;
  runBindingPollTick();
  const ms = Math.round(clampOpcUaLivePollSeconds(bindingPollIntervalSeconds.value) * 1000);
  bindingPollTimerId = window.setInterval(runBindingPollTick, ms);
}

watch(
  [opcUaLiveRefreshEnabled, dbLiveRefreshEnabled, bindingPollIntervalSeconds, editing],
  () => {
    startBindingPollTimer();
  },
);

watch(bindingPollIntervalSeconds, (v) => {
  const c = clampOpcUaLivePollSeconds(v);
  if (c !== v) bindingPollIntervalSeconds.value = c;
  try {
    localStorage.setItem(BINDING_POLL_LS_INTERVAL_SEC, String(c));
  } catch {
    /* ignore */
  }
});

watch(opcUaLiveRefreshEnabled, (on) => {
  try {
    localStorage.setItem(OPC_LIVE_LS_ENABLED, on ? "1" : "0");
  } catch {
    /* ignore */
  }
});

watch(dbLiveRefreshEnabled, (on) => {
  try {
    localStorage.setItem(DB_LIVE_LS_ENABLED, on ? "1" : "0");
  } catch {
    /* ignore */
  }
});

watchDebounced(
  editing,
  () => {
    if (!editing.value) return;
    const opc = opcUaLiveRefreshEnabled.value;
    const db = dbLiveRefreshEnabled.value;
    if (!opc && !db) return;
    void bindingPreview.refresh({ opc, sql: db, silent: true });
  },
  { debounce: 450, maxWait: 5000, deep: true },
);

watch(midMode, () => {
  if (!editing.value) return;
  void bindingPreview.refresh({ silent: true });
});

watch([opcUaLiveRefreshEnabled, dbLiveRefreshEnabled], () => {
  if (!editing.value) return;
  const opc = opcUaLiveRefreshEnabled.value;
  const db = dbLiveRefreshEnabled.value;
  if (!opc && !db) return;
  void bindingPreview.refresh({ opc, sql: db, silent: true });
});

watchDebounced(
  editing,
  () => {
    if (!tplHistoryReady.value || tplApplyingHistory.value || !editing.value) return;
    const t = editing.value;
    const prev = tplHistoryLastRecorded.value;
    if (!prev) return;
    if (stableFingerprintPart(t) === stableFingerprintPart(prev)) return;
    tplUndoStack.value.push(cloneDeepTemplate(prev));
    if (tplUndoStack.value.length > TPL_UNDO_CAP) tplUndoStack.value.shift();
    tplRedoStack.value = [];
    tplHistoryLastRecorded.value = cloneDeepTemplate(t);
  },
  { debounce: 320, maxWait: 4500, deep: true },
);

function resetTplEditHistory() {
  tplHistoryReady.value = false;
  tplUndoStack.value = [];
  tplRedoStack.value = [];
  tplHistoryLastRecorded.value = editing.value ? cloneDeepTemplate(editing.value) : null;
  tplHistoryReady.value = !!editing.value;
}

function undoTplEdit() {
  if (!editing.value || tplUndoStack.value.length === 0) return;
  tplApplyingHistory.value = true;
  try {
    tplRedoStack.value.push(cloneDeepTemplate(editing.value));
    const prev = tplUndoStack.value.pop();
    editing.value = cloneDeepTemplate(prev);
    ensureBodyPages(editing.value);
    syncLegacyElementsAlias(editing.value);
    reclamp();
    tplHistoryLastRecorded.value = cloneDeepTemplate(editing.value);
  } finally {
    tplApplyingHistory.value = false;
  }
  void nextTick(() => {
    if (!sel.value) selId.value = null;
    hint.value = "已撤销。";
    void bindingPreview.refresh({ silent: true });
  });
}

function redoTplEdit() {
  if (!editing.value || tplRedoStack.value.length === 0) return;
  tplApplyingHistory.value = true;
  try {
    tplUndoStack.value.push(cloneDeepTemplate(editing.value));
    const next = tplRedoStack.value.pop();
    editing.value = cloneDeepTemplate(next);
    ensureBodyPages(editing.value);
    syncLegacyElementsAlias(editing.value);
    reclamp();
    tplHistoryLastRecorded.value = cloneDeepTemplate(editing.value);
  } finally {
    tplApplyingHistory.value = false;
  }
  void nextTick(() => {
    if (!sel.value) selId.value = null;
    hint.value = "已重做。";
    void bindingPreview.refresh({ silent: true });
  });
}

const sel = computed(() => {
  const t = editing.value;
  const id = selId.value;
  if (!t || !id) return null;
  const pages = ensureBodyPages(t);
  for (const row of pages) {
    const found = row.find((x) => x.id === id);
    if (found) return found;
  }
  const coverFound = bodyElementsRef(t, "cover").find((x) => x.id === id);
  if (coverFound) return coverFound;
  return bodyElementsRef(t, "back").find((x) => x.id === id) ?? null;
});

/** 手写板副标题与描摹字：优先签名库名称，否则签署说明 */
const sigPadGuideLabel = computed(() => {
  const el = sel.value;
  if (!el || el.type !== "signature") return undefined;
  const id = String(el.signatureAssetId || "").trim();
  if (id) {
    const row = sigChoices.value.find((x) => x.id === id);
    const lab = String(row?.label || "").trim();
    if (lab) return lab;
  }
  const sl = String(el.signerLabel || "").trim();
  return sl || undefined;
});

/** 签名库图作为手写板水印；确定时若无墨色笔迹则仅导出库图，有笔迹则叠加 */
const sigPadGuideImageSrc = computed(() => {
  const el = sel.value;
  if (!el || el.type !== "signature") return undefined;
  if (!String(el.signatureAssetId || "").trim()) return undefined;
  const src = String(el.imageSrc || "").trim();
  return src || undefined;
});

watch([selId, sh], () => {
  const id = selId.value;
  const s = sel.value;
  if (!id || !s || s.type !== "table") {
    tableCellPick.value = null;
    return;
  }
  const cur = tableCellPick.value;
  if (cur && cur.elId !== id) tableCellPick.value = null;
}, { immediate: true });

/** 正文编辑：当前列表页序号，用于 v-for */
const bodySlots = computed(() => {
  const t = editing.value;
  if (!t) return [];
  const n = ensureBodyPages(t).length;
  return Array.from({ length: n }, (_, i) => i);
});

/** @type {Record<string, HTMLElement | undefined>} */
const editAnchors = {};
const editScrollRootRef = ref(null);

/** @param {string} key @param {unknown} el */
function setEditAnchor(key, el) {
  const section = el instanceof HTMLElement ? el : undefined;
  if (section) editAnchors[key] = section;
  else delete editAnchors[key];
}

function editAnchorKeyForSheet() {
  if (sh.value === "cover") return "cover";
  if (sh.value === "back") return "back";
  return "body-" + bodyPageIdx.value;
}

function scrollActiveBodyPageIntoView() {
  scrollEditSheetIntoView();
}

function scrollEditSheetIntoView(retry = 0) {
  nextTick(() => {
    const root = editScrollRootRef.value;
    const anchor = editAnchors[editAnchorKeyForSheet()];
    if (root && anchor instanceof HTMLElement) {
      const pad = 12;
      const delta = anchor.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - pad;
      root.scrollTo({
        top: Math.max(0, delta),
        behavior: retry > 0 ? "auto" : "smooth",
      });
      return;
    }
    if (retry < 12) {
      window.setTimeout(() => scrollEditSheetIntoView(retry + 1), 50);
    }
  });
}

/** @type {ReturnType<typeof setTimeout> | null} */
let scrollEditDebounceTimer = null;

function scheduleScrollEditSheetIntoView() {
  if (scrollEditDebounceTimer) clearTimeout(scrollEditDebounceTimer);
  scrollEditDebounceTimer = setTimeout(() => {
    scrollEditDebounceTimer = null;
    scrollEditSheetIntoView();
  }, 32);
}

/** @param {import('@/lib/report-template/export-preview-nav').ExportPreviewNavPayload} payload */
function applyExportPreviewNavigation(payload) {
  if (payload.sheet === "cover") {
    sh.value = "cover";
    return;
  }
  if (payload.sheet === "back") {
    sh.value = "back";
    return;
  }
  sh.value = "body";
  const t = editing.value;
  if (!t) return;
  const n = ensureBodyPages(t).length;
  const maxIx = Math.max(0, n - 1);
  bodyPageIdx.value = Math.max(0, Math.min(maxIx, payload.bodyPageIndex));
}

/** @param {import('@/lib/report-template/export-preview-nav').ExportPreviewNavPayload} payload */
function onExportPreviewNavigate(payload) {
  applyExportPreviewNavigation(payload);
}

/** @param {import('@/lib/report-template/export-preview-nav').ExportPreviewNavPayload} payload */
function onExportPreviewRequestEdit(payload) {
  applyExportPreviewNavigation(payload);
  midMode.value = "edit";
}

/** 编辑栈内任一点击（捕获阶段）同步左侧版式绑定上下文 */
function onEditCardActivate(slot, bodyIx) {
  if (midMode.value !== "edit") return;
  if (slot === "cover") {
    sh.value = "cover";
    return;
  }
  if (slot === "back") {
    sh.value = "back";
    return;
  }
  sh.value = "body";
  if (typeof bodyIx === "number") bodyPageIdx.value = bodyIx;
}

watch([selId, editing], () => {
  const t = editing.value;
  const id = selId.value;
  if (!t || !id) return;
  const pages = ensureBodyPages(t);
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].some((e) => e.id === id)) {
      sh.value = "body";
      bodyPageIdx.value = i;
      return;
    }
  }
  if (bodyElementsRef(t, "cover").some((e) => e.id === id)) {
    sh.value = "cover";
    return;
  }
  if (bodyElementsRef(t, "back").some((e) => e.id === id)) {
    sh.value = "back";
  }
});

watch(midMode, (m) => {
  if (m !== "edit") return;
  scheduleScrollEditSheetIntoView();
});

watch([sh, bodyPageIdx], () => {
  if (midMode.value !== "edit") return;
  scheduleScrollEditSheetIntoView();
});

const bodyPageCount = computed(() => {
  const t = editing.value;
  if (!t) return 1;
  return ensureBodyPages(t).length;
});

const bodyPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "normal"));
const coverPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "cover"));
const backPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "back"));

/** 编辑画布卡片标题与导出预览页码一致：1 + 正文页数 + 1 */
const totalEditPages = computed(() => 1 + bodyPageCount.value + 1);

const templateDimLabel = computed(() => {
  const t = editing.value;
  if (!t) return "";
  return paperLabel[t.paperKind] + (t.orientation === "landscape" ? " · 横" : " · 纵");
});

async function loadLayoutPresetsList() {
  layoutPresetsAll.value = await refreshLayoutPresets();
}

/** @param {'body'|'cover'|'back'} slot */
function onPresetBind(slot, ev) {
  const presetId = typeof ev.target?.value === "string" ? ev.target.value : "";
  const t = editing.value;
  if (!t) return;
  if (!presetId) {
    if (slot === "body") t.layoutPresetId = null;
    else if (slot === "cover") t.coverLayoutPresetId = null;
    else t.backLayoutPresetId = null;
    hint.value = "已断开该页版式 ID 绑定（沿用当前纸上快照）。";
    reclamp();
    return;
  }
  const p = layoutPresetsAll.value.find((x) => x.id === presetId);
  if (!p) {
    hint.value = "所选版式未找到。";
    return;
  }
  applyLayoutPresetToTemplate(t, p, slot);
  reclamp();
  const label = slot === "body" ? "正文" : slot === "cover" ? "封面" : "末页";
  hint.value = `已用「${p.name}」替换${label}纸张与眉脚布局。`;
}

function setSheet(s) {
  sh.value = s;
  selId.value = null;
  const t = editing.value;
  if (t && s === "body") {
    const n = ensureBodyPages(t).length;
    if (bodyPageIdx.value >= n) bodyPageIdx.value = Math.max(0, n - 1);
  }
  if (midMode.value === "edit") scheduleScrollEditSheetIntoView();
}

function addBodyPageRow() {
  const t = editing.value;
  if (!t) return;
  const pages = ensureBodyPages(t);
  if (pages.length >= 30) {
    hint.value = "正文分页最多 30 页。";
    return;
  }
  pages.push([]);
  syncLegacyElementsAlias(t);
  bodyPageIdx.value = pages.length - 1;
  selId.value = null;
  hint.value = `已新增正文第 ${pages.length} 页（空白画布）。`;
  scrollActiveBodyPageIntoView();
}

function removeBodyPageRow() {
  const t = editing.value;
  if (!t) return;
  const pages = ensureBodyPages(t);
  if (pages.length <= 1) {
    hint.value = "至少保留 1 页正文画布。";
    return;
  }
  pages.splice(bodyPageIdx.value, 1);
  syncLegacyElementsAlias(t);
  if (bodyPageIdx.value >= pages.length) bodyPageIdx.value = pages.length - 1;
  selId.value = null;
  hint.value = "已删除当前正文页画布。";
}

/** @param {Event & { target: HTMLInputElement }} ev */
function onBodyPageCountInput(ev) {
  const t = editing.value;
  if (!t) return;
  let n = Math.floor(Number(ev.target.value));
  if (!Number.isFinite(n) || n < 1) n = 1;
  n = Math.min(30, n);
  const pages = ensureBodyPages(t);
  while (pages.length < n) pages.push([]);
  while (pages.length > n && pages.length > 1) pages.pop();
  syncLegacyElementsAlias(t);
  if (bodyPageIdx.value >= pages.length) bodyPageIdx.value = pages.length - 1;
  ev.target.value = String(pages.length);
}

async function boot() {
  const token = beginLoad();
  editing.value = null;
  const id = String(route.params.id || "");
  if (!id) {
    if (!isLoadStale(token)) router.replace({ name: "TemplateManager" });
    return;
  }
  hint.value = "";
  try {
    const remote = await api.getTemplate(id);
    if (isLoadStale(token)) return;
    editing.value = cloneDeepTemplate(remote);
    ensureBodyPages(editing.value);
    syncLegacyElementsAlias(editing.value);
    bodyPageIdx.value = 0;
    await loadLayoutPresetsList();
    if (isLoadStale(token)) return;
    if (layoutPresetsAll.value.length) {
      resyncTemplateBoundPresets(editing.value, layoutPresetsAll.value);
      reclamp();
    }
  } catch {
    if (isLoadStale(token)) return;
    hint.value = "无法从后端载入模版。";
    editing.value = null;
    return;
  }
  selId.value = null;
  resetTplEditHistory();
  void bindingPreview.refresh({ silent: true });
}

watch(
  () => route.params.id,
  () => {
    void boot();
  },
);

function reclamp() {
  const t = editing.value;
  if (!t) return;
  const pages = ensureBodyPages(t);
  for (const s of /** @type {const} */ (["body", "cover", "back"])) {
    const m = metricsForSheet(t, s);
    if (s === "body") {
      for (const row of pages) {
        for (const el of row) clampElementToLayout(el, m.contentW, m.contentH);
      }
    } else {
      for (const el of bodyElementsRef(t, s)) clampElementToLayout(el, m.contentW, m.contentH);
    }
  }
}

async function save() {
  const t = editing.value;
  if (!t || saving.value) return;
  ensureBodyPages(t);
  syncLegacyElementsAlias(t);
  t.updatedAt = new Date().toISOString();
  t.schemaVersion = TEMPLATE_SCHEMA_VERSION;
  reclamp();
  saving.value = true;
  try {
    await api.putTemplate(t.id, t);
    hint.value = "已保存。";
  } catch (e) {
    hint.value = "保存失败：" + String(e.message || e);
  } finally {
    saving.value = false;
  }
}

function back() {
  router.push({ name: "TemplateManager" });
}

function dragStart(ev, tp) {
  midMode.value = "edit";
  ev.dataTransfer.setData("application/x-template-tool", tp);
  ev.dataTransfer.setData("text/plain", tp);
}

function delSel() {
  const t = editing.value;
  const id = selId.value;
  if (!t || !id) return;
  const pages = ensureBodyPages(t);
  for (const row of pages) {
    const ix = row.findIndex((x) => x.id === id);
    if (ix >= 0) {
      row.splice(ix, 1);
      selId.value = null;
      return;
    }
  }
  for (const sheet of /** @type {const} */ (["cover", "back"])) {
    const arr = bodyElementsRef(t, sheet);
    const ix = arr.findIndex((x) => x.id === id);
    if (ix >= 0) {
      arr.splice(ix, 1);
      selId.value = null;
      return;
    }
  }
}

function sigOk(dataUrl) {
  if (!sel.value || sel.value.type !== "signature") return;
  sel.value.imageSrc = dataUrl;
}

async function refreshSigChoices() {
  try {
    sigChoices.value = await sigApi.listSignatures();
  } catch {
    sigChoices.value = [];
  }
}

async function onPickSigLibrary(ev) {
  const id = typeof ev.target?.value === "string" ? ev.target.value : "";
  if (!sel.value || sel.value.type !== "signature") return;
  sel.value.signatureAssetId = id;
  if (!id) {
    hint.value = "已清空签名库绑定。";
    return;
  }
  try {
    const a = await sigApi.getSignature(id);
    sel.value.imageSrc = a.imageSrc;
    hint.value = "已从签名库载入图像。";
  } catch {
    hint.value = "读取签名条目失败";
  }
}

function eventTargetIsTypingField(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function onKey(ev) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
    ev.preventDefault();
    void save();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (ev.shiftKey) {
      if (tplRedoStack.value.length === 0) return;
      ev.preventDefault();
      redoTplEdit();
      return;
    }
    if (tplUndoStack.value.length === 0) return;
    ev.preventDefault();
    undoTplEdit();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (tplRedoStack.value.length === 0) return;
    ev.preventDefault();
    redoTplEdit();
    return;
  }
  if (eventTargetIsTypingField(ev.target)) return;
  if (ev.key === "Delete" || ev.key === "Backspace") {
    if (!selId.value) return;
    ev.preventDefault();
    delSel();
  }
}

onMounted(async () => {
  try {
    const en = localStorage.getItem(OPC_LIVE_LS_ENABLED);
    if (en === "1") opcUaLiveRefreshEnabled.value = true;
    if (en === "0") opcUaLiveRefreshEnabled.value = false;
    const dbEn = localStorage.getItem(DB_LIVE_LS_ENABLED);
    if (dbEn === "1") dbLiveRefreshEnabled.value = true;
    if (dbEn === "0") dbLiveRefreshEnabled.value = false;
    let rawIv = localStorage.getItem(BINDING_POLL_LS_INTERVAL_SEC);
    if (rawIv == null || rawIv === "") rawIv = localStorage.getItem(LEGACY_OPC_POLL_INTERVAL_SEC);
    if (rawIv != null && rawIv !== "") {
      const iv = Number.parseFloat(rawIv);
      if (Number.isFinite(iv)) bindingPollIntervalSeconds.value = clampOpcUaLivePollSeconds(iv);
    }
  } catch {
    /* ignore */
  }
  await boot();
  refreshSigChoices();
  window.addEventListener("keydown", onKey);
  startBindingPollTimer();
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  stopBindingPollTimer();
});
</script>

<style scoped>
.ted {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 48px);
  min-height: 0;
}
.ted-top {
  flex: none;
  border-bottom: 1px solid #e4e4e7;
  background: #fafafa;
}
.preset-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 4px 8px 8px;
  font-size: 12px;
}
.preset-bar-label {
  font-weight: 600;
  color: #3f3f46;
}
.preset-lbl {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #52525b;
}
.preset-ddl {
  min-width: 140px;
  max-width: 220px;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
}
.preset-empty {
  color: #71717a;
}
.preset-hint {
  flex: 1 1 220px;
  min-width: 0;
  color: #78716c;
  line-height: 1.4;
}
.sheet-hint {
  margin: 0;
  padding: 8px;
  font-size: 11px;
  line-height: 1.45;
  color: #57534e;
  background: #f4f4f5;
  border-radius: 6px;
}
.sheet-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sheet-tab {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fafafa;
  cursor: pointer;
  font-size: 11px;
  touch-action: manipulation;
}
.sheet-tab.active {
  border-color: #6366f1;
  background: rgb(238 242 255);
  color: #4338ca;
  font-weight: 600;
}
.wait {
  padding: 2rem;
  color: #71717a;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  row-gap: 12px;
  padding: 10px 0;
}
.bar--sticky {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgb(244 244 245 / 0.96);
  backdrop-filter: blur(8px);
  margin-left: -2px;
  margin-right: -2px;
  padding-left: 6px;
  padding-right: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e4e4e7;
  box-sizing: border-box;
}
.bar-start {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.bar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.bar-name-inp {
  min-width: 120px;
  max-width: min(360px, 46vw);
  flex: 1 1 180px;
  padding: 6px 8px;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #18181b;
  background: #fff;
  box-sizing: border-box;
}
.muted-inline {
  font-size: 12px;
  color: #71717a;
}
.b {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  touch-action: manipulation;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.b.primary:hover {
  background: #4338ca;
  border-color: #3730a3;
}
.b:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.msg {
  font-size: 12px;
  color: #b45309;
  margin: 6px 8px 0;
}
.ted-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 8px 8px 4px;
}
.ted-meta-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #52525b;
}
.inp {
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  background: #fff;
  min-width: 140px;
}
.link {
  border: none;
  background: none;
  color: #4f46e5;
  cursor: pointer;
  font-size: 14px;
}
.btn {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
}
.cols {
  flex: 1;
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) minmax(300px, 320px);
  /* 与版式编辑页 .pe-cols 一致：行高可收缩，避免左侧栏单独拉高并出现滚动条 */
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}
.left {
  padding: 8px;
  border-right: 1px solid #e4e4e7;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fafafa;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.left h5 {
  margin: 4px 0 0;
  font-size: 12px;
}
.left-view-h {
  margin: 12px 0 0;
}
.view-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.view-tab {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 11px;
  touch-action: manipulation;
}
.view-tab.active {
  border-color: #6366f1;
  background: rgb(238 242 255);
  color: #4338ca;
  font-weight: 600;
}
.opc-live-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  padding: 8px;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  box-sizing: border-box;
}
.opc-live-lbl {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
  cursor: pointer;
  line-height: 1.35;
}
.opc-live-chk {
  margin-top: 2px;
  flex-shrink: 0;
}
.opc-live-interval {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.opc-live-interval-lbl {
  font-size: 11px;
  color: #52525b;
}
.opc-live-interval-inp {
  width: 64px;
}
.preview-opts-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.preview-side-lbl {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
}
.preview-side-inp {
  width: 52px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  font-size: 13px;
  background: #fff;
  box-sizing: border-box;
}
.preview-side-hint,
.preview-side-dblhint {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: #71717a;
}
.preview-side-dblhint {
  color: #4338ca;
  font-weight: 600;
}
.view-mode-edit-hint {
  margin-top: 8px;
}
.body-pages-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.body-pages-lbl {
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
}
.body-pages-sel {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  font-size: 12px;
  background: #fff;
}
.btn-mini {
  padding: 4px 8px;
  font-size: 12px;
}
.left button.on {
  outline: 2px solid #6366f1;
}
.tool {
  border: 1px dashed #999;
  background: #fff;
  cursor: grab;
  padding: 10px 8px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: 6px;
  text-align: left;
  touch-action: manipulation;
}
.mid {
  min-height: 0;
  min-width: 0;
  background: #f4f4f5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: contain;
}
.mid-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mid-preview-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mid-preview-stack {
  flex: 1 1 auto;
  min-height: 0;
}
.mid-edit-stack {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tee-root {
  box-sizing: border-box;
  width: 100%;
  min-height: 0;
  min-width: 0;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: auto;
  padding: 10px 10px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  background: radial-gradient(rgb(251 251 254), rgb(229 229 237));
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.tee-card {
  flex-shrink: 0;
  width: 100%;
  max-width: 100%;
  padding: 10px 12px 14px;
  border-radius: 12px;
  border: 2px solid transparent;
  background: rgb(250 250 252 / 0.92);
  box-shadow: 0 1px 0 rgb(24 24 27 / 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}
.tee-card--hl {
  border-color: #818cf8;
  box-shadow:
    0 0 0 1px rgb(99 102 241 / 0.22),
    0 8px 22px rgb(24 24 27 / 0.06);
}
.tee-cap {
  align-self: stretch;
  font-size: 11px;
  font-weight: 600;
  color: #52525b;
  margin-bottom: 8px;
}
.ted-props {
  border-left: 1px solid #e4e4e7;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: auto;
  font-size: 13px;
  background: #fafafa;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.ted-props--empty {
  color: #71717a;
}
.ted-props-placeholder {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
</style>
