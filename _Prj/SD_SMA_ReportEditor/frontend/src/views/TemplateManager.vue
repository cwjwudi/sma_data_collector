<template>
  <div class="page tm">
    <header class="hdr">
      <h2 class="page-title">模版管理</h2>
      <div>
        <button type="button" class="b" @click="mode = mode === 'list' ? 'thumbs' : 'list'">
          {{ mode === "list" ? "缩略图" : "列表" }}
        </button>
        <button type="button" class="b primary" @click="wizard = true">新建整份模版…</button>
      </div>
    </header>
    <p v-if="msg" class="msg">{{ msg }}</p>
    <p v-if="rows.length" class="drag-hint">
      {{
        mode === "list"
          ? "拖动列表序号列握柄可调整排列顺序"
          : "拖动卡片左上角握柄可调整排列顺序"
      }}
    </p>

    <table v-if="mode === 'list'" class="tbl">
      <thead>
        <tr>
          <th class="col-seq">序号</th>
          <th>名称</th>
          <th>纸张</th>
          <th>更新</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td colspan="5" class="empty">暂无模版</td>
        </tr>
        <tr
          v-for="r in rows"
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
          <td>
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
          <td>{{ r.dim }}</td>
          <td>{{ r.updated }}</td>
          <td class="td-act">
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

    <div v-else class="grid">
      <div
        v-for="r in rows"
        :key="'g' + r.id"
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
          <div class="row3">
            <div class="micro">
              <span class="micro-t">封面</span>
              <div class="micro-body">
                <TemplateMiniPage
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
                  <option value="">选用已建版式…</option>
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
                  v-for="row in bodyPresetRows"
                  :key="'pb-' + row.preset.id"
                  :value="row.preset.id"
                >
                  {{ layoutPresetSelectLabel(row.seq, row.preset.name) }}
                </option>
                </select>
              </div>
            </div>
            <div class="micro">
              <span class="micro-t">封尾 · 末页</span>
              <div class="micro-body">
                <TemplateMiniPage
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
                  <option value="">选用已建版式…</option>
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
        <div v-else class="skel">{{ thumbLoading.has(r.id) ? "加载…" : "等待加载…" }}</div>
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
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { useRouter } from "vue-router";
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
import { bodyElementsRef, metricsForSheet } from "@/lib/report-template/editor-sheet";
import { applyLayoutPresetToTemplate, resyncTemplateBoundPresets } from "@/lib/report-template/layout-apply";
import { refreshLayoutPresets } from "@/lib/report-template/layout-registry";
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

const router = useRouter();
const { begin: beginLoad, isStale: isLoadStale } = useStaleGuard();
const mode = ref("thumbs");
const wizard = ref(false);
const msg = ref("");
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
const summaries = ref([]);
const cache = ref({});
const thumbLoading = ref(new Set());
const thumbFailed = ref(new Set());
const offline = ref(false);
/** @type {import('vue').Ref<import('@/lib/report-template/layout-model').LayoutPreset[]>} */
const layoutPresetsAll = ref([]);

const coverPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "cover"));
const bodyPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "normal"));
const backPresetRows = computed(() => layoutPresetSelectRows(layoutPresetsAll.value, "back"));

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

function markThumbLoading(id, on) {
  const s = new Set(thumbLoading.value);
  if (on) s.add(id);
  else s.delete(id);
  thumbLoading.value = s;
}

function markThumbFailed(id, on) {
  const s = new Set(thumbFailed.value);
  if (on) s.add(id);
  else s.delete(id);
  thumbFailed.value = s;
}

async function load() {
  const token = beginLoad();
  msg.value = "";
  try {
    const list = await api.listTemplateSummaries();
    if (isLoadStale(token)) return;
    applyLoadedSummaries(list);
    offline.value = false;
  } catch {
    if (isLoadStale(token)) return;
    offline.value = true;
    const local = loadLocal();
    applyLoadedSummaries(
      local.map((t) => ({
        id: t.id,
        name: t.name,
        updatedAt: t.updatedAt,
        paperKind: t.paperKind,
        orientation: t.orientation,
      })),
    );
    msg.value = "无法连接后端，已显示本地模版摘要。";
    cache.value = Object.fromEntries(local.map((t) => [t.id, t]));
  }
}

const THUMB_FETCH_CONCURRENCY = 4;

async function hydrateThumbs() {
  const token = beginLoad();
  const pending = summaries.value.filter((s) => !cache.value[s.id]).map((s) => s.id);
  for (const id of pending) {
    markThumbFailed(id, false);
    markThumbLoading(id, true);
  }
  await mapPool(pending, THUMB_FETCH_CONCURRENCY, async (id) => {
    if (isLoadStale(token)) return;
    try {
      const t = await api.getTemplate(id);
      if (isLoadStale(token)) return;
      cache.value = { ...cache.value, [id]: t };
      markThumbFailed(id, false);
    } catch {
      if (isLoadStale(token)) return;
      markThumbFailed(id, true);
    } finally {
      if (!isLoadStale(token)) markThumbLoading(id, false);
    }
  });
}

async function retryThumb(id) {
  markThumbFailed(id, false);
  markThumbLoading(id, true);
  const token = beginLoad();
  try {
    const t = await api.getTemplate(id);
    if (isLoadStale(token)) return;
    cache.value = { ...cache.value, [id]: t };
  } catch {
    if (isLoadStale(token)) return;
    markThumbFailed(id, true);
  } finally {
    if (!isLoadStale(token)) markThumbLoading(id, false);
  }
}

async function refreshThumbsView() {
  await loadPresets();
  if (!offline.value) await hydrateThumbs();
  else {
    const local = loadLocal();
    cache.value = Object.fromEntries(local.map((x) => [x.id, x]));
    thumbLoading.value = new Set();
    thumbFailed.value = new Set();
  }
  resyncAllCachedTemplates();
}

async function loadPresets() {
  const token = beginLoad();
  try {
    const list = await refreshLayoutPresets();
    if (isLoadStale(token)) return;
    layoutPresetsAll.value = list;
  } catch {
    if (isLoadStale(token)) return;
    layoutPresetsAll.value = [];
  }
}

/** 缩略图缓存中的模版：按绑定 ID 拉齐版式库最新快照（仅内存，不写服务器） */
function resyncAllCachedTemplates() {
  const presets = layoutPresetsAll.value;
  if (!presets.length) return;
  for (const id of Object.keys(cache.value)) {
    const t = cache.value[id];
    if (t && typeof t === "object") {
      resyncTemplateBoundPresets(t, presets);
      reclampTemplate(t);
    }
  }
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

/** @param {string} templateId @param {'cover'|'body'|'back'} slot */
async function onApplyPreset(templateId, slot, ev) {
  const presetId = typeof ev.target?.value === "string" ? ev.target.value : "";
  const t = cache.value[templateId];
  if (!t) return;
  msg.value = "";

  if (!presetId) {
    if (slot === "body") t.layoutPresetId = null;
    else if (slot === "cover") t.coverLayoutPresetId = null;
    else t.backLayoutPresetId = null;
    reclampTemplate(t);
    await persistFullTemplate(t);
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
  async (m) => {
    if (m !== "thumbs") return;
    await refreshThumbsView();
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
  if (!confirm("删除此模版？")) return;
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

onMounted(async () => {
  await load();
  if (mode.value === "thumbs") {
    await refreshThumbsView();
  }
});
</script>

<style scoped>
.tm {
  padding: 0 4px;
  touch-action: manipulation;
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
.drag-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 14px;
}
.tbl th,
.tbl td {
  border: 1px solid #e4e4e7;
  padding: 8px;
  text-align: left;
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
.col-seq {
  width: 88px;
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
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
}
.td-act {
  white-space: nowrap;
  vertical-align: middle;
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
