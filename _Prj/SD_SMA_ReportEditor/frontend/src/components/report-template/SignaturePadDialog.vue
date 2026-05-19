<template>
  <div v-if="modelValue" class="sig-backdrop" @click.self="$emit('update:modelValue', false)">
    <div class="sig-modal" role="dialog" aria-modal="true">
      <h3 class="sig-title">{{ title }}</h3>
      <p v-if="subtitle" class="sig-subtitle">条目名称：{{ subtitle }}</p>
      <p class="sig-hint">{{ hintLine }}</p>
      <div ref="wrapRef" class="sig-canvas-wrap">
        <canvas ref="guideCanvasRef" class="sig-layer sig-layer--guide" aria-hidden="true" />
        <canvas ref="inkCanvasRef" class="sig-layer sig-layer--ink" />
      </div>
      <div class="sig-actions">
        <button type="button" class="btn" @click="clear">清除</button>
        <button type="button" class="btn" @click="$emit('update:modelValue', false)">取消</button>
        <button type="button" class="btn btn-primary" @click="confirm">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, nextTick } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    /** 例如签名库条目名称（仅展示） */
    subtitle?: string;
    /** 在非透明画布上绘制浅色空心描摹字（供用户对齐笔迹）；与 subtitle 可同时使用 */
    guideOutlineText?: string;
    /** 浅色水印：签名库 PNG/data URL，仅在手写板底层显示，导出时可与墨色笔画合成 */
    guideImageSrc?: string;
  }>(),
  {
    title: "电子签名",
    subtitle: undefined,
    guideOutlineText: undefined,
    guideImageSrc: undefined,
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "confirm", dataUrl: string): void;
}>();

const hintLine = computed(() => {
  const hasLib = !!(props.guideImageSrc?.trim());
  if (hasLib) {
    return "浅色为签名库水印，仅供对齐；墨色为您的手写。确定后自动将手写叠加到库图之上（未手写则仅保存库图）。";
  }
  return "可依浅色描摹字迹书写；墨色笔迹为最终保存内容。";
});

const wrapRef = ref<HTMLElement | null>(null);
const guideCanvasRef = ref<HTMLCanvasElement | null>(null);
const inkCanvasRef = ref<HTMLCanvasElement | null>(null);
let drawing = false;
let lastX = 0;
let lastY = 0;
let dpr = 1;
/** 墨色层是否有用户笔迹 */
let hasInk = false;
let cachedGuideImg: HTMLImageElement | null = null;
let cachedGuideImgSrc = "";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    if (!/^data:/i.test(src)) im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("图像加载失败"));
    im.src = src;
  });
}

function resizeLayers() {
  const guide = guideCanvasRef.value;
  const ink = inkCanvasRef.value;
  const wrap = wrapRef.value ?? guide?.parentElement;
  if (!guide || !ink || !wrap) return;
  dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.floor(wrap.clientWidth);
  const cssH = Math.floor(wrap.clientHeight);
  if (cssW <= 0 || cssH <= 0) return;

  for (const c of [guide, ink]) {
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
  }

  hasInk = false;
  void drawGuideLayer();
  prepareInkLayer();
}

function prepareInkLayer() {
  const ink = inkCanvasRef.value;
  if (!ink) return;
  const ctx = ink.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ink.width / dpr, ink.height / dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
}

/** 底层：虚线框 + 可选水印图 + 可选描摹空心字（均不写入墨色层） */
async function drawGuideLayer() {
  const guide = guideCanvasRef.value;
  const wrap = wrapRef.value ?? guide?.parentElement;
  if (!guide || !wrap) return;
  const ctx = guide.getContext("2d");
  if (!ctx) return;
  const w = guide.width / dpr;
  const h = guide.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgb(148 163 184)";
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 6]);
  const margin = 10;
  ctx.strokeRect(margin + 0.5, margin + 0.5, Math.max(0, w - 2 * margin - 1), Math.max(0, h - 2 * margin - 1));
  ctx.setLineDash([]);

  const innerLeft = margin + 2;
  const innerTop = margin + 2;
  const innerW = Math.max(0, w - 2 * margin - 4);
  const innerH = Math.max(0, h - 2 * margin - 4);

  const src = props.guideImageSrc?.trim() ?? "";
  if (src) {
    try {
      if (!cachedGuideImg || cachedGuideImgSrc !== src) {
        cachedGuideImg = await loadImage(src);
        cachedGuideImgSrc = src;
      }
      const im = cachedGuideImg;
      if (im?.complete && im.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        const scale = Math.min(innerW / im.naturalWidth, innerH / im.naturalHeight);
        const dw = im.naturalWidth * scale;
        const dh = im.naturalHeight * scale;
        const dx = innerLeft + (innerW - dw) / 2;
        const dy = innerTop + (innerH - dh) / 2;
        ctx.drawImage(im, dx, dy, dw, dh);
        ctx.restore();
      }
    } catch {
      cachedGuideImg = null;
      cachedGuideImgSrc = "";
    }
  } else {
    cachedGuideImg = null;
    cachedGuideImgSrc = "";
  }

  drawTracingOutlineLayer(ctx, w, h, margin);
}

/** 条目名称浅色空心字，作为描摹底样 */
function drawTracingOutlineLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
) {
  const raw = props.guideOutlineText?.trim() ?? "";
  if (!raw) return;
  const padIn = margin + 8;
  const maxW = Math.max(40, w - 2 * padIn);
  const maxH = Math.max(32, h - 2 * padIn);
  const cx = w / 2;
  const cy = h / 2;
  let fontPx = Math.min(maxH * 0.5, Math.max(maxW / (Math.max(raw.length, 1) * 0.72), maxW / 16));
  fontPx = Math.max(14, Math.min(fontPx, 112));
  for (let i = 0; i < 30; i++) {
    ctx.font = `700 ${Math.round(fontPx)}px ui-sans-serif, "PingFang SC", "Microsoft YaHei", sans-serif`;
    const tw = ctx.measureText(raw).width;
    const approxH = fontPx * 1.05;
    if (tw <= maxW && approxH <= maxH) break;
    fontPx = Math.max(12, fontPx - 3);
    if (fontPx <= 14 && tw <= maxW && approxH <= maxH) break;
  }
  ctx.strokeStyle = "rgb(148 163 184 / 0.9)";
  ctx.lineWidth = 1.35;
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText(raw, cx, cy);
}

function pos(ev: PointerEvent, c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function onPointerDown(ev: PointerEvent) {
  const c = inkCanvasRef.value;
  if (!c) return;
  ev.preventDefault();
  c.setPointerCapture(ev.pointerId);
  drawing = true;
  const p = pos(ev, c);
  lastX = p.x;
  lastY = p.y;
}

function onPointerMove(ev: PointerEvent) {
  if (!drawing) return;
  const c = inkCanvasRef.value;
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const p = pos(ev, c);
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  lastX = p.x;
  lastY = p.y;
  hasInk = true;
}

function endStroke(ev: PointerEvent) {
  if (!drawing) return;
  const c = inkCanvasRef.value;
  if (c?.releasePointerCapture) {
    try {
      c.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }
  drawing = false;
}

function clear() {
  hasInk = false;
  prepareInkLayer();
}

/** 将图像按比例填满目标像素画布（contain） */
function drawImageContainPixels(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pw: number,
  ph: number,
) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  const scale = Math.min(pw / img.naturalWidth, ph / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (pw - dw) / 2;
  const dy = (ph - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

async function confirm() {
  const ink = inkCanvasRef.value;
  if (!ink) return;
  const guideImgSrc = props.guideImageSrc?.trim() ?? "";
  const hasLib = !!guideImgSrc;

  if (!hasInk && !hasLib) {
    alert("请先在手写区内落笔书写（墨色笔迹），或先在下拉里关联签名库条目以便使用库图。");
    return;
  }

  const pw = ink.width;
  const ph = ink.height;
  const exportC = document.createElement("canvas");
  exportC.width = pw;
  exportC.height = ph;
  const ex = exportC.getContext("2d");
  if (!ex) return;

  if (hasLib) {
    try {
      let im = cachedGuideImg && cachedGuideImgSrc === guideImgSrc ? cachedGuideImg : null;
      if (!im) im = await loadImage(guideImgSrc);
      ex.fillStyle = "#ffffff";
      ex.fillRect(0, 0, pw, ph);
      drawImageContainPixels(ex, im, pw, ph);
    } catch {
      alert("签名库图像加载失败，无法合成。");
      return;
    }
  }

  if (hasInk) {
    ex.drawImage(ink, 0, 0);
  }

  const dataUrl = exportC.toDataURL("image/png");
  emit("confirm", dataUrl);
  emit("update:modelValue", false);
}

function attach() {
  const c = inkCanvasRef.value;
  if (!c) return;
  c.addEventListener("pointerdown", onPointerDown);
  c.addEventListener("pointermove", onPointerMove);
  c.addEventListener("pointerup", endStroke);
  c.addEventListener("pointercancel", endStroke);
}

function detach() {
  drawing = false;
  const c = inkCanvasRef.value;
  if (!c) return;
  c.removeEventListener("pointerdown", onPointerDown);
  c.removeEventListener("pointermove", onPointerMove);
  c.removeEventListener("pointerup", endStroke);
  c.removeEventListener("pointercancel", endStroke);
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      hasInk = false;
      detach();
      return;
    }
    await nextTick();
    requestAnimationFrame(() => {
      resizeLayers();
      void drawGuideLayer();
      detach();
      attach();
    });
  },
);

watch(
  () => [props.guideOutlineText, props.guideImageSrc] as const,
  () => {
    if (!props.modelValue) return;
    requestAnimationFrame(() => {
      void drawGuideLayer();
    });
  },
);

function onWinResize() {
  if (!props.modelValue) return;
  resizeLayers();
  attach();
}

window.addEventListener("resize", onWinResize);

onUnmounted(() => {
  detach();
  window.removeEventListener("resize", onWinResize);
});
</script>

<style scoped>
.sig-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sig-modal {
  background: #fff;
  padding: 1rem 1.25rem 1rem;
  border-radius: 10px;
  max-width: 96vw;
  width: 420px;
  box-shadow: 0 20px 50px rgb(0 0 0 / 0.2);
}
.sig-title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}
.sig-subtitle {
  margin: 0 0 0.35rem;
  font-size: 13px;
  font-weight: 600;
  color: #3f3f46;
}
.sig-hint {
  margin: 0 0 0.65rem;
  font-size: 12px;
  color: rgb(113 113 122);
  line-height: 1.45;
}
.sig-canvas-wrap {
  position: relative;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  height: 180px;
  touch-action: none;
  overflow: hidden;
  background: #fafafa;
}
.sig-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
.sig-layer--guide {
  pointer-events: none;
  z-index: 0;
}
.sig-layer--ink {
  cursor: crosshair;
  z-index: 1;
  background: transparent;
}
.sig-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fafafa;
  cursor: pointer;
  font-size: 13px;
}
.btn-primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.btn:hover {
  filter: brightness(0.96);
}
</style>
