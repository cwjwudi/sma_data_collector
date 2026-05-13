<template>
  <div v-if="modelValue" class="sig-backdrop" @click.self="$emit('update:modelValue', false)">
    <div class="sig-modal" role="dialog" aria-modal="true">
      <h3 class="sig-title">{{ title }}</h3>
      <p v-if="subtitle" class="sig-subtitle">条目名称：{{ subtitle }}</p>
      <p class="sig-hint">在<strong>虚线框内</strong>手写笔画；画布已显示描边书写区示意。</p>
      <div class="sig-canvas-wrap">
        <canvas ref="canvasRef" class="sig-canvas" />
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
import { onUnmounted, ref, watch, nextTick } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    /** 例如签名库条目名称（仅展示） */
    subtitle?: string;
  }>(),
  { title: "电子签名", subtitle: undefined },
);

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "confirm", dataUrl: string): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let drawing = false;
let lastX = 0;
let lastY = 0;
let dpr = 1;

function resizeCanvas() {
  const c = canvasRef.value;
  if (!c) return;
  const wrap = c.parentElement!;
  dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = Math.floor(wrap.clientWidth);
  const cssH = Math.floor(wrap.clientHeight);
  if (cssW <= 0 || cssH <= 0) return;
  c.width = Math.floor(cssW * dpr);
  c.height = Math.floor(cssH * dpr);
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    drawWritingGuide();
  }
}

/** 手写区描边示意（不参与「是否为空」的简单比较时仍保留灰线） */
function drawWritingGuide() {
  const c = canvasRef.value;
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const w = c.width / dpr;
  const h = c.height / dpr;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = "rgb(148 163 184)";
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 6]);
  const margin = 10;
  ctx.strokeRect(margin + 0.5, margin + 0.5, Math.max(0, w - 2 * margin - 1), Math.max(0, h - 2 * margin - 1));
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
}

function pos(ev: PointerEvent, c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function onPointerDown(ev: PointerEvent) {
  const c = canvasRef.value;
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
  const c = canvasRef.value;
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
}

function endStroke(ev: PointerEvent) {
  if (!drawing) return;
  const c = canvasRef.value;
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
  const c = canvasRef.value;
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
  drawWritingGuide();
}

function confirm() {
  const c = canvasRef.value;
  if (!c) return;
  const blank = document.createElement("canvas");
  blank.width = c.width;
  blank.height = c.height;
  const dataUrl = c.toDataURL("image/png");
  if (blank.toDataURL("image/png") === dataUrl) {
    alert("请先手写签名。");
    return;
  }
  emit("confirm", dataUrl);
  emit("update:modelValue", false);
}

function attach() {
  const c = canvasRef.value;
  if (!c) return;
  c.addEventListener("pointerdown", onPointerDown);
  c.addEventListener("pointermove", onPointerMove);
  c.addEventListener("pointerup", endStroke);
  c.addEventListener("pointercancel", endStroke);
}

function detach() {
  drawing = false;
  const c = canvasRef.value;
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
      detach();
      return;
    }
    await nextTick();
    requestAnimationFrame(() => {
      resizeCanvas();
      detach();
      attach();
    });
  },
);

window.addEventListener("resize", resizeCanvas);

onUnmounted(() => {
  detach();
  window.removeEventListener("resize", resizeCanvas);
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
}
.sig-canvas-wrap {
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  height: 180px;
  touch-action: none;
  overflow: hidden;
}
.sig-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: crosshair;
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
