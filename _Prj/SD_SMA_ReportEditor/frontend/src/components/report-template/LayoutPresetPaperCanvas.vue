<template>
  <div class="lppc-viewport">
    <input
      ref="layoutPresetImgFileRef"
      type="file"
      accept="image/*,.svg"
      class="sr-only-input"
      aria-hidden="true"
      tabindex="-1"
      @change="applyLayoutPresetImageSelection"
    />
    <p class="lppc-tip">随页面上下滚动浏览整张纸 · Ctrl / ⌘ + 滚轮缩放</p>
    <div class="lppc-flow" @wheel="onWheel">
      <div class="lppc-scale-frame" :style="canvasFrameStyle">
        <div class="lppc-scaler" :style="{ transform: `scale(${viewScale})`, transformOrigin: '0 0' }">
      <div class="lppc-paper" :style="paperBoxStyle" @pointerdown.capture="onPaperBlank">
        <div v-if="me.hb >= 1" class="lppc-band hdr" :style="hdrBandStyle">
          <div
            ref="hdrLayerRef"
            class="lppc-layer el-zone-root"
            :class="{ 'lppc-droptarget': dragOverZone === 'header' }"
            :style="hdrLayerBox"
            @pointerdown="onZoneBlank"
            @dragenter.prevent="dragOverZone = 'header'"
            @dragleave="onDragLeaveZone($event, 'header')"
            @dragover.prevent
            @drop.prevent="onDrop($event, 'header')"
          >
            <template v-for="el in preset.headerElements" :key="el.id">
              <div
                class="lppc-node touch"
                :class="{ selected: selId === el.id }"
                :style="nodeStyle(el)"
                @pointerdown.stop="beginMove($event, el, 'header')"
              >
                <template v-if="el.type === 'image'">
                  <div
                    class="lppc-img-layer"
                    title="可从资源管理器拖入图片到此"
                    @dragover.prevent
                    @drop.prevent.stop="onImageFileDrop($event, el)"
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
                      @replace-image="beginImagePick(el)"
                    >
                      <template #placeholder>
                        <span
                          role="button"
                          tabindex="0"
                          class="lppc-ph lppc-ph-upload"
                          title="点击从本机选择图片（或拖放到此）"
                          @pointerdown.stop
                          @click.prevent.stop="beginImagePick(el)"
                          @keyup.enter.prevent="beginImagePick(el)"
                          @keyup.space.prevent="beginImagePick(el)"
                        >
                          图片
                        </span>
                      </template>
                    </ZoneImageCompose>
                  </div>
                </template>
                <template v-else>{{ zonePreview(el) }}</template>
                <template v-if="selId === el.id">
                  <button
                    v-for="pos in HANDLES"
                    :key="pos"
                    type="button"
                    class="hz"
                    :class="'hz-' + pos"
                    tabindex="-1"
                    aria-label="缩放手柄"
                    @pointerdown.stop="beginResize($event, el, 'header', pos)"
                  />
                </template>
              </div>
            </template>
          </div>
        </div>

        <div
          ref="bodyLayerRef"
          class="lppc-band body el-zone-root"
          :class="{ 'lppc-droptarget': dragOverZone === 'body' }"
          :style="bodyBandStyle"
          @pointerdown="onZoneBlank"
          @dragenter.prevent="dragOverZone = 'body'"
          @dragleave="onDragLeaveZone($event, 'body')"
          @dragover.prevent
          @drop.prevent="onDrop($event, 'body')"
        >
          <template v-for="el in preset.bodyElements" :key="el.id">
            <div
              class="lppc-node touch"
              :class="{ selected: selId === el.id }"
              :style="nodeStyle(el)"
              @pointerdown.stop="beginMove($event, el, 'body')"
            >
              <template v-if="el.type === 'image'">
                <div
                  class="lppc-img-layer"
                  title="可从资源管理器拖入图片到此"
                  @dragover.prevent
                  @drop.prevent.stop="onImageFileDrop($event, el)"
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
                    @replace-image="beginImagePick(el)"
                  >
                    <template #placeholder>
                      <span
                        role="button"
                        tabindex="0"
                        class="lppc-ph lppc-ph-upload"
                        title="点击从本机选择图片（或拖放到此）"
                        @pointerdown.stop
                        @click.prevent.stop="beginImagePick(el)"
                        @keyup.enter.prevent="beginImagePick(el)"
                        @keyup.space.prevent="beginImagePick(el)"
                      >
                        图片
                      </span>
                    </template>
                  </ZoneImageCompose>
                </div>
              </template>
              <template v-else>{{ zonePreview(el) }}</template>
              <template v-if="selId === el.id">
                <button
                  v-for="pos in HANDLES"
                  :key="pos"
                  type="button"
                  class="hz"
                  :class="'hz-' + pos"
                  tabindex="-1"
                  aria-label="缩放手柄"
                  @pointerdown.stop="beginResize($event, el, 'body', pos)"
                />
              </template>
            </div>
          </template>
        </div>

        <div v-if="me.fb >= 1" class="lppc-band ftr" :style="ftrBandStyle">
          <div
            ref="ftrLayerRef"
            class="lppc-layer el-zone-root"
            :class="{ 'lppc-droptarget': dragOverZone === 'footer' }"
            :style="ftrLayerBox"
            @pointerdown="onZoneBlank"
            @dragenter.prevent="dragOverZone = 'footer'"
            @dragleave="onDragLeaveZone($event, 'footer')"
            @dragover.prevent
            @drop.prevent="onDrop($event, 'footer')"
          >
            <template v-for="el in preset.footerElements" :key="el.id">
              <div
                class="lppc-node touch"
                :class="{ selected: selId === el.id }"
                :style="nodeStyle(el)"
                @pointerdown.stop="beginMove($event, el, 'footer')"
              >
                <template v-if="el.type === 'image'">
                  <div
                    class="lppc-img-layer"
                    title="可从资源管理器拖入图片到此"
                    @dragover.prevent
                    @drop.prevent.stop="onImageFileDrop($event, el)"
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
                      @replace-image="beginImagePick(el)"
                    >
                      <template #placeholder>
                        <span
                          role="button"
                          tabindex="0"
                          class="lppc-ph lppc-ph-upload"
                          title="点击从本机选择图片（或拖放到此）"
                          @pointerdown.stop
                          @click.prevent.stop="beginImagePick(el)"
                          @keyup.enter.prevent="beginImagePick(el)"
                          @keyup.space.prevent="beginImagePick(el)"
                        >
                          图片
                        </span>
                      </template>
                    </ZoneImageCompose>
                  </div>
                </template>
                <template v-else>{{ zonePreview(el) }}</template>
                <template v-if="selId === el.id">
                  <button
                    v-for="pos in HANDLES"
                    :key="pos"
                    type="button"
                    class="hz"
                    :class="'hz-' + pos"
                    tabindex="-1"
                    aria-label="缩放手柄"
                    @pointerdown.stop="beginResize($event, el, 'footer', pos)"
                  />
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import ZoneImageCompose from "@/components/report-template/ZoneImageCompose.vue";
import { computePaperLayout, type PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import {
  clampZoneElement,
  makeLayoutZoneElement,
  previewZoneElementDisplay,
  type LayoutControlType,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";
import { presetToSnapshot, type LayoutPreset } from "@/lib/report-template/layout-model";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];
type Zone = "header" | "footer" | "body";

const props = defineProps<{
  preset: LayoutPreset;
}>();

const selId = defineModel<string | null>("selectedId");

const hdrLayerRef = ref<HTMLElement | null>(null);
const bodyLayerRef = ref<HTMLElement | null>(null);
const ftrLayerRef = ref<HTMLElement | null>(null);
const layoutPresetImgFileRef = ref<HTMLInputElement | null>(null);
let pendingLayoutPresetImageEl: LayoutZoneElement | null = null;
const viewScale = ref(1);
const dragOverZone = ref<Zone | null>(null);

const me = computed(() =>
  computePaperLayout(props.preset.paperKind, props.preset.orientation, presetToSnapshot(props.preset)),
);

const paperBoxStyle = computed(() => ({
  width: `${me.value.pageW}px`,
  height: `${me.value.pageH}px`,
  background: "#fff",
  border: "1px solid #d4d4d8",
  boxShadow: "0 12px 28px rgb(24 24 27 / 0.1)",
  position: "relative" as const,
}));

/** scale 不改变布局占位：外框等于缩放后的尺寸，才能把整张纸占位进外层页面滚动高度 */
const canvasFrameStyle = computed(() => {
  const s = viewScale.value || 1;
  const pad = 56;
  const pw = me.value.pageW + pad;
  const ph = me.value.pageH + pad;
  return {
    width: `${Math.ceil(pw * s)}px`,
    height: `${Math.ceil(ph * s)}px`,
    maxWidth: "100%",
    margin: "0 auto",
    position: "relative" as const,
    boxSizing: "border-box" as const,
  };
});

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

const hdrBandStyle = computed(() => bandBox(me.value, "hdr"));
const bodyBandStyle = computed(() => bandBox(me.value, "body"));
const ftrBandStyle = computed(() => bandBox(me.value, "ftr"));

const hdrLayerBox = computed(() => ({
  position: "relative" as const,
  width: "100%",
  height: "100%",
  boxSizing: "border-box" as const,
}));

const ftrLayerBox = computed(() => ({
  position: "relative" as const,
  width: "100%",
  height: "100%",
  boxSizing: "border-box" as const,
}));

function bandDims(z: Zone): { w: number; h: number } {
  const m = me.value;
  const bw = Math.max(40, m.pageW - m.ml - m.mr);
  if (z === "header") return { w: bw, h: Math.max(8, m.hb) };
  if (z === "footer") return { w: bw, h: Math.max(8, m.fb) };
  return { w: m.contentW, h: m.contentH };
}

function elementsForZone(z: Zone): LayoutZoneElement[] {
  if (z === "header") return props.preset.headerElements;
  if (z === "footer") return props.preset.footerElements;
  return props.preset.bodyElements;
}

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

function onPaperBlank(ev: PointerEvent) {
  const t = ev.target as HTMLElement;
  if (t.closest(".lppc-node") || t.closest(".hz")) return;
  selId.value = null;
}

function onZoneBlank(ev: PointerEvent) {
  const t = ev.target as HTMLElement;
  if (t.closest(".lppc-node") || t.closest(".hz")) return;
  selId.value = null;
}

function onDragLeaveZone(e: DragEvent, z: Zone) {
  const cur = e.currentTarget as HTMLElement;
  const rt = e.relatedTarget as Node | null;
  if (rt && cur.contains(rt)) return;
  if (dragOverZone.value === z) dragOverZone.value = null;
}

function isControl(t: string): t is LayoutControlType {
  return t === "text" || t === "box" || t === "image" || t === "pageNumber" || t === "date";
}

function onDrop(e: DragEvent, zone: Zone) {
  dragOverZone.value = null;
  const t = e.dataTransfer?.getData("application/x-zone-tool") || e.dataTransfer?.getData("text/plain") || "";
  if (!isControl(t)) return;
  const lay =
    zone === "header" ? hdrLayerRef.value : zone === "footer" ? ftrLayerRef.value : bodyLayerRef.value;
  if (!lay) return;
  const r = lay.getBoundingClientRect();
  const sc = viewScale.value || 1;
  const x = Math.round((e.clientX - r.left) / sc - 16);
  const y = Math.round((e.clientY - r.top) / sc - 12);
  const el = makeLayoutZoneElement(t);
  el.x = Math.max(0, x);
  el.y = Math.max(0, y);
  const { w, h } = bandDims(zone);
  clampZoneElement(el, w, h);
  elementsForZone(zone).push(el);
  selId.value = el.id;
}

let move: null | {
  sid: string;
  z: Zone;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
};
let resize: null | {
  sid: string;
  z: Zone;
  h: Handle;
  sx: number;
  sy: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
};

function clampEl(el: LayoutZoneElement, z: Zone) {
  const { w, h } = bandDims(z);
  clampZoneElement(el, w, h);
}

function beginMove(ev: PointerEvent, el: LayoutZoneElement, z: Zone) {
  selId.value = el.id;
  move = { sid: el.id, z, sx: ev.clientX, sy: ev.clientY, ox: el.x, oy: el.y };
  bindPtr();
}

function beginResize(ev: PointerEvent, el: LayoutZoneElement, z: Zone, h: Handle) {
  selId.value = el.id;
  resize = {
    sid: el.id,
    z,
    h,
    sx: ev.clientX,
    sy: ev.clientY,
    ix: el.x,
    iy: el.y,
    iw: el.w,
    ih: el.h,
  };
  bindPtr();
}

function bindPtr() {
  window.addEventListener("pointermove", ptrMove);
  window.addEventListener("pointerup", ptrUp, { once: true });
}

function ptrMove(ev: PointerEvent) {
  const sc = viewScale.value || 1;
  if (move) {
    const el = elementsForZone(move.z).find((x) => x.id === move!.sid);
    if (!el) return;
    el.x = Math.round(Math.max(0, move.ox + (ev.clientX - move.sx) / sc));
    el.y = Math.round(Math.max(0, move.oy + (ev.clientY - move.sy) / sc));
    clampEl(el, move.z);
    return;
  }
  if (resize) {
    const el = elementsForZone(resize.z).find((x) => x.id === resize!.sid);
    if (!el) return;
    const dx = (ev.clientX - resize.sx) / sc;
    const dy = (ev.clientY - resize.sy) / sc;
    const { h } = resize;
    let x = resize.ix;
    let y = resize.iy;
    let w = resize.iw;
    let hh = resize.ih;
    if (h.includes("e")) w = Math.max(16, Math.round(resize.iw + dx));
    if (h.includes("s")) hh = Math.max(16, Math.round(resize.ih + dy));
    if (h.includes("w")) {
      const nw = Math.max(16, Math.round(resize.iw - dx));
      x = Math.round(resize.ix + (resize.iw - nw));
      w = nw;
    }
    if (h.includes("n")) {
      const nh = Math.max(16, Math.round(resize.ih - dy));
      y = Math.round(resize.iy + (resize.ih - nh));
      hh = nh;
    }
    if (ev.shiftKey && (h === "se" || h === "nw" || h === "ne" || h === "sw")) {
      const s = Math.max(w, hh);
      w = s;
      hh = s;
    }
    Object.assign(el, { x, y, w, h: hh });
    clampEl(el, resize.z);
  }
}

function ptrUp() {
  move = null;
  resize = null;
  window.removeEventListener("pointermove", ptrMove);
}

onBeforeUnmount(ptrUp);

function onWheel(ev: WheelEvent) {
  if (!(ev.ctrlKey || ev.metaKey)) return;
  ev.preventDefault();
  const z = Math.exp(-ev.deltaY * 0.001);
  viewScale.value = Math.min(2.8, Math.max(0.35, +(viewScale.value * z).toFixed(4)));
}

function beginImagePick(el: LayoutZoneElement) {
  if (el.type !== "image") return;
  selId.value = el.id;
  pendingLayoutPresetImageEl = el;
  void nextTick(() => layoutPresetImgFileRef.value?.click());
}

async function assignImageSrcFromFileEl(el: LayoutZoneElement | null, f?: File | null) {
  if (!el || el.type !== "image" || !f?.type?.startsWith("image/")) return;
  try {
    el.imageSrc = await readImageFileAsDataUrl(f);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

async function applyLayoutPresetImageSelection(ev: Event) {
  const inp = ev.target as HTMLInputElement;
  const file = inp.files?.[0];
  inp.value = "";
  const tgt = pendingLayoutPresetImageEl;
  pendingLayoutPresetImageEl = null;
  await assignImageSrcFromFileEl(tgt, file);
}

async function onImageFileDrop(ev: DragEvent, el: LayoutZoneElement) {
  if (el.type !== "image") return;
  selId.value = el.id;
  await assignImageSrcFromFileEl(el, ev.dataTransfer?.files?.[0] ?? null);
}
</script>

<style scoped>
.lppc-viewport {
  display: flex;
  flex-direction: column;
  overflow: visible;
  background: radial-gradient(rgb(251 251 254), rgb(229 229 237));
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  min-height: 0;
  position: relative;
  touch-action: manipulation;
}
.lppc-tip {
  flex-shrink: 0;
  margin: 0;
  padding: 6px 10px;
  font-size: 11px;
  color: #52525b;
  background: rgb(255 255 255 / 0.92);
  border-bottom: 1px solid #e4e4e7;
}
.lppc-flow {
  flex: 0 0 auto;
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
}
.lppc-scale-frame {
  flex-shrink: 0;
}
.lppc-scaler {
  transform-origin: 0 0;
  padding: 28px;
  display: inline-block;
}
.lppc-paper {
  position: relative;
}
.lppc-band {
  box-sizing: border-box;
  overflow: hidden;
}
.lppc-band.hdr,
.lppc-band.ftr {
  background: rgb(239 239 246 / 0.55);
}
.lppc-band.body {
  background: rgb(250 250 252);
}
.lppc-layer {
  position: relative;
}
.lppc-droptarget {
  outline: 2px dashed #818cf8;
  outline-offset: -2px;
  background: rgb(238 242 255 / 0.35);
}
.lppc-node {
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
}
.lppc-node.selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1 inset;
}
.lppc-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.sr-only-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  opacity: 0;
}
.lppc-img-layer {
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
.lppc-ph {
  font-size: 10px;
  color: #94a3b8;
}
.lppc-ph-upload {
  cursor: pointer;
  border-bottom: 1px dashed currentcolor;
}
.lppc-ph-upload:hover {
  color: #475569;
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
  cursor: nwse-resize;
  touch-action: none;
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
  cursor: ns-resize;
}
.hz-s {
  left: 50%;
  margin-left: -22px;
  bottom: 0;
  cursor: ns-resize;
}
.hz-e {
  top: 50%;
  margin-top: -22px;
  right: 0;
  cursor: ew-resize;
}
.hz-w {
  top: 50%;
  margin-top: -22px;
  left: 0;
  cursor: ew-resize;
}
</style>
