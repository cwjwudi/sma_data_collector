<template>
  <div class="lpep">
    <h5 class="lpep-h">属性</h5>
    <p class="lpep-type-tag">{{ typeLabel }}</p>
    <div class="lpep-grid">
      <template v-if="el.type === 'text'">
        <label class="lpep-lab">文字<textarea v-model.trim="el.text" rows="2" class="lpep-inp" spellcheck="false" /></label>
        <label class="lpep-lab"
          >文字颜色<input v-model="el.color" type="text" class="lpep-inp" spellcheck="false" placeholder="#18181b"
        /></label>
        <div class="lpep-lab lpep-color-quick">
          <span class="lpep-mini-label">快捷取色</span>
          <input :value="textColorHex" type="color" class="lpep-color-native" @input="onTextColorPick($event)" />
        </div>
      </template>

      <template v-if="el.type === 'box'">
        <label class="lpep-lab">文字<input v-model.trim="el.text" class="lpep-inp" /></label>
        <BoxZoneColorPicker :el="el" />
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
          >图片来源 URL / data<textarea v-model.trim="el.imageSrc" rows="2" class="lpep-inp" spellcheck="false"
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
        <span class="lpep-img-hint"
          >本地图片将转为 data URL 与模版一并保存。九宫格对齐控制图片在占位格内的位置。</span
        >
      </template>

      <template v-if="el.type === 'parameter'">
        <label class="lpep-lab"
          >绑定方式<select v-model="el.bindingKind" class="lpep-inp">
            <option value="none">无</option>
            <option value="opcua">OPC UA</option>
            <option value="sql">SQL</option>
          </select></label
        >
        <label class="lpep-lab"
          >OPC UA 节点 ID<input v-model.trim="el.opcuaNodeId" class="lpep-inp" placeholder="节点 NodeId"
        /></label>
        <label class="lpep-lab"
          >展示占位文字<textarea v-model.trim="el.text" rows="2" class="lpep-inp" placeholder="预览用"
        /></label>
      </template>

      <template v-if="el.type === 'table' || el.type === 'chart'">
        <label class="lpep-lab"
          >绑定<select v-model="el.bindingKind" class="lpep-inp">
            <option value="none">无</option>
            <option value="sql">SQL</option>
          </select></label
        >
        <label class="lpep-lab"
          >SQL<textarea v-model="el.sqlText" rows="4" class="lpep-inp" spellcheck="false" placeholder="SELECT …"
        /></label>
      </template>

      <template v-if="el.type === 'chart'">
        <label class="lpep-lab"
          >图表类型<select v-model="el.chartKind" class="lpep-inp">
            <option value="line">折线</option>
            <option value="bar">柱状</option>
          </select></label
        >
      </template>

      <template v-if="el.type === 'signature'">
        <label class="lpep-lab">签署说明显示<input v-model.trim="el.signerLabel" class="lpep-inp" placeholder="签署说明" /></label>
        <label class="lpep-lab"
          >签名库<select
            :value="el.signatureAssetId"
            class="lpep-inp"
            @change="emit('pick-sig-library', $event)"
          >
            <option value="">不使用库条目（手写/粘贴）</option>
            <option v-for="s in sigChoices" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select></label
        >
        <p class="lpep-hint-muted">手写板仍可覆盖预览图；库 id 随模版保存。</p>
      </template>

      <label class="lpep-lab"
        >字号<input v-model.number="el.fontSize" type="number" min="8" max="72" class="lpep-inp"
      /></label>

      <label class="lpep-lab">X<input v-model.number="el.x" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">Y<input v-model.number="el.y" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">W<input v-model.number="el.w" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">H<input v-model.number="el.h" type="number" class="lpep-inp" /></label>

      <button type="button" class="lpep-del" @click="emit('remove')">删除选中</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import BoxZoneColorPicker from "@/components/report-template/BoxZoneColorPicker.vue";
import { readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import type { TemplateControlType, TemplateElement } from "@/lib/report-template/model";
import { computed, nextTick, ref } from "vue";

const props = defineProps<{
  el: TemplateElement;
  sigChoices: { id: string; label: string }[];
}>();

const emit = defineEmits<{
  remove: [];
  "pick-sig-library": [ev: Event];
}>();

const TYPE_LABELS: Record<TemplateControlType, string> = {
  text: "文本",
  box: "色块",
  image: "图片",
  table: "表格（SQL）",
  chart: "图表",
  parameter: "数据参数",
  signature: "电子签名",
};

const typeLabel = computed(() => TYPE_LABELS[props.el.type] ?? props.el.type);

const imgFileEl = ref<HTMLInputElement | null>(null);

/** 原生 color 输入需 #rrggbb */
function isHex6(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

const textColorHex = computed(() => {
  const v = props.el.color?.trim() ?? "";
  if (isHex6(v)) return v;
  return "#18181b";
});

function onTextColorPick(ev: Event) {
  const raw = (ev.target as HTMLInputElement).value;
  if (isHex6(raw)) props.el.color = raw;
}

async function pickLocalImage() {
  if (props.el.type !== "image") return;
  await nextTick();
  imgFileEl.value?.click();
}

async function onLocalImageChosen(ev: Event) {
  const inp = ev.target as HTMLInputElement;
  const f = inp.files?.[0];
  inp.value = "";
  if (props.el.type !== "image" || !f) return;
  try {
    props.el.imageSrc = await readImageFileAsDataUrl(f);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}
</script>

<style scoped>
/* 与 LayoutPresetElementProps（版式编辑器）同一套视觉 */
.lpep-h {
  margin: 0 0 6px;
  font-size: 13px;
}
.lpep-type-tag {
  margin: 0 0 10px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #4338ca;
  background: rgb(238 242 255);
  border: 1px solid rgb(199 210 254 / 0.85);
  border-radius: 6px;
  width: fit-content;
  max-width: 100%;
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
.lpep-hint-muted {
  margin: 0;
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
.lpep-color-quick {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.lpep-mini-label {
  font-size: 11px;
  color: #71717a;
}
.lpep-color-native {
  width: 36px;
  height: 32px;
  padding: 0;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
</style>
