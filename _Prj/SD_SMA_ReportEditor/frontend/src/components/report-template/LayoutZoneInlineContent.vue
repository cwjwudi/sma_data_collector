<template>
  <div v-if="canvasTextBoxEdit" class="lzic-edit-root" :style="editRootStyle">
    <textarea
      :key="'lzic-txt-' + el.id"
      v-model="el.text"
      class="lzic-text-edit"
      :class="textClass"
      rows="1"
      spellcheck="false"
      autofocus
      :style="textareaStyle"
      @pointerdown.stop
      @keydown.stop
    />
  </div>
  <template v-else-if="showCircle">
    <span class="lzic-fill">
      <span class="lzic-circle" :style="circleBgStyle">{{ display }}</span>
    </span>
  </template>
  <span v-else class="lzic-plain" :class="textClass" :style="inlineAlign">{{ display }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  normalizePageNumberMode,
  PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
  previewZoneElementDisplay,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";

const props = withDefaults(
  defineProps<{
    el: LayoutZoneElement;
    /** 纯文本分支额外 class（如版式画布的 lppc-zone-text） */
    textClass?: string;
    /** 页码类控件预览：当前页（默认 1） */
    previewPage?: number;
    /** 页码类控件预览：总页数（默认使用 PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK） */
    previewTotalPages?: number;
    /**
     * 画布内选中时：文本 / 色块可直接输入（与模版编辑器正文画布行为一致）
     */
    canvasInlineEdit?: boolean;
  }>(),
  { textClass: "", previewPage: undefined, previewTotalPages: undefined, canvasInlineEdit: false },
);

const canvasTextBoxEdit = computed(
  () => props.canvasInlineEdit === true && (props.el.type === "text" || props.el.type === "box"),
);

const display = computed(() =>
  previewZoneElementDisplay(
    props.el,
    props.previewPage ?? 1,
    props.previewTotalPages ?? PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
  ),
);

const showCircle = computed(() => {
  if (props.el.type !== "pageNumber") return false;
  return normalizePageNumberMode(props.el.pageNumberMode) === "circle";
});

const inlineAlign = computed(() => {
  const ax = props.el.alignX;
  return {
    textAlign: (ax === "center" ? "center" : ax === "end" ? "right" : "left") as
      | "left"
      | "center"
      | "right",
  };
});

const textareaStyle = computed(() => {
  const ax = props.el.alignX;
  const ta = ax === "center" ? "center" : ax === "end" ? "right" : "left";
  const wrap = props.el.textAutoWrap;
  return {
    textAlign: ta as "left" | "center" | "right",
    whiteSpace: wrap ? ("pre-wrap" as const) : ("nowrap" as const),
    overflowWrap: wrap ? ("anywhere" as const) : ("normal" as const),
    wordBreak: wrap ? ("break-word" as const) : ("normal" as const),
  };
});

/** 列方向 flex：主轴为竖向，与外层九宫格 alignY 一致，避免编辑态整块贴顶 */
const editRootStyle = computed(() => {
  const ay = props.el.alignY;
  const justifyContent =
    ay === "center" ? "center" : ay === "end" ? "flex-end" : "flex-start";
  return { justifyContent };
});

/** 与 layout-zone-render 一致：非透明时使用控件填充色 */
const circleBgStyle = computed(() => {
  if (props.el.type !== "pageNumber") return {};
  const bg = props.el.bgColor;
  return {
    backgroundColor: bg === "transparent" ? "transparent" : bg,
  };
});
</script>

<style scoped>
/* 选中编辑：在 flex 父级内撑满可用区域（align-self 抵消父级 align-items:center） */
.lzic-edit-root {
  align-self: stretch;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.lzic-text-edit {
  display: block;
  width: 100%;
  flex: 0 1 auto;
  min-width: 0;
  min-height: 1.25em;
  max-height: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  resize: none;
  overflow-x: hidden;
  overflow-y: auto;
  font: inherit;
  color: inherit;
  font-size: inherit;
  line-height: 1.35;
  letter-spacing: inherit;
  background: transparent;
  outline: none;
  box-shadow: none;
  caret-color: #4338ca;
  field-sizing: content;
}
.lzic-text-edit:focus {
  outline: none;
}
/* 与 layout-zone-render 中圆形页码一致 */
.lzic-fill {
  flex: 1 1 0;
  min-width: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.lzic-circle {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100%, 2.75em);
  height: min(100%, 2.75em);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  color: inherit;
  font-size: inherit;
  line-height: 1;
  flex-shrink: 0;
}
.lzic-plain {
  min-width: 0;
}
</style>
