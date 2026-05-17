<template>
  <div ref="viewportRef" class="cv-viewport" @wheel.prevent="onWheel">
    <input
      ref="tplImgFileRef"
      type="file"
      accept="image/*,.svg"
      class="cv-sr-file"
      tabindex="-1"
      aria-hidden="true"
      @change="onTplBodyImageChosen"
    />
    <div class="cv-scaler" :style="{ transform: `translate(${panX}px,${panY}px) scale(${viewScale})` }">
      <div ref="paperRef" class="cv-paper" :style="paperBoxStyle" @pointerdown.capture="onPaperBlank">
        <div v-if="me.hb > 1" class="cv-band hdr" :style="hdrStyle">
          <span class="cv-hint">{{ headerHint }}</span>
        </div>
        <div
          class="cv-body surface el-root"
          :class="{ 'cv-droptarget': dragOverRoot }"
          :style="bodyStyle"
          @dragenter.prevent="dragOverRoot = true"
          @dragleave="onDragLeaveRoot"
          @dragover.prevent="onDragOverRoot"
          @drop.prevent.stop="onDrop"
        >
          <div
            v-for="el in list"
            :key="el.id"
            class="el-node touch"
            :class="{ sel: selId === el.id }"
            :style="elCss(el)"
            @pointerdown.stop="beginMove($event, el)"
          >
            <div class="el-inner">
              <template v-if="el.type === 'image'">
                <div
                  class="cv-img-slot"
                  @dragover.prevent
                  @drop.prevent.stop="onTplImageDropFile($event, el)"
                >
                  <ZoneImageCompose
                    :image-src="el.imageSrc"
                    :caption-text="el.text"
                    :caption-position="el.imageCaptionPosition"
                    :align-x="el.alignX"
                    :align-y="el.alignY"
                    :rotation-deg="el.imageRotationDeg"
                    :font-size="el.fontSize"
                    :color="el.color"
                    @replace-image="beginTplBodyImagePick(el)"
                  >
                    <template #placeholder>
                      <span
                        class="cv-ph-img"
                        role="button"
                        tabindex="0"
                        title="单击选图（或拖到此处）；数据以 data URL 保存"
                        @pointerdown.stop
                        @click.prevent.stop="beginTplBodyImagePick(el)"
                        @keyup.enter.prevent="beginTplBodyImagePick(el)"
                        @keyup.space.prevent="beginTplBodyImagePick(el)"
                      >
                        图片占位
                      </span>
                    </template>
                  </ZoneImageCompose>
                </div>
              </template>
              <template v-else>{{ displayEl(el) }}</template>
            </div>
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
import { readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import ZoneImageCompose from "@/components/report-template/ZoneImageCompose.vue";
import { computed, nextTick, onBeforeUnmount, ref } from "vue";

const HZ = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type H = (typeof HZ)[number];

const props = defineProps<{ tmpl: ReportTemplate; sheet: EditorSheet }>();
const selId = defineModel<string | null>("selectedId");

const viewportRef = ref<HTMLElement | null>(null);
const tplImgFileRef = ref<HTMLInputElement | null>(null);
let tplBodyPendingSid: string | null = null;
const panX = ref(0);
const panY = ref(0);
const viewScale = ref(1);
const dragOverRoot = ref(false);

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

function onDragOverRoot() {
  dragOverRoot.value = true;
}

function onDragLeaveRoot(e: DragEvent) {
  const cur = e.currentTarget as HTMLElement;
  const rt = e.relatedTarget as Node | null;
  if (rt && cur.contains(rt)) return;
  dragOverRoot.value = false;
}

function toolType(s: string): TemplateControlType | null {
  const ok = ["text", "box", "image", "table", "chart", "parameter", "signature"];
  return ok.includes(s) ? (s as TemplateControlType) : null;
}

function onDrop(e: DragEvent) {
  dragOverRoot.value = false;
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

async function assignTplBodyImage(el: TemplateElement | null, f?: File | null) {
  if (!el || el.type !== "image" || !f?.type?.startsWith("image/")) return;
  try {
    el.imageSrc = await readImageFileAsDataUrl(f);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}

function beginTplBodyImagePick(el: TemplateElement) {
  if (el.type !== "image") return;
  selId.value = el.id;
  tplBodyPendingSid = el.id;
  void nextTick(() => tplImgFileRef.value?.click());
}

async function onTplBodyImageChosen(ev: Event) {
  const inp = ev.target as HTMLInputElement;
  const file = inp.files?.[0];
  inp.value = "";
  const id = tplBodyPendingSid;
  tplBodyPendingSid = null;
  const el = id ? list.value.find((x) => x.id === id) ?? null : null;
  await assignTplBodyImage(el, file ?? null);
}

async function onTplImageDropFile(ev: DragEvent, el: TemplateElement) {
  if (el.type !== "image") return;
  selId.value = el.id;
  await assignTplBodyImage(el, ev.dataTransfer?.files?.[0] ?? null);
}
</script>

<style scoped>
.cv-viewport {
  overflow: auto;
  background: radial-gradient(rgb(251 251 254), rgb(229 229 237));
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  min-height: 440px;
  touch-action: pan-x pan-y;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  position: relative;
}
.cv-sr-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
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
.cv-droptarget {
  outline: 2px dashed #818cf8;
  outline-offset: -2px;
  background: rgb(238 242 255 / 0.45);
}
.cv-hint {
  font-size: 11px;
  color: #71717a;
}
.el-inner {
  display: flex;
  align-items: center;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  white-space: nowrap;
}
.cv-img-slot {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
}
.cv-img-fit {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}
.cv-ph-img {
  font-size: 11px;
  color: #94a3b8;
  cursor: pointer;
  border-bottom: 1px dashed currentcolor;
}
.cv-ph-img:hover {
  color: #475569;
}
.el-node {
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  padding: 4px;
}
.el-node.sel {
  outline: 2px solid #6366f1;
  overflow: visible;
  z-index: 6;
}
.touch {
  touch-action: manipulation;
}
.hz {
  --cv-hz-hit: 44px;
  --cv-hz-out: 9px;
  position: absolute;
  width: var(--cv-hz-hit);
  height: var(--cv-hz-hit);
  margin: 0;
  border: none;
  padding: 0;
  background: transparent;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 3;
}
.hz:focus {
  outline: none;
}
.hz:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
  border-radius: 4px;
}
.hz::after {
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
.hz:hover::after {
  background: linear-gradient(145deg, #6366f1 0%, #4f46e5 100%);
  box-shadow:
    0 2px 6px rgb(15 23 42 / 0.3),
    0 0 0 1px rgb(79 70 229 / 0.45);
}
.hz-nw {
  left: calc(-1 * var(--cv-hz-out));
  top: calc(-1 * var(--cv-hz-out));
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
}
.hz-ne {
  right: calc(-1 * var(--cv-hz-out));
  top: calc(-1 * var(--cv-hz-out));
  margin-right: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
  cursor: nesw-resize;
}
.hz-se {
  right: calc(-1 * var(--cv-hz-out));
  bottom: calc(-1 * var(--cv-hz-out));
  margin-right: calc(-0.5 * var(--cv-hz-hit));
  margin-bottom: calc(-0.5 * var(--cv-hz-hit));
}
.hz-sw {
  left: calc(-1 * var(--cv-hz-out));
  bottom: calc(-1 * var(--cv-hz-out));
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-bottom: calc(-0.5 * var(--cv-hz-hit));
  cursor: nesw-resize;
}
.hz-n {
  left: 50%;
  top: calc(-1 * var(--cv-hz-out));
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
  cursor: ns-resize;
}
.hz-s {
  left: 50%;
  bottom: calc(-1 * var(--cv-hz-out));
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-bottom: calc(-0.5 * var(--cv-hz-hit));
  cursor: ns-resize;
}
.hz-e {
  right: calc(-1 * var(--cv-hz-out));
  top: 50%;
  margin-right: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
  cursor: ew-resize;
}
.hz-w {
  left: calc(-1 * var(--cv-hz-out));
  top: 50%;
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
  cursor: ew-resize;
}
</style>
