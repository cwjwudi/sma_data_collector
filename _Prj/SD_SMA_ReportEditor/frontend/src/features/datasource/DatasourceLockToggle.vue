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
      @keydown="onKeydown"
    >
      <span class="ds-lock-fill" :style="{ width: `${fillPct}%` }" aria-hidden="true" />
      <span
        class="ds-lock-thumb"
        :style="{ transform: `translateX(${thumbOffsetPx}px)` }"
        aria-hidden="true"
      >
        <svg v-if="locked" class="ds-lock-ico" viewBox="0 0 16 16" width="12" height="12" fill="none">
          <rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
          <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.5" />
        </svg>
        <svg v-else class="ds-lock-ico" viewBox="0 0 16 16" width="12" height="12" fill="none">
          <rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
          <path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.7-1.2" stroke="currentColor" stroke-width="1.5" />
        </svg>
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

/** 轨道 / 拇指几何（固定 px，避免 % 链撑破布局） */
const TRACK_W = 88;
const TRACK_H = 32;
const THUMB = 24;
const THUMB_PAD = 4;
const THUMB_TRAVEL = TRACK_W - THUMB - THUMB_PAD * 2;

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

const thumbOffsetPx = computed(() => {
  const p = Math.min(100, Math.max(0, thumbPct.value)) / 100;
  return THUMB_PAD + p * THUMB_TRAVEL;
});

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

async function onKeydown(ev: KeyboardEvent) {
  if (busy.value) return;
  if (ev.key !== "Enter" && ev.key !== " ") return;
  ev.preventDefault();
  await persist(!locked.value);
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
  flex-shrink: 0;
}

.ds-lock-track {
  /* 钉死几何，避免 Electron 默认 button 样式 / % 子元素撑破 */
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  position: relative;
  flex: 0 0 auto;
  width: 88px;
  height: 32px;
  min-width: 88px;
  min-height: 32px;
  max-width: 88px;
  max-height: 32px;
  margin: 0;
  padding: 0;
  border-radius: 999px;
  border: 1px solid #9ca3af;
  background: #e5e7eb;
  cursor: pointer;
  touch-action: none;
  overflow: hidden;
  vertical-align: middle;
  line-height: 0;
  color: inherit;
  font: inherit;
}

.ds-lock-track:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ds-lock-track:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}

.ds-lock--locked .ds-lock-track {
  border-color: #f59e0b;
  background: #fef3c7;
}

.ds-lock-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #fde68a, #fbbf24);
  opacity: 0.7;
  pointer-events: none;
}

.ds-lock-thumb {
  position: absolute;
  top: 4px;
  left: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #9ca3af;
  display: grid;
  place-items: center;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
  pointer-events: none;
  color: #4b5563;
  transition: transform 0.08s linear;
  will-change: transform;
}

.ds-lock--locked .ds-lock-thumb {
  border-color: #d97706;
  color: #b45309;
}

.ds-lock-ico {
  display: block;
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
