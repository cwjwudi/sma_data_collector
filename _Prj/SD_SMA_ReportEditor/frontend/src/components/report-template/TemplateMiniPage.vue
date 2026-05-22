<template>
  <MiniPreviewChrome :variant="previewVariant" :show-tag="false">
    <div class="mini-wrap" :style="wrapStyle">
      <div class="mini-page mpp-paper" :style="pageBoxStyle">
        <div v-if="me.hb > 0" class="mini-band mini-band-header" :style="headerBand">
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
              <template v-else
                ><LayoutZoneInlineContent
                  :el="el"
                  :preview-page="previewPage"
                  :preview-total-pages="previewTotalPages"
              /></template>
            </div>
          </div>
          <span v-if="headerEls.length === 0" class="mini-legacy">{{ headerFb }}</span>
        </div>
        <div class="mini-body" :style="bodyBand">
          <div class="mini-body-inner">
            <div
              v-for="d in decorationEls"
              v-show="miniShowDecorationEls"
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
              <template v-else
                ><LayoutZoneInlineContent
                  :el="d"
                  :preview-page="previewPage"
                  :preview-total-pages="previewTotalPages"
              /></template>
            </div>
            <template v-if="sheet !== 'body'">
              <div v-if="decorationEls.length === 0" class="mini-body-empty">正文</div>
            </template>
            <template v-else>
              <div
                v-for="el in bodyEls"
                v-show="miniShowBodyTplEl(el)"
                :key="(sheet === 'body' ? String(bodyPageIndex) + ':' : '') + el.id"
                class="mini-tpl-el"
                :style="miniTplElStyle(el)"
              >
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
                <template v-else-if="el.type === 'table'">
                  <div class="mini-tpl-table-wrap">
                    <table class="mini-tpl-table" :style="miniTplTableInnerStyle(el)">
                      <colgroup>
                        <col
                          v-for="(cw, ci) in miniTplTableColInnerWidthsPx(el)"
                          :key="'mcol-' + el.id + '-' + ci"
                          :style="{ width: cw + 'px' }"
                        />
                      </colgroup>
                      <tbody>
                        <tr v-for="ri in miniTableRowIndices(el)" :key="'mr-' + el.id + '-' + ri" :style="miniTplTableRowTrStyle(el)">
                          <td
                            v-for="ci in miniTableColIndices(el)"
                            :key="'mc-' + el.id + '-' + ri + '-' + ci"
                            class="mini-tpl-td"
                            :title="miniTableStaticTitle(el, ri, ci)"
                          >
                            {{ previewTableCellText(el, ri, ci) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </template>
                <span v-else-if="el.type === 'parameter'" class="mini-tpl-caption mini-tpl-param">{{
                  previewParameterText(el)
                }}</span>
                <span v-else-if="el.type === 'date'" class="mini-tpl-caption">{{ formatTplDate(el) }}</span>
                <span v-else-if="el.type === 'chart'" class="mini-tpl-caption">{{ previewChartText(el) }}</span>
                <template v-else-if="el.type === 'signature'">
                  <div class="mini-tpl-sig-stack" :style="miniSigStackJustify(el)">
                    <span
                      v-if="signatureShowsWatermark(el)"
                      class="mini-tpl-sig-watermark"
                      :class="{
                        'mini-tpl-sig-watermark--behind': signatureShowsHandwriting(el) && el.imageSrc,
                      }"
                      :style="miniSignatureWatermarkStyle(el)"
                      >{{ signatureWatermarkText(el) }}</span
                    >
                    <img
                      v-if="signatureShowsHandwriting(el) && el.imageSrc"
                      class="mini-tpl-sig-img"
                      :class="{ 'mini-tpl-sig-img--front': signatureShowsWatermark(el) }"
                      :src="el.imageSrc"
                      alt=""
                    />
                    <span
                      v-else-if="signatureShowsHandwriting(el) && !el.imageSrc"
                      class="mini-tpl-sig-handwriting-ph"
                      >（无图）</span
                    >
                  </div>
                </template>
                <span v-else class="mini-tpl-caption">{{ tplCaption(el) }}</span>
              </div>
              <div
                v-if="miniSqlFillTailDividerStyle"
                class="mini-sql-tail-hint"
                :style="miniSqlFillTailDividerStyle"
              >
                以下控件将在导出预览中另起一页显示
              </div>
              <div v-if="bodyEls.length === 0 && decorationEls.length === 0" class="mini-body-empty">画布</div>
            </template>
          </div>
        </div>
        <div v-if="me.fb > 0" class="mini-band mini-band-footer" :style="footerBand">
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
              <template v-else
                ><LayoutZoneInlineContent
                  :el="el"
                  :preview-page="previewPage"
                  :preview-total-pages="previewTotalPages"
              /></template>
            </div>
          </div>
          <span v-if="footerEls.length === 0" class="mini-legacy">{{ footerFb }}</span>
        </div>
      </div>
    </div>
  </MiniPreviewChrome>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
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
  zoneFillBackgroundCss,
  zoneTableInnerBackgroundCss,
  zoneTableNodeShellBackgroundCss,
  formatLayoutDate,
} from "@/lib/report-template/layout-zone-element";
import { cellKey, chartKey, paramKey } from "@/lib/report-template/binding-preview-utils";
import { reportBindingPreviewKey } from "@/lib/report-template/template-editor-context";
import {
  sqlFillSliceTableOuterHeightPx,
  tplElementsHorizontallyOverlap,
} from "@/lib/report-template/table-sql-fill-layout-utils";
import type { SqlFillTablePreviewSlice } from "@/lib/report-template/table-sql-fill-export-preview-split";
import { formatSqlFillTableCellPreview, templateTableSqlFillPreviewKey } from "@/lib/report-template/table-sql-fill-preview";
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import {
  metricsForSheet,
  bodyElementsRef,
  zoneBodyDecorRef,
  type EditorSheet,
} from "@/lib/report-template/editor-sheet";
import type { ReportTemplate, TemplateElement, TemplateTableCell } from "@/lib/report-template/model";
import {
  ensureTableGrid,
  signatureShowsHandwriting,
  signatureShowsWatermark,
  signatureWatermarkText,
  templateTableColumnInnerWidthsPx,
} from "@/lib/report-template/model";
import { clampTableRowHeightPx } from "@/lib/report-template/table-cell-metrics";
import { miniPreviewScale } from "@/lib/report-template/mini-preview-scale";

const props = withDefaults(
  defineProps<{
    template: ReportTemplate;
    sheet: EditorSheet;
    /** 正文分页时的页序号（0-based），封面/末页忽略 */
    bodyPageIndex?: number;
    /** 正文区内 SQL 填充续页序号（0 为首屏）；仅导出预览栈使用 */
    bodyContinuationIndex?: number;
    /** 按表格 id 裁剪 SQL 填充预览行（导出预览分页） */
    sqlFillTableSlices?: Record<string, SqlFillTablePreviewSlice>;
    /** 续页卡片：隐藏正文区装饰与非续表控件 */
    continuationHideOtherBodyElements?: boolean;
    /** 首屏：隐藏与该 SQL 表重叠且位于逻辑底线之下的控件 */
    sqlFillHideBelow?: { tableId: string; baselineY: number } | null;
    /** SQL 表最后一页：在表下显示「以下控件另起一页」 */
    showSqlFillTailDividerHint?: boolean;
    /** 仅渲染表格底线之下的正文控件（导出预览尾页） */
    tailOnlyBelowBaseline?: boolean;
    tailBaselineY?: number;
    overflowSqlFillTableId?: string;
    maxWidthPx?: number;
    maxHeightPx?: number;
    /** 页眉/页脚区内页码预览 */
    previewPage?: number;
    previewTotalPages?: number;
  }>(),
  {
    maxWidthPx: 160,
    maxHeightPx: 200,
    bodyPageIndex: 0,
    bodyContinuationIndex: 0,
    continuationHideOtherBodyElements: false,
    sqlFillHideBelow: null,
    showSqlFillTailDividerHint: false,
    tailOnlyBelowBaseline: false,
  },
);

const bindingPreview = inject(reportBindingPreviewKey, null);

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
const bodyEls = computed(() =>
  bodyElementsRef(props.template, props.sheet, props.sheet === "body" ? props.bodyPageIndex : 0),
);

const miniShowDecorationEls = computed(
  () => !props.continuationHideOtherBodyElements && !props.tailOnlyBelowBaseline,
);

const miniSqlFillTailDividerStyle = computed((): Record<string, string> | null => {
  if (!props.showSqlFillTailDividerHint || props.sheet !== "body") return null;
  const tid = props.overflowSqlFillTableId;
  if (!tid) return null;
  const tbl = bodyEls.value.find((e) => e.id === tid && e.type === "table");
  if (!tbl || tbl.type !== "table") return null;
  const slice = props.sqlFillTableSlices?.[tid];
  if (!slice) return null;
  const h = sqlFillSliceTableOuterHeightPx(tbl, slice);
  if (h == null) return null;
  return {
    position: "absolute",
    left: `${tbl.x}px`,
    top: `${tbl.y + h + 4}px`,
    width: `${tbl.w}px`,
    boxSizing: "border-box",
    padding: "4px 6px",
    fontSize: "10px",
    lineHeight: "1.35",
    color: "#52525b",
    background: "rgb(244 244 245 / 0.95)",
    border: "1px dashed rgb(161 161 170)",
    borderRadius: "4px",
    pointerEvents: "none",
    zIndex: "6",
  };
});

const scale = computed(() =>
  miniPreviewScale(props.maxWidthPx, props.maxHeightPx, me.value.pageW, me.value.pageH),
);

const scaledSize = computed(() => {
  const m = me.value;
  const s = scale.value;
  return {
    w: Math.ceil(m.pageW * s),
    /** +3：缩放绘制与表格底线在分数像素边界上易被外层 overflow:hidden 裁掉 */
    h: Math.ceil(m.pageH * s) + 3,
  };
});

const wrapStyle = computed(() => ({
  width: `${scaledSize.value.w}px`,
  maxWidth: "100%",
  height: `${scaledSize.value.h}px`,
  maxHeight: "100%",
  overflow: "hidden",
  boxSizing: "border-box",
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

function miniShowBodyTplEl(el: TemplateElement): boolean {
  if (props.tailOnlyBelowBaseline && props.tailBaselineY != null) {
    const base = props.tailBaselineY;
    if (props.overflowSqlFillTableId && el.id === props.overflowSqlFillTableId) return false;
    return el.y >= base - 0.5;
  }
  if (props.continuationHideOtherBodyElements) {
    if (el.type !== "table") return false;
    const sm = props.sqlFillTableSlices;
    return !!(sm && sm[el.id]);
  }
  const hb = props.sqlFillHideBelow;
  if (hb) {
    const tbl = bodyEls.value.find((x) => x.id === hb.tableId && x.type === "table");
    if (tbl && el.id !== hb.tableId && tplElementsHorizontallyOverlap(el, tbl) && el.y >= hb.baselineY - 0.25) {
      return false;
    }
  }
  return true;
}

function sqlFillSliceForTpl(el: TemplateElement): SqlFillTablePreviewSlice | undefined {
  return props.sqlFillTableSlices?.[el.id];
}

function miniTplElStyle(el: TemplateElement): Record<string, string> {
  const slice = el.type === "table" ? sqlFillSliceForTpl(el) : undefined;
  const cont = props.bodyContinuationIndex ?? 0;
  let topPx = el.y;
  let heightPx = el.h;
  if (props.tailOnlyBelowBaseline && props.tailBaselineY != null) {
    topPx = el.y - props.tailBaselineY;
  }
  if (slice) {
    const h2 = sqlFillSliceTableOuterHeightPx(el, slice);
    if (h2 != null) heightPx = h2;
    if (cont > 0) topPx = 0;
  }
  const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
  const explicitZ = normalizeZIndex(el.zIndex ?? 0);
  const z =
    explicitZ !== 0 ? explicitZ : Math.min(200000, Math.max(0, Math.floor(el.y)));
  const s: Record<string, string> = {
    position: "absolute",
    left: `${el.x}px`,
    top: `${topPx}px`,
    width: `${el.w}px`,
    height: `${heightPx}px`,
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
    ...(ff ? { fontFamily: ff } : {}),
    zIndex: String(z),
  };
  const wrap = getZoneTextWrapStyle(el);
  if (wrap) Object.assign(s, wrap);
  if (el.type === "box") {
    s.background =
      el.bgColor !== "transparent" ? el.bgColor : "#e4e4e766";
  } else if (el.type === "table") {
    s.background = zoneTableNodeShellBackgroundCss();
  } else {
    s.background = el.bgColor !== "transparent" ? el.bgColor : "transparent";
  }
  if (el.type === "image") {
    s.alignItems = "stretch";
    s.justifyContent = "stretch";
    s.padding = "0";
    s.whiteSpace = "normal";
  } else if (el.type === "box") {
    const bc = typeof el.color === "string" ? el.color : "#18181b";
    s.border = `1px solid ${bc}40`;
    s.borderRadius = "4px";
    s.padding = "2px 6px";
    const flex = flexJustifyAlignForAxes(el.alignX, el.alignY);
    s.justifyContent = flex.justifyContent;
    s.alignItems = flex.alignItems;
  } else if (el.type === "date") {
    s.border = "none";
    s.borderRadius = "0";
    const flex = flexJustifyAlignForAxes(el.alignX, el.alignY);
    s.justifyContent = flex.justifyContent;
    s.alignItems = flex.alignItems;
  } else if (el.type === "signature") {
    s.border = "none";
    s.borderRadius = "0";
    const flex = flexJustifyAlignForAxes(el.alignX, el.alignY);
    s.justifyContent = flex.justifyContent;
    s.alignItems = flex.alignItems;
  }
  if (el.type === "table") {
    s.alignItems = "stretch";
    s.justifyContent = "stretch";
    /** 与 TemplateBodyCanvas：.el-node{padding:4px} + 表格外框无 border，表格铺满内容区 */
    s.padding = "4px";
    s.overflow = "hidden";
    s.border = "none";
    s.borderRadius = "0";
    s.fontSize = `${el.fontSize}px`;
    s.background = zoneTableNodeShellBackgroundCss();
    return s;
  }
  return s;
}

function miniTplTableInnerStyle(el: TemplateElement): Record<string, string> {
  if (el.type !== "table") return {};
  return { background: zoneTableInnerBackgroundCss(el.bgColor) };
}

function miniTplTableColInnerWidthsPx(el: TemplateElement): number[] {
  if (el.type !== "table") return [];
  return templateTableColumnInnerWidthsPx(el);
}

function tableGrid(el: TemplateElement): TemplateTableCell[][] {
  if (el.type !== "table") return [];
  return ensureTableGrid(el);
}

function miniTplTableRowTrStyle(el: TemplateElement): Record<string, string> | undefined {
  if (el.type !== "table") return undefined;
  return { height: `${clampTableRowHeightPx(el.tableRowHeightPx)}px` };
}

function truncateStatic(s: string, n: number): string {
  const x = s.replace(/\s+/g, " ");
  return x.length <= n ? x : `${x.slice(0, n)}…`;
}

function formatStaticTableCell(cell: TemplateTableCell): string {
  if (cell.bindingKind === "opcua") {
    const id = cell.opcuaNodeId.trim();
    return id ? `⟨UA⟩ ${truncateStatic(id, 48)}` : "⟨UA⟩";
  }
  if (cell.bindingKind === "sql") {
    const q = cell.sqlText.trim();
    return q ? `⟨SQL⟩ ${truncateStatic(q, 36)}` : "⟨SQL⟩";
  }
  const t = cell.text.trim();
  return t.length > 0 ? t : "\u00a0";
}

function miniTableColIndices(el: TemplateElement): number[] {
  const n = el.tableCols ?? 4;
  return Array.from({ length: n }, (_, i) => i);
}

function miniTableRowIndices(el: TemplateElement): number[] {
  const g = tableGrid(el);
  const base = g.length;
  const pk = templateTableSqlFillPreviewKey(el.id);
  const pv = bindingPreview?.values.value[pk]?.tableSqlFill;
  const slice = sqlFillSliceForTpl(el);
  if (el.type !== "table" || !el.tableSqlFill?.enabled || !pv?.dataRows?.length) {
    return Array.from({ length: base }, (_, i) => i);
  }
  if (slice) {
    const n = (slice.includeHeaderRow ? 1 : 0) + slice.dataRowCount;
    return Array.from({ length: Math.max(1, n) }, (_, i) => i);
  }
  const total = Math.max(base, 1 + pv.dataRows.length);
  return Array.from({ length: total }, (_, i) => i);
}

function miniTableStaticTitle(el: TemplateElement, ri: number, ci: number): string {
  if (el.type === "table" && el.tableSqlFill?.enabled) {
    const vals = bindingPreview?.values.value;
    const pk = templateTableSqlFillPreviewKey(el.id);
    const fillPv = vals?.[pk]?.tableSqlFill;
    const loading = !!(bindingPreview?.loading.value && !fillPv?.dataRows?.length && !fillPv?.error);
    return formatSqlFillTableCellPreview({
      fill: el.tableSqlFill,
      rowIndex: ri,
      colIndex: ci,
      preview: fillPv ?? null,
      previewLoading: loading,
      errorMaxLen: 48,
      previewSlice: sqlFillSliceForTpl(el),
    });
  }
  const c = tableGrid(el)[ri]?.[ci];
  return c ? formatStaticTableCell(c) : "";
}

function previewTableCellText(el: TemplateElement, ri: number, ci: number): string {
  const cell = tableGrid(el)[ri]?.[ci] ?? null;
  const vals = bindingPreview?.values.value;

  if (el.type === "table" && el.tableSqlFill?.enabled) {
    const fill = el.tableSqlFill;
    const pk = templateTableSqlFillPreviewKey(el.id);
    const fillPv = vals?.[pk]?.tableSqlFill;
    const loading = !!(bindingPreview?.loading.value && !fillPv?.dataRows?.length && !fillPv?.error);
    return formatSqlFillTableCellPreview({
      fill,
      rowIndex: ri,
      colIndex: ci,
      preview: fillPv ?? null,
      previewLoading: loading,
      errorMaxLen: 36,
      previewSlice: sqlFillSliceForTpl(el),
    });
  }

  const key = cellKey(el.id, ri, ci);
  if (vals?.[key]?.text) return vals[key].text;
  if ((cell?.bindingKind === "opcua" || cell?.bindingKind === "sql") && bindingPreview?.loading.value) {
    return "…";
  }
  return cell ? formatStaticTableCell(cell) : "\u00a0";
}

function previewParameterText(el: TemplateElement): string {
  const vals = bindingPreview?.values.value;
  const key = paramKey(el.id);
  if (el.bindingKind === "opcua" || el.bindingKind === "sql") {
    if (vals?.[key]?.text) return vals[key].text;
    if (bindingPreview?.loading.value) {
      return `${el.text.trim() || "参数"}（加载中…）`;
    }
    const fb = el.text.trim();
    return fb || "（绑定预览：请确认 OPC / SQL 已配置）";
  }
  const t = el.text.trim();
  return t ? truncateStatic(t, 120) : tplCaption(el);
}

function previewChartText(el: TemplateElement): string {
  const vals = bindingPreview?.values.value;
  const key = chartKey(el.id);
  if (el.bindingKind === "sql") {
    if (vals?.[key]?.text) return vals[key].text;
    if (bindingPreview?.loading.value) {
      return `${el.chartKind === "bar" ? "柱图" : "折线"}（加载中…）`;
    }
  }
  return tplCaption(el);
}

function formatTplDate(el: TemplateElement): string {
  if (el.type !== "date") return "";
  const pat = (el.dateFormat || "").trim() || "HH:mm:ss";
  return formatLayoutDate(new Date(), pat);
}

function miniTextAlignForSig(el: TemplateElement): Record<string, string> | undefined {
  if (el.type !== "signature") return undefined;
  const ta =
    el.alignX === "center" ? "center" : el.alignX === "end" ? "right" : "left";
  return { textAlign: ta };
}

function miniSigStackJustify(el: TemplateElement): Record<string, string> | undefined {
  if (el.type !== "signature") return undefined;
  const jc =
    el.alignX === "center" ? "center" : el.alignX === "end" ? "flex-end" : "flex-start";
  return { justifyContent: jc };
}

function miniSignatureWatermarkStyle(
  el: TemplateElement,
): Record<string, string> | undefined {
  if (el.type !== "signature") return undefined;
  const ta = miniTextAlignForSig(el);
  if (signatureShowsHandwriting(el) && el.imageSrc) {
    const jc =
      el.alignX === "center" ? "center" : el.alignX === "end" ? "flex-end" : "flex-start";
    return { ...ta, justifyContent: jc };
  }
  return ta;
}

function tplCaption(el: TemplateElement): string {
  switch (el.type) {
    case "text":
      return el.text.trim()
        ? el.text.slice(0, 28) + (el.text.length > 28 ? "…" : "")
        : "文本";
    case "box":
      return el.text.trim()
        ? el.text.slice(0, 28) + (el.text.length > 28 ? "…" : "")
        : "色块";
    case "table":
      return `表·${el.tableRows ?? "?"}×${el.tableCols ?? "?"}`;
    case "chart":
      return el.chartKind === "bar" ? "柱图" : "折线";
    case "date":
      return formatTplDate(el);
    case "parameter":
      return el.bindingKind === "opcua" ? "OPC参数" : el.bindingKind === "sql" ? "SQL参数" : "参数";
    case "signature": {
      const wm = signatureShowsWatermark(el) ? signatureWatermarkText(el) : "";
      const hw = signatureShowsHandwriting(el);
      if (hw && el.imageSrc && wm) return truncateStatic(`${wm}+手写`, 28);
      if (hw && el.imageSrc) return "手写";
      if (wm && hw && !el.imageSrc) return truncateStatic(`${wm}·无图`, 28);
      if (wm) return truncateStatic(wm, 28);
      if (hw) return el.imageSrc ? "手写" : truncateStatic("无手写图", 28);
      return "签名";
    }
    case "image":
      return el.imageSrc ? "图像" : "图片";
    default:
      return "控件";
  }
}
</script>

<style scoped>
.mini-wrap {
  touch-action: manipulation;
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
.mini-tpl-el {
  pointer-events: none;
}
.mini-tpl-caption {
  overflow: hidden;
  white-space: nowrap;
  max-width: 100%;
}
.mini-tpl-table-wrap {
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  /* 避免 overflow:hidden + height:100% 表格最后一行底边框落在裁剪边上被吃掉（导出预览常见） */
  padding-bottom: 1px;
}
.mini-tpl-table {
  width: 100%;
  height: auto;
  max-height: 100%;
  /* separate：避免 collapse + 缩放预览时最下行外侧横线被算法吃掉 */
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
  padding: 3px 5px;
  vertical-align: middle;
  text-align: center;
  font-size: max(10px, 0.85em);
  line-height: 1.3;
  overflow: hidden;
  word-break: break-word;
}
.mini-tpl-td:last-child {
  border-right: 1px solid rgb(212 212 216);
}
.mini-tpl-table tbody tr:last-child .mini-tpl-td {
  border-bottom: 1px solid rgb(212 212 216);
}
.mini-tpl-param {
  white-space: normal;
  display: block;
  max-height: 100%;
  overflow: hidden;
  text-align: center;
  line-height: 1.25;
}
.mini-tpl-sig-stack {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
}
.mini-tpl-sig-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.mini-tpl-sig-img--front {
  position: relative;
  z-index: 1;
}
.mini-tpl-sig-watermark {
  display: block;
  flex: 1;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  word-break: break-word;
  line-height: 1.2;
  font-weight: 700;
  text-align: center;
  color: transparent;
  -webkit-text-stroke: 0.95px rgb(148 163 184 / 0.88);
  -webkit-text-fill-color: transparent;
}
.mini-tpl-sig-watermark--behind {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  padding: 0 2px;
  z-index: 0;
  pointer-events: none;
}
.mini-tpl-sig-handwriting-ph {
  flex: 1;
  min-width: 0;
  font-size: max(8px, 0.75em);
  opacity: 0.65;
  text-align: center;
  word-break: break-word;
}
@supports not ((-webkit-text-stroke: 1px transparent) or (text-stroke: 1px transparent)) {
  .mini-tpl-sig-watermark {
    color: rgb(148 163 184 / 0.48);
    -webkit-text-stroke: 0 transparent;
    -webkit-text-fill-color: currentcolor;
  }
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
