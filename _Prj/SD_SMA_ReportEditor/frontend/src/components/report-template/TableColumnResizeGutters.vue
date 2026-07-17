<template>
  <div class="tbl-col-gutters-root" aria-hidden="true">
    <button
      v-for="bi in boundaryIndices"
      :key="'gutter-' + bi"
      type="button"
      class="tbl-col-gutter-hit"
      :class="{ 'tbl-col-gutter-hit--active': activeBoundary === bi }"
      :style="{ left: gutterLeftPx(bi) + 'px' }"
      tabindex="-1"
      title="拖动调整列宽"
      aria-label="拖动调整列宽"
      @pointerdown.stop.prevent="onDown(bi, $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { takeLayoutDeltaFromScreen } from "@/lib/report-template/column-resize-pointer";

const props = withDefaults(
  defineProps<{
    columnWidthsPx: number[];
    /** 画布缩放（嵌套在 scale(...) 内时用），用于把屏幕位移换算为布局像素 */
    layoutScale?: number;
    disabled?: boolean;
  }>(),
  { layoutScale: 1, disabled: false },
);

const emit = defineEmits<{
  resizeDelta: [boundaryIndex: number, deltaLayoutPx: number];
}>();

const boundaryIndices = computed(() => {
  const n = props.columnWidthsPx?.length ?? 0;
  if (n < 2) return [];
  return Array.from({ length: n - 1 }, (_, i) => i);
});

/** cumulative[k] = sum(columnWidthsPx[0..k-1]) */
const cumulativeLeftPx = computed(() => {
  const w = props.columnWidthsPx;
  const cum: number[] = [0];
  let s = 0;
  for (let i = 0; i < w.length; i++) {
    s += Math.max(0, Number(w[i]) || 0);
    cum.push(s);
  }
  return cum;
});

function gutterLeftPx(bi: number): number {
  const cum = cumulativeLeftPx.value;
  const x = cum[bi + 1] ?? 0;
  return x;
}

const activeBoundary = ref<number | null>(null);
let lastClientX = 0;
/** 布局像素亚像素余数（P3-B）：高缩放时不足 1px 的步长不丢弃 */
let layoutDxAccum = 0;

function onDown(bi: number, ev: PointerEvent) {
  if (props.disabled) return;
  const t = ev.currentTarget as HTMLElement;
  activeBoundary.value = bi;
  lastClientX = ev.clientX;
  layoutDxAccum = 0;
  try {
    t.setPointerCapture(ev.pointerId);
  } catch {
    /* ignore */
  }
  const onMove = (e: PointerEvent) => {
    if (props.disabled) return;
    const screenDx = e.clientX - lastClientX;
    lastClientX = e.clientX;
    const { emitDx, nextAccum } = takeLayoutDeltaFromScreen(
      layoutDxAccum,
      screenDx,
      props.layoutScale,
    );
    layoutDxAccum = nextAccum;
    if (emitDx !== 0) emit("resizeDelta", bi, emitDx);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId === ev.pointerId) {
      try {
        t.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    }
    activeBoundary.value = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}
</script>

<style scoped>
.tbl-col-gutters-root {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  box-sizing: border-box;
}

.tbl-col-gutter-hit {
  position: absolute;
  top: 0;
  width: 10px;
  height: 100%;
  margin-left: -5px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
  pointer-events: auto;
  box-sizing: border-box;
}

.tbl-col-gutter-hit:hover,
.tbl-col-gutter-hit:focus-visible {
  background: rgb(99 102 241 / 0.22);
}

.tbl-col-gutter-hit--active {
  background: rgb(99 102 241 / 0.35);
}
</style>
