<template>
  <div ref="viewportRef" class="cv-viewport" @wheel.prevent="onWheel">
    <div class="cv-scaler" :style="{ transform: `translate(${panX}px,${panY}px) scale(${viewScale})` }">
      <div ref="paperRef" class="cv-paper" :style="paperBoxStyle" @pointerdown.capture="onPaperBlank">
        <div v-if="me.hb > 1" class="cv-band hdr" :style="hdrStyle">
          <span class="cv-hint">{{ headerHint }}</span>
        </div>
        <div class="cv-body surface el-root" :style="bodyStyle" @drop.prevent.stop="onDrop">
          <div
            v-for="el in list"
            :key="el.id"
            class="el-node touch"
            :class="{ sel: selId === el.id }"
            :style="elCss(el)"
            @pointerdown.stop="beginMove($event, el)"
          >
            <div class="el-inner">{{ displayEl(el) }}</div>
            <button
              v-for="hh in HZ"
              :key="hh"
              type="button"
              :class="['hz', 'hz-' + hh]"
              tabindex="-1"
              @pointerdown.stop="beginResize($event, el, hh)"
            />
          </div>
        </div>
        <div v-if="me.fb > 1" class="cv-band ftr" :style="ftrStyle">
          <span class="cv-hint">{{ footerHint }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import { bodyElementsRef, metricsForSheet, type EditorSheet } from "@/lib/report-template/editor-sheet";
import { clampElementToLayout } from "@/lib/report-template/snapshot-fingerprint";
import type { ReportTemplate, TemplateControlType } from "@/lib/report-template/model";
import type { TemplateElement } from "@/lib/report-template/model";
import { makeElement } from "@/lib/report-template/model";
import { computed, onBeforeUnmount, ref } from "vue";

const HZ = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type H = (typeof HZ)[number];

const props = defineProps<{ tmpl: ReportTemplate; sheet: EditorSheet }>();
const selId = defineModel<string | null>("selectedId");

const viewportRef = ref<HTMLElement | null>(null);
const panX = ref(0);
const panY = ref(0);
const viewScale = ref(1);

const me = computed(() => metricsForSheet(props.tmpl, props.sheet));
const list = computed(() => bodyElementsRef(props.tmpl, props.sheet));

function bandBox(m: PaperLayoutMetrics, which: "hdr" | "body" | "ftr"): Record<string, string> {
  if (which === "hdr") {
    return {
      position: "absolute",
      left: `${m.ml}px`,
      top: `${m.mt}px`,
      width: `${m.pageW - m.ml - m.mr}px`,
      height: `${m.hb}px`,
    };
  }
  if (which === "body") {
    return {
      position: "absolute",
      left: `${m.contentLeft}px`,
      top: `${m.contentTop}px`,
      width: `${m.contentW}px`,
      height: `${m.contentH}px`,
    };
  }
  return {
    position: "absolute",
    left: `${m.ml}px`,
    bottom: `${m.mb}px`,
    width: `${m.pageW - m.ml - m.mr}px`,
    height: `${m.fb}px`,
  };
}

const hdrStyle = computed(() => bandBox(me.value, "hdr"));
const bodyStyle = computed(() => bandBox(me.value, "body"));
const ftrStyle = computed(() => bandBox(me.value, "ftr"));

const paperBoxStyle = computed(() => ({
  width: `${me.value.pageW}px`,
  height: `${me.value.pageH}px`,
  background: "#fff",
  border: "1px solid #d4d4d8",
  boxShadow: "0 12px 28px rgb(24 24 27 / 0.1)",
  position: "relative" as const,
}));

function hdrTxt() {
  if (props.sheet === "cover") return props.tmpl.coverHeaderText;
  if (props.sheet === "back") return props.tmpl.backHeaderText;
  return props.tmpl.headerText;
}

function ftrTxt() {
  if (props.sheet === "cover") return props.tmpl.coverFooterText;
  if (props.sheet === "back") return props.tmpl.backFooterText;
  return props.tmpl.footerText;
}

const headerHint = computed(() => hdrTxt() || "(页眉)");
const footerHint = computed(() => ftrTxt() || "(页脚)");

function elCss(el: TemplateElement) {
  const s: Record<string, string> = {
    position: "absolute",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    fontSize: `${el.fontSize}px`,
    color: el.color,
    background: el.bgColor === "transparent" ? "transparent" : el.bgColor,
  };
  if (el.type === "box") s.border = `1px solid ${el.color}40`;
  return s;
}

function displayEl(el: TemplateElement): string {
  switch (el.type) {
    case "text":
    case "box":
      return el.text || "(空)";
    case "table":
      return `[表] ${(el.sqlText || "").trim().slice(0, 50)}`;
    case "chart":
      return `[图·${el.chartKind}]`;
    case "parameter":
      return `[参] ${el.opcuaNodeId || el.text}`;
    case "signature":
      return el.imageSrc ? "[签名]" : el.signerLabel || "签字";
    case "image":
      return el.imageSrc ? "[图像]" : "图片占位";
    default:
      return "";
  }
}

let move: null | {
  sid: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
};
let resize: null | {
  sid: string;
  h: H;
  sx: number;
  sy: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
};

function clamp(el: TemplateElement): void {
  clampElementToLayout(el, me.value.contentW, me.value.contentH);
}

function beginMove(ev: PointerEvent, el: TemplateElement) {
  selId.value = el.id;
  move = { sid: el.id, sx: ev.clientX, sy: ev.clientY, ox: el.x, oy: el.y };
  bindPtr();
}

function beginResize(ev: PointerEvent, el: TemplateElement, h: H) {
  selId.value = el.id;
  resize = { sid: el.id, h, sx: ev.clientX, sy: ev.clientY, ix: el.x, iy: el.y, iw: el.w, ih: el.h };
  bindPtr();
}

function bindPtr() {
  window.addEventListener("pointermove", ptrMove);
  window.addEventListener("pointerup", ptrUp, { once: true });
}

function ptrMove(ev: PointerEvent) {
  const sc = viewScale.value || 1;
  if (move) {
    const el = list.value.find((x) => x.id === move!.sid);
    if (!el) return;
    el.x = Math.round(Math.max(0, move!.ox + (ev.clientX - move!.sx) / sc));
    el.y = Math.round(Math.max(0, move!.oy + (ev.clientY - move!.sy) / sc));
    clamp(el);
    return;
  }
  if (resize) {
    const el = list.value.find((x) => x.id === resize!.sid);
    if (!el) return;
    const dx = (ev.clientX - resize.sx) / sc;
    const dy = (ev.clientY - resize.sy) / sc;
    const { h } = resize;
    let x = resize.ix;
    let y = resize.iy;
    let w = resize.iw;
    let hh = resize.ih;
    if (h.includes("e")) w = Math.max(20, Math.round(resize.iw + dx));
    if (h.includes("s")) hh = Math.max(20, Math.round(resize.ih + dy));
    if (h.includes("w")) {
      const nw = Math.max(20, Math.round(resize.iw - dx));
      x = Math.round(resize.ix + (resize.iw - nw));
      w = nw;
    }
    if (h.includes("n")) {
      const nh = Math.max(20, Math.round(resize.ih - dy));
      y = Math.round(resize.iy + (resize.ih - nh));
      hh = nh;
    }
    if (ev.shiftKey && /nw|ne|sw|se/.test(h)) {
      const s = Math.max(w, hh);
      w = s;
      hh = s;
    }
    Object.assign(el, { x, y, w, h: hh });
    clamp(el);
  }
}

function ptrUp() {
  move = null;
  resize = null;
  window.removeEventListener("pointermove", ptrMove);
}

onBeforeUnmount(ptrUp);

function onPaperBlank(ev: PointerEvent) {
  const t = ev.target as HTMLElement;
  if (t.closest(".el-node")) return;
  if (t.classList.contains("cv-paper") || t.classList.contains("cv-hint")) selId.value = null;
}

function toolType(s: string): TemplateControlType | null {
  const ok = ["text", "box", "image", "table", "chart", "parameter", "signature"];
  return ok.includes(s) ? (s as TemplateControlType) : null;
}

function onDrop(e: DragEvent) {
  const tp = toolType(e.dataTransfer?.getData("application/x-template-tool") || e.dataTransfer?.getData("text/plain") || "");
  if (!tp) return;
  const layer = viewportRef.value?.querySelector(".el-root");
  if (!layer) return;
  const r = layer.getBoundingClientRect();
  const sc = viewScale.value || 1;
  const x = Math.round((e.clientX - r.left) / sc - 20);
  const y = Math.round((e.clientY - r.top) / sc - 16);
  const el = makeElement(tp);
  el.x = Math.max(0, x);
  el.y = Math.max(0, y);
  clamp(el);
  list.value.push(el);
  selId.value = el.id;
}

function onWheel(ev: WheelEvent) {
  if (ev.ctrlKey || ev.metaKey) {
    const z = Math.exp(-ev.deltaY * 0.001);
    viewScale.value = Math.min(2.8, Math.max(0.35, +(viewScale.value * z).toFixed(4)));
    return;
  }
  panX.value -= ev.deltaX * 0.5;
  panY.value -= ev.deltaY * 0.5;
}
</script>

<style scoped>
.cv-viewport {
  overflow: auto;
  background: radial-gradient(rgb(251 251 254), rgb(229 229 237));
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  min-height: 440px;
}
.cv-scaler {
  transform-origin: 0 0;
  padding: 28px;
  display: inline-block;
}
.cv-band {
  position: absolute;
  box-sizing: border-box;
  background: rgb(239 239 246 / 0.55);
  overflow: hidden;
  display: flex;
  align-items: center;
  padding-left: 6px;
}
.cv-body {
  position: absolute;
  box-sizing: border-box;
  background: rgb(250 250 252);
}
.cv-hint {
  font-size: 11px;
  color: #71717a;
}
.el-inner {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
}
.el-node {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding: 4px;
}
.el-node.sel {
  outline: 2px solid #6366f1;
}
.touch {
  touch-action: manipulation;
}
.hz {
  position: absolute;
  width: 44px;
  height: 44px;
  margin: -22px;
  border: none;
  padding: 0;
  border-radius: 50%;
  background: radial-gradient(circle, #6366f1 32%, transparent 34%);
}
.hz-nw {
  left: 0;
  top: 0;
}
.hz-ne {
  right: 0;
  top: 0;
}
.hz-se {
  right: 0;
  bottom: 0;
}
.hz-sw {
  left: 0;
  bottom: 0;
}
.hz-n {
  left: 50%;
  margin-left: -22px;
  top: 0;
}
.hz-s {
  left: 50%;
  margin-left: -22px;
  bottom: 0;
}
.hz-e {
  top: 50%;
  margin-top: -22px;
  right: 0;
}
.hz-w {
  top: 50%;
  margin-top: -22px;
  left: 0;
}
</style>
