<template>
  <div class="tcwve">
    <div ref="barRef" class="tcwve-bar" role="group" aria-label="列宽比例">
      <div
        v-for="(_w, i) in columnWidthsPx"
        :key="'seg-' + i"
        class="tcwve-seg"
        :class="{ 'tcwve-seg--alt': i % 2 === 1 }"
        :style="segmentStyle(i)"
      >
        <span class="tcwve-seg-label">{{ i + 1 }}</span>
      </div>
      <TableColumnResizeGutters
        v-if="!disabled && columnWidthsPx.length >= 2"
        :column-widths-px="displayColumnWidthsPx"
        :layout-scale="layoutScale"
        @resize-delta="(bi, dx) => emit('resizeDelta', bi, dx)"
      />
    </div>
    <ul class="tcwve-metrics" aria-label="列宽数值">
      <li v-for="(m, i) in metrics" :key="'m-' + i" class="tcwve-metric">
        <span class="tcwve-metric-col">列 {{ i + 1 }}</span>
        <span class="tcwve-metric-val">{{ m.pxLabel }} · {{ m.pct }}%</span>
      </li>
    </ul>
    <p class="tcwve-hint">拖动分界调整相邻两列宽度；下方数值只读，便于对齐。</p>
  </div>
</template>

<script setup lang="ts">
import TableColumnResizeGutters from "@/components/report-template/TableColumnResizeGutters.vue";
import {
  formatMetricPx,
  integerColumnPercentsFromInnerWidthsPx,
} from "@/lib/report-template/table-cell-metrics";
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    columnWidthsPx: number[];
    innerW: number;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  resizeDelta: [boundaryIndex: number, deltaLayoutPx: number];
}>();

const barRef = ref<HTMLElement | null>(null);
const barWidthPx = ref(0);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const el = barRef.value;
  if (!el) return;
  barWidthPx.value = el.clientWidth;
  resizeObserver = new ResizeObserver(([entry]) => {
    barWidthPx.value = entry.contentRect.width;
  });
  resizeObserver.observe(el);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const layoutScale = computed(() => {
  const iw = props.innerW;
  return iw > 0 && barWidthPx.value > 0 ? barWidthPx.value / iw : 1;
});

const displayColumnWidthsPx = computed(() => {
  const s = layoutScale.value;
  return props.columnWidthsPx.map((w) => Math.max(0, Number(w) || 0) * s);
});

const percents = computed(() =>
  integerColumnPercentsFromInnerWidthsPx(props.columnWidthsPx, props.innerW),
);

const metrics = computed(() =>
  props.columnWidthsPx.map((w, i) => ({
    pxLabel: `${formatMetricPx(w)} px`,
    pct: percents.value[i] ?? 0,
  })),
);

function segmentStyle(i: number): Record<string, string> {
  const iw = props.innerW;
  const w = Math.max(0, Number(props.columnWidthsPx[i]) || 0);
  const pct = iw > 0 ? (100 * w) / iw : 100 / Math.max(1, props.columnWidthsPx.length);
  return { width: `${pct}%` };
}
</script>

<style scoped>
.tcwve {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.tcwve-bar {
  position: relative;
  display: flex;
  width: 100%;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #d4d4d8;
  overflow: hidden;
  background: #fafafa;
  box-sizing: border-box;
}

.tcwve-seg {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  background: rgb(99 102 241 / 0.12);
  box-sizing: border-box;
  border-right: 1px solid rgb(99 102 241 / 0.2);
}

.tcwve-seg:last-child {
  border-right: none;
}

.tcwve-seg--alt {
  background: rgb(99 102 241 / 0.22);
}

.tcwve-seg-label {
  font-size: 11px;
  font-weight: 600;
  color: #4338ca;
  user-select: none;
  pointer-events: none;
}

.tcwve-metrics {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}

.tcwve-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
  line-height: 1.35;
  color: #52525b;
}

.tcwve-metric-col {
  font-weight: 600;
  color: #3f3f46;
}

.tcwve-metric-val {
  font-variant-numeric: tabular-nums;
  color: #71717a;
}

.tcwve-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: #71717a;
}
</style>
