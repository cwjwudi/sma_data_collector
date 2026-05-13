<template>
  <div class="mini-shell" :class="shellRoleClass">
    <span class="role-tag" :title="roleBadgeText">{{ roleBadgeText }}</span>
    <div class="mini-wrap" :style="wrapStyle">
      <div class="mini-page" :style="pageBoxStyle">
        <div v-if="me.hb >= 1" class="mini-band mini-band-header" :style="headerBand">
        <div class="mini-band-inner">
          <div v-for="el in preset.headerElements" :key="el.id" class="mini-zone-el" :style="miniZoneElStyle(el)">
            <template v-if="el.type === 'image'">
              <img v-if="el.imageSrc" class="mini-img" :src="el.imageSrc" alt="" />
              <span v-else class="mini-ph">图片</span>
            </template>
            <template v-else>{{ previewZoneTxt(el) }}</template>
          </div>
        </div>
        <span v-if="preset.headerElements.length === 0" class="mini-legacy">{{ preset.headerText || "(页眉)" }}</span>
      </div>
      <div class="mini-body" :style="bodyBand">
        <div class="mini-body-inner">
          <div v-for="el in preset.bodyElements" :key="el.id" class="mini-zone-el" :style="miniZoneElStyle(el)">
            <template v-if="el.type === 'image'">
              <img v-if="el.imageSrc" class="mini-img" :src="el.imageSrc" alt="" />
              <span v-else class="mini-ph">图片</span>
            </template>
            <template v-else>{{ previewZoneTxt(el) }}</template>
          </div>
          <div v-if="preset.bodyElements.length === 0" class="mini-body-empty">{{ bodyEmptyHint }}</div>
        </div>
      </div>
      <div v-if="me.fb >= 1" class="mini-band mini-band-footer" :style="footerBand">
        <div class="mini-band-inner">
          <div v-for="el in preset.footerElements" :key="el.id" class="mini-zone-el" :style="miniZoneElStyle(el)">
            <template v-if="el.type === 'image'">
              <img v-if="el.imageSrc" class="mini-img" :src="el.imageSrc" alt="" />
              <span v-else class="mini-ph">图片</span>
            </template>
            <template v-else>{{ previewZoneTxt(el) }}</template>
          </div>
        </div>
        <span v-if="preset.footerElements.length === 0" class="mini-legacy">{{ preset.footerText || "(页脚)" }}</span>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { presetToSnapshot } from "@/lib/report-template/layout-model";
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import { previewZoneElementDisplay } from "@/lib/report-template/layout-zone-element";

const props = withDefaults(
  defineProps<{ preset: LayoutPreset; maxWidthPx?: number; maxHeightPx?: number }>(),
  { maxWidthPx: 160, maxHeightPx: 210 },
);

/** 缩略图外框：区分封面 / 末页封尾 / 正文页眉脚 */
const shellRoleClass = computed(() => {
  const r = props.preset.pageRole;
  if (r === "cover" || r === "back") return `mini-shell--${r}`;
  return "mini-shell--normal";
});

const roleBadgeText = computed(() => {
  switch (props.preset.pageRole) {
    case "cover":
      return "封面";
    case "back":
      return "末页 · 封尾";
    default:
      return "正文 · 眉脚";
  }
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

const pageBoxStyle = computed(() => ({
  position: "relative" as const,
  width: `${me.value.pageW}px`,
  height: `${me.value.pageH}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: "top left",
  boxSizing: "border-box",
  background: "#fff",
  border: "1px solid #d4d4d8",
  boxShadow: "0 2px 6px rgb(24 24 27 / 0.08)",
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

function previewZoneTxt(el: LayoutZoneElement): string {
  return previewZoneElementDisplay(el);
}

function miniZoneElStyle(el: LayoutZoneElement): Record<string, string> {
  return {
    position: "absolute",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "nowrap",
    color: el.color,
    fontSize: `${Math.max(6, el.fontSize * 0.85)}px`,
  };
}
</script>

<style scoped>
.mini-shell {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  border-radius: 10px;
  box-sizing: border-box;
}
.mini-shell--cover {
  background: linear-gradient(155deg, rgb(254 249 231) 0%, rgb(253 246 237) 28%, rgb(249 249 251) 55%);
  outline: 1px solid rgb(251 191 36 / 0.45);
  outline-offset: 0;
}
.mini-shell--back {
  background: linear-gradient(205deg, rgb(247 239 251) 0%, rgb(245 243 255) 32%, rgb(249 249 251) 58%);
  outline: 1px solid rgb(167 139 250 / 0.45);
}
.mini-shell--normal {
  background: linear-gradient(180deg, rgb(238 242 255) 0%, rgb(250 250 253) 40%);
  outline: 1px solid rgb(129 140 248 / 0.35);
}
.role-tag {
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
}
.mini-shell--cover .role-tag {
  background: #d97706;
  color: #fff;
}
.mini-shell--back .role-tag {
  background: #6d28d9;
  color: #fff;
}
.mini-shell--normal .role-tag {
  background: #4338ca;
  color: #fff;
}
.mini-shell--cover .mini-page {
  border-top-width: 3px;
  border-top-style: solid;
  border-top-color: rgb(251 146 60);
}
.mini-shell--back .mini-page {
  border-bottom-width: 3px;
  border-bottom-style: solid;
  border-bottom-color: rgb(168 139 246);
}
.mini-shell--normal .mini-page {
  border-left-width: 3px;
  border-left-style: solid;
  border-left-color: rgb(99 102 241);
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
  background: rgb(239 239 246 / 0.5);
}
.mini-band-footer {
  background: rgb(239 239 246 / 0.5);
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
  color: #94a3b8;
}
</style>
