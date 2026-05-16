<template>
  <div v-if="el" class="lpep">
    <h5 class="lpep-h">属性</h5>
    <div class="lpep-grid">
      <label
        v-if="el.type === 'text' || el.type === 'box'"
        class="lpep-lab"
        >文字<input v-model.trim="el.text" class="lpep-inp"
      /></label>
      <template v-if="el.type === 'date'">
        <label class="lpep-lab"
          >日期格式
          <select
            class="lpep-inp"
            :value="dateFormatSelectValue"
            @change="onDateFormatPresetChange($event)"
          >
            <option v-for="p in DATE_FORMAT_PRESETS" :key="p.value" :value="p.value">
              {{ p.label }}
            </option>
            <option value="__custom__">自定义…</option>
          </select>
        </label>
        <label v-if="dateFormatIsCustom" class="lpep-lab"
          >自定义 pattern<input
            v-model.trim="el.dateFormat"
            class="lpep-inp"
            spellcheck="false"
            placeholder="如 yyyy-MM-dd、yyyy年MM月dd日、含 HH:mm"
        /></label>
      </template>
      <template v-if="el.type === 'image'">
        <label class="lpep-lab"
          >配文<textarea v-model="el.text" rows="2" class="lpep-inp" spellcheck="false" placeholder="与图片同框显示的文字"
        ></textarea></label>
        <label class="lpep-lab"
          >配文位置<select v-model="el.imageCaptionPosition" class="lpep-inp">
            <option value="none">无配文</option>
            <option value="top">图上方</option>
            <option value="bottom">图下方</option>
            <option value="left">图左侧</option>
            <option value="right">图右侧</option>
          </select></label
        >
        <label class="lpep-lab"
          >图片水平位置（九宫格）<select v-model="el.alignX" class="lpep-inp">
            <option value="start">左</option>
            <option value="center">中</option>
            <option value="end">右</option>
          </select></label
        >
        <label class="lpep-lab"
          >图片垂直位置（九宫格）<select v-model="el.alignY" class="lpep-inp">
            <option value="start">上</option>
            <option value="center">中</option>
            <option value="end">下</option>
          </select></label
        >
        <label class="lpep-lab"
          >旋转角（°）<input
            v-model.number="el.imageRotationDeg"
            type="number"
            min="-360"
            max="360"
            step="1"
            class="lpep-inp"
        /></label>
        <label class="lpep-lab"
          >图片来源 URL / data<input v-model.trim="el.imageSrc" class="lpep-inp"
        /></label>
        <input
          ref="imgFileEl"
          type="file"
          accept="image/*,.svg"
          class="lpep-sr-file"
          aria-hidden="true"
          tabindex="-1"
          @change="onLocalImageChosen"
        />
        <button type="button" class="lpep-file-btn" @click="pickLocalImage">从本机选取图片…</button>
        <span class="lpep-img-hint">图片将转为 data URL，与预设 JSON 一并保存。水平×垂直对齐控制图片在占位格内的九宫格。</span>
      </template>
      <template v-if="el.type !== 'image'">
        <label class="lpep-lab"
          >水平位置<select v-model="el.alignX" class="lpep-inp">
            <option value="start">左</option>
            <option value="center">中</option>
            <option value="end">右</option>
          </select></label
        >
        <label class="lpep-lab"
          >垂直位置<select v-model="el.alignY" class="lpep-inp">
            <option value="start">上</option>
            <option value="center">中</option>
            <option value="end">下</option>
          </select></label
        >
      </template>
      <template v-if="el.type === 'pageNumber'">
        <label class="lpep-lab">形式</label>
        <select v-model="el.pageNumberMode" class="lpep-inp">
          <option value="plain">仅数字</option>
          <option value="slashTotal">当前页/总页数</option>
          <option value="cnPage">第N页</option>
          <option value="circle">圆形框</option>
        </select>
      </template>
      <LayoutFontFamilyField v-model="el.fontFamily" />
      <label class="lpep-lab">字号<input v-model.number="el.fontSize" type="number" min="8" max="72" class="lpep-inp" /></label>
      <label class="lpep-lab">X<input v-model.number="el.x" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">Y<input v-model.number="el.y" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">W<input v-model.number="el.w" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">H<input v-model.number="el.h" type="number" class="lpep-inp" /></label>
      <button type="button" class="lpep-del" @click="$emit('remove')">删除选中</button>
    </div>
  </div>
  <div v-else class="lpep-grey">
    <p>在画布上点选控件后在编辑属性。</p>
  </div>
</template>

<script setup lang="ts">
import { DATE_FORMAT_PRESETS, type LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import LayoutFontFamilyField from "@/components/report-template/LayoutFontFamilyField.vue";
import { readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import { computed, nextTick, ref } from "vue";

const props = defineProps<{
  el: LayoutZoneElement | null;
}>();

const dateFormatSelectValue = computed(() => {
  const el = props.el;
  if (!el || el.type !== "date") return "yyyy-MM-dd";
  const t = (el.dateFormat || "").trim();
  const hit = DATE_FORMAT_PRESETS.find((p) => p.value === t);
  return hit ? hit.value : "__custom__";
});

const dateFormatIsCustom = computed(() => dateFormatSelectValue.value === "__custom__");

function onDateFormatPresetChange(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const el = props.el;
  if (!el || el.type !== "date" || v === "__custom__") return;
  el.dateFormat = v;
}

const imgFileEl = ref<HTMLInputElement | null>(null);

defineEmits<{
  remove: [];
}>();

async function pickLocalImage() {
  const row = props.el;
  if (!row || row.type !== "image") return;
  await nextTick();
  imgFileEl.value?.click();
}

async function onLocalImageChosen(ev: Event) {
  const row = props.el;
  const inp = ev.target as HTMLInputElement;
  const f = inp.files?.[0];
  inp.value = "";
  if (!row || row.type !== "image" || !f) return;
  try {
    row.imageSrc = await readImageFileAsDataUrl(f);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}
</script>

<style scoped>
.lpep-h {
  margin: 0 0 8px;
  font-size: 13px;
}
.lpep-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}
.lpep-lab {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lpep-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
}
.lpep-del {
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgb(239 68 68);
  color: rgb(185 28 28);
  background: #fff;
  cursor: pointer;
}
.lpep-file-btn {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
  align-self: flex-start;
}
.lpep-img-hint {
  font-size: 11px;
  color: #71717a;
  line-height: 1.4;
}
.lpep-sr-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.lpep-grey {
  font-size: 13px;
  color: #71717a;
}
</style>
