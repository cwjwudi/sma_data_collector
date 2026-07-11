<template>
  <MiniPreviewChrome :variant="previewVariant">
    <div class="mini-wrap" :style="wrapStyle">
      <div class="mini-page mpp-paper" :style="pageBoxStyle">
        <div v-if="me.hb >= 1" class="mini-band mini-band-header" :style="headerBand">
          <div class="mini-band-inner">
            <div
              v-for="el in preset.headerElements"
              :key="el.id"
              class="mini-zone-el"
              :style="miniZoneElStyle(el)"
            >
              <ZoneImageCompose
                v-if="el.type === 'image'"
                :image-src="el.imageSrc"
                :caption-text="el.text"
                :caption-position="el.imageCaptionPosition"
                :align-x="el.alignX"
                :align-y="el.alignY"
                :rotation-deg="el.imageRotationDeg"
                :font-size="miniReadableFontPx(el.fontSize)"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="mini-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <ZoneTableStatic v-else-if="el.type === 'table'" :el="el" />
              <template v-else><LayoutZoneInlineContent :el="el" /></template>
            </div>
          </div>
          <span v-if="preset.headerElements.length === 0" class="mini-legacy">{{
            preset.headerText || "(页眉)"
          }}</span>
        </div>
        <div class="mini-body" :style="bodyBand">
          <div class="mini-body-inner">
            <div
              v-for="el in preset.bodyElements"
              :key="el.id"
              class="mini-zone-el"
              :style="miniZoneElStyle(el)"
            >
              <ZoneImageCompose
                v-if="el.type === 'image'"
                :image-src="el.imageSrc"
                :caption-text="el.text"
                :caption-position="el.imageCaptionPosition"
                :align-x="el.alignX"
                :align-y="el.alignY"
                :rotation-deg="el.imageRotationDeg"
                :font-size="miniReadableFontPx(el.fontSize)"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="mini-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <ZoneTableStatic v-else-if="el.type === 'table'" :el="el" />
              <template v-else><LayoutZoneInlineContent :el="el" /></template>
            </div>
            <div v-if="preset.bodyElements.length === 0" class="mini-body-empty">{{ bodyEmptyHint }}</div>
          </div>
        </div>
        <div v-if="me.fb >= 1" class="mini-band mini-band-footer" :style="footerBand">
          <div class="mini-band-inner">
            <div v-for="el in preset.footerElements" :key="el.id" class="mini-zone-el" :style="miniZoneElStyle(el)">
              <ZoneImageCompose
                v-if="el.type === 'image'"
                :image-src="el.imageSrc"
                :caption-text="el.text"
                :caption-position="el.imageCaptionPosition"
                :align-x="el.alignX"
                :align-y="el.alignY"
                :rotation-deg="el.imageRotationDeg"
                :font-size="miniReadableFontPx(el.fontSize)"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="mini-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <ZoneTableStatic v-else-if="el.type === 'table'" :el="el" />
              <template v-else><LayoutZoneInlineContent :el="el" /></template>
            </div>
          </div>
          <span v-if="preset.footerElements.length === 0" class="mini-legacy">{{
            preset.footerText || "(页脚)"
          }}</span>
        </div>
      </div>
    </div>
  </MiniPreviewChrome>
</template>

<script setup lang="ts">
import { computed } from "vue";
import LayoutZoneInlineContent from "@/components/report-template/LayoutZoneInlineContent.vue";
import MiniPreviewChrome from "@/components/report-template/MiniPreviewChrome.vue";
import ZoneImageCompose from "@/components/report-template/ZoneImageCompose.vue";
import ZoneTableStatic from "@/components/report-template/ZoneTableStatic.vue";
import type { MiniPreviewVariant } from "@/components/report-template/mini-preview-types";
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import { miniPreviewScale } from "@/lib/report-template/mini-preview-scale";
import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { presetToSnapshot } from "@/lib/report-template/layout-model";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import {
  flexJustifyAlignForAxes,
  getZoneTextWrapStyle,
  normalizePageNumberMode,
  normalizeZIndex,
  zoneTableNodeShellBackgroundCss,
} from "@/lib/report-template/layout-zone-element";

const props = withDefaults(
  defineProps<{ preset: LayoutPreset; maxWidthPx?: number; maxHeightPx?: number }>(),
  { maxWidthPx: 160, maxHeightPx: 210 },
);

const previewVariant = computed<MiniPreviewVariant>(() => {
  const r = props.preset.pageRole;
  if (r === "cover" || r === "back") return r;
  return "normal";
});

const bodyEmptyHint = computed(() => {
  switch (props.preset.pageRole) {
    case "cover":
      return "封面主区域";
    case "back":
      return "封尾主区域";
    default:
      return "正文区装饰";
  }
});

const me = computed(() =>
  computePaperLayout(props.preset.paperKind, props.preset.orientation, presetToSnapshot(props.preset)),
);

const scale = computed(() =>
  miniPreviewScale(props.maxWidthPx, props.maxHeightPx, me.value.pageW, me.value.pageH),
);

const scaledSize = computed(() => {
  const m = me.value;
  const s = scale.value;
  return { w: Math.ceil(m.pageW * s), h: Math.ceil(m.pageH * s) + 3 };
});

const wrapStyle = computed(() => ({
  width: `${scaledSize.value.w}px`,
  maxWidth: "100%",
  height: `${scaledSize.value.h}px`,
  maxHeight: "100%",
  overflow: "hidden",
  boxSizing: "border-box",
}));

/** 边框与投影由 MiniPreviewChrome :deep(.mpp-paper) 统一 */
const pageBoxStyle = computed(() => ({
  position: "relative" as const,
  width: `${me.value.pageW}px`,
  height: `${me.value.pageH}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: "top left",
  boxSizing: "border-box",
}));

function bandStyle(metric: PaperLayoutMetrics, which: "header" | "body" | "footer") {
  if (which === "header") {
    return {
      position: "absolute" as const,
      left: `${metric.ml}px`,
      top: `${metric.mt}px`,
      width: `${metric.pageW - metric.ml - metric.mr}px`,
      height: `${metric.hb}px`,
    };
  }
  if (which === "body") {
    return {
      position: "absolute" as const,
      left: `${metric.contentLeft}px`,
      top: `${metric.contentTop}px`,
      width: `${metric.contentW}px`,
      height: `${metric.contentH}px`,
    };
  }
  return {
    position: "absolute" as const,
    left: `${metric.ml}px`,
    bottom: `${metric.mb}px`,
    width: `${metric.pageW - metric.ml - metric.mr}px`,
    height: `${metric.fb}px`,
  };
}

const headerBand = computed(() => bandStyle(me.value, "header"));
const bodyBand = computed(() => bandStyle(me.value, "body"));
const footerBand = computed(() => bandStyle(me.value, "footer"));

/** 缩放后屏幕字号至少约 8px，避免页眉静态中文在缩略图里变成细线 */
function miniReadableFontPx(fontSize: number): number {
  const base = Math.max(6, Number(fontSize) * 0.85 || 6);
  const minOnScreen = 8 / Math.max(0.05, scale.value);
  return Math.max(base, minOnScreen);
}

function miniZoneElStyle(el: LayoutZoneElement): Record<string, string> {
  const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
  const flex = flexJustifyAlignForAxes(el.alignX, el.alignY);
  const wrap = getZoneTextWrapStyle(el);
  const s: Record<string, string> = {
    position: "absolute",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    boxSizing: "border-box",
    overflow: "hidden",
    color: el.color,
    fontSize: `${miniReadableFontPx(el.fontSize)}px`,
    ...(ff ? { fontFamily: ff } : {}),
    zIndex: String(normalizeZIndex(el.zIndex)),
  };
  if (el.type === "image") {
    s.display = "flex";
    s.flexDirection = "column";
    s.whiteSpace = "normal";
  } else if (el.type === "table") {
    s.display = "flex";
    s.flexDirection = "column";
    s.alignItems = "stretch";
    s.justifyContent = "stretch";
    s.padding = "2px";
    s.background = zoneTableNodeShellBackgroundCss();
  } else {
    s.display = "flex";
    s.justifyContent = flex.justifyContent;
    s.alignItems = flex.alignItems;
    if (wrap) Object.assign(s, wrap);
    else s.whiteSpace = "nowrap";
    if (el.type === "pageNumber" && normalizePageNumberMode(el.pageNumberMode) === "circle") {
      s.padding = "1px";
    }
  }
  return s;
}
</script>

<style scoped>
.mini-wrap {
  touch-action: manipulation;
  flex-shrink: 0;
  margin: 0 auto;
}
.mini-band-inner,
.mini-body-inner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.mini-band-header {
  background: rgb(239 239 246 / 0.52);
}
.mini-band-footer {
  background: rgb(239 239 246 / 0.52);
}
.mini-body {
  background: rgb(249 249 251);
}
.mini-zone-el {
  pointer-events: none;
}
.mini-body-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: rgb(161 161 170);
}
.mini-legacy {
  position: absolute;
  inset: 2px;
  font-size: 9px;
  color: rgb(113 113 122);
  overflow: hidden;
  pointer-events: none;
}
.mini-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.mini-ph {
  font-size: 8px;
  color: #a1a1aa;
}
</style>
