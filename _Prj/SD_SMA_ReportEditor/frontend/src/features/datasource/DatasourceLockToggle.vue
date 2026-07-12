<template>
  <div class="ds-lock" :class="{ 'ds-lock--locked': locked }">
    <button
      type="button"
      class="ds-lock-track"
      role="switch"
      :aria-checked="locked ? 'true' : 'false'"
      :aria-label="locked ? '数据源已锁定，滑动解锁' : '数据源可编辑，滑动锁定'"
      :disabled="busy"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span class="ds-lock-fill" :style="{ width: fillPct + '%' }" />
      <span class="ds-lock-thumb" :style="{ left: `calc(${thumbPct}% - 14px)` }">
        {{ locked ? "🔒" : "🔓" }}
      </span>
    </button>
    <div class="ds-lock-meta">
      <span class="ds-lock-label">{{ locked ? "已锁定" : "可编辑" }}</span>
      <span class="ds-lock-hint">{{ locked ? "滑动解锁" : "滑动锁定" }}</span>
    </div>
    <router-link class="ds-lock-audit" to="/audit">审计</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { apiFetch } from "@/api/client.js";

defineOptions({ name: "DatasourceLockToggle" });

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [boolean: boolean];
}>();

const busy = ref(false);
const dragPct = ref<number | null>(null);
let dragging = false;
let trackEl: HTMLElement | null = null;

const locked = computed(() => props.modelValue);

const thumbPct = computed(() => {
  if (dragPct.value != null) return dragPct.value;
  return locked.value ? 100 : 0;
});

const fillPct = computed(() => thumbPct.value);

function pctFromEvent(ev: PointerEvent): number {
  const el = trackEl;
  if (!el) return locked.value ? 100 : 0;
  const r = el.getBoundingClientRect();
  if (r.width <= 0) return 0;
  const x = Math.min(Math.max(ev.clientX - r.left, 0), r.width);
  return (x / r.width) * 100;
}

function onPointerDown(ev: PointerEvent) {
  if (busy.value) return;
  const t = ev.currentTarget as HTMLElement;
  trackEl = t;
  dragging = true;
  t.setPointerCapture?.(ev.pointerId);
  dragPct.value = pctFromEvent(ev);
}

function onPointerMove(ev: PointerEvent) {
  if (!dragging) return;
  dragPct.value = pctFromEvent(ev);
}

async function onPointerUp(ev: PointerEvent) {
  if (!dragging) return;
  dragging = false;
  const pct = pctFromEvent(ev);
  dragPct.value = null;
  trackEl = null;
  const wantLock = pct >= 70;
  const wantUnlock = pct <= 30;
  if (locked.value && wantUnlock) {
    await persist(false);
  } else if (!locked.value && wantLock) {
    await persist(true);
  }
}

async function persist(next: boolean) {
  if (next === locked.value) return;
  busy.value = true;
  try {
    await apiFetch("/settings/app_preferences", {
      method: "PATCH",
      body: { datasource_locked: next },
    });
    emit("update:modelValue", next);
    window.dispatchEvent(
      new CustomEvent("report-editor-datasource-lock-changed", { detail: { locked: next } }),
    );
  } catch (e) {
    console.warn("[DatasourceLockToggle]", e);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  try {
    const prefs = await apiFetch("/settings/app_preferences");
    if (typeof prefs?.datasource_locked === "boolean") {
      emit("update:modelValue", prefs.datasource_locked);
    }
  } catch {
    /* ignore */
  }
});

watch(
  () => props.modelValue,
  () => {
    dragPct.value = null;
  },
);
</script>

<style scoped>
.ds-lock {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ds-lock-track {
  position: relative;
  width: 88px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #f3f4f6;
  padding: 0;
  cursor: pointer;
  touch-action: none;
  overflow: hidden;
}

.ds-lock--locked .ds-lock-track {
  border-color: #f59e0b;
  background: #fffbeb;
}

.ds-lock-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #fde68a, #fbbf24);
  opacity: 0.55;
  pointer-events: none;
}

.ds-lock-thumb {
  position: absolute;
  top: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #d1d5db;
  display: grid;
  place-items: center;
  font-size: 12px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  pointer-events: none;
}

.ds-lock-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 3.5rem;
}

.ds-lock-label {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}

.ds-lock--locked .ds-lock-label {
  color: #b45309;
}

.ds-lock-hint {
  font-size: 11px;
  color: #9ca3af;
}

.ds-lock-audit {
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  text-decoration: none;
}

.ds-lock-audit:hover {
  text-decoration: underline;
}
</style>
