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
                :font-size="Math.max(6, el.fontSize * 0.85)"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="mini-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <template v-else-if="el.type === 'table'">
                <div class="mini-tpl-table-wrap">
                  <table class="mini-tpl-table" :style="miniZoneTableInnerStyle(el)">
                    <colgroup>
                      <col
                        v-for="(cw, ci) in miniZoneTableColInnerWidthsPx(el)"
                        :key="'hzcol-' + el.id + '-' + ci"
                        :style="{ width: cw + 'px' }"
                      />
                    </colgroup>
                    <tbody>
                      <tr
                        v-for="ri in miniZoneTableRowIndices(el)"
                        :key="'hzr-' + el.id + '-' + ri"
                        :style="miniZoneTableRowTrStyle(el)"
                      >
                        <td
                          v-for="ci in miniZoneTableColIndices(el)"
                          :key="'hzc-' + el.id + '-' + ri + '-' + ci"
                          class="mini-tpl-td"
                          :style="miniZoneTableCellStyle(el, ri, ci)"
                          :title="miniZoneTableCellText(el, ri, ci)"
                        >
                          {{ miniZoneTableCellText(el, ri, ci) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
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
                :font-size="Math.max(6, el.fontSize * 0.85)"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="mini-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <template v-else-if="el.type === 'table'">
                <div class="mini-tpl-table-wrap">
                  <table class="mini-tpl-table" :style="miniZoneTableInnerStyle(el)">
                    <colgroup>
                      <col
                        v-for="(cw, ci) in miniZoneTableColInnerWidthsPx(el)"
                        :key="'bzcol-' + el.id + '-' + ci"
                        :style="{ width: cw + 'px' }"
                      />
                    </colgroup>
                    <tbody>
                      <tr
                        v-for="ri in miniZoneTableRowIndices(el)"
                        :key="'bzr-' + el.id + '-' + ri"
                        :style="miniZoneTableRowTrStyle(el)"
                      >
                        <td
                          v-for="ci in miniZoneTableColIndices(el)"
                          :key="'bzc-' + el.id + '-' + ri + '-' + ci"
                          class="mini-tpl-td"
                          :style="miniZoneTableCellStyle(el, ri, ci)"
                          :title="miniZoneTableCellText(el, ri, ci)"
                        >
                          {{ miniZoneTableCellText(el, ri, ci) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
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
                :font-size="Math.max(6, el.fontSize * 0.85)"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="mini-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <template v-else-if="el.type === 'table'">
                <div class="mini-tpl-table-wrap">
                  <table class="mini-tpl-table" :style="miniZoneTableInnerStyle(el)">
                    <colgroup>
                      <col
                        v-for="(cw, ci) in miniZoneTableColInnerWidthsPx(el)"
                        :key="'fzcol-' + el.id + '-' + ci"
                        :style="{ width: cw + 'px' }"
                      />
                    </colgroup>
                    <tbody>
                      <tr
                        v-for="ri in miniZoneTableRowIndices(el)"
                        :key="'fzr-' + el.id + '-' + ri"
                        :style="miniZoneTableRowTrStyle(el)"
                      >
                        <td
                          v-for="ci in miniZoneTableColIndices(el)"
                          :key="'fzc-' + el.id + '-' + ri + '-' + ci"
                          class="mini-tpl-td"
                          :style="miniZoneTableCellStyle(el, ri, ci)"
                          :title="miniZoneTableCellText(el, ri, ci)"
                        >
                          {{ miniZoneTableCellText(el, ri, ci) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
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
import type { MiniPreviewVariant } from "@/components/report-template/mini-preview-types";
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import { computePaperLayout } from "@/lib/report-template/layout-geometry";
import { miniPreviewScale } from "@/lib/report-template/mini-preview-scale";
import type { LayoutPreset } from "@/lib/report-template/layout-model";
import { presetToSnapshot } from "@/lib/report-template/layout-model";
import {
  ensureZoneTableGrid,
  flexJustifyAlignForAxes,
  getZoneTextWrapStyle,
  normalizePageNumberMode,
  normalizeZIndex,
  resolveTableCellBackgroundCss,
  zoneFillBackgroundCss,
  zoneTableColumnInnerWidthsPx,
  zoneTableInnerBackgroundCss,
  zoneTableNodeShellBackgroundCss,
  type LayoutZoneElement,
  type LayoutZoneTableCell,
} from "@/lib/report-template/layout-zone-element";
import { clampTableRowHeightPx } from "@/lib/report-template/table-cell-metrics";
import { formatSqlFillTableCellPreview } from "@/lib/report-template/table-sql-fill-preview";

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

/** 与 TemplateMiniPage 一致：按设计字号缩放，不人为抬高（避免缩略图字号失真） */
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
    s.backgroundColor = zoneFillBackgroundCss(el.bgColor);
  } else if (el.type === "table") {
    s.display = "flex";
    s.flexDirection = "column";
    s.alignItems = "stretch";
    s.justifyContent = "stretch";
    s.padding = "2px";
    s.overflow = "hidden";
    s.whiteSpace = "normal";
    s.backgroundColor = zoneTableNodeShellBackgroundCss();
  } else {
    s.display = "flex";
    s.justifyContent = flex.justifyContent;
    s.alignItems = flex.alignItems;
    if (wrap) Object.assign(s, wrap);
    else s.whiteSpace = "nowrap";
    if (el.type === "pageNumber" && normalizePageNumberMode(el.pageNumberMode) === "circle") {
      s.padding = "1px";
      s.backgroundColor = "transparent";
    } else {
      s.backgroundColor = zoneFillBackgroundCss(el.bgColor);
    }
  }
  return s;
}

function truncateStatic(s: string, n: number): string {
  const x = s.replace(/\s+/g, " ");
  return x.length <= n ? x : `${x.slice(0, n)}…`;
}

function formatStaticTableCell(cell: LayoutZoneTableCell): string {
  if (cell.bindingKind === "opcua") {
    const id = cell.opcuaNodeId.trim();
    return id ? `⟨UA⟩ ${truncateStatic(id, 48)}` : "⟨UA⟩";
  }
  if (cell.bindingKind === "sql") {
    const q = cell.sqlText.trim();
    return q ? `⟨SQL⟩ ${truncateStatic(q, 36)}` : "⟨SQL⟩";
  }
  if (cell.bindingKind === "mongo") {
    const col = cell.mongoQuery?.collection?.trim() || "";
    return col ? `⟨Mongo⟩ ${truncateStatic(col, 36)}` : "⟨Mongo⟩";
  }
  const t = cell.text.trim();
  return t.length > 0 ? t : "\u00a0";
}

function zoneTableGrid(el: LayoutZoneElement): LayoutZoneTableCell[][] {
  if (el.type !== "table") return [];
  return ensureZoneTableGrid(el);
}

function miniZoneTableInnerStyle(el: LayoutZoneElement): Record<string, string> {
  if (el.type !== "table") return {};
  return { background: zoneTableInnerBackgroundCss(el.bgColor) };
}

function miniZoneTableRowTrStyle(el: LayoutZoneElement): Record<string, string> | undefined {
  if (el.type !== "table") return undefined;
  const h = clampTableRowHeightPx(el.tableRowHeightPx);
  // 与版式编辑画布一致：固定行高（tr 的 min-height/auto 在表格布局下常被忽略）
  return { height: `${h}px`, maxHeight: `${h}px` };
}

function miniZoneTableCellStyle(el: LayoutZoneElement, ri: number, ci: number): Record<string, string> {
  if (el.type !== "table") return {};
  ensureZoneTableGrid(el);
  const cell = el.tableCells?.[ri]?.[ci];
  const h = clampTableRowHeightPx(el.tableRowHeightPx);
  return {
    backgroundColor: resolveTableCellBackgroundCss(
      { tableBgColor: el.bgColor, tableColBgColors: el.tableColBgColors },
      ci,
      cell,
    ),
    height: `${h}px`,
    maxHeight: `${h}px`,
  };
}

function miniZoneTableColInnerWidthsPx(el: LayoutZoneElement): number[] {
  if (el.type !== "table") return [];
  return zoneTableColumnInnerWidthsPx(el);
}

function miniZoneTableColIndices(el: LayoutZoneElement): number[] {
  const n = el.tableCols ?? 4;
  return Array.from({ length: n }, (_, i) => i);
}

function miniZoneTableRowIndices(el: LayoutZoneElement): number[] {
  const g = zoneTableGrid(el);
  return Array.from({ length: g.length }, (_, i) => i);
}

function miniZoneTableCellText(el: LayoutZoneElement, ri: number, ci: number): string {
  if (el.type === "table" && el.tableSqlFill?.enabled) {
    return formatSqlFillTableCellPreview({
      fill: el.tableSqlFill,
      rowIndex: ri,
      colIndex: ci,
      preview: null,
      previewLoading: false,
      errorMaxLen: 36,
    });
  }
  const cell = zoneTableGrid(el)[ri]?.[ci];
  return cell ? formatStaticTableCell(cell) : "\u00a0";
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
.mini-ph {
  font-size: 8px;
  color: #a1a1aa;
}
/* 与 TemplateMiniPage 表格单元格样式对齐 */
.mini-tpl-table-wrap {
  width: 100%;
  height: 100%;
  overflow: visible;
  box-sizing: border-box;
  padding-bottom: 1px;
}
.mini-tpl-table {
  width: 100%;
  height: auto;
  max-height: none;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  background: rgb(255 255 255 / 0.96);
}
.mini-tpl-table tbody td {
  height: inherit;
  box-sizing: border-box;
}
.mini-tpl-td {
  border-top: 1px solid rgb(212 212 216);
  border-left: 1px solid rgb(212 212 216);
  padding: 2px 4px;
  vertical-align: middle;
  text-align: center;
  font-size: max(10px, 0.85em);
  line-height: 1.25;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  box-sizing: border-box;
}
.mini-tpl-td:last-child {
  border-right: 1px solid rgb(212 212 216);
}
.mini-tpl-table tbody tr:last-child .mini-tpl-td {
  border-bottom: 1px solid rgb(212 212 216);
}
</style>
