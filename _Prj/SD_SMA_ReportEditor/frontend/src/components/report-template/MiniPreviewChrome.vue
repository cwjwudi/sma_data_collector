<template>
  <div class="mpc" :class="'mpc--' + variant">
    <span v-if="showTag" class="mpc-tag" :title="tagText">{{ tagText }}</span>
    <div class="mpc-slot">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { MiniPreviewVariant } from "@/components/report-template/mini-preview-types";

const props = withDefaults(
  defineProps<{
    variant: MiniPreviewVariant;
    /** 覆盖默认左上角标签文案 */
    label?: string;
    /** 模版管理格子已含列标题时关闭角标避免重复 */
    showTag?: boolean;
  }>(),
  { label: undefined, showTag: true },
);

const tagText = computed(() => {
  if (props.label != null && props.label !== "") return props.label;
  switch (props.variant) {
    case "cover":
      return "封面";
    case "back":
      return "末页 · 封尾";
    default:
      return "正文 · 眉脚";
  }
});
</script>

<style scoped>
/* 模版管理 / 版式列表 缩略图共用外壳 — 触摸屏优化 touch-action */
.mpc {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 100%;
  padding: 4px;
  border-radius: 10px;
  box-sizing: border-box;
  touch-action: manipulation;
}

.mpc--cover {
  background: linear-gradient(155deg, rgb(254 249 231) 0%, rgb(253 246 237) 28%, rgb(249 249 251) 55%);
  outline: 1px solid rgb(251 191 36 / 0.45);
  outline-offset: 0;
}
.mpc--back {
  background: linear-gradient(205deg, rgb(247 239 251) 0%, rgb(245 243 255) 32%, rgb(249 249 251) 58%);
  outline: 1px solid rgb(167 139 250 / 0.45);
}
.mpc--normal {
  background: linear-gradient(180deg, rgb(238 242 255) 0%, rgb(250 250 253) 40%);
  outline: 1px solid rgb(129 140 248 / 0.35);
}

.mpc-tag {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.15;
  padding: 4px 7px;
  border-radius: 5px;
  max-width: calc(100% - 12px);
  text-align: left;
  box-shadow: 0 1px 3px rgb(24 24 27 / 0.12);
  pointer-events: none;
  user-select: none;
}
.mpc--cover .mpc-tag {
  background: #d97706;
  color: #fff;
}
.mpc--back .mpc-tag {
  background: #6d28d9;
  color: #fff;
}
.mpc--normal .mpc-tag {
  background: #4338ca;
  color: #fff;
}

.mpc-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
}

/* 整页类缩略图 */
.mpc :deep(.mpp-paper) {
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgb(24 24 27 / 0.1);
  box-sizing: border-box;
  background: #fff;
}

.mpc--cover :deep(.mpp-paper) {
  border-top-width: 3px;
  border-top-color: rgb(251 146 60);
}
.mpc--back :deep(.mpp-paper) {
  border-bottom-width: 3px;
  border-bottom-color: rgb(168 139 246);
}
.mpc--normal :deep(.mpp-paper) {
  border-left-width: 3px;
  border-left-color: rgb(99 102 241);
}

/* 页眉脚条带示意（TemplateMiniBands） */
.mpc--normal :deep(.mb-inner.mpp-paper) {
  border-radius: 6px;
}
</style>
