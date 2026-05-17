<template>
  <MiniPreviewChrome :variant="previewVariant" :show-tag="false">
    <div class="mini-wrap" :style="wrapStyle">
      <div class="mini-page mpp-paper" :style="pageBoxStyle">
        <div v-if="me.hb > 1" class="mini-band mini-band-header" :style="headerBand">
          <div class="mini-band-inner">
            <div
              v-for="el in headerEls"
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
                :font-size="Math.max(6, el.fontSize * 0.85)"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="mini-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <template v-else><LayoutZoneInlineContent :el="el" /></template>
            </div>
          </div>
          <span v-if="headerEls.length === 0" class="mini-legacy">{{ headerFb }}</span>
        </div>
        <div class="mini-body" :style="bodyBand">
          <div class="mini-body-inner">
            <div
              v-for="d in decorationEls"
              :key="d.id"
              class="mini-zone-el"
              :style="miniZoneElStyle(d)"
            >
              <ZoneImageCompose
                v-if="d.type === 'image'"
                :image-src="d.imageSrc"
                :caption-text="d.text"
                :caption-position="d.imageCaptionPosition"
                :align-x="d.alignX"
                :align-y="d.alignY"
                :rotation-deg="d.imageRotationDeg"
                :font-size="Math.max(6, d.fontSize * 0.85)"
                :color="d.color"
              >
                <template #placeholder>
                  <span class="mini-ph">图</span>
                </template>
              </ZoneImageCompose>
              <template v-else><LayoutZoneInlineContent :el="d" /></template>
            </div>
            <template v-if="sheet !== 'body'">
              <div v-if="decorationEls.length === 0" class="mini-body-empty">正文</div>
            </template>
            <template v-else>
              <div v-for="el in bodyEls" :key="el.id" class="mini-tpl-el" :style="miniTplElStyle(el)">
                <ZoneImageCompose
                  v-if="el.type === 'image'"
                  :image-src="el.imageSrc"
                  :caption-text="el.text"
                  :caption-position="el.imageCaptionPosition"
                  :align-x="el.alignX"
                  :align-y="el.alignY"
                  :rotation-deg="el.imageRotationDeg"
                  :font-size="Math.max(6, el.fontSize * 0.8)"
                  :color="el.color"
                >
                  <template #placeholder>
                    <span class="mini-tpl-caption">图</span>
                  </template>
                </ZoneImageCompose>
                <span v-else class="mini-tpl-caption">{{ tplCaption(el) }}</span>
              </div>
              <div v-if="bodyEls.length === 0 && decorationEls.length === 0" class="mini-body-empty">画布</div>
            </template>
          </div>
        </div>
        <div v-if="me.fb > 1" class="mini-band mini-band-footer" :style="footerBand">
          <div class="mini-band-inner">
            <div v-for="el in footerEls" :key="el.id" class="mini-zone-el" :style="miniZoneElStyle(el)">
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
                  <span class="mini-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <template v-else><LayoutZoneInlineContent :el="el" /></template>
            </div>
          </div>
          <span v-if="footerEls.length === 0" class="mini-legacy">{{ footerFb }}</span>
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
import type { MiniPreviewVariant } from "@/components/report-template/mini-preview-types";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import {
  flexJustifyAlignForAxes,
  getZoneTextWrapStyle,
  normalizePageNumberMode,
  normalizeZIndex,
} from "@/lib/report-template/layout-zone-element";
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import {
  metricsForSheet,
  bodyElementsRef,
  zoneBodyDecorRef,
  type EditorSheet,
} from "@/lib/report-template/editor-sheet";
import type { ReportTemplate } from "@/lib/report-template/model";
import type { TemplateElement } from "@/lib/report-template/model";

const props = withDefaults(
  defineProps<{ template: ReportTemplate; sheet: EditorSheet; maxWidthPx?: number; maxHeightPx?: number }>(),
  { maxWidthPx: 160, maxHeightPx: 200 },
);

const sheet = computed(() => props.sheet);

const previewVariant = computed<MiniPreviewVariant>(() => {
  if (props.sheet === "cover") return "cover";
  if (props.sheet === "back") return "back";
  return "normal";
});

const me = computed(() => metricsForSheet(props.template, props.sheet));

const headerEls = computed(() =>
  props.sheet === "cover"
    ? props.template.coverHeaderElements
    : props.sheet === "back"
      ? props.template.backHeaderElements
      : props.template.headerElements,
);
const footerEls = computed(() =>
  props.sheet === "cover"
    ? props.template.coverFooterElements
    : props.sheet === "back"
      ? props.template.backFooterElements
      : props.template.footerElements,
);
const headerFb = computed(() =>
  props.sheet === "cover"
    ? props.template.coverHeaderText
    : props.sheet === "back"
      ? props.template.backHeaderText
      : props.template.headerText,
);
const footerFb = computed(() =>
  props.sheet === "cover"
    ? props.template.coverFooterText
    : props.sheet === "back"
      ? props.template.backFooterText
      : props.template.footerText,
);

const decorationEls = computed(() => zoneBodyDecorRef(props.template, props.sheet));
const bodyEls = computed(() => bodyElementsRef(props.template, props.sheet));

const scale = computed(() => {
  const m = me.value;
  const sx = props.maxWidthPx / Math.max(1, m.pageW);
  const sy = props.maxHeightPx / Math.max(1, m.pageH);
  return Math.min(sx, sy, 1);
});

const scaledSize = computed(() => {
  const m = me.value;
  const s = scale.value;
  return { w: Math.ceil(m.pageW * s), h: Math.ceil(m.pageH * s) };
});

const wrapStyle = computed(() => ({
  width: `${scaledSize.value.w}px`,
  height: `${scaledSize.value.h}px`,
  overflow: "hidden",
}));

/** 边框与投影由 MiniPreviewChrome 统一（与 LayoutPresetMiniPage / 版式列表一致） */
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
    fontSize: `${Math.max(6, el.fontSize * 0.85)}px`,
    ...(ff ? { fontFamily: ff } : {}),
    zIndex: String(normalizeZIndex(el.zIndex)),
  };
  if (el.type === "image") {
    s.display = "flex";
    s.flexDirection = "column";
    s.whiteSpace = "normal";
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

function miniTplElStyle(el: TemplateElement): Record<string, string> {
  const s: Record<string, string> = {
    position: "absolute",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    boxSizing: "border-box",
    border: "1px solid rgb(24 24 27 / 0.15)",
    borderRadius: "2px",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px",
    color: el.color,
    fontSize: `${Math.max(6, el.fontSize * 0.8)}px`,
    background:
      el.type === "box"
        ? el.bgColor !== "transparent"
          ? el.bgColor
          : "#e4e4e766"
        : el.bgColor !== "transparent"
          ? el.bgColor
          : "transparent",
  };
  if (el.type === "image") {
    s.alignItems = "stretch";
    s.justifyContent = "stretch";
    s.padding = "0";
    s.whiteSpace = "normal";
  }
  return s;
}

function tplCaption(el: TemplateElement): string {
  switch (el.type) {
    case "text":
      return el.text.trim()
        ? el.text.slice(0, 28) + (el.text.length > 28 ? "…" : "")
        : "文本";
    case "table":
      return "表·SQL";
    case "chart":
      return el.chartKind === "bar" ? "柱图" : "折线";
    case "parameter":
      return el.bindingKind === "opcua" ? "OPC参数" : el.bindingKind === "sql" ? "SQL参数" : "参数";
    case "signature":
      return el.imageSrc ? "签名" : el.signerLabel || "签署";
    case "image":
      return el.imageSrc ? "图像" : "图片";
    default:
      return "框";
  }
}
</script>

<style scoped>
.mini-wrap {
  touch-action: manipulation;
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
.mini-tpl-el {
  pointer-events: none;
}
.mini-tpl-caption {
  overflow: hidden;
  white-space: nowrap;
  max-width: 100%;
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
  color: #94a3b8;
}
</style>
