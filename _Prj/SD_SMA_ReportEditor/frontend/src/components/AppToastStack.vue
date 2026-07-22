<template>
  <div class="app-toast-stack" aria-live="polite">
    <div
      v-for="item in appToasts"
      :key="item.id"
      class="app-toast"
      :class="`app-toast--${item.tone}`"
      role="status"
    >
      <span v-if="item.spinner" class="app-toast-spinner" aria-hidden="true" />
      <div class="app-toast-main">
        <pre class="app-toast-body">{{ item.message }}</pre>
        <button
          v-if="item.action"
          type="button"
          class="app-toast-action"
          @click="item.action.onClick()"
        >
          {{ item.action.label }}
        </button>
      </div>
      <button type="button" class="app-toast-close" aria-label="关闭" @click="dismissAppToast(item.id)">
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { appToasts, dismissAppToast } from "@/composables/useAppToast";
</script>

<style scoped>
.app-toast-stack {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 12000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

.app-toast {
  pointer-events: auto;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  background: #fff;
  border: 1px solid #e5e7eb;
}

.app-toast--ok {
  border-color: #86efac;
  background: #f0fdf4;
}

.app-toast--warn {
  border-color: #fde047;
  background: #fefce8;
}

.app-toast--err {
  border-color: #fca5a5;
  background: #fef2f2;
}

.app-toast-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.app-toast-body {
  margin: 0;
  width: 100%;
  font: 13px/1.45 system-ui, sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
  color: #1f2937;
}

.app-toast-action {
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.app-toast-action:hover {
  background: #e0e7ff;
}

.app-toast-close {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.app-toast-spinner {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 2px solid #c7d2fe;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: app-toast-spin 0.7s linear infinite;
}

@keyframes app-toast-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
