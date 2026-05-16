<template>
  <MiniPreviewChrome variant="normal" :show-tag="false">
    <div class="mb-wrap" :style="wrapStyle">
      <div class="mb-inner mpp-paper" :style="innerScaled">
      <div v-if="me.hb > 1" class="mb-strip mb-hdr" :style="headerBandStyle">
        <div class="mb-strip-rel">
          <div
            v-for="el in headerEls"
            :key="el.id"
            class="mb-z"
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
              :font-size="Math.max(6, el.fontSize * 0.85)"
              :color="el.color"
            >
              <template #placeholder>
                <span class="mb-ph">图</span>
              </template>
            </ZoneImageCompose>
            <template v-else>{{ previewZoneTxt(el) }}</template>
          </div>
        </div>
        <span v-if="headerEls.length === 0" class="mb-legacy">{{ headerFb }}</span>
      </div>
      <div class="mb-gap" :style="{ flex: `0 0 ${gapH}px` }">{{ gapLabel }}</div>
      <div v-if="me.fb > 1" class="mb-strip mb-ftr" :style="footerBandStyle">
        <div class="mb-strip-rel">
          <div v-for="el in footerEls" :key="el.id" class="mb-z" :style="miniZoneElStyle(el)">
            <ZoneImageCompose
              v-if="el.type === 'image'"
              :image-src="el.imageSrc"
              :caption-text="el.text"
              :caption-position="el.imageCaptionPosition"
              :align-x="el.alignX"
              :align-y="el.alignY"
              :rotation-deg="el.imageRotationDeg"
              :font-size="Math.max(6, el.fontSize * 0.85)"
              :color="el.color"
            >
              <template #placeholder>
                <span class="mb-ph">图</span>
              </template>
            </ZoneImageCompose>
            <template v-else>{{ previewZoneTxt(el) }}</template>
          </div>
        </div>
        <span v-if="footerEls.length === 0" class="mb-legacy">{{ footerFb }}</span>
      </div>
      <div v-if="me.hb <= 1 && me.fb <= 1" class="mb-none">无主文页眉脚带高度</div>
    </div>
  </div>
  </MiniPreviewChrome>
</template>

<script setup lang="ts">
import MiniPreviewChrome from "@/components/report-template/MiniPreviewChrome.vue";
import ZoneImageCompose from "@/components/report-template/ZoneImageCompose.vue";
import { computed } from "vue";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import { previewZoneElementDisplay } from "@/lib/report-template/layout-zone-element";
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import { metricsForSheet, type EditorSheet } from "@/lib/report-template/editor-sheet";
import type { ReportTemplate } from "@/lib/report-template/model";

const props = withDefaults(
  defineProps<{
    template: ReportTemplate;
    sheet?: EditorSheet;
    /** 中间缝隙标签 */
    gapLabel?: string;
    maxWidthPx?: number;
    maxHeightPx?: number;
  }>(),
  {
    sheet: "body",
    gapLabel: "正文区（示意）",
    maxWidthPx: 130,
    maxHeightPx: 168,
  },
);

const sheet = computed(() => props.sheet);
const me = computed(() => metricsForSheet(props.template, sheet.value));

const headerEls = computed(() =>
  sheet.value === "cover"
    ? props.template.coverHeaderElements
    : sheet.value === "back"
      ? props.template.backHeaderElements
      : props.template.headerElements,
);
const footerEls = computed(() =>
  sheet.value === "cover"
    ? props.template.coverFooterElements
    : sheet.value === "back"
      ? props.template.backFooterElements
      : props.template.footerElements,
);

const headerFb = computed(() =>
  sheet.value === "cover"
    ? props.template.coverHeaderText
    : sheet.value === "back"
      ? props.template.backHeaderText
      : props.template.headerText,
);
const footerFb = computed(() =>
  sheet.value === "cover"
    ? props.template.coverFooterText
    : sheet.value === "back"
      ? props.template.backFooterText
      : props.template.footerText,
);

const innerW = computed(() => {
  const m = me.value;
  return Math.max(40, m.pageW - m.ml - m.mr);
});

const hdrH = computed(() => Math.max(0, me.value.hb));
const ftrH = computed(() => Math.max(0, me.value.fb));
const gapH = computed(() =>
  Math.max(28, me.value.contentH * 0.12),
);

/** 垂直堆叠总高度（与整页宽度同尺） */
const stackH = computed(() => hdrH.value + gapH.value + ftrH.value);

const scale = computed(() => {
  const iw = innerW.value;
  const bh = stackH.value;
  const sx = props.maxWidthPx / Math.max(1, iw);
  const sy = props.maxHeightPx / Math.max(1, bh);
  return Math.min(sx, sy, 1);
});

const wrapStyle = computed(() => ({
  width: `${Math.ceil(innerW.value * scale.value)}px`,
  height: `${Math.ceil(stackH.value * scale.value)}px`,
  overflow: "hidden",
}));

function bandAbs(m: PaperLayoutMetrics, kind: "header" | "footer"): Record<string, string> {
  if (kind === "header") {
    return {
      position: "relative" as const,
      width: "100%",
      height: `${m.hb}px`,
    };
  }
  return {
    position: "relative" as const,
    width: "100%",
    height: `${m.fb}px`,
  };
}

const innerScaled = computed(() => ({
  width: `${innerW.value}px`,
  height: `${stackH.value}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: "top left",
  display: "flex",
  flexDirection: "column" as const,
  boxSizing: "border-box",
  background: "#fff",
  borderRadius: "6px",
}));

const headerBandStyle = computed(() => ({
  ...bandAbs(me.value, "header"),
  background: "rgb(239 239 246 / 0.52)",
}));

const footerBandStyle = computed(() => ({
  ...bandAbs(me.value, "footer"),
  background: "rgb(239 239 246 / 0.52)",
}));

function previewZoneTxt(el: LayoutZoneElement): string {
  return previewZoneElementDisplay(el);
}

function miniZoneElStyle(el: LayoutZoneElement): Record<string, string> {
  const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
  const s: Record<string, string> = {
    position: "absolute",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "nowrap",
    color: el.color,
    fontSize: `${Math.max(5, el.fontSize * 0.75)}px`,
    ...(ff ? { fontFamily: ff } : {}),
  };
  if (el.type === "image") {
    s.display = "flex";
    s.flexDirection = "column";
    s.whiteSpace = "normal";
  }
  return s;
}
</script>

<style scoped>
.mb-wrap {
  touch-action: manipulation;
}
.mb-inner {
  position: relative;
}
.mb-strip-rel {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.mb-gap {
  flex: none;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #a1a1aa;
  background: rgb(249 249 251);
  border-top: 1px dashed #e4e4e7;
  border-bottom: 1px dashed #e4e4e7;
}
.mb-none {
  font-size: 10px;
  color: #a1a1aa;
  padding: 16px;
  text-align: center;
}
.mb-legacy {
  position: absolute;
  inset: 2px;
  font-size: 8px;
  color: #71717a;
  overflow: hidden;
  pointer-events: none;
}
.mb-z {
  pointer-events: none;
}
.mb-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.mb-ph {
  font-size: 8px;
  color: #94a3b8;
}
</style>
