<template>
  <div
    class="zic-root"
    :class="rootCls"
    :style="rootStyle"
  >
    <span
      v-if="captionBefore"
      class="zic-caption"
      :style="captionBlockStyle"
    >{{ trimmedCaption }}</span>
    <div class="zic-paint" :style="paintStyle">
      <template v-if="imageSrcTrimmed">
        <img
          class="zic-img"
          alt=""
          :src="imageSrcTrimmed"
          draggable="false"
          :style="{ transform: rotTransform }"
          @dblclick.prevent.stop="$emit('replace-image')"
          @dragstart.prevent
        />
      </template>
      <slot v-else name="placeholder" />
    </div>
    <span
      v-if="captionAfter"
      class="zic-caption"
      :style="captionBlockStyle"
    >{{ trimmedCaption }}</span>
  </div>
</template>

<script setup lang="ts">
import {
  flexComposeOuterRoot,
  flexJustifyAlignForAxes,
  normalizeImageCaptionPosition,
  normalizeImageRotationDeg,
  type ImageCaptionPosition,
  type LayoutAlignAxis,
} from "@/lib/report-template/layout-zone-element";
import { computed } from "vue";

const props = defineProps<{
  imageSrc: string;
  captionText: string;
  captionPosition: ImageCaptionPosition;
  alignX: LayoutAlignAxis;
  alignY: LayoutAlignAxis;
  rotationDeg: number;
  fontSize: number;
  color: string;
  /** 配文等文字使用的字体族，空则继承 */
  fontFamily?: string;
}>();

defineEmits<{ "replace-image": [] }>();

const capNorm = computed(() => normalizeImageCaptionPosition(props.captionPosition));
const trimmedCaption = computed(() => String(props.captionText || "").trim());
const hasCaption = computed(() => capNorm.value !== "none" && trimmedCaption.value.length > 0);

const captionBefore = computed(
  () =>
    hasCaption.value && (capNorm.value === "top" || capNorm.value === "left"),
);

const captionAfter = computed(
  () =>
    hasCaption.value && (capNorm.value === "bottom" || capNorm.value === "right"),
);

const rowLay = computed(() => capNorm.value === "left" || capNorm.value === "right");

const rootCls = computed(() => (rowLay.value ? "zic-row" : "zic-col"));

const outerFlex = computed(() =>
  flexComposeOuterRoot(props.alignX, props.alignY, rowLay.value),
);

const innerAlign = computed(() => flexJustifyAlignForAxes(props.alignX, props.alignY));

const rootStyle = computed(() => ({
  justifyContent: outerFlex.value.justifyContent,
  alignItems: outerFlex.value.alignItems,
  gap: hasCaption.value ? "4px" : "0",
}));

const paintStyle = computed(() => ({
  justifyContent: innerAlign.value.justifyContent,
  alignItems: innerAlign.value.alignItems,
}));

function axisToTa(ax: LayoutAlignAxis): string {
  if (ax === "center") return "center";
  if (ax === "end") return "right";
  return "left";
}

const captionBlockStyle = computed(() => {
  const side = capNorm.value;
  const base: Record<string, string> = {
    flexShrink: "0",
    color: props.color,
    fontSize: `${props.fontSize}px`,
    whiteSpace: "pre-wrap",
    lineHeight: "1.25",
  };
  const capFf = String(props.fontFamily || "").trim();
  if (capFf) base.fontFamily = capFf;
  if (side === "top" || side === "bottom") {
    base.width = "100%";
    base.textAlign = axisToTa(props.alignX);
  } else if (side === "left" || side === "right") {
    base.maxWidth = "48%";
    base.alignSelf = "center";
    base.wordBreak = "break-word";
    base.overflow = "hidden";
  }
  return base;
});

const imageSrcTrimmed = computed(() => String(props.imageSrc || "").trim());

const rotTransform = computed(() => {
  const r = normalizeImageRotationDeg(props.rotationDeg);
  return Math.abs(r) < 0.01 ? "none" : `rotate(${r}deg)`;
});
</script>

<style scoped>
.zic-root {
  flex: 1;
  align-self: stretch;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.zic-root.zic-col {
  flex-direction: column;
}

.zic-root.zic-row {
  flex-direction: row;
}

.zic-paint {
  flex: 1;
  align-self: stretch;
  width: 100%;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.zic-img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  display: block;
  object-fit: contain;
  /* 禁止浏览器默认拖图（幽灵图）；pointerdown 需冒泡到外层 lppc-node / el-node 才能拖动与选中 */
  -webkit-user-drag: none;
  user-select: none;
}

.zic-caption {
  pointer-events: none;
}
</style>
