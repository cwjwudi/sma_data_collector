<template>
  <div
    class="ds-lock"
    :class="{
      'ds-lock--locked': locked,
      'ds-lock--unlocked': !locked,
      'ds-lock--busy': busy,
    }"
  >
    <button
      type="button"
      class="ds-lock-track"
      role="switch"
      :aria-checked="locked ? 'true' : 'false'"
      :aria-label="ariaLabel"
      :disabled="busy"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <span
        class="ds-lock-fill"
        :class="{ 'ds-lock-fill--sheen': !locked }"
        :style="{ width: `${fillWidth}px` }"
        aria-hidden="true"
      />
      <span class="ds-lock-hint-text" aria-hidden="true">{{ trackHint }}</span>
      <span
        class="ds-lock-thumb"
        :style="{ transform: `translateX(${thumbLeft}px)` }"
        aria-hidden="true"
      >
        <svg v-if="locked" class="ds-lock-ico" viewBox="0 0 16 16" width="14" height="14" fill="none">
          <rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
          <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.5" />
        </svg>
        <svg v-else class="ds-lock-ico" viewBox="0 0 16 16" width="14" height="14" fill="none">
          <rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
          <path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.7-1.2" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </span>
    </button>
    <div class="ds-lock-meta">
      <span class="ds-lock-label">{{ locked ? "已锁定" : "可编辑" }}</span>
      <span class="ds-lock-hint">{{ metaHint }}</span>
    </div>
    <router-link class="ds-lock-audit" to="/audit">审计</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { apiFetch } from "@/api/client.js";
import {
  LOCK_TRACK_H,
  LOCK_TRACK_W,
  fillWidthPx,
  pctFromClientX,
  thumbOffsetPx,
  wantLockAt,
  wantUnlockAt,
} from "./datasource-lock-geometry";
import {
  beginUnlockSession,
  clearUnlockSessionLocal,
  isUnlockSessionActive,
  lockDatasourceNow,
  remainingSeconds,
  retreatPct,
  subscribeUnlockSession,
} from "./datasource-unlock-session";

defineOptions({ name: "DatasourceLockToggle" });

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [boolean: boolean];
}>();

const busy = ref(false);
const dragPct = ref<number | null>(null);
const sessionTick = ref(0);
let dragging = false;
let trackEl: HTMLElement | null = null;
let unsubSession: (() => void) | null = null;

const locked = computed(() => props.modelValue);

const thumbPct = computed(() => {
  void sessionTick.value;
  if (dragPct.value != null) return dragPct.value;
  if (locked.value) return 100;
  if (isUnlockSessionActive()) return retreatPct();
  return 0;
});

const thumbLeft = computed(() => thumbOffsetPx(thumbPct.value));
const fillWidth = computed(() => fillWidthPx(thumbPct.value));

const secsLeft = computed(() => {
  void sessionTick.value;
  return remainingSeconds();
});

const ariaLabel = computed(() => {
  if (locked.value) return "数据源已锁定，向左滑动解锁";
  return `数据源可编辑，剩余 ${secsLeft.value} 秒后自动锁定；向右滑动可立即锁定，再滑到左端可重置计时`;
});

const trackHint = computed(() => {
  if (locked.value) return "滑动解锁";
  return `剩余 ${secsLeft.value}s`;
});

const metaHint = computed(() => {
  if (locked.value) return "向左滑解锁";
  return `剩余 ${secsLeft.value}s · 右滑锁定`;
});

function bumpSessionUi() {
  sessionTick.value += 1;
  if (isUnlockSessionActive()) {
    if (locked.value) emit("update:modelValue", false);
  } else if (!locked.value) {
    // 会话结束或外部已上锁：与 prefs 对齐为锁定
    emit("update:modelValue", true);
  }
}

let applyingLocal = false;

function pctFromEvent(ev: PointerEvent): number {
  const el = trackEl;
  if (!el) return locked.value ? 100 : retreatPct();
  const r = el.getBoundingClientRect();
  return pctFromClientX(ev.clientX, r.left, r.width);
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
  dragPct.value = pct;
  trackEl = null;
  try {
    if (locked.value && wantUnlockAt(pct)) {
      await doUnlock();
    } else if (!locked.value && wantLockAt(pct)) {
      await doLock();
    } else if (!locked.value && wantUnlockAt(pct)) {
      // 倒计时中再滑到解锁端 → 重置满 60s
      await doUnlock();
    }
  } finally {
    dragPct.value = null;
  }
}

async function onKeydown(ev: KeyboardEvent) {
  if (busy.value) return;
  if (ev.key !== "Enter" && ev.key !== " ") return;
  ev.preventDefault();
  if (locked.value) await doUnlock();
  else await doLock();
}

async function doUnlock() {
  busy.value = true;
  applyingLocal = true;
  try {
    await beginUnlockSession();
    emit("update:modelValue", false);
    sessionTick.value += 1;
  } catch (e) {
    console.warn("[DatasourceLockToggle] unlock", e);
  } finally {
    applyingLocal = false;
    busy.value = false;
  }
}

async function doLock() {
  busy.value = true;
  applyingLocal = true;
  try {
    await lockDatasourceNow();
    emit("update:modelValue", true);
    sessionTick.value += 1;
  } catch (e) {
    console.warn("[DatasourceLockToggle] lock", e);
  } finally {
    applyingLocal = false;
    busy.value = false;
  }
}

function onExternalLockChanged(ev: Event) {
  if (applyingLocal) return;
  const detail = (ev as CustomEvent<{ locked?: boolean }>).detail;
  if (typeof detail?.locked !== "boolean") return;
  if (detail.locked) {
    clearUnlockSessionLocal();
    emit("update:modelValue", true);
    sessionTick.value += 1;
  } else {
    emit("update:modelValue", false);
    sessionTick.value += 1;
    // 会话由 AI 弹框 / 其它入口 beginUnlockSession；此处只同步 UI
  }
}

onMounted(async () => {
  unsubSession = subscribeUnlockSession(bumpSessionUi);
  window.addEventListener("report-editor-datasource-lock-changed", onExternalLockChanged);
  try {
    const prefs = await apiFetch("/settings/app_preferences");
    if (typeof prefs?.datasource_locked === "boolean") {
      emit("update:modelValue", prefs.datasource_locked);
      if (!prefs.datasource_locked && !isUnlockSessionActive()) {
        applyingLocal = true;
        try {
          await beginUnlockSession();
          emit("update:modelValue", false);
        } finally {
          applyingLocal = false;
        }
      }
    }
  } catch {
    /* ignore */
  }
});
onUnmounted(() => {
  unsubSession?.();
  unsubSession = null;
  window.removeEventListener("report-editor-datasource-lock-changed", onExternalLockChanged);
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
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  position: relative;
  flex: 0 0 auto;
  width: v-bind("`${LOCK_TRACK_W}px`");
  height: v-bind("`${LOCK_TRACK_H}px`");
  min-width: v-bind("`${LOCK_TRACK_W}px`");
  min-height: v-bind("`${LOCK_TRACK_H}px`");
  max-width: v-bind("`${LOCK_TRACK_W}px`");
  max-height: v-bind("`${LOCK_TRACK_H}px`");
  margin: 0;
  padding: 0;
  border-radius: 999px;
  border: 1px solid #d1d5db;
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
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}

.ds-lock--locked .ds-lock-track {
  border-color: #cbd5e1;
  background: #e8eaef;
}

.ds-lock-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: #c7c9d1;
  pointer-events: none;
  z-index: 0;
}

.ds-lock--unlocked .ds-lock-fill {
  background: linear-gradient(90deg, #6366f1 0%, #4f46e5 55%, #4338ca 100%);
}

.ds-lock-fill--sheen::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 0%,
    transparent 40%,
    rgb(255 255 255 / 0.35) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: 220% 100%;
  animation: ds-lock-sheen 2.4s linear infinite;
  pointer-events: none;
}

@keyframes ds-lock-sheen {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.ds-lock-hint-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  pointer-events: none;
  letter-spacing: 0.02em;
  padding: 0 36px;
  box-sizing: border-box;
}

.ds-lock--unlocked .ds-lock-hint-text {
  color: rgb(255 255 255 / 0.92);
  text-shadow: 0 1px 1px rgb(0 0 0 / 0.18);
}

.ds-lock-thumb {
  position: absolute;
  top: 4px;
  left: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #d1d5db;
  display: grid;
  place-items: center;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.16);
  pointer-events: none;
  color: #475569;
  z-index: 2;
  transition: transform 0.08s linear;
  will-change: transform;
}

.ds-lock--unlocked .ds-lock-thumb {
  border-color: #a5b4fc;
  color: #4f46e5;
}

.ds-lock-ico {
  display: block;
}

.ds-lock-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 5.5rem;
}

.ds-lock-label {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}

.ds-lock--unlocked .ds-lock-label {
  color: #4f46e5;
}

.ds-lock-hint {
  font-size: 11px;
  color: #9ca3af;
}

.ds-lock--unlocked .ds-lock-hint {
  color: #6366f1;
  font-variant-numeric: tabular-nums;
}

.ds-lock-audit {
  font-size: 12px;
  font-weight: 600;
  color: #4f46e5;
  text-decoration: none;
}

.ds-lock-audit:hover {
  text-decoration: underline;
}
</style>
