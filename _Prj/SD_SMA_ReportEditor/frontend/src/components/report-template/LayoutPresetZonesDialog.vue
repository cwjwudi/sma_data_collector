<template>
  <div v-if="modelValue" class="hz-overlay" @click.self="close">
    <div class="hz-modal">
      <LayoutPresetZoneWorkbench :preset="preset" :zone="zone" />
      <div class="hz-foot">
        <button type="button" class="btn" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import LayoutPresetZoneWorkbench from "@/components/report-template/LayoutPresetZoneWorkbench.vue";
import type { LayoutPreset } from "@/lib/report-template/layout-model";

defineProps<{
  modelValue: boolean;
  preset: LayoutPreset;
  zone: "header" | "footer" | "body";
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
}>();

function close() {
  emit("update:modelValue", false);
}
</script>

<style scoped>
.hz-overlay {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.5);
  z-index: 950;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
.hz-modal {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  max-width: 96vw;
  max-height: 92vh;
  overflow: auto;
  width: min(720px, 100%);
}
.hz-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fafafa;
  cursor: pointer;
  font-size: 13px;
}
</style>
