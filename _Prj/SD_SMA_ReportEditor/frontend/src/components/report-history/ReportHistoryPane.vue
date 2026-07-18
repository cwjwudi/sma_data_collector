<template>
  <section class="pane" :aria-label="title">
    <div class="pane-head">
      <div class="pane-title-row">
        <h3 class="pane-title">{{ title }}</h3>
        <span v-if="selectedCount" class="pane-sel">已选 {{ selectedCount }}</span>
      </div>
      <div v-if="showPickRoot" class="pane-dir">
        <input :value="rootDir || ''" type="text" readonly class="pane-dir-inp" :placeholder="rootPlaceholder" />
        <button type="button" class="b primary" :disabled="disabled || busy" @click="$emit('pick-root')">
          {{ pickLabel }}
        </button>
      </div>
      <p v-else-if="rootHint" class="pane-hint">{{ rootHint }}</p>
    </div>

    <nav v-if="rootDir" class="rh-crumbs" :aria-label="title + '路径'">
      <button type="button" class="rh-crumb" :disabled="busy || !relSegments.length" @click="$emit('go-depth', -1)">
        根目录
      </button>
      <template v-for="(seg, i) in relSegments" :key="'c-' + i + '-' + seg">
        <span class="rh-crumb-sep" aria-hidden="true">/</span>
        <button
          type="button"
          class="rh-crumb"
          :class="{ 'rh-crumb--current': i === relSegments.length - 1 }"
          :disabled="busy || i === relSegments.length - 1"
          @click="$emit('go-depth', i)"
        >
          {{ seg }}
        </button>
      </template>
      <button
        v-if="relSegments.length"
        type="button"
        class="b ghost rh-up"
        :disabled="busy"
        @click="$emit('go-up')"
      >
        上级
      </button>
    </nav>

    <p v-if="!rootDir" class="rh-empty-hint">{{ emptyRootText }}</p>
    <p v-else-if="!busy && !entries.length && total === 0" class="rh-empty-hint">当前文件夹内暂无子文件夹或 PDF。</p>

    <div v-if="mode === 'list' && entries.length" class="tbl-panel">
      <table class="tbl">
        <thead>
          <tr>
            <th v-if="selectable" class="th-check">
              <input
                type="checkbox"
                :checked="allVisibleSelected"
                :indeterminate.prop="someVisibleSelected && !allVisibleSelected"
                :disabled="busy"
                aria-label="全选本页"
                @change="onToggleAllVisible(($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th>名称</th>
            <th>大小</th>
            <th>修改时间</th>
            <th v-if="showRowActions" class="th-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in entries"
            :key="entryKey(e)"
            :class="{ 'tr-selected': selected.has(entryKey(e)) }"
            @click="onRowClick(e, $event)"
          >
            <td v-if="selectable" class="td-check" @click.stop>
              <input
                type="checkbox"
                :checked="selected.has(entryKey(e))"
                :disabled="busy"
                :aria-label="'选择 ' + e.name"
                @change="onCheckToggle(e)"
              />
            </td>
            <td class="rh-name-cell" :title="entryTitle(e)">
              <button
                v-if="e.kind === 'dir'"
                type="button"
                class="rh-folder-btn"
                :disabled="busy"
                @click.stop="$emit('enter-dir', e.path)"
              >
                <span class="rh-folder-ico" aria-hidden="true"></span>
                {{ e.name }}
              </button>
              <span v-else>{{ e.name }}</span>
            </td>
            <td class="td-meta">{{ e.kind === "pdf" ? formatSize(e.sizeBytes) : "文件夹" }}</td>
            <td class="td-meta">{{ formatTime(e.modifiedAt || "") }}</td>
            <td v-if="showRowActions" class="td-actions" @click.stop>
              <template v-if="e.kind === 'dir'">
                <button type="button" class="b ghost" :disabled="busy" @click="$emit('enter-dir', e.path)">进入</button>
              </template>
              <template v-else>
                <button type="button" class="b ghost" @click="$emit('open-file', e)">打开</button>
                <button type="button" class="b ghost" @click="$emit('reveal-file', e)">所在位置</button>
                <button type="button" class="b danger-soft" @click="$emit('delete-file', e)">删除</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="mode === 'thumbs' && entries.length" class="grid">
      <div
        v-for="e in entries"
        :key="'card-' + entryKey(e)"
        class="card"
        :class="{ 'card--folder': e.kind === 'dir', 'card--selected': selected.has(entryKey(e)) }"
        :ref="(el) => (e.kind === 'pdf' ? setCardRef(e.filePath, el as Element | null) : undefined)"
        @click="onRowClick(e, $event)"
      >
        <label v-if="selectable" class="card-check" @click.stop>
          <input
            type="checkbox"
            :checked="selected.has(entryKey(e))"
            :disabled="busy"
            @change="onCheckToggle(e)"
          />
        </label>
        <template v-if="e.kind === 'dir'">
          <button type="button" class="folder-card-btn" :disabled="busy" @click.stop="$emit('enter-dir', e.path)">
            <span class="folder-card-ico" aria-hidden="true"></span>
            <span class="folder-card-name" :title="e.name">{{ e.name }}</span>
            <span class="folder-card-hint">点击进入</span>
          </button>
        </template>
        <template v-else>
          <div class="thumb-wrap" title="双击打开" @dblclick.stop="$emit('open-file', e)">
            <PdfExportThumb v-if="visibleCards.has(e.filePath)" :file-path="e.filePath" />
            <div v-else class="thumb-lazy-ph">滚动到此加载预览…</div>
          </div>
          <div class="foot">
            <div class="foot-line">
              <b :title="e.name">{{ e.name }}</b>
              <span class="foot-meta">{{ formatSize(e.sizeBytes) }} · {{ formatTime(e.modifiedAt) }}</span>
            </div>
            <div v-if="showRowActions" class="foot-actions" @click.stop>
              <button type="button" class="b primary" @click="$emit('open-file', e)">打开</button>
              <button type="button" class="b" @click="$emit('reveal-file', e)">位置</button>
              <button type="button" class="b danger" @click="$emit('delete-file', e)">删除</button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div v-if="rootDir && total > 0" class="rh-pager">
      <span class="rh-pager-meta">共 {{ total }} 项 · 第 {{ pageIndex + 1 }} / {{ pageCount }} 页</span>
      <label class="rh-pager-limit">
        每页
        <select
          class="rh-select"
          :value="pageSize"
          :disabled="busy"
          @change="$emit('page-size', Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <button type="button" class="b" :disabled="busy || pageIndex <= 0" @click="$emit('page', pageIndex - 1)">
        上一页
      </button>
      <button
        type="button"
        class="b"
        :disabled="busy || pageIndex + 1 >= pageCount"
        @click="$emit('page', pageIndex + 1)"
      >
        下一页
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import PdfExportThumb from "@/components/report-history/PdfExportThumb.vue";
import { applySelectionClick } from "@/lib/history-selection";
import {
  mergeIntersectingFilePaths,
  nextThumbObserverAction,
  planAfterHistoryEntriesChanged,
  type ThumbObserverAction,
} from "@/lib/history-thumb-visibility";

export type DirEntry = { kind: "dir"; name: string; path: string; modifiedAt?: string };
export type PdfEntry = {
  kind: "pdf";
  name: string;
  filePath: string;
  fileUrl?: string;
  sizeBytes: number;
  modifiedAt: string;
};
export type ExportEntry = DirEntry | PdfEntry;

const props = withDefaults(
  defineProps<{
    title: string;
    mode: "list" | "thumbs";
    rootDir: string | null;
    relSegments: string[];
    entries: ExportEntry[];
    total: number;
    pageIndex: number;
    pageSize: number;
    busy?: boolean;
    disabled?: boolean;
    selectable?: boolean;
    selected: Set<string>;
    showRowActions?: boolean;
    showPickRoot?: boolean;
    pickLabel?: string;
    rootPlaceholder?: string;
    rootHint?: string;
    emptyRootText?: string;
  }>(),
  {
    busy: false,
    disabled: false,
    selectable: false,
    showRowActions: true,
    showPickRoot: false,
    pickLabel: "选择文件夹…",
    rootPlaceholder: "未绑定",
    rootHint: "",
    emptyRootText: "请先选择文件夹。",
  },
);

const emit = defineEmits<{
  "pick-root": [];
  "go-depth": [depth: number];
  "go-up": [];
  "enter-dir": [path: string];
  "open-file": [e: PdfEntry];
  "reveal-file": [e: PdfEntry];
  "delete-file": [e: PdfEntry];
  page: [index: number];
  "page-size": [size: number];
  "update:selected": [next: Set<string>];
}>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize) || 1));
const selectedCount = computed(() => props.selected.size);
const orderedKeys = computed(() => props.entries.map(entryKey));
const allVisibleSelected = computed(
  () => orderedKeys.value.length > 0 && orderedKeys.value.every((k) => props.selected.has(k)),
);
const someVisibleSelected = computed(() => orderedKeys.value.some((k) => props.selected.has(k)));

let anchorKey: string | null = null;

function entryKey(e: ExportEntry): string {
  return e.kind === "dir" ? `d:${e.path}` : `p:${e.filePath}`;
}

function entryTitle(e: ExportEntry): string {
  return e.kind === "dir" ? e.path : e.filePath;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(iso: string): string {
  return (iso || "").replace("T", " ").slice(0, 19);
}

function commitSelection(next: Set<string>, nextAnchor: string) {
  anchorKey = nextAnchor;
  emit("update:selected", next);
}

function onRowClick(e: ExportEntry, ev: MouseEvent) {
  if (!props.selectable) return;
  const key = entryKey(e);
  const additive = ev.metaKey || ev.ctrlKey;
  const range = ev.shiftKey;
  const r = applySelectionClick({
    key,
    orderedKeys: orderedKeys.value,
    selected: props.selected,
    anchorKey,
    additive,
    range,
  });
  commitSelection(r.selected, r.anchorKey);
}

function onCheckToggle(e: ExportEntry) {
  const key = entryKey(e);
  const r = applySelectionClick({
    key,
    orderedKeys: orderedKeys.value,
    selected: props.selected,
    anchorKey,
    additive: true,
    range: false,
  });
  commitSelection(r.selected, r.anchorKey);
}

function onToggleAllVisible(checked: boolean) {
  const next = new Set(props.selected);
  for (const k of orderedKeys.value) {
    if (checked) next.add(k);
    else next.delete(k);
  }
  emit("update:selected", next);
}

const visibleCards = ref<Set<string>>(new Set());
const cardObserver = ref<IntersectionObserver | null>(null);
const cardEls = new Map<string, Element>();

function teardownCardObserver() {
  if (cardObserver.value) {
    cardObserver.value.disconnect();
    cardObserver.value = null;
  }
}

function createCardObserver() {
  if (typeof IntersectionObserver === "undefined") return;
  cardObserver.value = new IntersectionObserver(
    (ioEntries) => {
      const hits: string[] = [];
      for (const e of ioEntries) {
        if (!e.isIntersecting) continue;
        const fp = e.target instanceof HTMLElement ? e.target.dataset.fp : "";
        if (fp) hits.push(fp);
      }
      const { next, changed } = mergeIntersectingFilePaths(visibleCards.value, hits);
      if (changed) visibleCards.value = next;
    },
    { root: null, rootMargin: "400px 0px", threshold: 0.01 },
  );
  for (const el of cardEls.values()) cardObserver.value.observe(el);
}

function applyThumbObserverAction(action: ThumbObserverAction) {
  if (action === "noop") return;
  if (action === "restart") teardownCardObserver();
  createCardObserver();
}

function ensureCardObserver() {
  applyThumbObserverAction(nextThumbObserverAction(!!cardObserver.value, "ensure"));
}

/** entries 清空 visible 后重建 Observer，强制对当前视口发卡首轮回调（029） */
function resyncCardVisibility() {
  applyThumbObserverAction(nextThumbObserverAction(!!cardObserver.value, "restart"));
}

function setCardRef(filePath: string, el: Element | null) {
  if (el instanceof HTMLElement) {
    el.dataset.fp = filePath;
    cardEls.set(filePath, el);
    if (cardObserver.value) cardObserver.value.observe(el);
  } else {
    const prev = cardEls.get(filePath);
    if (prev && cardObserver.value) cardObserver.value.unobserve(prev);
    cardEls.delete(filePath);
  }
}

watch(
  () => props.entries,
  async () => {
    const plan = planAfterHistoryEntriesChanged();
    if (plan.clearVisible) visibleCards.value = new Set();
    await nextTick();
    if (plan.observerMode === "restart") resyncCardVisibility();
  },
);

onMounted(() => ensureCardObserver());
onActivated(async () => {
  await nextTick();
  resyncCardVisibility();
});
onUnmounted(() => {
  teardownCardObserver();
});

defineExpose({ ensureCardObserver, resyncCardVisibility });
</script>

<style scoped>
.pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pane-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pane-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.pane-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}
.pane-sel {
  font-size: 12px;
  color: #4338ca;
  font-weight: 600;
}
.pane-dir {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pane-dir-inp {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  background: rgb(255 255 255 / 0.9);
  color: #334155;
}
.pane-hint {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.rh-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 2px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.rh-crumb {
  border: none;
  background: transparent;
  color: #4338ca;
  font-size: 13px;
  font-weight: 600;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rh-crumb:hover:not(:disabled) {
  background: #eef2ff;
}
.rh-crumb:disabled {
  cursor: default;
  opacity: 0.85;
}
.rh-crumb--current {
  color: #1e293b;
}
.rh-crumb-sep {
  color: #94a3b8;
  font-size: 12px;
}
.rh-up {
  margin-left: 8px;
  min-height: 32px !important;
  padding: 0 10px !important;
  border-radius: 999px !important;
  font-size: 12px !important;
}
.rh-empty-hint {
  color: #71717a;
  font-size: 13px;
  margin: 8px 0;
}
.b {
  padding: 8px 14px;
  min-height: 40px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.b:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.b.danger {
  background: #dc2626;
  color: #fff;
  border-color: #b91c1c;
}
.b.ghost {
  background: #fff;
  border-color: #e2e8f0;
  color: #475569;
}
.b.danger-soft {
  background: transparent;
  border-color: transparent;
  color: #dc2626;
}
.th-check,
.td-check {
  width: 36px;
  text-align: center;
}
.tr-selected td {
  background: #eef2ff !important;
}
.tbl-panel {
  border-radius: 12px;
  border: 1px solid rgb(228 228 231 / 0.95);
  background: rgb(255 255 255 / 0.92);
  overflow: hidden;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.tbl thead th {
  padding: 10px 12px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.tbl tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  vertical-align: middle;
}
.tbl tbody tr {
  cursor: default;
}
.tbl tbody tr:hover td {
  background: #f8fafc;
}
.th-act {
  text-align: right;
}
.td-meta {
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
}
.rh-name-cell {
  max-width: 0;
  width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.td-actions {
  white-space: nowrap;
  text-align: right;
}
.td-actions .b {
  min-height: 32px;
  padding: 0 10px;
  margin-left: 4px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.rh-folder-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: #1e293b;
  cursor: pointer;
}
.rh-folder-ico {
  flex-shrink: 0;
  width: 14px;
  height: 11px;
  border: 2px solid #6366f1;
  border-radius: 2px;
  background: #eef2ff;
  position: relative;
}
.rh-folder-ico::before {
  content: "";
  position: absolute;
  left: -2px;
  top: -5px;
  width: 6px;
  height: 3px;
  border-radius: 1px 1px 0 0;
  background: #6366f1;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.card {
  position: relative;
  border: 1px solid rgb(228 228 231 / 0.95);
  border-radius: 12px;
  padding: 12px;
  background: rgb(255 255 255 / 0.92);
}
.card--selected {
  border-color: #818cf8;
  box-shadow: 0 0 0 2px #c7d2fe;
}
.card--folder {
  display: flex;
  align-items: stretch;
  min-height: 140px;
}
.card-check {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  background: rgb(255 255 255 / 0.9);
  border-radius: 4px;
  padding: 2px;
}
.folder-card-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  background: #f8fafc;
  border-radius: 8px;
  cursor: pointer;
  padding: 16px;
}
.folder-card-ico {
  width: 40px;
  height: 30px;
  border: 3px solid #6366f1;
  border-radius: 4px;
  background: #eef2ff;
  position: relative;
}
.folder-card-ico::before {
  content: "";
  position: absolute;
  left: -3px;
  top: -8px;
  width: 14px;
  height: 6px;
  border-radius: 2px 2px 0 0;
  background: #6366f1;
}
.folder-card-name {
  font-weight: 700;
  font-size: 13px;
  word-break: break-all;
  text-align: center;
}
.folder-card-hint {
  font-size: 11px;
  color: #64748b;
}
.thumb-wrap {
  display: flex;
  justify-content: center;
  min-height: 160px;
  max-height: 220px;
  overflow: hidden;
  padding: 6px;
  background: #f4f4f5;
  border-radius: 8px;
  cursor: pointer;
}
.thumb-lazy-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 160px;
  font-size: 12px;
  color: #a1a1aa;
}
.foot {
  margin-top: 8px;
  font-size: 12px;
}
.foot-line b {
  display: block;
  word-break: break-all;
  margin-bottom: 4px;
}
.foot-meta {
  color: #71717a;
  font-size: 11px;
}
.foot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.foot-actions .b {
  min-height: 32px;
  padding: 5px 10px;
  font-size: 12px;
}
.rh-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.rh-pager-meta {
  font-size: 12px;
  color: #64748b;
  margin-right: auto;
}
.rh-pager-limit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
}
.rh-select {
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  font-size: 12px;
  background: #fff;
}
</style>
