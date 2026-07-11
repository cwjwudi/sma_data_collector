<template>
  <div v-if="!editing" class="ted ted--boot" role="status" aria-live="polite">
    <div class="ted-boot-card">
      <span class="ted-boot-spin" aria-hidden="true" />
      <div class="ted-boot-copy">
        <p class="ted-boot-title">{{ bootStatus || "正在打开模版…" }}</p>
        <p class="ted-boot-sub">正在读取模版 JSON 与版式；编辑态不会在打开时查询数据库。</p>
      </div>
      <button type="button" class="link ted-boot-back" @click="back">← 返回模板列表</button>
    </div>
  </div>
  <div class="ted" v-else>
    <div class="ted-top">
      <header class="bar bar--sticky">
        <div class="bar-start">
          <button type="button" class="link" @click="back">← 模板列表</button>
          <input v-model.trim="editing.name" class="bar-name-inp" aria-label="模版名称" />
          <span class="muted-inline">{{ templateDimLabel }}</span>
        </div>
        <div class="bar-actions">
          <button
            type="button"
            class="b"
            title="撤销 (Ctrl+Z)"
            :disabled="tplUndoStack.length === 0"
            @click="undoTplEdit"
          >
            撤销
          </button>
          <button
            type="button"
            class="b"
            title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
            :disabled="tplRedoStack.length === 0"
            @click="redoTplEdit"
          >
            重做
          </button>
          <span class="bar-sep" aria-hidden="true" />
          <button
            type="button"
            class="b"
            title="复制选中控件（含全部属性）(Ctrl+C)"
            :disabled="!sel"
            @click="copySel"
          >
            复制
          </button>
          <button
            type="button"
            class="b"
            title="剪切选中控件 (Ctrl+X)"
            :disabled="!sel"
            @click="cutSel"
          >
            剪切
          </button>
          <button
            type="button"
            class="b"
            title="粘贴控件（保留属性配置）(Ctrl+V)"
            :disabled="!canPasteTpl"
            @click="pasteSel"
          >
            粘贴
          </button>
          <span class="bar-sep" aria-hidden="true" />
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
            v-if="includeCoverSheet"
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
            v-if="includeBackSheet"
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
            <p v-if="bindingPreview.loading.value" class="preview-side-loading" role="status">
              {{ bindingPreview.statusText.value || "正在读取数据…" }}
            </p>
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
            <button
              type="button"
              class="btn btn-mini"
              title="在当前页之前插入空白页"
              :disabled="bodyPageCount >= 30"
              @click="insertBodyPageBefore"
            >
              前插
            </button>
            <button
              type="button"
              class="btn btn-mini"
              title="在当前页之后插入空白页"
              :disabled="bodyPageCount >= 30"
              @click="insertBodyPageAfter"
            >
              后插
            </button>
            <button
              type="button"
              class="btn btn-mini"
              title="在末尾追加空白页"
              :disabled="bodyPageCount >= 30"
              @click="addBodyPageRow"
            >
              末加
            </button>
            <button
              type="button"
              class="btn btn-mini"
              title="将本页上移"
              :disabled="bodyPageIdx <= 0"
              @click="moveBodyPage(-1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="btn btn-mini"
              title="将本页下移"
              :disabled="bodyPageIdx >= bodyPageCount - 1"
              @click="moveBodyPage(1)"
            >
              ↓
            </button>
            <button type="button" class="btn btn-mini" :disabled="bodyPageCount <= 1" @click="removeBodyPageRow">
              −删本页
            </button>
          </div>
        </template>
        <p class="sheet-hint">
          <template v-if="sh === 'body'"
            ><strong>正文页</strong>：编辑画布中与预览一致为封面→正文各页→末页纵向排列；点左侧标签或正文下拉可滚动到对应卡片。可用「前插 / 后插 / 末加」在指定位置增页，「↑ ↓」调整顺序，「−删本页」删除当前页。页眉页脚请在「版式与页眉页脚」中维护。</template
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
              <div
                v-if="bindingPreview.loading.value"
                class="mid-preview-loading"
                role="status"
                aria-live="polite"
              >
                <span class="mid-preview-loading__spin" aria-hidden="true" />
                <span>{{ bindingPreview.statusText.value || "正在读取数据…" }}</span>
              </div>
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
                  v-if="includeCoverSheet"
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
                    正文 · 第 {{ bodyEditPreviewPage(bp) }} / {{ totalEditPages }} 页（画布 {{ bp + 1 }} / {{ bodyPageCount }}）
                  </div>
                  <TemplateBodyCanvas
                    v-model:selected-id="selId"
                    :tmpl="editing"
                    sheet="body"
                    :body-page-index="bp"
                    :embed-in-parent-scroll="true"
                    :zone-preview-page="bodyEditPreviewPage(bp)"
                    :zone-preview-total-pages="totalEditPages"
                  />
                </section>
                <section
                  v-if="includeBackSheet"
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
          :content-w="propsContentW"
          :content-h="propsContentH"
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
</template>

<script setup>
import TemplateBodyCanvas from "@/components/report-template/TemplateBodyCanvas.vue";
import TemplateExportPreviewStack from "@/components/report-template/TemplateExportPreviewStack.vue";
import TemplateElementProps from "@/components/report-template/TemplateElementProps.vue";
import SignaturePadDialog from "@/components/report-template/SignaturePadDialog.vue";
import * as api from "@/api/templates";
import {
  ensureSignatureSummaries,
  getSignatureImage,
} from "@/lib/signature-registry";
import { ref, computed, watch, nextTick, onMounted, onUnmounted, provide } from "vue";
import { useRoute, useRouter } from "vue-router";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import {
  bodyElementsRef,
  metricsForSheet,
  templateHasBackSheet,
  templateHasCoverSheet,
} from "@/lib/report-template/editor-sheet";
import {
  clampElementToLayout,
  cloneDeepTemplate,
  stableFingerprintPart,
} from "@/lib/report-template/snapshot-fingerprint";
import {
  layoutPresetSelectLabel,
  layoutPresetSelectRows,
} from "@/lib/layout-display-order";
import { ensureLayoutPresetsLoaded } from "@/lib/report-template/layout-registry";
import {
  applyLayoutPresetToTemplate,
  clearOptionalSheetFromTemplate,
  liftZoneTablesToSheetCanvas,
  resyncTemplateBoundPresets,
} from "@/lib/report-template/layout-apply";
import {
  ensureBodyPages,
  syncLegacyElementsAlias,
  TEMPLATE_SCHEMA_VERSION,
} from "@/lib/report-template/model";
import {
  copyTemplateElementToClipboard,
  eventTargetIsTypingField,
  hasTemplateElementClipboard,
  takeTemplateElementPasteClone,
} from "@/lib/report-template/editor-element-clipboard";
import { templateTableCellPickKey, reportBindingPreviewKey } from "@/lib/report-template/template-editor-context";
import { getCachedTemplateFullMap } from "@/lib/report-template/template-view-cache";
import { useReportBindingPreview } from "@/composables/useReportBindingPreview";
import { useStaleGuard } from "@/composables/useStaleGuard";
import {
  useSavedFingerprintBaseline,
  useUnsavedLeaveGuard,
} from "@/composables/useUnsavedLeaveGuard";
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
const {
  markClean: markTemplateClean,
  clearBaseline: clearTemplateBaseline,
  isDirty: isTemplateDirty,
} = useSavedFingerprintBaseline(() => editing.value);
const bindingPreview = useReportBindingPreview(editing);
provide(reportBindingPreviewKey, bindingPreview);
const selId = ref(null);
const sh = ref("body");
const dlgSig = ref(false);
/** @type {import('vue').Ref<'preview'|'edit'>} */
/** 默认进编辑画布，避免一打开就卡在导出预览的 SQL/OPC 拉取且无反馈 */
const midMode = ref("edit");
/** 正文分页编辑：当前画布索引（0-based） */
const bodyPageIdx = ref(0);
const hint = ref("");
/** 模版尚未挂载时的打开进度文案 */
const bootStatus = ref("正在打开模版…");
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

let midModeRefreshToken = 0;
watch(midMode, (mode) => {
  if (!editing.value) return;
  const token = ++midModeRefreshToken;
  // 本帧先切到预览并亮起「正在读取数据」，下一帧再拉数，避免干等在编辑态
  if (mode === "preview") {
    bindingPreview.loading.value = true;
  } else {
    bindingPreview.loading.value = false;
  }
  void nextTick(() => {
    if (token !== midModeRefreshToken || !editing.value) return;
    if (mode === "preview") {
      void bindingPreview.refresh({ silent: false, mutateTemplateRows: false });
    } else {
      void bindingPreview.refresh({ silent: true, mutateTemplateRows: false });
    }
  });
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

/** 属性面板改表格尺寸时与画布共用正文区边界 */
const propsContentW = computed(() => {
  const t = editing.value;
  if (!t) return Number.POSITIVE_INFINITY;
  return metricsForSheet(t, sh.value).contentW;
});
const propsContentH = computed(() => {
  const t = editing.value;
  if (!t) return Number.POSITIVE_INFINITY;
  return metricsForSheet(t, sh.value).contentH;
});

/** 粘贴按钮：模块级剪贴板非响应式，用 tick 驱动 UI 刷新 */
const clipboardTick = ref(0);
const canPasteTpl = computed(() => {
  void clipboardTick.value;
  return hasTemplateElementClipboard();
});

function bumpClipboardUi() {
  clipboardTick.value += 1;
}

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

const bodyPageCount = computed(() => {
  const t = editing.value;
  if (!t) return 1;
  return ensureBodyPages(t).length;
});

const includeCoverSheet = computed(() => {
  const t = editing.value;
  return t ? templateHasCoverSheet(t) : false;
});
const includeBackSheet = computed(() => {
  const t = editing.value;
  return t ? templateHasBackSheet(t) : false;
});

/** 编辑画布 / 导出预览页码：仅计已启用的封面、正文、末页 */
const totalEditPages = computed(() => {
  let n = bodyPageCount.value;
  if (includeCoverSheet.value) n += 1;
  if (includeBackSheet.value) n += 1;
  return n;
});

function bodyEditPreviewPage(bodyPageIndex) {
  return (includeCoverSheet.value ? 1 : 0) + bodyPageIndex + 1;
}

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
    if (includeCoverSheet.value) sh.value = "cover";
    return;
  }
  if (payload.sheet === "back") {
    if (includeBackSheet.value) sh.value = "back";
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
  if (templateHasCoverSheet(t) && bodyElementsRef(t, "cover").some((e) => e.id === id)) {
    sh.value = "cover";
    return;
  }
  if (templateHasBackSheet(t) && bodyElementsRef(t, "back").some((e) => e.id === id)) {
    sh.value = "back";
    return;
  }
  // 版式装饰层 / 页眉页脚：至少切到对应画布页，便于用户继续找
  if ((t.coverBodyZoneElements || []).some((e) => e.id === id) || (t.coverHeaderElements || []).some((e) => e.id === id) || (t.coverFooterElements || []).some((e) => e.id === id)) {
    if (templateHasCoverSheet(t)) sh.value = "cover";
    return;
  }
  if ((t.backBodyZoneElements || []).some((e) => e.id === id) || (t.backHeaderElements || []).some((e) => e.id === id) || (t.backFooterElements || []).some((e) => e.id === id)) {
    if (templateHasBackSheet(t)) sh.value = "back";
    return;
  }
  if ((t.headerElements || []).some((e) => e.id === id) || (t.footerElements || []).some((e) => e.id === id)) {
    sh.value = "body";
  }
});

/** 仪表盘健康问题「focus=控件ID」跳转后自动选中 */
function applyFocusFromRouteQuery() {
  const focus = String(route.query.focus || "").trim();
  if (!focus || !editing.value) return;
  midMode.value = "edit";
  selId.value = focus;
  void nextTick(() => scheduleScrollEditSheetIntoView());
}

watch(
  () => route.query.focus,
  () => {
    applyFocusFromRouteQuery();
  },
);

watch([editing, includeCoverSheet, includeBackSheet], () => {
  if (sh.value === "cover" && !includeCoverSheet.value) sh.value = "body";
  if (sh.value === "back" && !includeBackSheet.value) sh.value = "body";
});

watch(midMode, (m) => {
  if (m !== "edit") return;
  scheduleScrollEditSheetIntoView();
});

watch([sh, bodyPageIdx], () => {
  if (midMode.value !== "edit") return;
  scheduleScrollEditSheetIntoView();
});

const bodyPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "normal"));
const coverPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "cover"));
const backPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "back"));

const templateDimLabel = computed(() => {
  const t = editing.value;
  if (!t) return "";
  return paperLabel[t.paperKind] + (t.orientation === "landscape" ? " · 横" : " · 纵");
});

async function loadLayoutPresetsList() {
  layoutPresetsAll.value = await ensureLayoutPresetsLoaded();
}

/** @param {'body'|'cover'|'back'} slot */
function onPresetBind(slot, ev) {
  const presetId = typeof ev.target?.value === "string" ? ev.target.value : "";
  const t = editing.value;
  if (!t) return;
  if (!presetId) {
    if (slot === "body") {
      t.layoutPresetId = null;
      hint.value = "已断开正文版式 ID 绑定（沿用当前纸上快照）。";
    } else {
      clearOptionalSheetFromTemplate(t, slot);
      if (slot === "cover" && sh.value === "cover") sh.value = "body";
      if (slot === "back" && sh.value === "back") sh.value = "body";
      hint.value = slot === "cover" ? "已取消封面，本模版不再包含封面页。" : "已取消末页，本模版不再包含末页。";
    }
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

/**
 * 在指定索引插入空白正文页，并切到该页。
 * @param {number} index 0-based 插入位置（可等于 length 表示末尾追加）
 * @param {string} [okHint]
 */
function insertBodyPageAt(index, okHint) {
  const t = editing.value;
  if (!t) return;
  const pages = ensureBodyPages(t);
  if (pages.length >= 30) {
    hint.value = "正文分页最多 30 页。";
    return;
  }
  const i = Math.max(0, Math.min(pages.length, Math.floor(Number(index))));
  pages.splice(i, 0, []);
  syncLegacyElementsAlias(t);
  bodyPageIdx.value = i;
  selId.value = null;
  hint.value = okHint || `已插入正文第 ${i + 1} 页（空白画布）。`;
  scrollActiveBodyPageIntoView();
}

function insertBodyPageBefore() {
  insertBodyPageAt(bodyPageIdx.value, `已在第 ${bodyPageIdx.value + 1} 页前插入空白页。`);
}

function insertBodyPageAfter() {
  const cur = bodyPageIdx.value + 1;
  insertBodyPageAt(bodyPageIdx.value + 1, `已在第 ${cur} 页后插入空白页。`);
}

/** 末尾追加（兼容原「＋页」） */
function addBodyPageRow() {
  const t = editing.value;
  if (!t) return;
  const pages = ensureBodyPages(t);
  insertBodyPageAt(pages.length, `已在末尾新增正文第 ${pages.length + 1} 页（空白画布）。`);
}

/**
 * 交换当前正文页与相邻页顺序。
 * @param {number} delta -1 上移 / +1 下移
 */
function moveBodyPage(delta) {
  const t = editing.value;
  if (!t) return;
  const pages = ensureBodyPages(t);
  const from = bodyPageIdx.value;
  const to = from + (delta < 0 ? -1 : 1);
  if (to < 0 || to >= pages.length) return;
  const tmp = pages[from];
  pages[from] = pages[to];
  pages[to] = tmp;
  syncLegacyElementsAlias(t);
  bodyPageIdx.value = to;
  selId.value = null;
  hint.value = delta < 0 ? `已将正文页上移至第 ${to + 1} 页。` : `已将正文页下移至第 ${to + 1} 页。`;
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
  const removed = bodyPageIdx.value + 1;
  pages.splice(bodyPageIdx.value, 1);
  syncLegacyElementsAlias(t);
  if (bodyPageIdx.value >= pages.length) bodyPageIdx.value = pages.length - 1;
  selId.value = null;
  hint.value = `已删除正文第 ${removed} 页画布。`;
  scrollActiveBodyPageIntoView();
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
  clearTemplateBaseline();
  bootStatus.value = "正在打开模版…";
  const id = String(route.params.id || "");
  if (!id) {
    if (!isLoadStale(token)) router.replace({ name: "TemplateManager" });
    return;
  }
  hint.value = "";

  /**
   * 模版挂载后：仅预览态拉 SQL/OPC。
   * 编辑态不再静默查询——备份里 SQL 填充表多时，连不上库会卡数十秒，且挡住打开体感。
   */
  const refreshBindingsAfterOpen = () => {
    void nextTick(() => {
      if (isLoadStale(token) || !editing.value) return;
      if (midMode.value !== "preview") return;
      bindingPreview.loading.value = true;
      void bindingPreview.refresh({ silent: false, mutateTemplateRows: false });
    });
  };

  /** @param {import('@/lib/report-template/model').ReportTemplate} tpl */
  const applyTemplate = async (tpl) => {
    bootStatus.value = "正在解析模版…";
    await nextTick();
    const cloned = cloneDeepTemplate(tpl);
    ensureBodyPages(cloned);
    syncLegacyElementsAlias(cloned);
    // 旧数据里封面/末页版式装饰层中的表格提升为可编辑画布控件（拖拽/缩放/绑定与正文一致）
    liftZoneTablesToSheetCanvas(cloned);
    bodyPageIdx.value = 0;

    bootStatus.value = "正在加载版式列表…";
    await nextTick();
    await loadLayoutPresetsList();
    if (isLoadStale(token)) return false;
    if (layoutPresetsAll.value.length) {
      resyncTemplateBoundPresets(cloned, layoutPresetsAll.value);
    }

    bootStatus.value = "正在打开画布…";
    await nextTick();
    // 先挂上编辑对象再收尾，避免打开过程中静默打数据库
    editing.value = cloned;
    // 始终 reclamp：收齐老纵表残留的偏大 tableRows/h（不依赖是否有版式列表）
    reclamp();
    selId.value = null;
    resetTplEditHistory();
    markTemplateClean();
    refreshBindingsAfterOpen();
    await nextTick();
    applyFocusFromRouteQuery();
    return true;
  };

  // 启动预热/模版管理页已有完整缓存时先秒开，再后台校对远端版本
  const cached = getCachedTemplateFullMap()[id];
  let seededUpdatedAt = "";
  if (cached && typeof cached === "object") {
    bootStatus.value = "正在从本机缓存打开…";
    await nextTick();
    const ok = await applyTemplate(/** @type {any} */ (cached));
    if (!ok) return;
    seededUpdatedAt = String(editing.value?.updatedAt || "");
  }

  try {
    if (!seededUpdatedAt) bootStatus.value = "正在从服务器加载模版…";
    else bootStatus.value = "正在核对服务器版本…";
    await nextTick();
    const remote = await api.getTemplate(id);
    if (isLoadStale(token)) return;
    if (!seededUpdatedAt) {
      await applyTemplate(remote);
      return;
    }
    // 缓存与远端一致则不动；远端更新且用户尚未编辑时静默换成远端版本
    const remoteUpdatedAt = String(remote?.updatedAt || "");
    if (remoteUpdatedAt && remoteUpdatedAt !== seededUpdatedAt) {
      if (tplUndoStack.value.length === 0 && tplRedoStack.value.length === 0) {
        bootStatus.value = "服务器有更新，正在载入最新模版…";
        await applyTemplate(remote);
      } else {
        hint.value = "此模版在其他端已有更新，当前显示为本机缓存版本；保存将覆盖远端修改。";
      }
    }
  } catch (e) {
    if (isLoadStale(token)) return;
    if (!seededUpdatedAt) {
      const msg = e instanceof Error ? e.message : String(e);
      bootStatus.value = "无法从后端载入模版";
      hint.value = `无法从后端载入模版：${msg}`;
      editing.value = null;
      clearTemplateBaseline();
    }
  }
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
  if (!t || saving.value) return false;
  ensureBodyPages(t);
  syncLegacyElementsAlias(t);
  t.updatedAt = new Date().toISOString();
  t.schemaVersion = TEMPLATE_SCHEMA_VERSION;
  reclamp();
  saving.value = true;
  try {
    await api.putTemplate(t.id, t);
    // 写回内存缓存：下次进入编辑器直接秒开最新版本
    getCachedTemplateFullMap()[t.id] = cloneDeepTemplate(t);
    markTemplateClean();
    hint.value = "已保存。";
    return true;
  } catch (e) {
    hint.value = "保存失败：" + String(e.message || e);
    return false;
  } finally {
    saving.value = false;
  }
}

const { ensureCanLeave } = useUnsavedLeaveGuard({
  isDirty: isTemplateDirty,
  save,
  entityLabel: "模版",
});

async function back() {
  if (!(await ensureCanLeave())) return;
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

function copySel() {
  const el = sel.value;
  if (!el) return;
  midMode.value = "edit";
  copyTemplateElementToClipboard(el);
  bumpClipboardUi();
  hint.value = "已复制控件（含属性配置）。";
}

function cutSel() {
  const el = sel.value;
  if (!el) return;
  midMode.value = "edit";
  copyTemplateElementToClipboard(el);
  bumpClipboardUi();
  delSel();
  hint.value = "已剪切控件。";
}

function pasteSel() {
  const t = editing.value;
  if (!t || !hasTemplateElementClipboard()) return;
  midMode.value = "edit";
  const m = metricsForSheet(t, sh.value);
  const el = takeTemplateElementPasteClone(m.contentW, m.contentH);
  if (!el) return;
  bumpClipboardUi();
  if (sh.value === "body") {
    const pages = ensureBodyPages(t);
    const ix = Math.max(0, Math.min(bodyPageIdx.value, pages.length - 1));
    pages[ix].push(el);
  } else {
    bodyElementsRef(t, sh.value).push(el);
  }
  selId.value = el.id;
  hint.value = "已粘贴控件（属性已保留）。";
}

function sigOk(dataUrl) {
  dlgSig.value = false;
  if (!sel.value || sel.value.type !== "signature") return;
  sel.value.imageSrc = dataUrl;
}

async function refreshSigChoices() {
  try {
    sigChoices.value = await ensureSignatureSummaries();
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
    const src = await getSignatureImage(id);
    if (src === undefined) throw new Error("empty");
    sel.value.imageSrc = src;
    hint.value = "已从签名库载入图像。";
  } catch {
    hint.value = "读取签名条目失败";
  }
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
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (!sel.value) return;
    ev.preventDefault();
    copySel();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "x") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (!sel.value) return;
    ev.preventDefault();
    cutSel();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (!hasTemplateElementClipboard()) return;
    ev.preventDefault();
    pasteSel();
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
.ted--boot {
  align-items: center;
  justify-content: center;
  background: #f4f4f5;
  padding: 24px;
  box-sizing: border-box;
}
.ted-boot-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 420px;
  padding: 28px 32px;
  border-radius: 12px;
  border: 1px solid #e4e4e7;
  background: #fff;
  box-shadow: 0 8px 28px rgb(0 0 0 / 6%);
  text-align: center;
}
.ted-boot-spin {
  width: 28px;
  height: 28px;
  border: 3px solid color-mix(in srgb, var(--accent, #2563eb) 28%, transparent);
  border-top-color: var(--accent, #2563eb);
  border-radius: 50%;
  animation: mid-preview-spin 0.7s linear infinite;
}
.ted-boot-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ted-boot-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: #18181b;
}
.ted-boot-sub {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: #71717a;
}
.ted-boot-back {
  margin-top: 4px;
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
.bar-sep {
  width: 1px;
  height: 22px;
  background: #e4e4e7;
  margin: 0 2px;
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
.preview-side-loading {
  margin: 0 0 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent, #2563eb) 12%, transparent);
  color: var(--text, #1f2937);
  font-size: 12px;
  font-weight: 600;
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
.btn-mini:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mid-preview-loading {
  position: absolute;
  z-index: 4;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border, #c5cdd8);
  background: color-mix(in srgb, var(--panel, #fff) 92%, transparent);
  box-shadow: 0 2px 10px rgb(0 0 0 / 10%);
  font-size: 13px;
  color: var(--text, #1f2937);
  pointer-events: none;
}
.mid-preview-loading__spin {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, var(--accent, #2563eb) 35%, transparent);
  border-top-color: var(--accent, #2563eb);
  border-radius: 50%;
  animation: mid-preview-spin 0.7s linear infinite;
}
@keyframes mid-preview-spin {
  to {
    transform: rotate(360deg);
  }
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
