<template>
  <div v-if="el.type === 'box'" class="bzc">
    <div class="bzc-block">
      <span class="bzc-title">填充色</span>
      <div class="bzc-swatches" role="group" aria-label="填充色预设">
        <button
          v-for="s in fillPresets"
          :key="s.value"
          type="button"
          class="bzc-swatch"
          :class="{
            'bzc-swatch--on': fillActive(s.value),
            'bzc-swatch--clear': s.value === 'transparent',
          }"
          :title="s.label"
          :aria-pressed="fillActive(s.value)"
          :style="s.value !== 'transparent' ? { backgroundColor: s.value } : undefined"
          @click="el.bgColor = s.value"
        />
      </div>
      <label class="bzc-picker-wrap" title="自定义填充（含取色器）">
        <span class="bzc-sr">打开填充色选择器</span>
        <input
          class="bzc-picker"
          type="color"
          :value="fillHexForPicker"
          @input="onFillPickerInput($event)"
        />
      </label>
    </div>
    <div class="bzc-block">
      <span class="bzc-title">边框与文字色</span>
      <div class="bzc-swatches" role="group" aria-label="边框与文字色预设">
        <button
          v-for="s in strokePresets"
          :key="s.value"
          type="button"
          class="bzc-swatch"
          :class="{ 'bzc-swatch--on': strokeActive(s.value) }"
          :title="s.label"
          :aria-pressed="strokeActive(s.value)"
          :style="{ backgroundColor: s.value }"
          @click="el.color = s.value"
        />
      </div>
      <label class="bzc-picker-wrap" title="自定义边框与文字颜色">
        <span class="bzc-sr">打开边框与文字色选择器</span>
        <input
          class="bzc-picker"
          type="color"
          :value="strokeHexForPicker"
          @input="onStrokePickerInput($event)"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TemplateElement } from "@/lib/report-template/model";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";

const props = defineProps<{
  el: LayoutZoneElement | TemplateElement;
}>();

/** 与原生取色器兼容的 #rrggbb */
const FALLBACK_FILL = "#e4e4e7";
const FALLBACK_STROKE = "#18181b";

const fillPresets: { value: string; label: string }[] = [
  { value: "transparent", label: "透明" },
  { value: "#fafafa", label: "近白" },
  { value: "#e4e4e7", label: "浅灰" },
  { value: "#fecaca", label: "浅红" },
  { value: "#fde68a", label: "浅黄" },
  { value: "#bbf7d0", label: "浅绿" },
  { value: "#a5b4fc", label: "浅紫" },
  { value: "#67e8f9", label: "浅青" },
  { value: "#27272a", label: "深灰" },
];

const strokePresets: { value: string; label: string }[] = [
  { value: "#18181b", label: "墨" },
  { value: "#52525b", label: "中灰" },
  { value: "#dc2626", label: "红" },
  { value: "#ca8a04", label: "琥珀" },
  { value: "#16a34a", label: "绿" },
  { value: "#2563eb", label: "蓝" },
  { value: "#7c3aed", label: "紫" },
  { value: "#ffffff", label: "白" },
];

function isHex6(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

const fillHexForPicker = computed(() => {
  const v = props.el.bgColor?.trim() || "";
  if (v === "transparent" || !isHex6(v)) return FALLBACK_FILL;
  return v;
});

const strokeHexForPicker = computed(() => {
  const v = props.el.color?.trim() || "";
  if (!isHex6(v)) return FALLBACK_STROKE;
  return v;
});

function fillActive(val: string): boolean {
  return (props.el.bgColor || "") === val;
}

function strokeActive(val: string): boolean {
  return (props.el.color || "").toLowerCase() === val.toLowerCase();
}

function onFillPickerInput(ev: Event) {
  const raw = (ev.target as HTMLInputElement).value;
  if (isHex6(raw)) props.el.bgColor = raw;
}

function onStrokePickerInput(ev: Event) {
  const raw = (ev.target as HTMLInputElement).value;
  if (isHex6(raw)) props.el.color = raw;
}
</script>

<style scoped>
.bzc {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bzc-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bzc-title {
  font-size: 12px;
  color: #52525b;
}
.bzc-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.bzc-swatch {
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border-radius: 6px;
  border: 1px solid rgb(228 228 231 / 0.95);
  cursor: pointer;
  box-sizing: border-box;
  flex-shrink: 0;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.bzc-swatch:hover {
  transform: scale(1.06);
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.12);
}
.bzc-swatch--on {
  outline: 2px solid #6366f1;
  outline-offset: 1px;
}
.bzc-swatch--clear {
  background: repeating-conic-gradient(#f4f4f5 0% 25%, #e4e4e7 0% 50%) 50% / 8px 8px;
  border-color: #d4d4d8;
}
.bzc-picker-wrap {
  align-self: flex-start;
  cursor: pointer;
  margin-top: 2px;
}
.bzc-picker {
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.bzc-picker::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.bzc-picker::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}
.bzc-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
