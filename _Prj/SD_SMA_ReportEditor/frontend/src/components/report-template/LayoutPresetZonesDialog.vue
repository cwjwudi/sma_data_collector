<template>
  <div v-if="modelValue" class="hz-overlay" @click.self="close">
    <div class="hz-modal" role="dialog" aria-modal="true" aria-labelledby="hz-dlg-title">
      <div class="hz-head">
        <span id="hz-dlg-title">放大编辑 · {{ preset.name }}</span>
        <button type="button" class="hz-close" @click="close">关闭</button>
      </div>
      <div class="hz-body">
        <LayoutPresetPaperCanvas :preset="preset" v-model:selected-id="selId" class="hz-canvas" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import LayoutPresetPaperCanvas from "@/components/report-template/LayoutPresetPaperCanvas.vue";
import type { LayoutPreset } from "@/lib/report-template/layout-model";

const props = defineProps<{
  modelValue: boolean;
  preset: LayoutPreset;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
}>();

const selId = defineModel<string | null>("selectedId", { default: null });

function close() {
  emit("update:modelValue", false);
}

function onKey(ev: KeyboardEvent) {
  if (!props.modelValue) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    close();
  }
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<style scoped>
.hz-overlay {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.5);
  z-index: 950;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 8px;
}
.hz-modal {
  background: #f4f4f5;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-height: 100%;
  box-shadow: 0 24px 48px rgb(0 0 0 / 0.2);
  overflow: hidden;
}
.hz-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid #e4e4e7;
  font-size: 14px;
  font-weight: 600;
  color: #27272a;
}
.hz-close {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fafafa;
  cursor: pointer;
  font-size: 13px;
}
.hz-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.hz-canvas {
  border: none;
  border-radius: 0;
}
</style>
