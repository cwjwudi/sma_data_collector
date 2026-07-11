<template>
  <div class="page tm">
    <header class="hdr">
      <h2 class="page-title">模版管理</h2>
      <div>
        <button type="button" class="b" @click="mode = mode === 'list' ? 'thumbs' : 'list'">
          {{ mode === "list" ? "缩略图" : "列表" }}
        </button>
        <button type="button" class="b" :disabled="loading" @click="enterView">刷新</button>
        <button type="button" class="b primary" @click="wizard = true">新建整份模版…</button>
      </div>
    </header>
    <p v-if="loading" class="loading-hint">正在加载模版，请稍候…</p>
    <p v-if="msg" class="msg">
      {{ msg }}
      <button v-if="offline" type="button" class="msg-retry" :disabled="loading" @click="enterView">重试连接</button>
    </p>
    <p v-if="rows.length" class="drag-hint">
      {{
        mode === "list"
          ? "拖动列表序号列握柄可调整排列顺序"
          : "拖动卡片左上角握柄可调整排列顺序"
      }}
    </p>

    <div v-if="mode === 'list'" class="tbl-panel">
      <table class="tbl">
        <colgroup>
          <col class="col-seq" />
          <col class="col-name" />
          <col class="col-dim" />
          <col class="col-updated" />
          <col class="col-act" />
        </colgroup>
        <thead>
          <tr>
            <th class="col-seq">序号</th>
            <th class="col-name">名称</th>
            <th class="col-dim">纸张</th>
            <th class="col-updated">更新</th>
            <th class="col-act th-act">操作</th>
          </tr>
        </thead>
        <tbody>
        <tr v-if="loading && !rows.length">
          <td colspan="5" class="empty">正在加载模版…</td>
        </tr>
        <tr v-else-if="!rows.length">
          <td colspan="5" class="empty">暂无模版</td>
        </tr>
        <tr
          v-for="r in pagedRows"
          :key="r.id"
          :class="{
            'tr--hl': highlightId === r.id,
            'tr--dragging': dragId === r.id,
            'tr--drag-over': dragOverId === r.id && dragId !== r.id,
          }"
          @dragover.prevent="onDragOver(r.id)"
          @dragleave="onDragLeave(r.id)"
          @drop.prevent="onDragDrop(r.id)"
        >
          <td class="col-seq">
            <div class="row-seq-cell">
              <button
                type="button"
                class="row-drag-handle"
                draggable="true"
                title="拖动排序"
                aria-label="拖动排序"
                @dragstart="onDragStart($event, r.id)"
                @dragend="onDragEnd"
                @click.prevent
              >
                <svg
                  class="row-drag-handle-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="6" r="1.5" />
                  <circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" />
                  <circle cx="15" cy="18" r="1.5" />
                </svg>
              </button>
              <span class="row-seq-num">{{ r.seq }}</span>
            </div>
          </td>
          <td class="col-name">
            <div class="tpl-name-row">
              <input
                v-if="renamingId === r.id"
                v-model="renameDraft"
                type="text"
                class="tpl-name-input tpl-name-input--active"
                maxlength="128"
                @keydown.enter.prevent="commitRename(r.id)"
                @keydown.escape.prevent="cancelRename"
                @blur="commitRename(r.id)"
              />
              <template v-else>
                <span class="tpl-name">{{ r.name }}</span>
                <button
                  type="button"
                  class="btn-rename"
                  title="改名"
                  aria-label="改名"
                  @click.stop="startRename(r)"
                >
                  <svg
                    class="btn-rename-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              </template>
            </div>
          </td>
          <td class="col-dim">{{ r.dim }}</td>
          <td class="col-updated">{{ r.updated }}</td>
          <td class="col-act td-act">
            <div class="foot-actions foot-actions--table">
              <a
                href="#"
                class="lnk"
                title="仅在编辑器中编排正文画布上的控件与眉脚元素"
                @click.prevent="goEditor(r.id)"
                >改正文</a
              >
              <a href="#" class="lnk" @click.prevent="openDuplicate(r)">复制</a>
              <a href="#" class="lnk danger" @click.prevent="delTpl(r.id)">删除</a>
            </div>
          </td>
        </tr>
        </tbody>
      </table>
    </div>

    <p v-if="mode === 'thumbs' && loading && !rows.length" class="empty">正在加载模版…</p>
    <p v-else-if="mode === 'thumbs' && !rows.length" class="empty">暂无模版</p>
    <div v-else-if="mode === 'thumbs'" class="grid">
      <div
        v-for="r in pagedRows"
        :key="'g' + r.id"
        :ref="(el) => setCardRef(r.id, el)"
        class="card"
        :id="'tm-card-' + r.id"
        :class="{
          'card--dragging': dragId === r.id,
          'card--drag-over': dragOverId === r.id && dragId !== r.id,
          'card--hl': highlightId === r.id,
        }"
        @dragover.prevent="onDragOver(r.id)"
        @dragleave="onDragLeave(r.id)"
        @drop.prevent="onDragDrop(r.id)"
      >
        <div class="card-top-bar">
          <button
            type="button"
            class="card-drag-handle"
            draggable="true"
            title="拖动排序"
            aria-label="拖动排序"
            @dragstart="onDragStart($event, r.id)"
            @dragend="onDragEnd"
            @click.prevent
          >
            <svg
              class="card-drag-handle-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
          </button>
          <span class="card-seq" aria-label="序号">{{ r.seq }}</span>
        </div>
        <template v-if="cache[r.id]">
          <div v-if="!isCardVisible(r.id)" class="row3-ph" aria-hidden="true">
            <span class="row3-ph-hint">预览待显示…</span>
          </div>
          <div v-else class="row3">
            <div class="micro" :class="{ 'micro--sheet-off': !sheetIncluded(cache[r.id], 'cover') }">
              <span class="micro-t">封面</span>
              <div
                class="micro-body"
                :class="{ 'micro-body--absent': !sheetIncluded(cache[r.id], 'cover') }"
              >
                <div
                  v-if="!sheetIncluded(cache[r.id], 'cover')"
                  class="micro-absent"
                  role="status"
                  aria-label="本模版未选用封面"
                >
                  <span class="micro-absent-badge">未选用封面</span>
                  <span class="micro-absent-desc">导出与编辑时不包含此页</span>
                </div>
                <TemplateMiniPage
                  v-else
                  :key="'cov-' + r.id + '-' + optionalSheetThumbKey(cache[r.id], 'cover')"
                  :template="cache[r.id]"
                  sheet="cover"
                  :max-width-px="230"
                  :max-height-px="300"
                />
              </div>
              <div class="micro-foot">
                <label class="micro-lab">版式</label>
                <select
                  class="micro-preset"
                  :value="boundPresetId(cache[r.id], 'cover')"
                  @change="onApplyPreset(r.id, 'cover', $event)"
                >
                  <option value="">不使用封面</option>
                  <option
                    v-if="orphanBoundPresetOption(cache[r.id], 'cover')"
                    :value="orphanBoundPresetOption(cache[r.id], 'cover').id"
                    disabled
                  >
                    {{ orphanBoundPresetOption(cache[r.id], 'cover').label }}
                  </option>
                  <option
                  v-for="row in coverPresetRows"
                  :key="'pc-' + row.preset.id"
                  :value="row.preset.id"
                >
                  {{ layoutPresetSelectLabel(row.seq, row.preset.name) }}
                </option>
                </select>
              </div>
            </div>
            <div class="micro">
              <span class="micro-t">页眉 · 页脚 · 正文纸</span>
              <div class="micro-body">
                <TemplateMiniBands
                  :template="cache[r.id]"
                  sheet="body"
                  gap-label="正文区（示意省略）"
                  :max-width-px="230"
                  :max-height-px="300"
                />
              </div>
              <div class="micro-foot">
                <label class="micro-lab">正文版式</label>
                <select
                  class="micro-preset"
                  :value="boundPresetId(cache[r.id], 'body')"
                  @change="onApplyPreset(r.id, 'body', $event)"
                >
                  <option value="">选用已建版式…</option>
                  <option
                    v-if="orphanBoundPresetOption(cache[r.id], 'body')"
                    :value="orphanBoundPresetOption(cache[r.id], 'body').id"
                    disabled
                  >
                    {{ orphanBoundPresetOption(cache[r.id], 'body').label }}
                  </option>
                  <option
                  v-for="row in bodyPresetRows"
                  :key="'pb-' + row.preset.id"
                  :value="row.preset.id"
                >
                  {{ layoutPresetSelectLabel(row.seq, row.preset.name) }}
                </option>
                </select>
              </div>
            </div>
            <div class="micro" :class="{ 'micro--sheet-off': !sheetIncluded(cache[r.id], 'back') }">
              <span class="micro-t">封尾 · 末页</span>
              <div
                class="micro-body"
                :class="{ 'micro-body--absent': !sheetIncluded(cache[r.id], 'back') }"
              >
                <div
                  v-if="!sheetIncluded(cache[r.id], 'back')"
                  class="micro-absent"
                  role="status"
                  aria-label="本模版未选用封尾"
                >
                  <span class="micro-absent-badge">未选用封尾</span>
                  <span class="micro-absent-desc">导出与编辑时不包含此页</span>
                </div>
                <TemplateMiniPage
                  v-else
                  :key="'back-' + r.id + '-' + optionalSheetThumbKey(cache[r.id], 'back')"
                  :template="cache[r.id]"
                  sheet="back"
                  :max-width-px="230"
                  :max-height-px="300"
                />
              </div>
              <div class="micro-foot">
                <label class="micro-lab">版式</label>
                <select
                  class="micro-preset"
                  :value="boundPresetId(cache[r.id], 'back')"
                  @change="onApplyPreset(r.id, 'back', $event)"
                >
                  <option value="">不使用封尾</option>
                  <option
                    v-if="orphanBoundPresetOption(cache[r.id], 'back')"
                    :value="orphanBoundPresetOption(cache[r.id], 'back').id"
                    disabled
                  >
                    {{ orphanBoundPresetOption(cache[r.id], 'back').label }}
                  </option>
                  <option
                  v-for="row in backPresetRows"
                  :key="'pk-' + row.preset.id"
                  :value="row.preset.id"
                >
                  {{ layoutPresetSelectLabel(row.seq, row.preset.name) }}
                </option>
                </select>
              </div>
            </div>
          </div>
        </template>
        <div v-else-if="thumbFailed.has(r.id)" class="skel skel--err">
          <span>预览加载失败</span>
          <button type="button" class="skel-retry" @click="retryThumb(r.id)">重试</button>
        </div>
        <div v-else class="skel">正在加载预览…</div>
        <div class="foot">
          <div class="foot-meta">
            <div class="tpl-name-row tpl-name-row--card">
              <input
                v-if="renamingId === r.id"
                v-model="renameDraft"
                type="text"
                class="tpl-name-input tpl-name-input--card tpl-name-input--active"
                maxlength="128"
                @keydown.enter.prevent="commitRename(r.id)"
                @keydown.escape.prevent="cancelRename"
                @blur="commitRename(r.id)"
              />
              <template v-else>
                <b class="foot-template-name">{{ r.name }}</b>
                <button
                  type="button"
                  class="btn-rename"
                  title="改名"
                  aria-label="改名"
                  @click.stop="startRename(r)"
                >
                  <svg
                    class="btn-rename-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              </template>
            </div>
            <span class="foot-template-meta">{{ r.dim }} · {{ r.updated }}</span>
          </div>
          <div class="foot-actions">
            <a
              href="#"
              class="lnk"
              title="仅在编辑器中编排正文画布上的控件与眉脚元素"
              @click.prevent="goEditor(r.id)"
              >改正文</a
            >
            <a href="#" class="lnk" @click.prevent="openDuplicate(r)">复制</a>
            <a href="#" class="lnk danger" @click.prevent="delTpl(r.id)">删除</a>
          </div>
        </div>
      </div>
    </div>

    <nav v-if="rows.length > PAGE_SIZE" class="tm-pager" aria-label="模版列表分页">
      <button type="button" class="b tm-pager-btn" :disabled="pageIndex <= 0" @click="goPage(pageIndex - 1)">
        上一页
      </button>
      <span class="tm-pager-info">
        第 {{ pageIndex + 1 }} / {{ totalPages }} 页 · 本页 {{ pagedRows.length }} / 共 {{ rows.length }} 个
      </span>
      <button
        type="button"
        class="b tm-pager-btn"
        :disabled="pageIndex >= totalPages - 1"
        @click="goPage(pageIndex + 1)"
      >
        下一页
      </button>
      <label class="tm-pager-jump">
        跳至
        <input
          v-model.number="pageJumpDraft"
          type="number"
          min="1"
          :max="totalPages"
          class="tm-pager-inp"
          @keydown.enter.prevent="commitPageJump"
        />
        页
        <button type="button" class="b tm-pager-btn" @click="commitPageJump">确定</button>
      </label>
    </nav>
    <p v-if="mode === 'thumbs' && thumbsLoadingPage" class="tm-pager-loading">
      正在加载本页预览（已就绪 {{ pageThumbReadyCount }} / {{ pagedRows.length }}）…
    </p>

    <div v-if="dupDlg" class="tm-dup-backdrop" @click.self="closeDupDlg">
      <div class="tm-dup-modal" role="dialog" aria-modal="true" aria-labelledby="tm-dup-title">
        <h3 id="tm-dup-title" class="tm-dup-title">复制模版</h3>
        <p class="tm-dup-desc">
          将复制「{{ dupSourceRow?.name }}」的封面、正文、末页版式绑定与画布控件。确定后会在列表中新增一份模版。
        </p>
        <label class="tm-dup-lbl" for="tm-dup-name">新模版名称</label>
        <input
          id="tm-dup-name"
          ref="dupNameInputEl"
          v-model.trim="dupNameInput"
          type="text"
          class="tm-dup-inp"
          maxlength="128"
          autocomplete="off"
          @keydown.enter.prevent="confirmDuplicate"
        />
        <div class="tm-dup-actions">
          <button type="button" class="b" @click="closeDupDlg">取消</button>
          <button type="button" class="b primary" :disabled="!dupNameInput.trim()" @click="confirmDuplicate">
            复制
          </button>
        </div>
      </div>
    </div>

    <NewTemplateWizardDialog v-model="wizard" @created="created" />
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  watch,
  onUnmounted,
  onActivated,
  onDeactivated,
  onMounted,
  nextTick,
} from "vue";
import { useRouter } from "vue-router";

defineOptions({ name: "TemplateManager" });
import * as api from "@/api/templates";
import { mapPool, useStaleGuard } from "@/composables/useStaleGuard";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import {
  applyDisplayOrder,
  loadTemplateDisplayOrder,
  reorderIdsBefore,
  saveTemplateDisplayOrder,
} from "@/lib/template-display-order";
import {
  layoutPresetSelectLabel,
  layoutPresetSelectRows,
} from "@/lib/layout-display-order";
import {
  clampElementToLayout,
  cloneDeepTemplate,
} from "@/lib/report-template/snapshot-fingerprint";
import {
  bodyElementsRef,
  metricsForSheet,
  templateHasBackSheet,
  templateHasCoverSheet,
} from "@/lib/report-template/editor-sheet";
import {
  applyLayoutPresetToTemplate,
  clearOptionalSheetFromTemplate,
  liftZoneTablesToSheetCanvas,
  resyncTemplateBoundPresets,
  stripStaleOptionalSheetZones,
} from "@/lib/report-template/layout-apply";
import { ensureLayoutPresetsLoaded } from "@/lib/report-template/layout-registry";
import {
  getCachedTemplateFullMap,
  getCachedTemplateSummaries,
  hasTemplateViewCache,
  saveTemplateViewCache,
  clearTemplateViewCache,
} from "@/lib/report-template/template-view-cache";
import {
  loadTemplates as loadLocal,
  saveTemplates,
  ensureBodyPages,
  syncLegacyElementsAlias,
  TEMPLATE_SCHEMA_VERSION,
  duplicateReportTemplate,
} from "@/lib/report-template/model";
import TemplateMiniPage from "@/components/report-template/TemplateMiniPage.vue";
import TemplateMiniBands from "@/components/report-template/TemplateMiniBands.vue";
import NewTemplateWizardDialog from "@/components/report-template/NewTemplateWizardDialog.vue";
import { appConfirm } from "@/composables/useAppConfirm";

const router = useRouter();
/** 列表与缩略图分两套 generation，避免 hydrate/重试把刚成功的列表结果标成 stale */
const { begin: beginListLoad, isStale: isListLoadStale } = useStaleGuard();
const { begin: beginThumbLoad, isStale: isThumbLoadStale } = useStaleGuard();

/** 记住上次的视图模式：默认「列表」以便打开页面即时呈现（缩略图为重加载） */
const MODE_STORAGE_KEY = "tm-view-mode";
function readInitialMode() {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    if (v === "list" || v === "thumbs") return v;
  } catch {
    /* ignore */
  }
  return "list";
}
const mode = ref(readInitialMode());
watch(mode, (m) => {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, m);
  } catch {
    /* ignore */
  }
});
const wizard = ref(false);
const msg = ref("");
const loading = ref(false);
const renamingId = ref(null);
const renameDraft = ref("");
const dragId = ref(null);
const dragOverId = ref(null);
const dupDlg = ref(false);
/** @type {import('vue').Ref<{ id: string, name: string } | null>} */
const dupSourceRow = ref(null);
const dupNameInput = ref("");
const dupNameInputEl = ref(null);
const highlightId = ref(null);
let highlightTimer = null;
const summaries = ref(hasTemplateViewCache() ? getCachedTemplateSummaries() : []);
const cache = ref(hasTemplateViewCache() ? getCachedTemplateFullMap() : {});
const thumbFailed = ref(new Set());
const offline = ref(false);
let offlineRetryTimer = null;
let offlineRetryCount = 0;
/** 后端冷启动可能超过 30s；在仍显示离线时持续重试（有上限间隔） */
const OFFLINE_RETRY_MAX = 40;

function clearOfflineRetry() {
  if (offlineRetryTimer != null) {
    window.clearTimeout(offlineRetryTimer);
    offlineRetryTimer = null;
  }
}

function scheduleOfflineRetry() {
  if (offlineRetryTimer != null) return;
  if (offlineRetryCount >= OFFLINE_RETRY_MAX) return;
  offlineRetryCount += 1;
  const delay = Math.min(8000, 1000 + offlineRetryCount * 500);
  offlineRetryTimer = window.setTimeout(() => {
    offlineRetryTimer = null;
    if (!offline.value) return;
    void enterView();
  }, delay);
}

/** @type {import('vue').Ref<import('@/lib/report-template/layout-model').LayoutPreset[]>} */
const layoutPresetsAll = ref([]);

/**
 * 缩略图卡片懒渲染：只有进入（或接近）视口的卡片才构建其微缩预览重 DOM，
 * 避免模版较多时一次性挂载数十个完整预览。已渲染过的卡片保持渲染，滚回时无需重建。
 */
const visibleCards = ref(new Set());
/** @type {IntersectionObserver | null} */
let cardObserver = null;
/** @type {Map<string, HTMLElement>} */
const cardEls = new Map();

/** @param {string} id */
function isCardVisible(id) {
  return visibleCards.value.has(id);
}

function ensureCardObserver() {
  if (cardObserver || typeof IntersectionObserver === "undefined") return;
  cardObserver = new IntersectionObserver(
    (entries) => {
      let changed = false;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = e.target instanceof HTMLElement ? e.target.dataset.tmId : "";
        if (id && !visibleCards.value.has(id)) {
          visibleCards.value.add(id);
          changed = true;
        }
      }
      if (changed) visibleCards.value = new Set(visibleCards.value);
    },
    { root: null, rootMargin: "400px 0px", threshold: 0.01 },
  );
  for (const el of cardEls.values()) cardObserver.observe(el);
}

function teardownCardObserver() {
  if (cardObserver) {
    cardObserver.disconnect();
    cardObserver = null;
  }
}

/** 模板卡片 DOM 引用回调：注册后交给 IntersectionObserver 观测 */
function setCardRef(id, el) {
  if (el instanceof HTMLElement) {
    el.dataset.tmId = id;
    cardEls.set(id, el);
    if (cardObserver) cardObserver.observe(el);
  } else {
    const prev = cardEls.get(id);
    if (prev && cardObserver) cardObserver.unobserve(prev);
    cardEls.delete(id);
  }
}

const coverPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "cover"));
const bodyPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "normal"));
const backPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "back"));

/** @param {import('@/lib/report-template/model').ReportTemplate} t @param {'cover'|'back'} slot */
function sheetIncluded(t, slot) {
  if (slot === "cover") return templateHasCoverSheet(t);
  return templateHasBackSheet(t);
}

/** @param {import('@/lib/report-template/model').ReportTemplate} t @param {'cover'|'back'} slot */
function optionalSheetThumbKey(t, slot) {
  if (!t) return "0";
  if (slot === "cover") {
    return [
      t.coverLayoutPresetId ?? "",
      t.coverHeaderElements.length,
      t.coverFooterElements.length,
      t.coverBodyZoneElements.length,
      t.coverElements.length,
    ].join("-");
  }
  return [
    t.backLayoutPresetId ?? "",
    t.backHeaderElements.length,
    t.backFooterElements.length,
    t.backBodyZoneElements.length,
    t.backElements.length,
  ].join("-");
}

function syncDisplayOrderToStorage() {
  saveTemplateDisplayOrder(summaries.value.map((s) => s.id));
}

function applyLoadedSummaries(list) {
  summaries.value = applyDisplayOrder(list, loadTemplateDisplayOrder());
}

/** @param {DragEvent} e @param {string} id */
function onDragStart(e, id) {
  dragId.value = id;
  dragOverId.value = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  const row =
    e.currentTarget instanceof HTMLElement
      ? e.currentTarget.closest("tr") || e.currentTarget.closest(".card")
      : null;
  if (row && e.dataTransfer) {
    const offsetX = row instanceof HTMLTableRowElement ? 28 : 48;
    const offsetY = row instanceof HTMLTableRowElement ? 18 : 28;
    e.dataTransfer.setDragImage(row, offsetX, offsetY);
  }
}

function onDragEnd() {
  dragId.value = null;
  dragOverId.value = null;
}

/** @param {string} targetId */
function onDragOver(targetId) {
  if (!dragId.value || dragId.value === targetId) return;
  dragOverId.value = targetId;
}

/** @param {string} targetId */
function onDragLeave(targetId) {
  if (dragOverId.value === targetId) dragOverId.value = null;
}

/** @param {string} targetId */
function onDragDrop(targetId) {
  const fromId = dragId.value;
  dragId.value = null;
  dragOverId.value = null;
  if (!fromId || fromId === targetId) return;
  const ids = summaries.value.map((s) => s.id);
  const next = reorderIdsBefore(ids, fromId, targetId);
  if (next.join() === ids.join()) return;
  summaries.value = applyDisplayOrder(summaries.value, next);
  syncDisplayOrderToStorage();
}

const rows = computed(() =>
  summaries.value.map((s, i) => ({
    id: s.id,
    seq: i + 1,
    name: s.name,
    dim: PAPER_LABEL[s.paperKind] + (s.orientation === "landscape" ? "·横" : "·纵"),
    updated: (s.updatedAt || "").replace("T", " ").slice(0, 19),
  })),
);

/** 每页条数：翻页立刻切页，只渲染当前页，缩略图也只按本页渐进加载 */
const PAGE_SIZE = 20;
const pageIndex = ref(0);
const pageJumpDraft = ref(1);
const thumbsLoadingPage = ref(false);

const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)));

const pagedRows = computed(() => {
  const start = pageIndex.value * PAGE_SIZE;
  return rows.value.slice(start, start + PAGE_SIZE);
});

const pageThumbReadyCount = computed(() =>
  pagedRows.value.reduce((n, r) => n + (cache.value[r.id] ? 1 : 0), 0),
);

function clampPageIndex(i) {
  const max = Math.max(0, totalPages.value - 1);
  return Math.max(0, Math.min(max, Math.floor(Number(i)) || 0));
}

function goPage(i) {
  const next = clampPageIndex(i);
  if (next === pageIndex.value) return;
  pageIndex.value = next;
  pageJumpDraft.value = next + 1;
  // 翻页立刻切 UI；缩略图后台按本页加载，不阻塞
  if (mode.value === "thumbs") void refreshThumbsView({ pageOnly: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function commitPageJump() {
  goPage((Number(pageJumpDraft.value) || 1) - 1);
}

watch(
  () => rows.value.length,
  () => {
    pageIndex.value = clampPageIndex(pageIndex.value);
    pageJumpDraft.value = pageIndex.value + 1;
  },
);

function markThumbFailed(id, on) {
  const s = new Set(thumbFailed.value);
  if (on) s.add(id);
  else s.delete(id);
  thumbFailed.value = s;
}

async function load() {
  const token = beginListLoad();
  msg.value = "";
  if (!summaries.value.length) loading.value = true;
  try {
    const list = await api.listTemplateSummaries();
    if (isListLoadStale(token)) return;
    applyLoadedSummaries(list);
    offline.value = false;
    offlineRetryCount = 0;
    clearOfflineRetry();
    msg.value = "";
  } catch (e) {
    if (isListLoadStale(token)) return;
    offline.value = true;
    const local = loadLocal();
    if (local.length) {
      applyLoadedSummaries(
        local.map((t) => ({
          id: t.id,
          name: t.name,
          updatedAt: t.updatedAt,
          paperKind: t.paperKind,
          orientation: t.orientation,
        })),
      );
      cache.value = Object.fromEntries(local.map((t) => [t.id, t]));
      msg.value = "无法连接后端，已显示本地模版摘要。";
    } else if (!summaries.value.length) {
      // 切勿用空本地缓存覆盖已成功加载的列表（并发旧请求失败时的典型坑）
      applyLoadedSummaries([]);
      msg.value =
        "无法连接后端（本机也无缓存模版）。后端启动后会自动重试，也可点「刷新」。";
    } else {
      msg.value =
        "暂时无法刷新模版列表，仍显示已加载内容。将自动重试…" +
        (e instanceof Error && e.message ? `（${e.message}）` : "");
    }
    scheduleOfflineRetry();
  } finally {
    if (!isListLoadStale(token)) loading.value = false;
  }
}

const THUMB_FETCH_CONCURRENCY = 4;

/**
 * 按需加载缩略图完整模版。
 * @param {{ ids?: string[] }} [opts] 不传则按当前页 id；传 ids 则只拉这些
 */
async function hydrateThumbs(opts = {}) {
  const token = beginThumbLoad();
  const scopeIds =
    Array.isArray(opts.ids) && opts.ids.length
      ? opts.ids
      : pagedRows.value.map((r) => r.id);
  if (!scopeIds.length) return;

  /** 已缓存且 updatedAt 未变的不再重复拉取；本页缺什么就拉什么，加载几个显示几个 */
  const pending = scopeIds.filter((id) => {
    const s = summaries.value.find((x) => x.id === id);
    if (!s) return !cache.value[id];
    const cached = cache.value[id];
    if (!cached) return true;
    return (cached.updatedAt || "") !== (s.updatedAt || "");
  });
  if (!pending.length) return;
  for (const id of pending) markThumbFailed(id, false);

  // 不再走 /templates/full 全量包：模版多时会卡住整页；改为按本页并发渐进写入 cache
  await mapPool(pending, THUMB_FETCH_CONCURRENCY, async (id) => {
    if (isThumbLoadStale(token)) return;
    try {
      const t = await api.getTemplate(id);
      if (isThumbLoadStale(token)) return;
      normalizeOptionalSheetsForList(t);
      resyncOneCachedTemplate(t);
      cache.value = { ...cache.value, [id]: t };
      markThumbFailed(id, false);
    } catch {
      if (isThumbLoadStale(token)) return;
      markThumbFailed(id, true);
    }
  });
}

async function retryThumb(id) {
  markThumbFailed(id, false);
  const token = beginThumbLoad();
  try {
    const t = await api.getTemplate(id);
    if (isThumbLoadStale(token)) return;
    normalizeOptionalSheetsForList(t);
    resyncOneCachedTemplate(t);
    cache.value = { ...cache.value, [id]: t };
  } catch {
    if (isThumbLoadStale(token)) return;
    markThumbFailed(id, true);
  }
}

/**
 * @param {{ pageOnly?: boolean }} [opts]
 * pageOnly=true：只刷新当前页预览（翻页/进入用）；不阻塞 UI
 */
async function refreshThumbsView(opts = {}) {
  thumbsLoadingPage.value = true;
  try {
    await loadPresets();
    if (!offline.value) {
      await hydrateThumbs({ ids: pagedRows.value.map((r) => r.id) });
    } else {
      const local = loadLocal();
      const pageIds = new Set(pagedRows.value.map((r) => r.id));
      const next = { ...cache.value };
      for (const t of local) {
        if (!pageIds.has(t.id)) continue;
        normalizeOptionalSheetsForList(t);
        resyncOneCachedTemplate(t);
        next[t.id] = t;
      }
      cache.value = next;
      thumbFailed.value = new Set();
    }
  } finally {
    thumbsLoadingPage.value = false;
  }
}

async function loadPresets() {
  const token = beginThumbLoad();
  try {
    const list = await ensureLayoutPresetsLoaded();
    if (isThumbLoadStale(token)) return;
    layoutPresetsAll.value = list;
  } catch {
    if (isThumbLoadStale(token)) return;
    layoutPresetsAll.value = [];
  }
}

/** 单份模版：按绑定 ID 拉齐版式库最新快照（仅内存） */
function resyncOneCachedTemplate(t) {
  const presets = layoutPresetsAll.value;
  if (!t || typeof t !== "object" || !presets.length) return;
  liftZoneTablesToSheetCanvas(t);
  resyncTemplateBoundPresets(t, presets);
  normalizeOptionalSheetsForList(t);
  reclampTemplate(t);
}

/** @param {import('@/lib/report-template/model').ReportTemplate} t */
function normalizeOptionalSheetsForList(t) {
  stripStaleOptionalSheetZones(t, "cover");
  stripStaleOptionalSheetZones(t, "back");
}

/** @param {import('@/lib/report-template/model').ReportTemplate} t */
function reclampTemplate(t) {
  const pages = ensureBodyPages(t);
  syncLegacyElementsAlias(t);
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

/** @param {import('@/lib/report-template/model').ReportTemplate} t @param {'cover'|'body'|'back'} slot */
function boundPresetId(t, slot) {
  if (slot === "cover") return t.coverLayoutPresetId || "";
  if (slot === "body") return t.layoutPresetId || "";
  return t.backLayoutPresetId || "";
}

/**
 * 模版绑定了版式 ID，但当前版式库中找不到对应条目（或用途不匹配）时，
 * 下拉增加禁用项，避免误显示「不使用封面 / 选用已建版式…」。
 * @param {import('@/lib/report-template/model').ReportTemplate} t
 * @param {'cover'|'body'|'back'} slot
 */
function orphanBoundPresetOption(t, slot) {
  const id = boundPresetId(t, slot);
  if (!id) return null;
  const expectedRole = slot === "body" ? "normal" : slot;
  const hit = layoutPresetsAll.value.find((x) => x.id === id && x.pageRole === expectedRole);
  if (hit) return null;
  const short = id.length > 8 ? `${id.slice(0, 8)}…` : id;
  const label =
    slot === "cover"
      ? `版式缺失（封面 ${short}）`
      : slot === "back"
        ? `版式缺失（封尾 ${short}）`
        : `版式缺失（正文 ${short}）`;
  return { id, label };
}

/** @param {string} templateId @param {'cover'|'body'|'back'} slot */
async function onApplyPreset(templateId, slot, ev) {
  const presetId = typeof ev.target?.value === "string" ? ev.target.value : "";
  const t = cache.value[templateId];
  if (!t) return;
  msg.value = "";

  if (!presetId) {
    if (slot === "body") {
      t.layoutPresetId = null;
    } else {
      clearOptionalSheetFromTemplate(t, slot);
    }
    reclampTemplate(t);
    cache.value = { ...cache.value, [templateId]: cloneDeepTemplate(t) };
    await persistFullTemplate(t);
    msg.value =
      slot === "cover"
        ? "已取消封面，本模版不再包含封面页。"
        : slot === "back"
          ? "已取消封尾，本模版不再包含末页。"
          : "已断开正文版式 ID 绑定（沿用当前纸上快照）。";
    return;
  }

  const expectedRole = slot === "body" ? "normal" : slot;
  const p = layoutPresetsAll.value.find((x) => x.id === presetId);
  if (!p || p.pageRole !== expectedRole) {
    msg.value = "所选条目与用途不匹配或未找到。";
    ev.target.value = boundPresetId(t, slot);
    return;
  }

  applyLayoutPresetToTemplate(t, p, slot);
  reclampTemplate(t);
  cache.value = { ...cache.value, [templateId]: cloneDeepTemplate(t) };
  await persistFullTemplate(t);
}

/** @param {import('@/lib/report-template/model').ReportTemplate} t */
async function persistFullTemplate(t) {
  ensureBodyPages(t);
  syncLegacyElementsAlias(t);
  t.updatedAt = new Date().toISOString();
  t.schemaVersion = TEMPLATE_SCHEMA_VERSION;
  try {
    await api.putTemplate(t.id, t);
    msg.value = "已更新该模版的版式引用并保存。";
    summaries.value = summaries.value.map((s) =>
      s.id === t.id ? { ...s, name: t.name, updatedAt: t.updatedAt } : s,
    );
  } catch {
    const list = loadLocal();
    const ix = list.findIndex((x) => x.id === t.id);
    if (ix >= 0) list[ix] = t;
    else list.push(t);
    saveTemplates(list);
    offline.value = true;
    msg.value = "已写入本机模版库并已保存。"
    summaries.value = summaries.value.map((s) =>
      s.id === t.id ? { ...s, name: t.name, updatedAt: t.updatedAt } : s,
    );
  }
}

function startRename(r) {
  renamingId.value = r.id;
  renameDraft.value = r.name;
  nextTick(() => {
    document.querySelector(".tpl-name-input--active")?.focus();
    document.querySelector(".tpl-name-input--active")?.select();
  });
}

function cancelRename() {
  renamingId.value = null;
  renameDraft.value = "";
}

/** @param {string} id */
async function commitRename(id) {
  if (renamingId.value !== id) return;
  const name = renameDraft.value.trim().slice(0, 128);
  renamingId.value = null;
  renameDraft.value = "";
  if (!name) {
    msg.value = "名称不能为空。";
    return;
  }
  const cur = summaries.value.find((s) => s.id === id);
  if (cur?.name === name) return;

  msg.value = "";
  let t = cache.value[id];
  if (!t) {
    try {
      t = await api.getTemplate(id);
      cache.value[id] = t;
    } catch {
      t = loadLocal().find((x) => x.id === id) || null;
      if (t) cache.value[id] = t;
    }
  }
  if (!t) {
    msg.value = "无法加载模版，改名失败。";
    return;
  }
  t.name = name;
  try {
    await persistFullTemplate(t);
    msg.value = "已更新模版名称。";
  } catch (e) {
    msg.value = "改名失败：" + String(e?.message || e);
  }
}

watch(
  () => mode.value,
  (m) => {
    if (m !== "thumbs") return;
    // 切到缩略图：立刻显示本页卡片骨架，预览后台按页加载
    void refreshThumbsView({ pageOnly: true });
  },
);

function goEditor(id) {
  router.push({ name: "TemplateEditor", params: { id } });
}

function summaryFromTemplate(t) {
  return {
    id: t.id,
    name: t.name,
    updatedAt: t.updatedAt,
    paperKind: t.paperKind,
    orientation: t.orientation,
  };
}

/** @param {{ id: string, name: string }} r */
function openDuplicate(r) {
  dupSourceRow.value = r;
  dupNameInput.value = `${r.name}（副本）`;
  dupDlg.value = true;
  void nextTick(() => {
    dupNameInputEl.value?.focus();
    dupNameInputEl.value?.select();
  });
}

function closeDupDlg() {
  dupDlg.value = false;
  dupSourceRow.value = null;
}

async function loadTemplateForDuplicate(id) {
  let t = cache.value[id];
  if (t) return t;
  try {
    t = await api.getTemplate(id);
    cache.value[id] = t;
    return t;
  } catch {
    return loadLocal().find((x) => x.id === id) || null;
  }
}

function flashHighlight(id) {
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightId.value = id;
  highlightTimer = setTimeout(() => {
    highlightId.value = null;
    highlightTimer = null;
  }, 2800);
}

async function scrollToTemplateCard(id) {
  const ix = rows.value.findIndex((r) => r.id === id);
  if (ix >= 0) {
    const targetPage = Math.floor(ix / PAGE_SIZE);
    if (targetPage !== pageIndex.value) {
      pageIndex.value = targetPage;
      pageJumpDraft.value = targetPage + 1;
      if (mode.value === "thumbs") void refreshThumbsView({ pageOnly: true });
    }
  }
  await nextTick();
  if (mode.value === "thumbs") {
    document.getElementById(`tm-card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  document.querySelector(`tr.tr--hl`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function confirmDuplicate() {
  const row = dupSourceRow.value;
  const trimmed = dupNameInput.value.trim();
  if (!row) return;
  if (!trimmed) {
    msg.value = "名称不能为空。";
    return;
  }
  closeDupDlg();
  msg.value = "";
  const source = await loadTemplateForDuplicate(row.id);
  if (!source) {
    msg.value = "无法加载源模版，复制失败。";
    return;
  }
  try {
    const copy = duplicateReportTemplate(source, trimmed);
    ensureBodyPages(copy);
    syncLegacyElementsAlias(copy);
    copy.schemaVersion = TEMPLATE_SCHEMA_VERSION;
    try {
      await api.putTemplate(copy.id, copy);
    } catch {
      const list = loadLocal();
      list.push(copy);
      saveTemplates(list);
      offline.value = true;
      msg.value = "已复制到本机模版库；可在「设置 › 浏览器数据迁移」上传到服务器。";
    }
    cache.value[copy.id] = cloneDeepTemplate(copy);
    const newSum = summaryFromTemplate(copy);
    const ix = summaries.value.findIndex((s) => s.id === row.id);
    const next = [...summaries.value];
    next.splice(ix >= 0 ? ix + 1 : next.length, 0, newSum);
    summaries.value = next;
    syncDisplayOrderToStorage();
    if (!msg.value) msg.value = "已复制为新模版。";
    flashHighlight(copy.id);
    await scrollToTemplateCard(copy.id);
  } catch (e) {
    msg.value = "复制失败：" + String(e?.message || e);
  }
}

async function delTpl(id) {
  if (
    !(await appConfirm({
      title: "删除模版",
      message: "删除此模版？",
      confirmText: "删除",
      danger: true,
    }))
  ) {
    return;
  }
  try {
    await api.deleteTemplate(id);
  } catch {
    /* ignore offline */
  }
  summaries.value = summaries.value.filter((x) => x.id !== id);
  delete cache.value[id];
  syncDisplayOrderToStorage();
}

async function created(t) {
  try {
    await api.putTemplate(t.id, t);
  } catch {
    const list = loadLocal();
    if (!list.some((x) => x.id === t.id)) {
      list.push(t);
      saveTemplates(list);
    }
    msg.value += " 新建模版已写入本机 localStorage；可在「设置 › 浏览器数据迁移」上传到服务器。";
  }
  cache.value[t.id] = cloneDeepTemplate(t);
  summaries.value = [
    {
      id: t.id,
      name: t.name,
      updatedAt: t.updatedAt,
      paperKind: t.paperKind,
      orientation: t.orientation,
    },
    ...summaries.value.filter((x) => x.id !== t.id),
  ];
  syncDisplayOrderToStorage();
  goEditor(t.id);
}

/** 进入本页（首次挂载或从 keep-alive 缓存中被重新激活）时的数据刷新 */
async function enterView() {
  await load();
  if (mode.value === "thumbs") {
    // 不 await 全量：摘要到了立刻显示本页，预览按页后台补齐
    void refreshThumbsView({ pageOnly: true });
  }
}

function persistViewCache() {
  /** 保存当前摘要与缩略图缓存，切回本页时可先秒显示再后台刷新 */
  saveTemplateViewCache(summaries.value, cache.value);
}

/**
 * 组件被 <keep-alive> 缓存：`onActivated` 在首次挂载与每次重新进入时都会触发，
 * 因此把加载逻辑放在这里即可「切回秒显示 + 后台增量刷新」，无需在 onMounted 再跑一次。
 */
onActivated(() => {
  void enterView();
  ensureCardObserver();
});

function onExternalConfigRestored() {
  clearTemplateViewCache();
  void enterView();
}

function onAssetsChanged() {
  void enterView();
}

/** 启动预热完成：若此前因后端未就绪走了离线兜底（或缩略图未加载），立即重载 */
function onWarmupComplete() {
  if (hasTemplateViewCache()) {
    const full = getCachedTemplateFullMap();
    if (Object.keys(full).length) {
      cache.value = { ...full, ...cache.value };
    }
  }
  void enterView();
}

onMounted(() => {
  window.addEventListener("report-editor-config-imported", onExternalConfigRestored);
  window.addEventListener("report-editor-warmup-complete", onWarmupComplete);
  window.addEventListener("report-editor-assets-changed", onAssetsChanged);
});

onDeactivated(() => {
  persistViewCache();
});

onUnmounted(() => {
  persistViewCache();
  clearOfflineRetry();
  teardownCardObserver();
  window.removeEventListener("report-editor-config-imported", onExternalConfigRestored);
  window.removeEventListener("report-editor-warmup-complete", onWarmupComplete);
  window.removeEventListener("report-editor-assets-changed", onAssetsChanged);
});
</script>

<style scoped>
.tm {
  padding: 0 4px;
  touch-action: manipulation;
}
.tm-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 14px 0 8px;
  padding: 8px 4px;
  border-top: 1px solid #e4e4e7;
}
.tm-pager-info {
  font-size: 13px;
  color: #52525b;
}
.tm-pager-btn {
  margin-left: 0 !important;
  min-height: 36px;
  padding: 6px 12px;
}
.tm-pager-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tm-pager-jump {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #52525b;
  margin-left: auto;
}
.tm-pager-inp {
  width: 64px;
  padding: 6px 8px;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  font-size: 13px;
}
.tm-pager-loading {
  margin: 0 4px 10px;
  font-size: 12px;
  color: #a16207;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.b {
  margin-left: 8px;
  padding: 8px 14px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  touch-action: manipulation;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.msg {
  font-size: 12px;
  color: #b45309;
  margin: 8px 0;
}
.msg-retry {
  margin-left: 10px;
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid #d97706;
  background: #fffbeb;
  color: #92400e;
  cursor: pointer;
}
.msg-retry:disabled {
  opacity: 0.5;
  cursor: default;
}
.loading-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: #4f46e5;
}
.drag-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}
.tbl-panel {
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid rgb(228 228 231 / 0.95);
  background: rgb(255 255 255 / 0.92);
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.06);
  overflow-x: auto;
}
.tbl {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 14px;
}
.tbl thead th {
  padding: 11px 14px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.tbl tbody td {
  padding: 12px 14px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}
.tbl tbody tr:last-child td {
  border-bottom: none;
}
.tbl tbody tr:hover td {
  background: #f8fafc;
}
.tbl .col-seq {
  width: 88px;
}
.tbl .col-name {
  width: 34%;
}
.tbl .col-dim {
  width: 24%;
}
.tbl .col-updated {
  width: 180px;
}
.tbl .col-act {
  width: 220px;
}
.th-act {
  text-align: right;
}
.col-seq {
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
}
.col-name {
  overflow: hidden;
}
.col-dim,
.col-updated {
  white-space: nowrap;
  color: #64748b;
  font-size: 13px;
}
.col-updated {
  font-variant-numeric: tabular-nums;
}
.empty {
  color: #71717a;
  padding: 24px;
  text-align: center;
}
.lnk {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 44px;
  padding: 0 14px;
  box-sizing: border-box;
  margin: 0;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(79, 70, 229, 0.12);
}
.foot-actions--table .lnk {
  min-width: 0;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border-color: #e2e8f0;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}
.foot-actions--table .lnk:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1e293b;
}
.foot-actions--table .lnk.danger {
  border-color: #fecaca;
  background: #fff;
  color: #dc2626;
}
.foot-actions--table .lnk.danger:hover {
  background: #fef2f2;
  border-color: #fca5a5;
}
.lnk:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
}
.lnk:active {
  background: #c7d2fe;
}
.lnk.danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}
.lnk.danger:hover {
  background: #fee2e2;
  border-color: #fca5a5;
}
.lnk.danger:active {
  background: #fecaca;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(700px, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.card {
  position: relative;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  touch-action: manipulation;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease;
}
.card--dragging {
  opacity: 0.55;
}
.card--drag-over {
  border-color: #818cf8;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}
.card--hl {
  outline: 2px solid rgb(129 140 248 / 0.65);
  outline-offset: 2px;
}
.tr--hl td {
  background: #eef2ff;
}
.tr--dragging td {
  opacity: 0.55;
}
.tr--drag-over td {
  background: #eef2ff;
  box-shadow: inset 0 2px 0 #818cf8;
}
.row-seq-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.row-seq-num {
  min-width: 1.25em;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #64748b;
}
.row-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fafafa;
  color: #71717a;
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
}
.row-drag-handle:hover {
  background: #f4f4f5;
  border-color: #d4d4d8;
  color: #4f46e5;
}
.row-drag-handle:active {
  cursor: grabbing;
}
.row-drag-handle-icon {
  display: block;
  pointer-events: none;
}
.tm-dup-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.55);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.tm-dup-modal {
  background: #fff;
  padding: 1.1rem 1.25rem 1rem;
  border-radius: 10px;
  max-width: 96vw;
  width: 420px;
  box-shadow: 0 20px 50px rgb(0 0 0 / 0.22);
}
.tm-dup-title {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
  font-weight: 600;
}
.tm-dup-desc {
  margin: 0 0 0.85rem;
  font-size: 12px;
  color: #52525b;
  line-height: 1.45;
}
.tm-dup-lbl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
  margin-bottom: 4px;
}
.tm-dup-inp {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  font-size: 14px;
}
.tm-dup-inp:focus {
  outline: 2px solid rgb(129 140 248 / 0.5);
  outline-offset: 1px;
  border-color: #818cf8;
}
.tm-dup-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
  margin-top: 12px;
}
.tm-dup-actions .b.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.card-top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.card-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fafafa;
  color: #71717a;
  cursor: grab;
  touch-action: none;
}
.card-drag-handle:hover {
  background: #f4f4f5;
  border-color: #d4d4d8;
  color: #4f46e5;
}
.card-drag-handle:active {
  cursor: grabbing;
}
.card-drag-handle-icon {
  display: block;
  pointer-events: none;
}
.card-seq {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #475569;
  line-height: 1;
}
.row3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
  min-width: 0;
}
/** 懒渲染占位：保留与真实预览接近的高度，避免卡片塌陷导致懒加载一次性全部触发 */
.row3-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 336px;
  border: 1px dashed var(--border, #d7dbe0);
  border-radius: 8px;
  color: var(--text-muted, #9aa2ad);
  font-size: 12px;
  background: var(--surface-subtle, #f7f8fa);
}
@media (max-width: 920px) {
  .row3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .row3 {
    grid-template-columns: 1fr;
  }
}
.micro {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  gap: 8px;
  padding: 8px;
  border: 1px solid #eef0f6;
  border-radius: 8px;
  background: #fcfcfd;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}
.micro-t {
  flex: 0 0 auto;
  min-height: 2.6em;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.35;
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
}
.micro--sheet-off {
  border-style: dashed;
  border-color: #d4d4d8;
  background: #f8fafc;
}
.micro-body {
  flex: 1 1 312px;
  min-height: 312px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.micro-body--absent {
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(
    -45deg,
    #f4f4f5,
    #f4f4f5 8px,
    #fafafa 8px,
    #fafafa 16px
  );
}
.micro-absent {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 92%;
  padding: 20px 14px;
  text-align: center;
  border-radius: 10px;
  border: 1px dashed #a1a1aa;
  background: rgb(255 255 255 / 0.88);
  box-shadow: 0 1px 0 rgb(24 24 27 / 0.04);
}
.micro-absent-badge {
  display: inline-block;
  padding: 5px 12px;
  border-radius: 999px;
  background: #e4e4e7;
  color: #3f3f46;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.micro-absent-desc {
  font-size: 11px;
  line-height: 1.45;
  color: #71717a;
}
.micro-foot {
  flex: 0 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
}
.micro-lab {
  width: 100%;
  min-height: 1.25em;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  line-height: 1.25;
}
.micro-preset {
  width: 100%;
  min-height: 44px;
  padding: 6px 8px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  font-size: 12px;
  color: #1e293b;
  cursor: pointer;
  touch-action: manipulation;
}
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 16px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f4f4f5;
  font-size: 13px;
  line-height: 1.5;
}
.foot-meta {
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tpl-name-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}
.tpl-name-row--card {
  width: 100%;
}
.tpl-name {
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-name-input {
  flex: 1 1 auto;
  min-width: 120px;
  max-width: 100%;
  padding: 6px 10px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #a5b4fc;
  background: #fff;
  font-size: 14px;
  color: #0f172a;
}
.tpl-name-input--card {
  font-size: 18px;
  font-weight: 700;
}
.btn-rename {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fafafa;
  color: #52525b;
  cursor: pointer;
  touch-action: manipulation;
}
.btn-rename:hover {
  background: #f4f4f5;
  border-color: #d4d4d8;
  color: #4f46e5;
}
.btn-rename-icon {
  display: block;
}
.foot-template-name {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  color: #0f172a;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.foot-template-meta {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
}
.foot-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.foot-actions--table {
  justify-content: flex-end;
  gap: 6px;
}
.td-act {
  white-space: nowrap;
  vertical-align: middle;
  text-align: right;
}
.skel {
  min-height: 120px;
  color: #71717a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.skel--err {
  color: #b45309;
  background: #fffbeb;
  border-radius: 8px;
  border: 1px dashed #fcd34d;
}
.skel-retry {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}
.skel-retry:hover {
  border-color: #a1a1aa;
  background: #fafafa;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
}
</style>
