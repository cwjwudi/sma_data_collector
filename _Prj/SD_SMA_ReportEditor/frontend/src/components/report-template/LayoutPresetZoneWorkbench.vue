<template>
  <div class="lpw-root">
    <h3 class="lpw-title">{{ zoneTitle }} · 版式「{{ preset.name }}」</h3>
    <div class="lpw-tools">
      <span class="lpw-tools-label">拖拽到灰区：</span>
      <button
        v-for="t in toolTypes"
        :key="t"
        type="button"
        class="lpw-tool"
        draggable="true"
        @dragstart="(e) => onToolDragStart(e, t)"
      >
        {{ toolLabels[t] }}
      </button>
    </div>
    <div
      class="lpw-stage"
      :class="{ 'lpw-dragover': dragOverStage }"
      :style="stageStyle"
      @pointerdown="onStagePointerDown"
      @dragenter.prevent="dragOverStage = true"
      @dragleave="onDragLeaveStage"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div ref="layerRef" class="lpw-layer" :style="{ width: bandW + 'px', height: bandH + 'px' }">
        <template v-for="el in elements" :key="el.id">
          <div
            class="lpw-node"
            :class="{ selected: selId === el.id }"
            :style="nodeStyle(el)"
            @pointerdown.stop="startMove($event, el)"
          >
            <template v-if="el.type === 'image'">
              <img v-if="el.imageSrc" class="lpw-img" :src="el.imageSrc" alt="" />
              <span v-else class="lpw-ph">图片</span>
            </template>
            <template v-else>{{ zonePreview(el) }}</template>
            <template v-if="selId === el.id">
              <button
                v-for="pos in HANDLES"
                :key="pos"
                type="button"
                class="lpw-handle"
                :class="'lpw-handle-' + pos"
                tabindex="-1"
                aria-label="缩放手柄"
                @pointerdown.stop="startResize($event, el, pos)"
              />
            </template>
          </div>
        </template>
      </div>
    </div>
    <details v-if="sel" class="lpw-props" open>
      <summary>属性</summary>
      <div class="lpw-props-inner">
        <label v-if="sel.type !== 'pageNumber'">文字<input v-model.trim="sel.text" class="lpw-inp" /></label>
        <label v-if="sel.type === 'date'">日期格式<input v-model.trim="sel.dateFormat" class="lpw-inp" /></label>
        <label v-if="sel.type === 'image'"
          >图片来源 URL / data<input v-model.trim="sel.imageSrc" class="lpw-inp"
        /></label>
        <template v-if="sel.type === 'pageNumber'">
          <label>形式</label>
          <select v-model="sel.pageNumberMode" class="lpw-inp">
            <option value="plain">仅数字</option>
            <option value="slashTotal">当前页/总页数</option>
            <option value="cnPage">第N页</option>
            <option value="circle">圆形框</option>
          </select>
        </template>
        <label>字号<input v-model.number="sel.fontSize" type="number" min="8" max="72" class="lpw-inp" /></label>
        <label>X<input v-model.number="sel.x" type="number" class="lpw-inp" /></label>
        <label>Y<input v-model.number="sel.y" type="number" class="lpw-inp" /></label>
        <label>W<input v-model.number="sel.w" type="number" class="lpw-inp" /></label>
        <label>H<input v-model.number="sel.h" type="number" class="lpw-inp" /></label>
        <button type="button" class="btn btn-danger-outline" @click="removeSel">删除选中</button>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  clampZoneElement,
  makeLayoutZoneElement,
  previewZoneElementDisplay,
  type LayoutControlType,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import { presetToSnapshot, type LayoutPreset } from "@/lib/report-template/layout-model";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

type Handle = (typeof HANDLES)[number];

const props = defineProps<{
  preset: LayoutPreset;
  zone: "header" | "footer" | "body";
}>();

const selId = ref<string | null>(null);
const layerRef = ref<HTMLElement | null>(null);
const dragOverStage = ref(false);

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

const me = computed(() =>
  computePaperLayout(props.preset.paperKind, props.preset.orientation, presetToSnapshot(props.preset)),
);

const bandW = computed(() => Math.max(40, me.value.pageW - me.value.ml - me.value.mr));
const bandH = computed(() => {
  if (props.zone === "header") return Math.max(8, me.value.hb);
  if (props.zone === "footer") return Math.max(8, me.value.fb);
  return Math.max(40, me.value.contentH);
});

const zoneTitle = computed(() =>
  props.zone === "header" ? "页眉区" : props.zone === "footer" ? "页脚区" : "正文区内装饰",
);

const stageStyle = computed(() => ({
  margin: "0 auto",
  width: `${bandW.value}px`,
  height: `${Math.max(bandH.value, 24)}px`,
  overflow: "hidden",
  border: "1px solid #cbd5e1",
  background: "linear-gradient(#f8fafc, #f4f4f5)",
  touchAction: "none",
}));

const elements = computed(() => {
  if (props.zone === "header") return props.preset.headerElements;
  if (props.zone === "footer") return props.preset.footerElements;
  return props.preset.bodyElements;
});

const sel = computed(() =>
  selId.value ? elements.value.find((x) => x.id === selId.value) ?? null : null,
);

function nodeStyle(el: LayoutZoneElement) {
  return {
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    color: el.color,
    fontSize: `${el.fontSize}px`,
  };
}

function zonePreview(el: LayoutZoneElement) {
  return previewZoneElementDisplay(el);
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

function onDragLeaveStage(e: DragEvent) {
  const cur = e.currentTarget as HTMLElement;
  const rt = e.relatedTarget as Node | null;
  if (rt && cur.contains(rt)) return;
  dragOverStage.value = false;
}

function onDrop(e: DragEvent) {
  dragOverStage.value = false;
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
</script>

<style scoped>
.lpw-root {
  max-width: 100%;
}
.lpw-title {
  margin: 0 0 8px;
  font-size: 1rem;
}
.lpw-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}
.lpw-tools-label {
  color: #52525b;
}
.lpw-tool {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px dashed #a1a1aa;
  background: #fafafa;
  cursor: grab;
  font-size: 12px;
  touch-action: manipulation;
  min-height: 36px;
}
.lpw-stage.lpw-dragover {
  outline: 2px dashed #818cf8;
  outline-offset: -1px;
  background: linear-gradient(rgb(238 242 255), rgb(224 231 254));
}
.lpw-layer {
  position: relative;
  box-sizing: border-box;
}
.lpw-node {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid transparent;
  background: rgb(255 255 255 / 0.35);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 2px 4px;
  overflow: hidden;
  white-space: nowrap;
  touch-action: none;
}
.lpw-node.selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1 inset;
}
.lpw-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.lpw-ph {
  font-size: 10px;
  color: #94a3b8;
}
.lpw-handle {
  position: absolute;
  width: 44px;
  height: 44px;
  margin: -22px;
  padding: 0;
  border: none;
  background: radial-gradient(circle, #6366f1 0 28%, transparent 30%);
  opacity: 0.85;
  cursor: nwse-resize;
  touch-action: none;
}
.lpw-handle-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}
.lpw-handle-ne {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}
.lpw-handle-se {
  bottom: 0;
  right: 0;
  cursor: nwse-resize;
}
.lpw-handle-sw {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}
.lpw-handle-n {
  top: 0;
  left: 50%;
  margin-left: -22px;
  cursor: ns-resize;
}
.lpw-handle-s {
  bottom: 0;
  left: 50%;
  margin-left: -22px;
  cursor: ns-resize;
}
.lpw-handle-e {
  right: 0;
  top: 50%;
  margin-top: -22px;
  cursor: ew-resize;
}
.lpw-handle-w {
  left: 0;
  top: 50%;
  margin-top: -22px;
  cursor: ew-resize;
}
.lpw-props {
  margin-top: 10px;
}
.lpw-props-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
}
.lpw-props-inner label {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.lpw-inp {
  flex: 1;
  min-width: 120px;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
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
