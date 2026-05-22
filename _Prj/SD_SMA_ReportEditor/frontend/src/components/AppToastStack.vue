<template>
  <div class="app-toast-stack" aria-live="polite">
    <div
      v-for="item in appToasts"
      :key="item.id"
      class="app-toast"
      :class="`app-toast--${item.tone}`"
      role="status"
    >
      <pre class="app-toast-body">{{ item.message }}</pre>
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

.app-toast-body {
  margin: 0;
  flex: 1;
  font: 13px/1.45 system-ui, sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
  color: #1f2937;
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
</style>
