<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    samples: number[];
    width?: number;
    height?: number;
  }>(),
  {
    width: 360,
    height: 64,
  },
);

const polylinePoints = computed(() => {
  const s = props.samples;
  if (!s.length) return "";
  const w = props.width;
  const h = props.height;
  const padX = 2;
  const padY = 6;
  const innerW = Math.max(1, w - padX * 2);
  const innerH = Math.max(1, h - padY * 2);
  let min = Infinity;
  let max = -Infinity;
  for (const v of s) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const n = s.length;
  return s
    .map((v, i) => {
      const x = padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const y = padY + innerH - ((v - min) / span) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
});

const yRangeLabel = computed(() => {
  const s = props.samples;
  if (!s.length) return "";
  let min = Infinity;
  let max = -Infinity;
  for (const v of s) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return "";
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  if (min === max) return fmt(min);
  return `${fmt(max)} / ${fmt(min)}`;
});
</script>

<template>
  <div class="ats-wrap" role="img" :aria-label="samples.length ? '触发变量近期数值曲线' : '等待采样'">
    <svg
      class="ats-svg"
      :viewBox="`0 0 ${width} ${height}`"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line
        v-if="samples.length"
        :x1="2"
        :y1="height - 6"
        :x2="width - 2"
        :y2="height - 6"
        class="ats-baseline"
      />
      <polyline
        v-if="polylinePoints"
        :points="polylinePoints"
        class="ats-line"
        fill="none"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span v-if="yRangeLabel" class="ats-range" aria-hidden="true">{{ yRangeLabel }}</span>
  </div>
</template>

<style scoped>
.ats-wrap {
  position: relative;
  width: 100%;
  max-width: 100%;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.ats-svg {
  display: block;
  width: 100%;
  height: 64px;
}
.ats-baseline {
  stroke: #e4e4e7;
  stroke-width: 1;
}
.ats-line {
  stroke: #2563eb;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.ats-range {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 10px;
  color: #71717a;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
</style>
