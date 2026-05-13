<template>
  <div v-if="working" class="page lpe">
    <header class="bar">
      <button type="button" class="link" @click="back">← 版式列表</button>
      <span class="bar-title">{{ working.name }}</span>
      <span class="muted-inline">{{ dimLabel }}</span>
    </header>

    <p v-if="msg" class="msg">{{ msg }}</p>

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
      <strong>画布</strong>与「模版管理」一致：页眉带、正文区、页脚带同屏；
      <strong>Ctrl / ⌘ + 滚轮</strong>缩放。
    </p>
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
    <div class="foot-actions">
      <button type="button" class="b primary" :disabled="saving" @click="savePreset">保存版式</button>
      <button type="button" class="b danger-outline" @click="removePreset">删除版式</button>
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
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import LayoutPresetZonesDialog from "@/components/report-template/LayoutPresetZonesDialog.vue";
import LayoutPresetPaperCanvas from "@/components/report-template/LayoutPresetPaperCanvas.vue";
import LayoutPresetElementProps from "@/components/report-template/LayoutPresetElementProps.vue";
import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { hydrateLayoutPreset } from "@/lib/report-template/layout-model";
import type { LayoutControlType } from "@/lib/report-template/layout-zone-element";
import { PAPER_LABEL, type PaperKind } from "@/lib/report-template/paper";
import {
  deleteLayoutPresetFlexible,
  refreshLayoutPresets,
  saveLayoutPresetFlexible,
} from "@/lib/report-template/layout-registry";

const pkList = ["A5", "A4", "A3", "Letter"] as PaperKind[];

const route = useRoute();
const router = useRouter();

const presetId = computed(() =>
  typeof route.params.id === "string" ? route.params.id : Array.isArray(route.params.id) ? route.params.id[0] ?? "" : "",
);

const msg = ref("");
const saving = ref(false);
const working = ref<LayoutPreset | null>(null);
const loadErr = ref("");
const dlgOpen = ref(false);
const presetCanvasSelId = ref<string | null>(null);

const presetToolLabels: Record<LayoutControlType, string> = {
  text: "文本",
  box: "色块",
  image: "图片",
  pageNumber: "页码",
  date: "日期",
};
const presetToolTypes: LayoutControlType[] = ["text", "box", "image", "pageNumber", "date"];

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

async function loadWorking() {
  loadErr.value = "";
  msg.value = "";
  const id = presetId.value;
  if (!id) {
    loadErr.value = "缺少版式 ID。";
    working.value = null;
    return;
  }
  try {
    const list = await refreshLayoutPresets();
    const raw = list.find((x) => x.id === id);
    if (!raw) {
      loadErr.value = "未找到该版式（可能已删除）。";
      working.value = null;
      return;
    }
    working.value = clonePreset(raw);
    presetCanvasSelId.value = null;
  } catch (e) {
    loadErr.value = "加载失败：" + String((e as Error).message || e);
    working.value = null;
  }
}

function back() {
  router.push({ name: "LayoutPresets" });
}

async function savePreset() {
  const w = working.value;
  if (!w?.name.trim()) {
    msg.value = "名称不能为空。";
    return;
  }
  saving.value = true;
  msg.value = "";
  try {
    w.updatedAt = new Date().toISOString();
    await saveLayoutPresetFlexible(w);
    await loadWorking();
    msg.value = "版式已保存。";
  } catch (e) {
    msg.value = "保存失败：" + String((e as Error).message || e);
  } finally {
    saving.value = false;
  }
}

async function removePreset() {
  const w = working.value;
  if (!w) return;
  if (!confirm("删除此版式？引用它的模版会失去关联 ID，请先确认模版侧已调整。")) return;
  msg.value = "";
  try {
    await deleteLayoutPresetFlexible(w.id);
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

onMounted(() => {
  void loadWorking();
});
</script>

<style scoped>
.lpe {
  padding: 0 4px;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 52px);
  box-sizing: border-box;
}
.lpe-fail {
  padding: 24px;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e4e4e7;
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
  margin: 0 0 10px;
}
.msg {
  font-size: 12px;
  color: #b45309;
  margin: 6px 0;
}
.pe-cols {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr) 248px;
  gap: 0;
  flex: 1;
  min-height: 480px;
  margin-bottom: 12px;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
@media (max-width: 1100px) {
  .pe-cols {
    grid-template-columns: 1fr;
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
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
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
}
.pe-right {
  padding: 10px;
  border-left: 1px solid #e4e4e7;
  background: #fafafa;
  overflow: auto;
  font-size: 13px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.btn-ghost {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px dashed #d4d4d8;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}
.foot-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.b {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
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
