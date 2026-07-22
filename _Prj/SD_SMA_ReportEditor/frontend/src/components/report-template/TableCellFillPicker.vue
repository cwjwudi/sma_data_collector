<template>
  <div class="tcfp">
    <span class="tcfp-title">{{ title }}</span>
    <div class="tcfp-swatches" role="group" :aria-label="title">
      <button
        v-for="s in fillPresets"
        :key="s.value"
        type="button"
        class="tcfp-swatch"
        :class="{
          'tcfp-swatch--on': modelValue === s.value,
          'tcfp-swatch--clear': s.value === 'transparent',
        }"
        :title="s.label"
        :aria-pressed="modelValue === s.value"
        :style="s.value !== 'transparent' ? { backgroundColor: s.value } : undefined"
        @click="emit('update:modelValue', s.value)"
      />
    </div>
    <label class="tcfp-picker-wrap" :title="'自定义' + title">
      <span class="tcfp-sr">打开颜色选择器</span>
      <input class="tcfp-picker" type="color" :value="hexForPicker" @input="onPickerInput($event)" />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    title: string;
    /** 覆盖默认色板（如正文底色：纯白 / 历史灰） */
    presets?: { value: string; label: string }[];
  }>(),
  {
    presets: undefined,
  },
);

const emit = defineEmits<{
  "update:modelValue": [string];
}>();

const FALLBACK_FILL = "#e4e4e7";

const DEFAULT_FILL_PRESETS: { value: string; label: string }[] = [
  { value: "transparent", label: "默认白底" },
  { value: "#fafafa", label: "近白" },
  { value: "#e4e4e7", label: "浅灰" },
  { value: "#fecaca", label: "浅红" },
  { value: "#fde68a", label: "浅黄" },
  { value: "#bbf7d0", label: "浅绿" },
  { value: "#a5b4fc", label: "浅紫" },
  { value: "#67e8f9", label: "浅青" },
  { value: "#27272a", label: "深灰" },
];

const fillPresets = computed(() =>
  props.presets?.length ? props.presets : DEFAULT_FILL_PRESETS,
);

function isHex6(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

function cssColorToHex6(v: string): string | null {
  const s = v.trim();
  if (isHex6(s)) return s;
  // 现代语法 rgb(r g b) / 逗号写法 → 供 <input type="color">
  const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) {
    const r = Math.round(Number(m[1]));
    const g = Math.round(Number(m[2]));
    const b = Math.round(Number(m[3]));
    if ([r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
      return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return null;
}

const hexForPicker = computed(() => {
  const v = props.modelValue?.trim() || "";
  if (v === "transparent") return FALLBACK_FILL;
  return cssColorToHex6(v) || FALLBACK_FILL;
});

function onPickerInput(ev: Event) {
  const raw = (ev.target as HTMLInputElement).value;
  if (isHex6(raw)) emit("update:modelValue", raw);
}
</script>

<style scoped>
.tcfp {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tcfp-title {
  font-size: 12px;
  color: #52525b;
}
.tcfp-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.tcfp-swatch {
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
.tcfp-swatch:hover {
  transform: scale(1.06);
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.12);
}
.tcfp-swatch--on {
  outline: 2px solid #6366f1;
  outline-offset: 1px;
}
.tcfp-swatch--clear {
  background: repeating-conic-gradient(#f4f4f5 0% 25%, #e4e4e7 0% 50%) 50% / 8px 8px;
  border-color: #d4d4d8;
}
.tcfp-picker-wrap {
  align-self: flex-start;
  cursor: pointer;
  margin-top: 2px;
}
.tcfp-picker {
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.tcfp-picker::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.tcfp-picker::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}
.tcfp-sr {
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
