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
          :disabled="!hasLayoutSelection"
          @click="copySelectedPresetEl"
        >
          复制
        </button>
        <button
          type="button"
          class="b"
          title="剪切选中控件 (Ctrl+X)"
          :disabled="!hasLayoutSelection"
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
        <button type="button" class="b" title="左对齐" :disabled="!canAlignLayout" @click="alignLayout('left')">
          左齐
        </button>
        <button type="button" class="b" title="水平居中" :disabled="!canAlignLayout" @click="alignLayout('centerH')">
          水平中
        </button>
        <button type="button" class="b" title="右对齐" :disabled="!canAlignLayout" @click="alignLayout('right')">
          右齐
        </button>
        <button type="button" class="b" title="顶对齐" :disabled="!canAlignLayout" @click="alignLayout('top')">
          顶齐
        </button>
        <button type="button" class="b" title="垂直居中" :disabled="!canAlignLayout" @click="alignLayout('centerV')">
          垂直中
        </button>
        <button type="button" class="b" title="底对齐" :disabled="!canAlignLayout" @click="alignLayout('bottom')">
          底齐
        </button>
        <button
          type="button"
          class="b"
          title="水平等距分布（至少 3 个）"
          :disabled="!canDistributeLayout"
          @click="distributeLayout('horizontal')"
        >
          水平距
        </button>
        <button
          type="button"
          class="b"
          title="垂直等距分布（至少 3 个）"
          :disabled="!canDistributeLayout"
          @click="distributeLayout('vertical')"
        >
          垂直距
        </button>
        <span class="bar-sep" aria-hidden="true" />
        <button
          type="button"
          class="b"
          title="将本页页眉/正文/页脚中非表格控件的预览/导出外框设为隐藏（可撤销）"
          :disabled="!working"
          @click="hideBordersOnPresetPage"
        >
          一键隐藏边框
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
      <div class="pe-body-bg">
        <TableCellFillPicker
          v-model="working.bodyBackgroundCss"
          title="正文底色"
          :presets="bodyBgPresets"
        />
      </div>
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
        <LayoutPresetPaperCanvas v-model:selected-ids="presetCanvasSelIds" :preset="working" />
      </main>
      <aside class="pe-right">
        <LayoutPresetElementProps v-if="selectedPresetEl" :el="selectedPresetEl" @remove="removeSelectedPresetEl" />
        <div v-else-if="multiLayoutSummary" class="pe-multi-summary">
          <h3 class="pe-multi-title">已选 {{ presetCanvasSelIds.length }} 项</h3>
          <p class="pe-multi-types">
            <span v-for="(cnt, tp) in multiLayoutTypeCounts" :key="tp" class="pe-multi-chip">
              {{ presetToolLabels[tp] || tp }} × {{ cnt }}
            </span>
          </p>
          <ul class="pe-multi-list">
            <li v-for="item in multiLayoutSummary" :key="item.id">
              <button type="button" class="pe-multi-item" @click="focusLayoutItem(item.id)">
                <span class="pe-multi-item-type">{{ presetToolLabels[item.el.type] || item.el.type }}</span>
                <span class="pe-multi-item-id">{{ item.zoneLabel }} · {{ item.id }}</span>
              </button>
            </li>
          </ul>
          <MultiElementBatchProps :els="multiLayoutSummary.map((x) => x.el)" surface="layout" />
          <p class="pe-multi-note">Shift 区间加选；工具栏可对齐/分布。</p>
        </div>
        <p v-else class="pe-props-empty">点选画布控件后在此编辑属性。</p>
      </aside>
    </div>
    </div>

    <LayoutPresetZonesDialog
      v-model="dlgOpen"
      v-model:selected-ids="presetCanvasSelIds"
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
import MultiElementBatchProps from "@/components/report-template/MultiElementBatchProps.vue";
import TableCellFillPicker from "@/components/report-template/TableCellFillPicker.vue";
import type { LayoutPreset } from "@/lib/report-template/layout-model";
import {
  DEFAULT_BODY_BACKGROUND_CSS,
  defaultBlankLayoutSnapshot,
  hydrateLayoutPreset,
} from "@/lib/report-template/layout-model";
import type { LayoutControlType, LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import { hideBordersOnLayoutPresetBands } from "@/lib/report-template/show-border";
import {
  copyLayoutZoneElementToClipboard,
  copyLayoutZoneElementsToClipboard,
  eventTargetIsTypingField,
  findLayoutElementZone,
  hasLayoutElementClipboard,
  pasteLayoutZoneElementsIntoPreset,
} from "@/lib/report-template/editor-element-clipboard";
import { countTypesById, primaryId, selectOnly } from "@/lib/report-template/selection-set";
import {
  canAlign,
  canDistribute,
  computeAlignPatches,
  computeDistributePatches,
} from "@/lib/report-template/selection-align";
import type { AlignKind, DistributeKind } from "@/lib/report-template/selection-align";
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
import { collectFontFamiliesFromLayoutElements } from "@/lib/report-template/font-families-collect";
import {
  checkFontFamiliesSync,
  formatFontPreflightWarnings,
} from "@/lib/report-template/font-availability";
import { appConfirm } from "@/composables/useAppConfirm";
import { auditLog } from "@/lib/auditLog";
import { summarizeDeleteLayouts } from "@/lib/auditLabels";
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
const presetCanvasSelIds = ref<string[]>([]);
const presetCanvasSelId = computed({
  get: () => primaryId(presetCanvasSelIds.value),
  set: (v: string | null) => {
    presetCanvasSelIds.value = v ? selectOnly(v) : [];
  },
});

const ZONE_LABEL: Record<string, string> = {
  header: "页眉",
  body: "正文",
  footer: "页脚",
};

function findLayoutElementById(id: string): LayoutZoneElement | null {
  const w = working.value;
  if (!w || !id) return null;
  return (
    w.headerElements.find((x) => x.id === id) ||
    w.footerElements.find((x) => x.id === id) ||
    w.bodyElements.find((x) => x.id === id) ||
    null
  );
}

function gatherSelectedLayoutElements(): Array<{ el: LayoutZoneElement; zone: "header" | "body" | "footer" }> {
  const w = working.value;
  if (!w) return [];
  const out: Array<{ el: LayoutZoneElement; zone: "header" | "body" | "footer" }> = [];
  for (const id of presetCanvasSelIds.value) {
    const el = findLayoutElementById(id);
    if (!el) continue;
    const zone = findLayoutElementZone(w, id);
    if (!zone) continue;
    out.push({ el, zone });
  }
  return out;
}

const hasLayoutSelection = computed(() => gatherSelectedLayoutElements().length > 0);

const selectedPresetEl = computed(() => {
  if (presetCanvasSelIds.value.length !== 1) return null;
  return findLayoutElementById(presetCanvasSelId.value || "");
});

const multiLayoutSummary = computed(() => {
  const w = working.value;
  if (!w || presetCanvasSelIds.value.length <= 1) return null;
  const items = [];
  for (const id of presetCanvasSelIds.value) {
    const el = findLayoutElementById(id);
    const zone = findLayoutElementZone(w, id);
    if (!el || !zone) return null;
    items.push({ id, el, zoneLabel: ZONE_LABEL[zone] || zone });
  }
  return items.length > 1 ? items : null;
});

const multiLayoutTypeCounts = computed(() => {
  const items = multiLayoutSummary.value;
  if (!items) return {};
  return countTypesById(
    items.map((x) => x.el),
    presetCanvasSelIds.value,
  );
});

function focusLayoutItem(id: string) {
  presetCanvasSelIds.value = selectOnly(id);
}

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

function removeSelectedPresetEl() {
  const w = working.value;
  const ids = new Set(presetCanvasSelIds.value);
  if (!w || ids.size === 0) return;
  for (const arr of [w.headerElements, w.footerElements, w.bodyElements]) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (ids.has(arr[i].id)) arr.splice(i, 1);
    }
  }
  presetCanvasSelIds.value = [];
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
  const items = gatherSelectedLayoutElements();
  if (!w || !items.length) return;
  if (items.length === 1) {
    copyLayoutZoneElementToClipboard(items[0]!.el, items[0]!.zone);
  } else {
    copyLayoutZoneElementsToClipboard(items.map((x) => ({ el: x.el, zone: x.zone })));
  }
  bumpClipboardUi();
  msg.value = items.length > 1 ? `已复制 ${items.length} 个控件（含属性配置）。` : "已复制控件（含属性配置）。";
}

function cutSelectedPresetEl() {
  const w = working.value;
  const items = gatherSelectedLayoutElements();
  if (!w || !items.length) return;
  if (items.length === 1) {
    copyLayoutZoneElementToClipboard(items[0]!.el, items[0]!.zone);
  } else {
    copyLayoutZoneElementsToClipboard(items.map((x) => ({ el: x.el, zone: x.zone })));
  }
  bumpClipboardUi();
  removeSelectedPresetEl();
  msg.value = items.length > 1 ? `已剪切 ${items.length} 个控件。` : "已剪切控件。";
}

function pastePresetEl() {
  const w = working.value;
  if (!w || !hasLayoutElementClipboard()) return;
  const preferred = presetCanvasSelId.value ? findLayoutElementZone(w, presetCanvasSelId.value) : null;
  const newIds = pasteLayoutZoneElementsIntoPreset(w, preferred);
  bumpClipboardUi();
  if (!newIds.length) return;
  presetCanvasSelIds.value = newIds;
  msg.value =
    newIds.length > 1 ? `已粘贴 ${newIds.length} 个控件（属性已保留）。` : "已粘贴控件（属性已保留）。";
}

const canAlignLayout = computed(() => canAlign(presetCanvasSelIds.value.length));
const canDistributeLayout = computed(() => canDistribute(presetCanvasSelIds.value.length));

function gatherSelectedAlignBoxes() {
  const out: { id: string; x: number; y: number; w: number; h: number }[] = [];
  for (const id of presetCanvasSelIds.value) {
    const el = findLayoutElementById(id);
    if (!el) continue;
    out.push({
      id: el.id,
      x: Number(el.x) || 0,
      y: Number(el.y) || 0,
      w: Number(el.w) || 0,
      h: Number(el.h) || 0,
    });
  }
  return out;
}

function applyPosPatchesToLayout(patches: { id: string; x: number; y: number }[]) {
  let n = 0;
  for (const p of patches) {
    const el = findLayoutElementById(p.id);
    if (!el) continue;
    el.x = p.x;
    el.y = p.y;
    n += 1;
  }
  return n;
}

function alignLayout(kind: AlignKind) {
  const boxes = gatherSelectedAlignBoxes();
  const patches = computeAlignPatches(boxes, kind, primaryId(presetCanvasSelIds.value));
  const n = applyPosPatchesToLayout(patches);
  msg.value = n ? `已对齐 ${n} 个控件。` : "无需移动（已对齐或选中不足）。";
}

function distributeLayout(kind: DistributeKind) {
  const boxes = gatherSelectedAlignBoxes();
  const patches = computeDistributePatches(boxes, kind);
  const n = applyPosPatchesToLayout(patches);
  msg.value = n ? `已等距分布（调整 ${n} 个）。` : "无需移动（选中不足 3 个或已等距）。";
}

function hideBordersOnPresetPage() {
  const w = working.value;
  if (!w) return;
  const n = hideBordersOnLayoutPresetBands({
    headerElements: w.headerElements,
    bodyElements: w.bodyElements,
    footerElements: w.footerElements,
  });
  msg.value =
    n > 0 ? `已隐藏 ${n} 个控件的预览/导出外框（表格未改，可撤销）。` : "本页没有可隐藏的控件外框。";
}

const mmFields = [
  { k: "marginTopMm" as const, lab: "上边距" },
  { k: "marginRightMm" as const, lab: "右边距" },
  { k: "marginBottomMm" as const, lab: "下边距" },
  { k: "marginLeftMm" as const, lab: "左边距" },
  { k: "headerBandMm" as const, lab: "页眉带高度" },
  { k: "footerBandMm" as const, lab: "页脚带高度" },
];

const bodyBgPresets = [
  { value: "transparent", label: "透明（纸白）" },
  { value: "#ffffff", label: "纯白" },
  { value: DEFAULT_BODY_BACKGROUND_CSS, label: "默认浅灰" },
  { value: "#fafafa", label: "近白" },
  { value: "#f4f4f5", label: "锌灰" },
  { value: "#eef2ff", label: "淡靛" },
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
    if (presetCanvasSelIds.value.some((id) => !findLayoutElementById(id))) presetCanvasSelIds.value = [];
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
    if (presetCanvasSelIds.value.some((id) => !findLayoutElementById(id))) presetCanvasSelIds.value = [];
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
    presetCanvasSelIds.value = [];
    resetPresetHistoryFromWorking(working.value);
    void bindingPreview.refresh({ silent: true, mutateTemplateRows: false });
    await nextTick();
    applyFocusFromRouteQuery();
  } catch (e) {
    if (isLoadStale(token)) return;
    loadErr.value = "加载失败：" + String((e as Error).message || e);
    working.value = null;
    resetPresetHistoryFromWorking(null);
  }
}

/** 仪表盘健康问题 ?focus= 跳转后自动选中版式控件 */
function applyFocusFromRouteQuery() {
  const focus = String(route.query.focus || "").trim();
  if (!focus || !working.value) return;
  const hit = findLayoutElementZone(working.value, focus);
  if (!hit) {
    msg.value = `健康告警指定的控件 ID「${focus}」在当前版式中未找到。`;
    return;
  }
  presetCanvasSelId.value = focus;
  msg.value = `已从健康告警定位并选中控件（ID ${focus}）。`;
}

watch(
  () => route.query.focus,
  () => {
    applyFocusFromRouteQuery();
  },
);

async function savePreset() {
  const w = working.value;
  if (!w?.name.trim()) {
    msg.value = "名称不能为空。";
    return false;
  }
  const fontWarns = formatFontPreflightWarnings(
    checkFontFamiliesSync(
      collectFontFamiliesFromLayoutElements([
        ...w.headerElements,
        ...w.footerElements,
        ...w.bodyElements,
      ]),
    ),
  );
  if (fontWarns.length) {
    const ok = await appConfirm({
      title: "字体检查",
      message: `${fontWarns.join("\n")}\n\n仍要保存版式吗？`,
      confirmText: "仍要保存",
      cancelText: "返回修改",
    });
    if (!ok) return false;
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
    presetCanvasSelIds.value = [];
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
    void auditLog({
      action: "layout.delete",
      result: "ok",
      summary: summarizeDeleteLayouts([w.name || "未命名"]),
      object_type: "layout",
      object_id: w.id,
      detail: { name: w.name || "未命名" },
    });
    skipLeaveGuard.value = true;
    router.replace({ name: "LayoutPresets" });
  } catch (e) {
    msg.value = "删除失败：" + String((e as Error).message || e);
    void auditLog({
      action: "layout.delete",
      result: "fail",
      summary: `删除版式「${w.name || "未命名"}」失败：${String((e as Error).message || e).slice(0, 80)}`,
      object_type: "layout",
      object_id: w.id,
    });
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
    if (!hasLayoutSelection.value) return;
    ev.preventDefault();
    copySelectedPresetEl();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "x") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (!hasLayoutSelection.value) return;
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
  if (ev.key === "Escape") {
    if (presetCanvasSelIds.value.length) {
      ev.preventDefault();
      presetCanvasSelIds.value = [];
    }
    return;
  }
  if (ev.key === "Delete" || ev.key === "Backspace") {
    if (!hasLayoutSelection.value) return;
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
.pe-body-bg {
  grid-column: 1 / -1;
  max-width: 320px;
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
.pe-props-empty {
  margin: 0;
  color: #71717a;
  font-size: 13px;
  line-height: 1.45;
}
.pe-multi-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pe-multi-title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}
.pe-multi-types {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pe-multi-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(238 242 255);
  color: #4338ca;
  font-weight: 600;
}
.pe-multi-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 40vh;
  overflow: auto;
}
.pe-multi-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
}
.pe-multi-item-type {
  font-weight: 600;
  color: #3f3f46;
}
.pe-multi-item-id {
  color: #71717a;
  word-break: break-all;
}
.pe-multi-note {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  line-height: 1.45;
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
