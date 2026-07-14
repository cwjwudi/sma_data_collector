<template>
  <div class="mebp">
    <h4 class="mebp-h">共有外观</h4>
    <p v-if="!fields.length" class="mebp-empty">
      所选类型无共有可批量修改的外观属性；点上方列表可单选编辑。
    </p>
    <div v-else class="mebp-grid">
      <div v-if="has('showBorder')" class="mebp-row">
        <span class="mebp-lab">边框</span>
        <div class="mebp-seg" role="group" aria-label="控件外框显示">
          <button
            type="button"
            class="mebp-seg-btn"
            :class="{ 'mebp-seg-on': borderState === true }"
            :aria-pressed="borderState === true"
            @click="setField('showBorder', true)"
          >
            显示
          </button>
          <button
            type="button"
            class="mebp-seg-btn"
            :class="{ 'mebp-seg-on': borderState === false }"
            :aria-pressed="borderState === false"
            @click="setField('showBorder', false)"
          >
            隐藏
          </button>
        </div>
        <span v-if="borderState === null" class="mebp-mixed">混合</span>
      </div>

      <div v-if="has('bgColor')" class="mebp-row mebp-row--col">
        <span class="mebp-lab">填充色<span v-if="bgMixed" class="mebp-mixed"> · 混合</span></span>
        <div class="mebp-swatches" role="group" aria-label="填充色预设">
          <button
            v-for="s in fillPresets"
            :key="s.value"
            type="button"
            class="mebp-swatch"
            :class="{
              'mebp-swatch--on': !bgMixed && bgUniform === s.value,
              'mebp-swatch--clear': s.value === 'transparent',
            }"
            :title="s.label"
            :aria-pressed="!bgMixed && bgUniform === s.value"
            :style="s.value !== 'transparent' ? { backgroundColor: s.value } : undefined"
            @click="setField('bgColor', s.value)"
          />
          <label class="mebp-picker-wrap" title="自定义填充">
            <span class="mebp-sr">自定义填充色</span>
            <input
              class="mebp-picker"
              type="color"
              :value="bgPickerHex"
              @input="onBgPicker($event)"
            />
          </label>
        </div>
      </div>

      <div v-if="has('color')" class="mebp-row mebp-row--col">
        <span class="mebp-lab">文字色<span v-if="colorMixed" class="mebp-mixed"> · 混合</span></span>
        <div class="mebp-swatches" role="group" aria-label="文字色预设">
          <button
            v-for="s in strokePresets"
            :key="s.value"
            type="button"
            class="mebp-swatch"
            :class="{ 'mebp-swatch--on': !colorMixed && colorUniform === s.value }"
            :title="s.label"
            :aria-pressed="!colorMixed && colorUniform === s.value"
            :style="{ backgroundColor: s.value }"
            @click="setField('color', s.value)"
          />
          <label class="mebp-picker-wrap" title="自定义文字色">
            <span class="mebp-sr">自定义文字色</span>
            <input
              class="mebp-picker"
              type="color"
              :value="colorPickerHex"
              @input="onColorPicker($event)"
            />
          </label>
        </div>
      </div>

      <div v-if="has('textAutoWrap')" class="mebp-row">
        <span class="mebp-lab">换行</span>
        <div class="mebp-seg" role="group" aria-label="文本换行方式">
          <button
            type="button"
            class="mebp-seg-btn"
            :class="{ 'mebp-seg-on': wrapState === false }"
            :aria-pressed="wrapState === false"
            @click="setField('textAutoWrap', false)"
          >
            单行
          </button>
          <button
            type="button"
            class="mebp-seg-btn"
            :class="{ 'mebp-seg-on': wrapState === true }"
            :aria-pressed="wrapState === true"
            @click="setField('textAutoWrap', true)"
          >
            自动
          </button>
        </div>
        <span v-if="wrapState === null" class="mebp-mixed">混合</span>
      </div>

      <label v-if="has('fontSize')" class="mebp-row mebp-row--field">
        <span class="mebp-lab">字号</span>
        <input
          v-model="fontSizeDraft"
          type="number"
          min="8"
          max="72"
          class="mebp-inp"
          :placeholder="fontSizeMixed ? '混合' : undefined"
          @change="commitFontSize"
          @keydown.enter.prevent="commitFontSize"
        />
      </label>

      <div v-if="has('fontFamily')" class="mebp-row mebp-row--col">
        <span class="mebp-lab">字体<span v-if="fontFamilyMixed" class="mebp-mixed"> · 混合</span></span>
        <LayoutFontFamilyField :model-value="fontFamilyDraft" @update:model-value="onFontFamily" />
      </div>

      <label v-if="has('alignX')" class="mebp-row mebp-row--field">
        <span class="mebp-lab">水平</span>
        <select class="mebp-inp" :value="alignXSelect" @change="onAlignX($event)">
          <option v-if="alignXMixed" value="__mixed__" disabled>混合</option>
          <option value="start">左</option>
          <option value="center">中</option>
          <option value="end">右</option>
        </select>
      </label>

      <label v-if="has('alignY')" class="mebp-row mebp-row--field">
        <span class="mebp-lab">垂直</span>
        <select class="mebp-inp" :value="alignYSelect" @change="onAlignY($event)">
          <option v-if="alignYMixed" value="__mixed__" disabled>混合</option>
          <option value="start">上</option>
          <option value="center">中</option>
          <option value="end">下</option>
        </select>
      </label>
    </div>
    <p class="mebp-note">仅改共有外观；绑定与表格请单选。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import LayoutFontFamilyField from "@/components/report-template/LayoutFontFamilyField.vue";
import {
  applyBatchField,
  intersectBatchFields,
  readBatchField,
  type BatchEl,
  type BatchFieldKey,
  type BatchSurface,
} from "@/lib/report-template/selection-batch-props";

const props = defineProps<{
  els: BatchEl[];
  surface: BatchSurface;
}>();

const fields = computed(() => intersectBatchFields(props.els, props.surface));

function has(key: BatchFieldKey) {
  return fields.value.includes(key);
}

function setField(key: BatchFieldKey, value: string | number | boolean) {
  applyBatchField(props.els, key, value);
}

function readBool(key: BatchFieldKey): boolean | null {
  const r = readBatchField(props.els, key);
  if (r.kind === "mixed") return null;
  return !!r.value;
}

function readStr(key: BatchFieldKey): { mixed: boolean; value: string } {
  const r = readBatchField(props.els, key);
  if (r.kind === "mixed") return { mixed: true, value: "" };
  return { mixed: false, value: String(r.value) };
}

const borderState = computed(() => readBool("showBorder"));
const wrapState = computed(() => readBool("textAutoWrap"));

const bgRead = computed(() => readStr("bgColor"));
const bgMixed = computed(() => bgRead.value.mixed);
const bgUniform = computed(() => bgRead.value.value);

const colorRead = computed(() => readStr("color"));
const colorMixed = computed(() => colorRead.value.mixed);
const colorUniform = computed(() => colorRead.value.value);

const fontSizeMixed = computed(() => readBatchField(props.els, "fontSize").kind === "mixed");
const fontSizeDraft = ref<number | string>("");

const fontFamilyRead = computed(() => readStr("fontFamily"));
const fontFamilyMixed = computed(() => fontFamilyRead.value.mixed);
const fontFamilyDraft = computed(() => (fontFamilyMixed.value ? "" : fontFamilyRead.value.value));

const alignXRead = computed(() => readStr("alignX"));
const alignXMixed = computed(() => alignXRead.value.mixed);
const alignXSelect = computed(() => (alignXMixed.value ? "__mixed__" : alignXRead.value.value));

const alignYRead = computed(() => readStr("alignY"));
const alignYMixed = computed(() => alignYRead.value.mixed);
const alignYSelect = computed(() => (alignYMixed.value ? "__mixed__" : alignYRead.value.value));

watch(
  () => {
    const r = readBatchField(props.els, "fontSize");
    return r.kind === "uniform" ? r.value : null;
  },
  (v) => {
    fontSizeDraft.value = v == null ? "" : Number(v);
  },
  { immediate: true },
);

function commitFontSize() {
  const n = Number(fontSizeDraft.value);
  if (!Number.isFinite(n)) return;
  setField("fontSize", n);
}

function onFontFamily(v: string) {
  setField("fontFamily", v ?? "");
}

function onAlignX(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  if (v === "__mixed__") return;
  setField("alignX", v);
}

function onAlignY(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  if (v === "__mixed__") return;
  setField("alignY", v);
}

const fillPresets = [
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

const strokePresets = [
  { value: "#18181b", label: "墨" },
  { value: "#52525b", label: "中灰" },
  { value: "#dc2626", label: "红" },
  { value: "#ca8a04", label: "琥珀" },
  { value: "#16a34a", label: "绿" },
  { value: "#2563eb", label: "蓝" },
  { value: "#7c3aed", label: "紫" },
  { value: "#ffffff", label: "白" },
];

function isHex6(v: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

const bgPickerHex = computed(() => {
  const v = bgUniform.value.trim();
  if (bgMixed.value || v === "transparent" || !isHex6(v)) return "#e4e4e7";
  return v;
});

const colorPickerHex = computed(() => {
  const v = colorUniform.value.trim();
  if (colorMixed.value || !isHex6(v)) return "#18181b";
  return v;
});

function onBgPicker(ev: Event) {
  const v = (ev.target as HTMLInputElement).value;
  if (isHex6(v)) setField("bgColor", v);
}

function onColorPicker(ev: Event) {
  const v = (ev.target as HTMLInputElement).value;
  if (isHex6(v)) setField("color", v);
}
</script>

<style scoped>
.mebp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid #e4e4e7;
}
.mebp-h {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: #3f3f46;
}
.mebp-empty,
.mebp-note {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  line-height: 1.45;
}
.mebp-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mebp-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.mebp-row--col {
  flex-direction: column;
  align-items: stretch;
}
.mebp-row--field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}
.mebp-lab {
  font-size: 12px;
  color: #52525b;
}
.mebp-mixed {
  font-size: 11px;
  color: #a1a1aa;
}
.mebp-seg {
  display: inline-flex;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  overflow: hidden;
}
.mebp-seg-btn {
  padding: 5px 10px;
  font-size: 12px;
  border: 0;
  background: #fff;
  color: #3f3f46;
  cursor: pointer;
}
.mebp-seg-btn + .mebp-seg-btn {
  border-left: 1px solid #c7d2fe;
}
.mebp-seg-on {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.mebp-inp {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  background: #fff;
  color: #18181b;
}
.mebp-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.mebp-swatch {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  cursor: pointer;
  padding: 0;
}
.mebp-swatch--clear {
  background: repeating-conic-gradient(#e4e4e7 0% 25%, #fff 0% 50%) 50% / 10px 10px;
}
.mebp-swatch--on {
  outline: 2px solid #6366f1;
  outline-offset: 1px;
}
.mebp-picker-wrap {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #d4d4d8;
  cursor: pointer;
}
.mebp-picker {
  width: 140%;
  height: 140%;
  margin: -20%;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.mebp-sr {
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
