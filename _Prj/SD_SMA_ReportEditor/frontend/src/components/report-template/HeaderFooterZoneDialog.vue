<template>
  <div v-if="modelValue" class="hz-overlay" @click.self="close">
    <div class="hz-modal">
      <input
        ref="hzImgFileRef"
        type="file"
        accept="image/*,.svg"
        class="hz-sr-file"
        aria-hidden="true"
        tabindex="-1"
        @change="hzApplyImagePick"
      />
      <h3 class="hz-title">{{ zone === "header" ? "编辑页眉" : "编辑页脚" }} · {{ sheetLabel }}</h3>
      <div class="hz-tools">
        <span class="hz-tools-label">拖拽到灰区：</span>
        <button
          v-for="t in toolTypes"
          :key="t"
          type="button"
          class="hz-tool"
          draggable="true"
          @dragstart="(e) => onToolDragStart(e, t)"
        >
          {{ toolLabels[t] }}
        </button>
      </div>
      <div class="hz-stage-scroll">
        <div
          class="hz-stage"
          :style="stageStyle"
          @pointerdown="onStagePointerDown"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <div ref="layerRef" class="hz-layer" :style="{ width: bandW + 'px', height: bandH + 'px' }">
          <template v-for="el in elements" :key="el.id">
            <div
              class="hz-node"
              :class="{ selected: selId === el.id }"
              :style="nodeStyle(el)"
              @pointerdown.stop="startMove($event, el)"
            >
              <template v-if="el.type === 'image'">
                <div
                  class="hz-img-layer"
                  title="可从资源管理器拖入图片"
                  @dragover.prevent
                  @drop.prevent.stop="hzDropImage($event, el)"
                >
                  <ZoneImageCompose
                    :image-src="el.imageSrc"
                    :caption-text="el.text"
                    :caption-position="el.imageCaptionPosition"
                    :align-x="el.alignX"
                    :align-y="el.alignY"
                    :rotation-deg="el.imageRotationDeg"
                    :font-size="el.fontSize"
                    :font-family="el.fontFamily"
                    :color="el.color"
                    @replace-image="hzBeginImagePick(el)"
                  >
                    <template #placeholder>
                      <span
                        role="button"
                        tabindex="0"
                        class="hz-ph hz-ph-upload"
                        title="点击从本机选择（或拖入）"
                        @pointerdown.stop
                        @click.prevent.stop="hzBeginImagePick(el)"
                        @keyup.enter.prevent="hzBeginImagePick(el)"
                        @keyup.space.prevent="hzBeginImagePick(el)"
                      >
                        图片
                      </span>
                    </template>
                  </ZoneImageCompose>
                </div>
              </template>
              <template v-else>
                <LayoutZoneInlineContent :el="el" />
              </template>
              <template v-if="selId === el.id">
                <button
                  v-for="pos in HANDLES"
                  :key="pos"
                  type="button"
                  class="hz-handle"
                  :class="'hz-handle-' + pos"
                  tabindex="-1"
                  aria-label="缩放手柄"
                  @pointerdown.stop="startResize($event, el, pos)"
                />
              </template>
            </div>
          </template>
        </div>
      </div>
      </div>
      <details v-if="sel" class="hz-props" open>
        <summary>属性</summary>
        <div class="hz-props-inner">
          <label v-if="sel.type === 'text' || sel.type === 'box'"
            >文字<input v-model.trim="sel.text" class="hz-inp" />
          </label>
          <BoxZoneColorPicker v-if="sel.type === 'box'" class="hz-span2" :el="sel" />
          <template v-if="sel.type === 'date'">
            <label class="hz-span2"
              >日期格式
              <select
                class="hz-inp"
                :value="hzDateFormatSelectValue"
                @change="onHzDateFormatPreset($event)"
              >
                <option v-for="p in DATE_FORMAT_PRESETS" :key="p.value" :value="p.value">
                  {{ p.label }}
                </option>
                <option value="__custom__">自定义…</option>
              </select>
            </label>
            <label v-if="hzDateFormatIsCustom" class="hz-span2"
              >自定义 pattern<br /><input
                v-model.trim="sel.dateFormat"
                class="hz-inp"
                spellcheck="false"
                placeholder="如 yyyy-MM-dd / yyyy年MM月dd日 / 含 HH:mm"
            /></label>
          </template>
          <template v-if="sel.type === 'image'">
            <label class="hz-span2">配文<br /><textarea v-model="sel.text" rows="2" class="hz-inp" /></label>
            <label class="hz-span2"
              >配文位置<select v-model="sel.imageCaptionPosition" class="hz-inp">
                <option value="none">无配文</option>
                <option value="top">图上方</option>
                <option value="bottom">图下方</option>
                <option value="left">图左侧</option>
                <option value="right">图右侧</option>
              </select></label
            >
            <label>水平位置<select v-model="sel.alignX" class="hz-inp">
              <option value="start">左</option>
              <option value="center">中</option>
              <option value="end">右</option>
            </select></label>
            <label>垂直位置<select v-model="sel.alignY" class="hz-inp">
              <option value="start">上</option>
              <option value="center">中</option>
              <option value="end">下</option>
            </select></label>
            <label class="hz-span2"
              >旋转（°）<input
                v-model.number="sel.imageRotationDeg"
                type="number"
                min="-360"
                max="360"
                class="hz-inp"
            /></label>
            <label class="hz-span2"
              >图片来源 URL / data<input v-model.trim="sel.imageSrc" class="hz-inp"
            /></label>
            <button type="button" class="btn hz-img-pick-btn" @click="hzPickFromPanel(sel)">
              从本机选取图片…
            </button>
            <span class="hz-img-hint">本地图片转为 data URL 随模板保存。</span>
          </template>
          <template v-if="sel.type !== 'image'">
            <label>水平位置<select v-model="sel.alignX" class="hz-inp">
              <option value="start">左</option>
              <option value="center">中</option>
              <option value="end">右</option>
            </select></label>
            <label>垂直位置<select v-model="sel.alignY" class="hz-inp">
              <option value="start">上</option>
              <option value="center">中</option>
              <option value="end">下</option>
            </select></label>
            <div v-if="sel.type === 'text' || sel.type === 'box' || sel.type === 'date'" class="hz-span2 hz-wrap-row">
              <span class="hz-wrap-title">换行</span>
              <div class="hz-seg" role="group" aria-label="文本换行方式">
                <button
                  type="button"
                  class="hz-seg-btn"
                  :class="{ 'hz-seg-on': !sel.textAutoWrap }"
                  :aria-pressed="!sel.textAutoWrap"
                  @click="sel.textAutoWrap = false"
                >
                  单行
                </button>
                <button
                  type="button"
                  class="hz-seg-btn"
                  :class="{ 'hz-seg-on': sel.textAutoWrap }"
                  :aria-pressed="sel.textAutoWrap"
                  @click="sel.textAutoWrap = true"
                >
                  自动
                </button>
              </div>
              <p class="hz-wrap-hint">「自动」表示在框宽内换行，无空格长串也会断行。</p>
            </div>
          </template>
          <template v-if="sel.type === 'pageNumber'">
            <label class="hz-span2">形式</label>
            <select v-model="sel.pageNumberMode" class="hz-inp hz-span2">
              <option value="plain">仅数字</option>
              <option value="slashTotal">当前页/总页数</option>
              <option value="cnPage">第N页</option>
              <option value="circle">圆形框</option>
            </select>
          </template>
          <label class="hz-span2"
            >叠放顺序（越大越靠前）<input
              v-model.number="sel.zIndex"
              type="number"
              min="0"
              max="10000"
              step="1"
              class="hz-inp"
          /></label>
          <LayoutFontFamilyField v-model="sel.fontFamily" />
          <label>字号<input v-model.number="sel.fontSize" type="number" min="8" max="72" class="hz-inp" /></label>
          <label>X<input v-model.number="sel.x" type="number" class="hz-inp" /></label>
          <label>Y<input v-model.number="sel.y" type="number" class="hz-inp" /></label>
          <label>W<input v-model.number="sel.w" type="number" class="hz-inp" /></label>
          <label>H<input v-model.number="sel.h" type="number" class="hz-inp" /></label>
          <button type="button" class="btn btn-danger-outline" @click="removeSel">删除选中</button>
        </div>
      </details>
      <div class="hz-actions">
        <button type="button" class="btn" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  clampZoneElement,
  makeLayoutZoneElement,
  DATE_FORMAT_PRESETS,
  flexJustifyAlignForAxes,
  getZoneTextWrapStyle,
  normalizePageNumberMode,
  normalizeZIndex,
  type LayoutControlType,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";
import { metricsForSheet, type EditorSheet } from "@/lib/report-template/editor-sheet";
import type { ReportTemplate } from "@/lib/report-template/model";
import { readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import ZoneImageCompose from "@/components/report-template/ZoneImageCompose.vue";
import LayoutFontFamilyField from "@/components/report-template/LayoutFontFamilyField.vue";
import LayoutZoneInlineContent from "@/components/report-template/LayoutZoneInlineContent.vue";
import BoxZoneColorPicker from "@/components/report-template/BoxZoneColorPicker.vue";
import { computed, nextTick, ref } from "vue";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

type Handle = (typeof HANDLES)[number];

const props = defineProps<{
  modelValue: boolean;
  tmpl: ReportTemplate;
  sheet: EditorSheet;
  zone: "header" | "footer";
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
}>();

const selId = ref<string | null>(null);
const layerRef = ref<HTMLElement | null>(null);
const hzImgFileRef = ref<HTMLInputElement | null>(null);
let pendingHzImgEl: LayoutZoneElement | null = null;

let dragMove: {
  sid: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
} | null = null;
let dragResize:
  | {
      sid: string;
      h: Handle;
      startX: number;
      startY: number;
      ix: number;
      iy: number;
      iw: number;
      ih: number;
    }
  | null = null;

const me = computed(() => metricsForSheet(props.tmpl, props.sheet));

const bandW = computed(() => Math.max(40, me.value.pageW - me.value.ml - me.value.mr));
const bandH = computed(() => (props.zone === "header" ? me.value.hb : me.value.fb));

const sheetLabel = computed(() =>
  props.sheet === "body" ? "正文页" : props.sheet === "cover" ? "封面" : "末页",
);

const stageStyle = computed(() => ({
  width: `${bandW.value}px`,
  height: `${Math.max(props.zone === "header" ? me.value.hb : me.value.fb, 24)}px`,
  overflow: "hidden",
  border: "1px solid #cbd5e1",
  background: "linear-gradient(#f8fafc, #f4f4f5)",
  touchAction: "none",
}));

const elements = computed(() => {
  if (props.sheet === "cover") {
    return props.zone === "header" ? props.tmpl.coverHeaderElements : props.tmpl.coverFooterElements;
  }
  if (props.sheet === "back") {
    return props.zone === "header" ? props.tmpl.backHeaderElements : props.tmpl.backFooterElements;
  }
  return props.zone === "header" ? props.tmpl.headerElements : props.tmpl.footerElements;
});

const sel = computed(() =>
  selId.value ? elements.value.find((x) => x.id === selId.value) ?? null : null,
);

const hzDateFormatSelectValue = computed(() => {
  const s = sel.value;
  if (!s || s.type !== "date") return "yyyy-MM-dd";
  const t = (s.dateFormat || "").trim();
  const hit = DATE_FORMAT_PRESETS.find((p) => p.value === t);
  return hit ? hit.value : "__custom__";
});

const hzDateFormatIsCustom = computed(() => hzDateFormatSelectValue.value === "__custom__");

function onHzDateFormatPreset(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const s = sel.value;
  if (!s || s.type !== "date" || v === "__custom__") return;
  s.dateFormat = v;
}

function nodeStyle(el: LayoutZoneElement) {
  const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
  const flex = flexJustifyAlignForAxes(el.alignX, el.alignY);
  const wrap = getZoneTextWrapStyle(el);
  const base: Record<string, string> = {
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    color: el.color,
    fontSize: `${el.fontSize}px`,
    ...(ff ? { fontFamily: ff } : {}),
    display: "flex",
    justifyContent: flex.justifyContent,
    alignItems: flex.alignItems,
    zIndex: String(normalizeZIndex(el.zIndex)),
    ...(wrap ?? { whiteSpace: "nowrap" }),
  };
  if (el.type === "pageNumber" && normalizePageNumberMode(el.pageNumberMode) === "circle") {
    return { ...base, padding: "2px" };
  }
  return base;
}

function onStagePointerDown() {
  selId.value = null;
}

const toolLabels: Record<LayoutControlType, string> = {
  text: "文本",
  box: "色块",
  image: "图片",
  pageNumber: "页码",
  date: "日期",
};

const toolTypes: LayoutControlType[] = ["text", "box", "image", "pageNumber", "date"];

function onToolDragStart(e: DragEvent, t: LayoutControlType) {
  e.dataTransfer?.setData("application/x-zone-tool", t);
  e.dataTransfer?.setData("text/plain", t);
}

function onDrop(e: DragEvent) {
  const t = e.dataTransfer?.getData("application/x-zone-tool") || e.dataTransfer?.getData("text/plain");
  if (!isControl(t)) return;
  const lay = layerRef.value;
  if (!lay) return;
  const r = lay.getBoundingClientRect();
  const x = Math.round(e.clientX - r.left - 16);
  const y = Math.round(e.clientY - r.top - 12);
  const el = makeLayoutZoneElement(t);
  el.x = Math.max(0, x);
  el.y = Math.max(0, y);
  clampZoneElement(el, bandW.value, bandH.value);
  elements.value.push(el);
  selId.value = el.id;
}

function isControl(t: string): t is LayoutControlType {
  return t === "text" || t === "box" || t === "image" || t === "pageNumber" || t === "date";
}

function startMove(ev: PointerEvent, el: LayoutZoneElement) {
  selId.value = el.id;
  dragMove = { sid: el.id, sx: ev.clientX, sy: ev.clientY, ox: el.x, oy: el.y };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endMove, { once: true });
}

function onMove(ev: PointerEvent) {
  if (dragMove) {
    const el = elements.value.find((x) => x.id === dragMove!.sid);
    if (!el) return;
    el.x = Math.max(0, dragMove.ox + (ev.clientX - dragMove.sx));
    el.y = Math.max(0, dragMove.oy + (ev.clientY - dragMove.sy));
    clampZoneElement(el, bandW.value, bandH.value);
    return;
  }
  if (dragResize) {
    const el = elements.value.find((x) => x.id === dragResize!.sid);
    if (!el) return;
    const { h } = dragResize;
    const dx = ev.clientX - dragResize.startX;
    const dy = ev.clientY - dragResize.startY;
    let x = dragResize.ix;
    let y = dragResize.iy;
    let w = dragResize.iw;
    let hh = dragResize.ih;
    if (h.includes("e")) w = Math.max(16, dragResize.iw + dx);
    if (h.includes("s")) hh = Math.max(16, dragResize.ih + dy);
    if (h.includes("w")) {
      const nw = Math.max(16, dragResize.iw - dx);
      x = dragResize.ix + (dragResize.iw - nw);
      w = nw;
    }
    if (h.includes("n")) {
      const nh = Math.max(16, dragResize.ih - dy);
      y = dragResize.iy + (dragResize.ih - nh);
      hh = nh;
    }
    if (ev.shiftKey && (h === "se" || h === "nw" || h === "ne" || h === "sw")) {
      const s = Math.max(w, hh);
      w = s;
      hh = s;
    }
    el.x = x;
    el.y = y;
    el.w = w;
    el.h = hh;
    clampZoneElement(el, bandW.value, bandH.value);
  }
}

function endMove() {
  dragMove = null;
  dragResize = null;
  window.removeEventListener("pointermove", onMove);
}

function startResize(ev: PointerEvent, el: LayoutZoneElement, h: Handle) {
  selId.value = el.id;
  dragResize = {
    sid: el.id,
    h,
    startX: ev.clientX,
    startY: ev.clientY,
    ix: el.x,
    iy: el.y,
    iw: el.w,
    ih: el.h,
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endMove, { once: true });
}

function removeSel() {
  if (!selId.value) return;
  const id = selId.value;
  const idx = elements.value.findIndex((x) => x.id === id);
  if (idx >= 0) elements.value.splice(idx, 1);
  selId.value = null;
}

function close() {
  emit("update:modelValue", false);
}

function hzBeginImagePick(el: LayoutZoneElement) {
  if (el.type !== "image") return;
  selId.value = el.id;
  pendingHzImgEl = el;
  void nextTick(() => hzImgFileRef.value?.click());
}

function hzPickFromPanel(el: LayoutZoneElement | null) {
  if (!el || el.type !== "image") return;
  hzBeginImagePick(el);
}

async function hzApplyImagePick(ev: Event) {
  const inp = ev.target as HTMLInputElement;
  const f = inp.files?.[0];
  inp.value = "";
  const tgt = pendingHzImgEl;
  pendingHzImgEl = null;
  await hzAssignImage(tgt, f ?? null);
}

async function hzDropImage(ev: DragEvent, el: LayoutZoneElement) {
  selId.value = el.id;
  await hzAssignImage(el, ev.dataTransfer?.files?.[0] ?? null);
}

async function hzAssignImage(el: LayoutZoneElement | null, f?: File | null) {
  if (!el || el.type !== "image" || !f?.type?.startsWith("image/")) return;
  try {
    el.imageSrc = await readImageFileAsDataUrl(f);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}
</script>

<style scoped>
.hz-overlay {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.5);
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(12px, 3vh, 28px) 12px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.hz-modal {
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px 12px;
  max-width: min(640px, 96vw);
  width: 100%;
  min-width: 0;
  max-height: none;
  overflow-x: hidden;
  box-sizing: border-box;
  position: relative;
  flex: none;
  margin-bottom: 16px;
}
.hz-title {
  margin: 0 0 8px;
  font-size: 1rem;
}
.hz-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}
.hz-tools-label {
  color: #52525b;
}
.hz-tool {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px dashed #a1a1aa;
  background: #fafafa;
  cursor: grab;
  font-size: 12px;
  touch-action: manipulation;
  min-height: 36px;
}
.hz-stage-scroll {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  border-radius: 8px;
  box-sizing: border-box;
}
.hz-layer {
  position: relative;
  box-sizing: border-box;
}
.hz-node {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid transparent;
  background: rgb(255 255 255 / 0.35);
  display: flex;
  padding: 2px 4px;
  overflow: hidden;
  white-space: nowrap;
  touch-action: none;
}
.hz-node.selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1 inset;
  overflow: visible;
  z-index: 6;
}
.hz-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.hz-ph {
  font-size: 10px;
  color: #94a3b8;
}
.hz-ph-upload {
  cursor: pointer;
  border-bottom: 1px dashed currentcolor;
}
.hz-ph-upload:hover {
  color: #475569;
}
.hz-img-layer {
  flex: 1;
  align-self: stretch;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
}
.hz-sr-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.hz-img-pick-btn {
  grid-column: 1 / -1;
}
.hz-img-hint {
  grid-column: 1 / -1;
  font-size: 11px;
  color: #71717a;
  line-height: 1.4;
}
/* 缩放手柄：与版式画布一致，圆点在控件外侧 */
.hz-handle {
  --hz-handle-hit: 44px;
  --hz-handle-out: 9px;
  position: absolute;
  width: var(--hz-handle-hit);
  height: var(--hz-handle-hit);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  opacity: 1;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 3;
}
.hz-handle:focus {
  outline: none;
}
.hz-handle:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
  border-radius: 4px;
}
.hz-handle::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  margin-top: -6px;
  box-sizing: border-box;
  border-radius: 50%;
  background: linear-gradient(145deg, #818cf8 0%, #6366f1 55%, #4f46e5 100%);
  border: 2px solid #fff;
  box-shadow:
    0 1px 3px rgb(15 23 42 / 0.25),
    0 0 0 1px rgb(99 102 241 / 0.35);
  pointer-events: none;
}
.hz-handle:hover::after {
  background: linear-gradient(145deg, #6366f1 0%, #4f46e5 100%);
  box-shadow:
    0 2px 6px rgb(15 23 42 / 0.3),
    0 0 0 1px rgb(79 70 229 / 0.45);
}
.hz-handle-nw {
  top: calc(-1 * var(--hz-handle-out));
  left: calc(-1 * var(--hz-handle-out));
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: nwse-resize;
}
.hz-handle-ne {
  top: calc(-1 * var(--hz-handle-out));
  right: calc(-1 * var(--hz-handle-out));
  margin-right: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: nesw-resize;
}
.hz-handle-se {
  bottom: calc(-1 * var(--hz-handle-out));
  right: calc(-1 * var(--hz-handle-out));
  margin-right: calc(-0.5 * var(--hz-handle-hit));
  margin-bottom: calc(-0.5 * var(--hz-handle-hit));
  cursor: nwse-resize;
}
.hz-handle-sw {
  bottom: calc(-1 * var(--hz-handle-out));
  left: calc(-1 * var(--hz-handle-out));
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-bottom: calc(-0.5 * var(--hz-handle-hit));
  cursor: nesw-resize;
}
.hz-handle-n {
  top: calc(-1 * var(--hz-handle-out));
  left: 50%;
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: ns-resize;
}
.hz-handle-s {
  bottom: calc(-1 * var(--hz-handle-out));
  left: 50%;
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-bottom: calc(-0.5 * var(--hz-handle-hit));
  cursor: ns-resize;
}
.hz-handle-e {
  right: calc(-1 * var(--hz-handle-out));
  top: 50%;
  margin-right: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: ew-resize;
}
.hz-handle-w {
  left: calc(-1 * var(--hz-handle-out));
  top: 50%;
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: ew-resize;
}
.hz-props {
  margin-top: 10px;
}
.hz-props-inner {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
}
.hz-span2 {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hz-wrap-row {
  gap: 6px;
}
.hz-wrap-title {
  font-size: 12px;
  color: #52525b;
}
.hz-seg {
  display: inline-flex;
  align-self: flex-start;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  overflow: hidden;
  background: #fafafa;
}
.hz-seg-btn {
  margin: 0;
  padding: 6px 14px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  line-height: 1.2;
}
.hz-seg-btn + .hz-seg-btn {
  box-shadow: inset 1px 0 0 #e4e4e7;
}
.hz-seg-btn:hover:not(.hz-seg-on) {
  background: rgb(244 244 245 / 0.85);
  color: #18181b;
}
.hz-seg-on {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.hz-wrap-hint {
  margin: 0;
  font-size: 11px;
  color: #a1a1aa;
  line-height: 1.35;
}

.hz-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}
.hz-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fafafa;
  cursor: pointer;
  font-size: 13px;
}
.btn-danger-outline {
  border-color: rgb(239 68 68);
  color: rgb(185 28 28);
  background: #fff;
}
</style>
