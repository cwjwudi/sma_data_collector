<template>
  <div
    v-if="session"
    class="sidebar-export"
    :class="{ 'sidebar-export--collapsed': collapsed }"
    aria-live="polite"
  >
    <button
      type="button"
      class="sidebar-export__btn"
      :title="tooltip"
      :aria-label="ariaLabel"
      @click="onOpen"
    >
      <span class="sidebar-export__spinner" aria-hidden="true" />
      <template v-if="!collapsed">
        <span class="sidebar-export__text">
          <span class="sidebar-export__title">{{ session.title }}</span>
          <span class="sidebar-export__detail">{{ session.detail }}</span>
          <span class="sidebar-export__hint">点击重新打开页面</span>
        </span>
      </template>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  primaryReportExportSession,
  restoreBatchExportProgress,
} from "@/lib/report-export-progress-state";

defineProps<{
  collapsed: boolean;
}>();

const session = primaryReportExportSession;

const tooltip = computed(() => {
  const s = session.value;
  if (!s) return "结批进行中";
  return `${s.title}：${s.detail}（点击重新打开生成报表）`;
});

const ariaLabel = computed(() => tooltip.value);

function onOpen(): void {
  restoreBatchExportProgress(session.value?.id);
}
</script>

<style scoped>
.sidebar-export {
  flex-shrink: 0;
  padding: 10px 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-export--collapsed {
  padding: 8px;
  display: flex;
  justify-content: center;
}

.sidebar-export__btn {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(147, 197, 253, 0.35);
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.16);
  color: #e0e7ff;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.sidebar-export__btn:hover {
  background: rgba(59, 130, 246, 0.28);
  border-color: rgba(147, 197, 253, 0.55);
}

.sidebar-export--collapsed .sidebar-export__btn {
  width: 40px;
  height: 40px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

.sidebar-export__spinner {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 2px solid rgba(191, 219, 254, 0.35);
  border-top-color: #93c5fd;
  border-radius: 50%;
  animation: sidebar-export-spin 0.8s linear infinite;
}

.sidebar-export--collapsed .sidebar-export__spinner {
  margin-top: 0;
}

.sidebar-export__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sidebar-export__title {
  font-size: 12px;
  font-weight: 700;
  color: #dbeafe;
  line-height: 1.3;
}

.sidebar-export__detail {
  font-size: 11px;
  color: #bfdbfe;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.sidebar-export__hint {
  margin-top: 2px;
  font-size: 10px;
  color: #93c5fd;
}

@keyframes sidebar-export-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
