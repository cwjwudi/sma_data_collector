<template>
  <Teleport to="body">
    <div
      v-if="appConfirmState.open"
      class="app-confirm-backdrop"
      @click.self="resolveAppConfirm(false)"
      @keydown.esc.prevent="resolveAppConfirm(false)"
    >
      <div
        class="app-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        @keydown.enter.prevent="resolveAppConfirm(true)"
      >
        <h2 id="app-confirm-title" class="app-confirm-title">{{ appConfirmState.title }}</h2>
        <pre class="app-confirm-message">{{ appConfirmState.message }}</pre>
        <div class="app-confirm-actions">
          <button ref="cancelButton" type="button" class="app-confirm-btn" @click="resolveAppConfirm(false)">
            {{ appConfirmState.cancelText }}
          </button>
          <button
            type="button"
            class="app-confirm-btn app-confirm-btn--primary"
            :class="{ 'app-confirm-btn--danger': appConfirmState.danger }"
            @click="resolveAppConfirm(true)"
          >
            {{ appConfirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { appConfirmState, resolveAppConfirm } from "@/composables/useAppConfirm";

const cancelButton = ref<HTMLButtonElement | null>(null);

watch(
  () => appConfirmState.value.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    cancelButton.value?.focus({ preventScroll: true });
  },
);
</script>

<style scoped>
.app-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 13000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
}

.app-confirm {
  width: min(420px, calc(100vw - 40px));
  padding: 22px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
}

.app-confirm-title {
  margin: 0 0 10px;
  color: #111827;
  font: 700 18px/1.3 system-ui, sans-serif;
}

.app-confirm-message {
  margin: 0;
  color: #4b5563;
  font: 14px/1.55 system-ui, sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
}

.app-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.app-confirm-btn {
  min-width: 74px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 14px;
  background: #fff;
  color: #111827;
  font: 14px/1.2 system-ui, sans-serif;
  cursor: pointer;
}

.app-confirm-btn:focus-visible {
  outline: 2px solid #a5b4fc;
  outline-offset: 2px;
}

.app-confirm-btn--primary {
  border-color: #4f46e5;
  background: #4f46e5;
  color: #fff;
}

.app-confirm-btn--danger {
  border-color: #dc2626;
  background: #dc2626;
}
</style>
