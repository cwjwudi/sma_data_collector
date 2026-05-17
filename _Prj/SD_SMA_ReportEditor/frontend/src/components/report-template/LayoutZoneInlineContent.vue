<template>
  <template v-if="showCircle">
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
  previewZoneElementDisplay,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";

const props = withDefaults(
  defineProps<{
    el: LayoutZoneElement;
    /** 纯文本分支额外 class（如版式画布的 lppc-zone-text） */
    textClass?: string;
  }>(),
  { textClass: "" },
);

const display = computed(() => previewZoneElementDisplay(props.el));

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
