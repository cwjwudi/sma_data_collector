<template>
  <div v-if="working" class="page lpe page-fill-height">
    <header class="bar bar--sticky">
      <div class="bar-start">
        <button type="button" class="link" @click="back">← 版式列表</button>
        <span class="bar-title">{{ working.name }}</span>
        <span class="muted-inline">{{ dimLabel }}</span>
      </div>
      <div class="bar-actions">
        <button
          type="button"
          class="b"
          title="撤销 (Ctrl+Z)"
          :disabled="presetUndoStack.length === 0"
          @click="undoPresetEdit"
        >
          撤销
        </button>
        <button
          type="button"
          class="b"
          title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
          :disabled="presetRedoStack.length === 0"
          @click="redoPresetEdit"
        >
          重做
        </button>
        <span class="bar-sep" aria-hidden="true" />
        <button
          type="button"
          class="b"
          title="复制选中控件（含全部属性）(Ctrl+C)"
          :disabled="!selectedPresetEl"
          @click="copySelectedPresetEl"
        >
          复制
        </button>
        <button
          type="button"
          class="b"
          title="剪切选中控件 (Ctrl+X)"
          :disabled="!selectedPresetEl"
          @click="cutSelectedPresetEl"
        >
          剪切
        </button>
        <button
          type="button"
          class="b"
          title="粘贴控件（保留属性配置）(Ctrl+V)"
          :disabled="!canPasteLayout"
          @click="pastePresetEl"
        >
          粘贴
        </button>
        <span class="bar-sep" aria-hidden="true" />
        <button type="button" class="b primary" :disabled="saving" @click="savePreset">
          {{ saving ? "保存中…" : "保存版式" }}
        </button>
        <button type="button" class="b danger-outline" @click="removePreset">删除版式</button>
      </div>
    </header>

    <div class="lpe-shell">
    <p v-if="msg" class="msg">{{ msg }}</p>

    <div class="lpe-meta">
    <div class="grid-form">
      <label>名称<input v-model.trim="working.name" class="inp" /></label>
      <label>
        页面用途（pageRole）
        <select v-model="working.pageRole" class="inp">
          <option value="normal">正文页 · _repeat 中间页</option>
          <option value="cover">封面 · 首页</option>
          <option value="back">末页 · 封尾</option>
        </select>
      </label>
      <label>
        纸张
        <select v-model="working.paperKind" class="inp">
          <option v-for="pk in pkList" :key="pk" :value="pk">{{ PAPER_LABEL[pk] }}</option>
        </select>
      </label>
      <label>
        方向
        <select v-model="working.orientation" class="inp">
          <option value="portrait">纵向</option>
          <option value="landscape">横向</option>
        </select>
      </label>
      <label v-for="fld in mmFields" :key="fld.k">
        {{ fld.lab }}（mm）<input v-model.number="working[fld.k]" type="number" min="0" class="inp" />
      </label>
    </div>
    <p class="muted">
      <strong>画布</strong>与「模版管理」一致：页眉、正文区、页脚在同一张纵向纸上；
      竖向浏览请用<strong>中间画布区域</strong>的滚动条（本页不再整页拉长）。
      <strong>Ctrl / ⌘ + 滚轮</strong>可缩放画布。
    </p>
    </div>

    <div class="pe-cols">
      <aside class="pe-left">
        <h5 class="pe-h5">拖拽到画布</h5>
        <button
          v-for="t in presetToolTypes"
          :key="t"
          type="button"
          class="pe-tool"
          draggable="true"
          @dragstart="(e) => onPresetToolDragStart(e, t)"
        >
          {{ presetToolLabels[t] }}
        </button>
        <p class="pe-hint">拖入后点选控件，在右侧编辑属性。</p>
        <button type="button" class="btn-ghost" @click="dlgOpen = true">全屏放大编辑…</button>
      </aside>
      <main class="pe-mid">
        <LayoutPresetPaperCanvas v-model:selected-id="presetCanvasSelId" :preset="working" />
      </main>
      <aside class="pe-right">
        <LayoutPresetElementProps :el="selectedPresetEl" @remove="removeSelectedPresetEl" />
      </aside>
    </div>
    </div>

    <LayoutPresetZonesDialog
      v-model="dlgOpen"
      v-model:selected-id="presetCanvasSelId"
      :preset="working"
    />
  </div>
  <div v-else class="page lpe-fail">
    <p>{{ loadErr || "载入中…" }}</p>
    <button type="button" class="b primary" @click="back">返回版式列表</button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import LayoutPresetZonesDialog from "@/components/report-template/LayoutPresetZonesDialog.vue";
import LayoutPresetPaperCanvas from "@/components/report-template/LayoutPresetPaperCanvas.vue";
import LayoutPresetElementProps from "@/components/report-template/LayoutPresetElementProps.vue";
import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { defaultBlankLayoutSnapshot, hydrateLayoutPreset } from "@/lib/report-template/layout-model";
import type { LayoutControlType } from "@/lib/report-template/layout-zone-element";
import {
  copyLayoutZoneElementToClipboard,
  eventTargetIsTypingField,
  findLayoutElementZone,
  hasLayoutElementClipboard,
  pasteLayoutZoneElementIntoPreset,
} from "@/lib/report-template/editor-element-clipboard";
import {
  layoutPresetTableCellPickKey,
  reportBindingPreviewKey,
  type TemplateTableCellPick,
} from "@/lib/report-template/template-editor-context";
import type { ReportTemplate } from "@/lib/report-template/model";
import { useReportBindingPreview } from "@/composables/useReportBindingPreview";
import { PAPER_LABEL, type PaperKind } from "@/lib/report-template/paper";
import {
  deleteLayoutPresetFlexible,
  ensureLayoutPresetsLoaded,
  saveLayoutPresetFlexible,
} from "@/lib/report-template/layout-registry";
import { stableFingerprintPart } from "@/lib/report-template/snapshot-fingerprint";
import { watchDebounced } from "@vueuse/core";
import { useStaleGuard } from "@/composables/useStaleGuard";
import { appConfirm } from "@/composables/useAppConfirm";
import {
  useSavedFingerprintBaseline,
  useUnsavedLeaveGuard,
} from "@/composables/useUnsavedLeaveGuard";

const pkList = ["A5", "A4", "A3", "Letter"] as PaperKind[];

const route = useRoute();
const router = useRouter();
const { begin: beginLoad, isStale: isLoadStale } = useStaleGuard();

const presetId = computed(() =>
  typeof route.params.id === "string" ? route.params.id : Array.isArray(route.params.id) ? route.params.id[0] ?? "" : "",
);

const msg = ref("");
const saving = ref(false);
const working = ref<LayoutPreset | null>(null);
const {
  markClean: markPresetClean,
  clearBaseline: clearPresetBaseline,
  isDirty: isPresetDirty,
} = useSavedFingerprintBaseline(() => working.value);
const loadErr = ref("");
const dlgOpen = ref(false);
const presetCanvasSelId = ref<string | null>(null);

const presetUndoStack = ref<LayoutPreset[]>([]);
const presetRedoStack = ref<LayoutPreset[]>([]);
const presetHistoryLastRecorded = ref<LayoutPreset | null>(null);
const presetHistoryReady = ref(false);
const presetApplyingHistory = ref(false);
const PRESET_UNDO_CAP = 80;

const layoutPresetTablePick = ref<TemplateTableCellPick | null>(null);
provide(layoutPresetTableCellPickKey, layoutPresetTablePick);

/** 供绑定预览：把版式三带映射到模版 zone 字段（正文带进 coverBodyZoneElements） */
const layoutPreviewTmpl = computed<ReportTemplate | null>(() => {
  const p = working.value;
  if (!p) return null;
  const blank = defaultBlankLayoutSnapshot();
  return {
    id: `__layout_preview_${p.id}`,
    name: p.name,
    updatedAt: "",
    elements: [],
    bodyPages: [[]],
    paperKind: p.paperKind,
    orientation: p.orientation,
    layoutPresetId: p.id,
    layoutSnapshot: blank,
    coverLayoutPresetId: null,
    coverLayoutSnapshot: blank,
    coverHeaderText: "",
    coverFooterText: "",
    coverHeaderElements: [],
    coverFooterElements: [],
    coverBodyZoneElements: p.bodyElements,
    backLayoutPresetId: null,
    backLayoutSnapshot: blank,
    backHeaderText: "",
    backFooterText: "",
    backHeaderElements: [],
    backFooterElements: [],
    backBodyZoneElements: [],
    headerText: "",
    footerText: "",
    headerElements: p.headerElements,
    footerElements: p.footerElements,
    coverElements: [],
    backElements: [],
  };
});

const bindingPreview = useReportBindingPreview(layoutPreviewTmpl as Ref<ReportTemplate | null>);
provide(reportBindingPreviewKey, bindingPreview);

watchDebounced(
  layoutPreviewTmpl,
  () => {
    void bindingPreview.refresh({ silent: true, mutateTemplateRows: false });
  },
  { deep: true, debounce: 400 },
);

const presetToolLabels: Record<LayoutControlType, string> = {
  text: "文本",
  box: "色块",
  image: "图片",
  pageNumber: "页码",
  date: "日期",
  table: "表格",
  parameter: "数据参数",
};
const presetToolTypes: LayoutControlType[] = [
  "text",
  "box",
  "image",
  "pageNumber",
  "date",
  "table",
  "parameter",
];

function onPresetToolDragStart(e: DragEvent, t: LayoutControlType) {
  e.dataTransfer?.setData("application/x-zone-tool", t);
  e.dataTransfer?.setData("text/plain", t);
}

const dimLabel = computed(() => {
  const w = working.value;
  if (!w) return "";
  return PAPER_LABEL[w.paperKind] + (w.orientation === "landscape" ? " · 横" : " · 纵");
});

const selectedPresetEl = computed(() => {
  const w = working.value;
  const id = presetCanvasSelId.value;
  if (!w || !id) return null;
  return (
    w.headerElements.find((x) => x.id === id) ||
    w.footerElements.find((x) => x.id === id) ||
    w.bodyElements.find((x) => x.id === id) ||
    null
  );
});

function removeSelectedPresetEl() {
  const w = working.value;
  const id = presetCanvasSelId.value;
  if (!w || !id) return;
  for (const arr of [w.headerElements, w.footerElements, w.bodyElements]) {
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) {
      arr.splice(i, 1);
      presetCanvasSelId.value = null;
      return;
    }
  }
}

const clipboardTick = ref(0);
const canPasteLayout = computed(() => {
  void clipboardTick.value;
  return hasLayoutElementClipboard();
});

function bumpClipboardUi() {
  clipboardTick.value += 1;
}

function copySelectedPresetEl() {
  const w = working.value;
  const el = selectedPresetEl.value;
  if (!w || !el) return;
  const zone = findLayoutElementZone(w, el.id) || "body";
  copyLayoutZoneElementToClipboard(el, zone);
  bumpClipboardUi();
  msg.value = "已复制控件（含属性配置）。";
}

function cutSelectedPresetEl() {
  const w = working.value;
  const el = selectedPresetEl.value;
  if (!w || !el) return;
  const zone = findLayoutElementZone(w, el.id) || "body";
  copyLayoutZoneElementToClipboard(el, zone);
  bumpClipboardUi();
  removeSelectedPresetEl();
  msg.value = "已剪切控件。";
}

function pastePresetEl() {
  const w = working.value;
  if (!w || !hasLayoutElementClipboard()) return;
  const preferred = presetCanvasSelId.value ? findLayoutElementZone(w, presetCanvasSelId.value) : null;
  const newId = pasteLayoutZoneElementIntoPreset(w, preferred);
  bumpClipboardUi();
  if (!newId) return;
  presetCanvasSelId.value = newId;
  msg.value = "已粘贴控件（属性已保留）。";
}

const mmFields = [
  { k: "marginTopMm" as const, lab: "上边距" },
  { k: "marginRightMm" as const, lab: "右边距" },
  { k: "marginBottomMm" as const, lab: "下边距" },
  { k: "marginLeftMm" as const, lab: "左边距" },
  { k: "headerBandMm" as const, lab: "页眉带高度" },
  { k: "footerBandMm" as const, lab: "页脚带高度" },
];

function clonePreset(p: LayoutPreset): LayoutPreset {
  return hydrateLayoutPreset(JSON.parse(JSON.stringify(p)));
}

function resetPresetHistoryFromWorking(w: LayoutPreset | null) {
  presetHistoryReady.value = false;
  presetUndoStack.value = [];
  presetRedoStack.value = [];
  presetHistoryLastRecorded.value = w ? clonePreset(w) : null;
  presetHistoryReady.value = !!w;
  if (w) markPresetClean();
  else clearPresetBaseline();
}

watchDebounced(
  working,
  () => {
    if (!presetHistoryReady.value || presetApplyingHistory.value || !working.value) return;
    const cur = working.value;
    const prev = presetHistoryLastRecorded.value;
    if (!prev) return;
    if (stableFingerprintPart(cur) === stableFingerprintPart(prev)) return;
    presetUndoStack.value.push(clonePreset(prev));
    if (presetUndoStack.value.length > PRESET_UNDO_CAP) presetUndoStack.value.shift();
    presetRedoStack.value = [];
    presetHistoryLastRecorded.value = clonePreset(cur);
  },
  { debounce: 320, maxWait: 4500, deep: true },
);

function undoPresetEdit() {
  if (!working.value || presetUndoStack.value.length === 0) return;
  presetApplyingHistory.value = true;
  try {
    presetRedoStack.value.push(clonePreset(working.value));
    const prev = presetUndoStack.value.pop()!;
    working.value = clonePreset(prev);
    presetHistoryLastRecorded.value = clonePreset(working.value);
  } finally {
    presetApplyingHistory.value = false;
  }
  void nextTick(() => {
    const id = presetCanvasSelId.value;
    if (id && !selectedPresetEl.value) presetCanvasSelId.value = null;
    msg.value = "已撤销。";
  });
}

function redoPresetEdit() {
  if (!working.value || presetRedoStack.value.length === 0) return;
  presetApplyingHistory.value = true;
  try {
    presetUndoStack.value.push(clonePreset(working.value));
    const next = presetRedoStack.value.pop()!;
    working.value = clonePreset(next);
    presetHistoryLastRecorded.value = clonePreset(working.value);
  } finally {
    presetApplyingHistory.value = false;
  }
  void nextTick(() => {
    const id = presetCanvasSelId.value;
    if (id && !selectedPresetEl.value) presetCanvasSelId.value = null;
    msg.value = "已重做。";
  });
}

async function loadWorking() {
  const token = beginLoad();
  loadErr.value = "";
  msg.value = "";
  working.value = null;
  clearPresetBaseline();
  const id = presetId.value;
  if (!id) {
    loadErr.value = "缺少版式 ID。";
    resetPresetHistoryFromWorking(null);
    return;
  }
  try {
    const list = await ensureLayoutPresetsLoaded();
    if (isLoadStale(token)) return;
    const raw = list.find((x) => x.id === id);
    if (!raw) {
      loadErr.value = "未找到该版式（可能已删除）。";
      working.value = null;
      resetPresetHistoryFromWorking(null);
      return;
    }
    working.value = clonePreset(raw);
    presetCanvasSelId.value = null;
    resetPresetHistoryFromWorking(working.value);
    void bindingPreview.refresh({ silent: true, mutateTemplateRows: false });
  } catch (e) {
    if (isLoadStale(token)) return;
    loadErr.value = "加载失败：" + String((e as Error).message || e);
    working.value = null;
    resetPresetHistoryFromWorking(null);
  }
}

async function savePreset() {
  const w = working.value;
  if (!w?.name.trim()) {
    msg.value = "名称不能为空。";
    return false;
  }
  saving.value = true;
  msg.value = "";
  try {
    w.updatedAt = new Date().toISOString();
    const r = await saveLayoutPresetFlexible(w);
    if (!r.ok) {
      msg.value = r.message;
      return false;
    }
    presetCanvasSelId.value = null;
    if (r.source === "remote") {
      await loadWorking();
      msg.value = "版式已保存。";
    } else {
      working.value = clonePreset(r.preset);
      resetPresetHistoryFromWorking(working.value);
      msg.value =
        `未能写入服务器（${r.warning}）。当前内容已暂存于本浏览器缓存；联网后可在「设置」迁移或再次保存。在未成功写入服务器前，勿依赖多机/多浏览器同步。`;
    }
    return true;
  } catch (e) {
    msg.value = "保存失败：" + String((e as Error).message || e);
    return false;
  } finally {
    saving.value = false;
  }
}

const { ensureCanLeave, skipLeaveGuard } = useUnsavedLeaveGuard({
  isDirty: isPresetDirty,
  save: savePreset,
  entityLabel: "版式",
});

async function back() {
  if (!(await ensureCanLeave())) return;
  router.push({ name: "LayoutPresets" });
}

async function removePreset() {
  const w = working.value;
  if (!w) return;
  if (
    !(await appConfirm({
      title: "删除版式",
      message: "删除此版式？引用它的模版会失去关联 ID，请先确认模版侧已调整。",
      confirmText: "删除",
      danger: true,
    }))
  ) {
    return;
  }
  msg.value = "";
  try {
    await deleteLayoutPresetFlexible(w.id);
    skipLeaveGuard.value = true;
    router.replace({ name: "LayoutPresets" });
  } catch (e) {
    msg.value = "删除失败：" + String((e as Error).message || e);
  }
}

watch(
  () => route.params.id,
  () => {
    void loadWorking();
  },
);

function onEditorWindowKeydown(ev: KeyboardEvent) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
    ev.preventDefault();
    void savePreset();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (ev.shiftKey) {
      if (presetRedoStack.value.length === 0) return;
      ev.preventDefault();
      redoPresetEdit();
      return;
    }
    if (presetUndoStack.value.length === 0) return;
    ev.preventDefault();
    undoPresetEdit();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (presetRedoStack.value.length === 0) return;
    ev.preventDefault();
    redoPresetEdit();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (!selectedPresetEl.value) return;
    ev.preventDefault();
    copySelectedPresetEl();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "x") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (!selectedPresetEl.value) return;
    ev.preventDefault();
    cutSelectedPresetEl();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (!hasLayoutElementClipboard()) return;
    ev.preventDefault();
    pastePresetEl();
    return;
  }
  if (eventTargetIsTypingField(ev.target)) return;
  if (ev.key === "Delete" || ev.key === "Backspace") {
    if (!presetCanvasSelId.value) return;
    ev.preventDefault();
    removeSelectedPresetEl();
  }
}

onMounted(() => {
  void loadWorking();
  window.addEventListener("keydown", onEditorWindowKeydown);
});
onUnmounted(() => window.removeEventListener("keydown", onEditorWindowKeydown));
</script>

<style scoped>
.lpe {
  padding: 0 4px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.lpe-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 8px;
}
.lpe-meta {
  flex: 0 1 auto;
  max-height: min(300px, 40vh);
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}
.lpe-fail {
  padding: 24px;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  row-gap: 12px;
  margin-bottom: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #e4e4e7;
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
.link {
  border: none;
  background: none;
  color: #4f46e5;
  cursor: pointer;
  font-size: 14px;
}
.bar-title {
  font-weight: 600;
  font-size: 15px;
  color: #18181b;
}
.muted-inline {
  font-size: 12px;
  color: #71717a;
}
.grid-form {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}
.grid-form label {
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
}
.muted {
  font-size: 12px;
  color: #71717a;
  margin: 0;
}
.msg {
  font-size: 12px;
  color: #b45309;
  margin: 6px 0;
}
.pe-cols {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr) 248px;
  /* 关键：行高允许收缩到 0，否则中间栏里画布会把整格里撑高，外层 .content-scroll 再出一条滚动条 → 双滚动条 */
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  flex: 1;
  min-height: 0;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
@media (max-width: 1100px) {
  .pe-cols {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .pe-left,
  .pe-right {
    border: none !important;
    border-bottom: 1px solid #e4e4e7 !important;
  }
}
.pe-left {
  padding: 10px;
  border-right: 1px solid #e4e4e7;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fafafa;
  min-height: 0;
  overflow: hidden;
  overscroll-behavior: none;
}
.pe-h5 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
}
.pe-tool {
  border: 1px dashed #999;
  background: #fff;
  cursor: grab;
  padding: 10px 8px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: 6px;
  text-align: left;
  touch-action: manipulation;
  font-size: 12px;
}
.pe-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #71717a;
  line-height: 1.35;
}
.pe-mid {
  min-height: 0;
  min-width: 0;
  background: #f4f4f5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: contain;
}
.pe-right {
  padding: 10px;
  border-left: 1px solid #e4e4e7;
  background: #fafafa;
  overflow: auto;
  font-size: 13px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  min-height: 0;
}
.btn-ghost {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px dashed #d4d4d8;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}
.b {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.b:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.b.danger-outline {
  border-color: #f87171;
  color: #b91c1c;
}
.b:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
