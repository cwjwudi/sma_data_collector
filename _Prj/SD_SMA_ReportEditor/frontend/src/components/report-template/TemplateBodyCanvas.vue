<template>
  <div
    ref="viewportRef"
    class="cv-viewport"
    :class="{
      'cv-viewport--locked': interactionLocked,
      'cv-viewport--embed-scroll': embedInParentScroll,
    }"
    @wheel="onWheel"
  >
    <input
      ref="tplImgFileRef"
      type="file"
      accept="image/*,.svg"
      class="cv-sr-file"
      tabindex="-1"
      aria-hidden="true"
      @change="onTplBodyImageChosen"
    />
    <div class="cv-embed-slot" :style="embedSlotStyle">
    <div class="cv-scaler" :style="scalerTransformStyle">
      <div ref="paperRef" class="cv-paper" :style="paperBoxStyle" @pointerdown.capture="onPaperBlank">
        <div v-if="me.hb > 0" class="cv-band hdr" :style="hdrStyle">
          <div class="cv-band-inner">
            <div
              v-for="el in headerEls"
              :key="'hdr-' + el.id"
              class="cv-zone-el"
              :style="canvasZoneElStyle(el)"
            >
              <ZoneImageCompose
                v-if="el.type === 'image'"
                :image-src="el.imageSrc"
                :caption-text="el.text"
                :caption-position="el.imageCaptionPosition"
                :align-x="el.alignX"
                :align-y="el.alignY"
                :rotation-deg="el.imageRotationDeg"
                :font-size="el.fontSize"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="cv-zone-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <ZoneTableStatic v-else-if="el.type === 'table'" :el="el" />
              <LayoutZoneInlineContent
                v-else
                :el="el"
                :preview-page="zonePreviewPageResolved"
                :preview-total-pages="zonePreviewTotalResolved"
              />
            </div>
          </div>
          <span v-if="headerEls.length === 0" class="cv-hint">{{ headerHint }}</span>
        </div>
        <div
          v-else-if="snapBands.headerBandMm <= 0"
          class="cv-band-missing"
          :style="marginHintStyle('hdr')"
        >
          <span class="cv-hint">（页眉带高度为 0 — 可在「版式与页眉页脚」中设置）</span>
        </div>
        <div
          class="cv-body surface el-root"
          :class="{ 'cv-droptarget': dragOverRoot }"
          :style="bodyStyle"
          @dragenter.prevent="dragOverRoot = true"
          @dragleave="onDragLeaveRoot"
          @dragover.prevent="onDragOverRoot"
          @drop.prevent.stop="onDrop"
        >
          <div v-if="decorationEls.length > 0" class="cv-zone-decor-layer">
            <div
              v-for="d in decorationEls"
              :key="'dec-' + d.id"
              class="cv-zone-el"
              :style="canvasZoneElStyle(d)"
            >
              <ZoneImageCompose
                v-if="d.type === 'image'"
                :image-src="d.imageSrc"
                :caption-text="d.text"
                :caption-position="d.imageCaptionPosition"
                :align-x="d.alignX"
                :align-y="d.alignY"
                :rotation-deg="d.imageRotationDeg"
                :font-size="d.fontSize"
                :color="d.color"
              >
                <template #placeholder>
                  <span class="cv-zone-ph">图</span>
                </template>
              </ZoneImageCompose>
              <ZoneTableStatic v-else-if="d.type === 'table'" :el="d" />
              <LayoutZoneInlineContent
                v-else
                :el="d"
                :preview-page="zonePreviewPageResolved"
                :preview-total-pages="zonePreviewTotalResolved"
              />
            </div>
          </div>
          <div
            v-for="el in list"
            :key="el.id"
            class="el-node touch"
            :class="{ sel: selId === el.id }"
            :style="elCss(el)"
            @pointerdown.stop="beginMove($event, el)"
          >
            <div class="el-inner" :class="elInnerClass(el)" :style="elInnerFlexStyle(el)">
              <template v-if="el.type === 'image'">
                <div
                  class="cv-img-slot"
                  @dragover.prevent
                  @drop.prevent.stop="onTplImageDropFile($event, el)"
                >
                  <ZoneImageCompose
                    :image-src="el.imageSrc"
                    :caption-text="el.text"
                    :caption-position="el.imageCaptionPosition"
                    :align-x="el.alignX"
                    :align-y="el.alignY"
                    :rotation-deg="el.imageRotationDeg"
                    :font-size="el.fontSize"
                    :color="el.color"
                    @replace-image="beginTplBodyImagePick(el)"
                  >
                    <template #placeholder>
                      <span
                        class="cv-ph-img"
                        role="button"
                        tabindex="0"
                        title="单击选图（或拖到此处）；数据以 data URL 保存"
                        @pointerdown.stop
                        @click.prevent.stop="beginTplBodyImagePick(el)"
                        @keyup.enter.prevent="beginTplBodyImagePick(el)"
                        @keyup.space.prevent="beginTplBodyImagePick(el)"
                      >
                        图片占位
                      </span>
                    </template>
                  </ZoneImageCompose>
                </div>
              </template>
              <template v-else-if="el.type === 'table'">
                <div class="cv-table-shell">
                  <table class="cv-table" :style="templateTableInnerStyle(el)">
                    <colgroup>
                      <col
                        v-for="(cw, ci) in tplTableColInnerWidthsPx(el)"
                        :key="'ccol-' + el.id + '-' + ci"
                        :style="{ width: cw + 'px' }"
                      />
                    </colgroup>
                    <tbody>
                      <tr v-for="ri in tplTableRowIndices(el)" :key="'tr-' + el.id + '-' + ri" :style="tplTableRowTrStyle(el)">
                        <td
                          v-for="ci in tplTableColIndices(el)"
                          :key="'tc-' + el.id + '-' + ri + '-' + ci"
                          class="cv-table-cell"
                          :class="{ 'cv-table-cell--hot': isTableCellHot(el, ri, ci) }"
                          :style="tplTableCellStyle(el, ri, ci)"
                          @pointerdown="pickTableCell(el, ri, ci)"
                        >
                          <template v-if="isVisualSqlFillOutputPickerRow(el, ri)">
                            <select
                              class="cv-table-cell-ddl tbl-sql-ddl"
                              :class="{ 'tbl-sql-ddl--warn': tplVisualSqlStructureMissing(el) }"
                              :value="tplVisualOutputSelectValue(el, ci)"
                              :disabled="interactionLocked"
                              :title="tplVisualSqlColumnSelectTitle(el)"
                              @pointerdown.stop="pickTableCell(el, ri, ci)"
                              @change="onTplVisualOutputColumnChange(el, ci, $event)"
                            >
                              <option value="">{{ tplVisualSqlEmptyOptionLabel(el) }}</option>
                              <option :value="'__sequence__'">＃ 序号列</option>
                              <option
                                v-for="opt in tplVisualSqlColumnCatalog[el.id]"
                                :key="'fld-' + el.id + '-' + ci + '-' + opt.name"
                                :value="opt.name"
                              >
                                {{ opt.name }}
                              </option>
                            </select>
                          </template>
                          <template v-else-if="isVerticalSqlFillSlotPickerCell(el, ri, ci)">
                            <select
                              class="cv-table-cell-ddl tbl-sql-ddl"
                              :class="{ 'tbl-sql-ddl--warn': tplVisualSqlStructureMissing(el) }"
                              :value="tplVerticalSlotSelectValue(el, ri)"
                              :disabled="interactionLocked"
                              :title="tplVisualSqlColumnSelectTitle(el)"
                              @pointerdown.stop="pickTableCell(el, ri, ci)"
                              @change="onTplVerticalSlotChange(el, ri, $event)"
                            >
                              <option :value="'__field__'">{{ tplVerticalPendingOptionLabel(el) }}</option>
                              <option value="">— 空白分隔 —</option>
                              <option
                                v-for="opt in tplVisualSqlColumnCatalog[el.id]"
                                :key="'vfld-' + el.id + '-' + ri + '-' + opt.name"
                                :value="opt.name"
                              >
                                {{ opt.name }}
                              </option>
                            </select>
                          </template>
                          <template v-else-if="el.tableSqlFill?.enabled">
                            <span class="cv-table-cell-txt">{{ formatTplBodyTableCell(el, ri, ci) }}</span>
                          </template>
                          <template v-else>
                            <textarea
                              v-if="isTableCellHot(el, ri, ci) && !interactionLocked && tableGrid(el)[ri]?.[ci]"
                              :key="'tced-' + el.id + '-' + ri + '-' + ci"
                              v-model="tableGrid(el)[ri][ci].text"
                              class="cv-table-cell-edit"
                              rows="1"
                              spellcheck="false"
                              autofocus
                              @pointerdown.stop="pickTableCell(el, ri, ci)"
                              @keydown.stop
                            />
                            <span v-else class="cv-table-cell-txt">{{ formatTplBodyTableCell(el, ri, ci) }}</span>
                          </template>
                        </td>
                        </tr>
                        <tr v-if="tplSqlFillPageHintVisible(el)" class="cv-table-sql-page-hint-row">
                          <td class="cv-table-sql-page-hint-cell" :colspan="el.tableCols ?? 4">
                            {{ tplSqlFillPageHintText(el) }}
                          </td>
                        </tr>
                        <tr v-if="tplSqlFillEditorTruncateHintVisible(el)" class="cv-table-sql-truncate-hint-row">
                          <td class="cv-table-sql-truncate-hint-cell" :colspan="el.tableCols ?? 4">
                            {{ TPL_SQL_FILL_EDITOR_TRUNCATE_HINT }}
                          </td>
                        </tr>
                      </tbody>
                  </table>
                  <TableColumnResizeGutters
                    v-if="selId === el.id && !interactionLocked"
                    :column-widths-px="tplTableColInnerWidthsPx(el)"
                    :layout-scale="canvasScale"
                    @resize-delta="(bi, dx) => onTplTableColumnResize(el, bi, dx)"
                  />
                </div>
              </template>
              <template v-else-if="el.type === 'date'">
                <span class="cv-text-display" :style="textAlignForCanvasText(el)">{{ formatTplDate(el) }}</span>
              </template>
              <template v-else-if="el.type === 'signature'">
                <div class="cv-sig-stack" :style="signatureStackJustify(el)">
                  <span
                    v-if="signatureShowsWatermark(el)"
                    class="cv-sig-watermark"
                    :class="{ 'cv-sig-watermark--behind': signatureShowsHandwriting(el) && el.imageSrc }"
                    :style="signatureWatermarkCanvasStyle(el)"
                    >{{ signatureWatermarkText(el) }}</span
                  >
                  <img
                    v-if="signatureShowsHandwriting(el) && el.imageSrc"
                    class="cv-sig-img"
                    :class="{ 'cv-sig-img--front': signatureShowsWatermark(el) }"
                    :src="el.imageSrc"
                    alt=""
                    draggable="false"
                  />
                  <span
                    v-else-if="signatureShowsHandwriting(el) && !el.imageSrc"
                    class="cv-sig-handwriting-ph"
                    :style="textAlignForCanvasText(el)"
                    >（暂无手写图）</span
                  >
                </div>
              </template>
              <template v-else-if="el.type === 'text' || el.type === 'box'">
                <textarea
                  v-if="selId === el.id && !interactionLocked"
                  :key="'cvtxt-' + el.id"
                  v-model="el.text"
                  class="cv-text-edit"
                  rows="1"
                  spellcheck="false"
                  autofocus
                  :style="textAlignForCanvasText(el)"
                  @pointerdown.stop
                  @keydown.stop
                />
                <span v-else class="cv-text-display" :style="textAlignForCanvasText(el)">{{ displayEl(el) }}</span>
              </template>
              <template v-else>{{ displayEl(el) }}</template>
            </div>
            <template v-if="selId === el.id">
              <button
                v-for="hh in HZ"
                :key="hh"
                type="button"
                :class="['hz', 'hz-' + hh]"
                tabindex="-1"
                @pointerdown.stop="beginResize($event, el, hh)"
              />
            </template>
          </div>
          <div
            v-if="tplSnapGuides.v.length > 0 || tplSnapGuides.h.length > 0"
            class="cv-snap-guide-layer"
            aria-hidden="true"
          >
            <div
              v-for="(vx, gi) in tplSnapGuides.v"
              :key="'snap-v-' + gi + '-' + vx"
              class="cv-snap-line cv-snap-line--v"
              :style="{ left: vx + 'px' }"
            />
            <div
              v-for="(hy, gi) in tplSnapGuides.h"
              :key="'snap-h-' + gi + '-' + hy"
              class="cv-snap-line cv-snap-line--h"
              :style="{ top: hy + 'px' }"
            />
          </div>
        </div>
        <div v-if="me.fb > 0" class="cv-band ftr" :style="ftrStyle">
          <div class="cv-band-inner">
            <div
              v-for="el in footerEls"
              :key="'ftr-' + el.id"
              class="cv-zone-el"
              :style="canvasZoneElStyle(el)"
            >
              <ZoneImageCompose
                v-if="el.type === 'image'"
                :image-src="el.imageSrc"
                :caption-text="el.text"
                :caption-position="el.imageCaptionPosition"
                :align-x="el.alignX"
                :align-y="el.alignY"
                :rotation-deg="el.imageRotationDeg"
                :font-size="el.fontSize"
                :color="el.color"
              >
                <template #placeholder>
                  <span class="cv-zone-ph">图片</span>
                </template>
              </ZoneImageCompose>
              <ZoneTableStatic v-else-if="el.type === 'table'" :el="el" />
              <LayoutZoneInlineContent
                v-else
                :el="el"
                :preview-page="zonePreviewPageResolved"
                :preview-total-pages="zonePreviewTotalResolved"
              />
            </div>
          </div>
          <span v-if="footerEls.length === 0" class="cv-hint">{{ footerHint }}</span>
        </div>
        <div
          v-else-if="snapBands.footerBandMm <= 0"
          class="cv-band-missing"
          :style="marginHintStyle('ftr')"
        >
          <span class="cv-hint">（页脚带高度为 0 — 可在「版式与页眉页脚」中设置）</span>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import {
  activeLayoutSnapshotForSheet,
  bodyElementsRef,
  metricsForSheet,
  zoneBodyDecorRef,
  type EditorSheet,
} from "@/lib/report-template/editor-sheet";
import {
  alignmentGuidesForRect,
  magneticSnapResize,
  magneticSnapTranslate,
  type SnapPeer,
} from "@/lib/report-template/layout-snap-guides";
import { clampElementToLayout } from "@/lib/report-template/snapshot-fingerprint";
import {
  estimatedSqlFillTableBottomY,
  tplElementsHorizontallyOverlap,
} from "@/lib/report-template/table-sql-fill-layout-utils";
import { sqlFillTableNeedsPreviewPagination } from "@/lib/report-template/table-sql-fill-export-preview-split";
import {
  flexJustifyAlignForAxes,
  getZoneTextWrapStyle,
  normalizePageNumberMode,
  normalizeZIndex,
  PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
  zoneFillBackgroundCss,
  zoneTableInnerBackgroundCss,
  resolveTableCellBackgroundCss,
  zoneTableNodeShellBackgroundCss,
  formatLayoutDate,
  type LayoutZoneElement,
} from "@/lib/report-template/layout-zone-element";
import type { ReportTemplate, TemplateControlType } from "@/lib/report-template/model";
import type { TemplateElement, TemplateTableCell } from "@/lib/report-template/model";
import {
  clampTableElementOuterSize,
  ensureTableGrid,
  intrinsicOuterHeightForTemplateTable,
  makeElement,
  minOuterSizeForTable,
  signatureShowsHandwriting,
  signatureShowsWatermark,
  signatureWatermarkText,
  templateTableColumnInnerWidthsPx,
} from "@/lib/report-template/model";
import {
  applyTableColumnResizeDeltaPx,
  clampTableRowHeightPx,
  REPORT_TEMPLATE_TABLE_NODE_PADDING_PX,
  uniformTableCellBoxPx,
} from "@/lib/report-template/table-cell-metrics";
import type { VisualSqlTableColumnMeta } from "@/lib/report-template/table-sql-visual-catalog";
import { loadVisualSqlTableColumnsCached } from "@/lib/report-template/table-sql-visual-catalog";
import { applyVisualSqlOutputColumnPick, applyVerticalSqlSlotField, syncTableRowsForVerticalSqlSlots } from "@/lib/report-template/table-sql-visual-compile";
import {
  ensureVisualSource,
  isVisualSqlFillOutputPickerRow,
  isVerticalSqlFill,
  isVerticalSqlFillSlotPickerCell,
  clampTableSqlMaxRows,
  visualSqlColumnPickValue,
  visualSqlNeedsStructureTable,
  visualSqlStructureTableName,
  verticalSqlSlotPickValue,
  TABLE_SQL_VERTICAL_FIELD_PENDING,
} from "@/lib/report-template/table-sql-fill";
import { looksLikeImageFile, pickFirstImageFileFromDataTransfer, readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import LayoutZoneInlineContent from "@/components/report-template/LayoutZoneInlineContent.vue";
import ZoneTableStatic from "@/components/report-template/ZoneTableStatic.vue";
import TableColumnResizeGutters from "@/components/report-template/TableColumnResizeGutters.vue";
import ZoneImageCompose from "@/components/report-template/ZoneImageCompose.vue";
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { reportBindingPreviewKey, templateTableCellPickKey } from "@/lib/report-template/template-editor-context";
import {
  formatSqlFillTableCellPreview,
  sqlFillEditorDisplayDataRowCount,
  templateTableSqlFillPreviewKey,
  TABLE_SQL_FILL_PREVIEW_ROW_LIMIT,
} from "@/lib/report-template/table-sql-fill-preview";
import { tableSqlFillVerticalChromePx } from "@/lib/report-template/table-sql-fill-layout-utils";

/** cv-scaler 左右 padding 合计（与样式 padding: 20px 一致） */
const EMBED_SCALER_PAD = 40;

const HZ = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type H = (typeof HZ)[number];

/** 编辑画布 SQL 预览截断时表格末尾提示（置于分页提示行之后） */
const TPL_SQL_FILL_EDITOR_TRUNCATE_HINT = "未完全显示，将在导出预览中优化";

/** 与 `ensureTableGrid` / clampTableDim 一致：正文表格最多 30 行（含表头），数据格最多 29 */
const TEMPLATE_BODY_TABLE_MAX_ROWS = 30;

/**
 * 编辑画布行数预算：分页灰字说明实际为多行，不能用 1×数据行高计入，否则尾部黄色提示会被 shell overflow 裁掉。
 */
const SQL_FILL_EDITOR_PAGE_HINT_ROW_SLOTS = 4;
/** 窄表宽时截断提示可能折行，略多预留一行高度 */
const SQL_FILL_EDITOR_TRUNCATE_HINT_ROW_SLOTS = 2;

function sqlFillEditorFooterRowSlots(showPage: boolean, showTrunc: boolean): number {
  return (showPage ? SQL_FILL_EDITOR_PAGE_HINT_ROW_SLOTS : 0) + (showTrunc ? SQL_FILL_EDITOR_TRUNCATE_HINT_ROW_SLOTS : 0);
}

const props = withDefaults(
  defineProps<{
    tmpl: ReportTemplate;
    sheet: EditorSheet;
    /** 正文画布分页序号（0-based） */
    bodyPageIndex?: number;
    interactionLocked?: boolean;
    /**
     * 嵌入外层单列滚动（正文多页纵向拼接）：画布不自占滚动条，滚轮交给父级，类似 Word 连续页面。
     */
    embedInParentScroll?: boolean;
    /** 页眉/页脚区内页码等控件的预览页码（与导出预览一致） */
    zonePreviewPage?: number;
    zonePreviewTotalPages?: number;
  }>(),
  {
    interactionLocked: false,
    bodyPageIndex: 0,
    embedInParentScroll: false,
    zonePreviewPage: undefined,
    zonePreviewTotalPages: undefined,
  },
);
const selId = defineModel<string | null>("selectedId");

const cellPickRef = inject(templateTableCellPickKey, null);
const bindingPreview = inject(reportBindingPreviewKey, null);

const me = computed(() => metricsForSheet(props.tmpl, props.sheet));

const viewportRef = ref<HTMLElement | null>(null);
const tplImgFileRef = ref<HTMLInputElement | null>(null);
let tplBodyPendingSid: string | null = null;
const panX = ref(0);
const panY = ref(0);
const viewScale = ref(1);
/** 嵌入父级滚动时按视口宽度自适应的缩放比 */
const embedFitScale = ref(1);
const dragOverRoot = ref(false);

const canvasScale = computed(() =>
  props.embedInParentScroll ? embedFitScale.value : viewScale.value,
);

const embedSlotStyle = computed(() => {
  if (!props.embedInParentScroll) return undefined;
  const s = embedFitScale.value;
  const pad = EMBED_SCALER_PAD;
  return {
    width: `${me.value.pageW * s + pad}px`,
    height: `${me.value.pageH * s + pad}px`,
    marginLeft: "auto",
    marginRight: "auto",
  };
});

const scalerTransformStyle = computed(() => {
  const s = canvasScale.value;
  if (props.embedInParentScroll) {
    return { transform: `scale(${s})`, transformOrigin: "0 0" };
  }
  return { transform: `translate(${panX.value}px,${panY.value}px) scale(${s})` };
});

let embedResizeObserver: ResizeObserver | null = null;

function syncEmbedFitScale() {
  if (!props.embedInParentScroll) return;
  const el = viewportRef.value;
  if (!el) return;
  const vw = el.clientWidth;
  if (vw <= 0) return;
  const contentW = me.value.pageW + EMBED_SCALER_PAD;
  const next = Math.min(1, Math.max(0.25, (vw - 2) / contentW));
  if (Math.abs(next - embedFitScale.value) < 0.001) return;
  embedFitScale.value = +next.toFixed(4);
}

function bindEmbedResizeObserver() {
  embedResizeObserver?.disconnect();
  embedResizeObserver = null;
  if (!props.embedInParentScroll) return;
  const el = viewportRef.value;
  if (!el) return;
  embedResizeObserver = new ResizeObserver(() => syncEmbedFitScale());
  embedResizeObserver.observe(el);
}

function scheduleEmbedFitSync() {
  void nextTick(() => {
    syncEmbedFitScale();
    bindEmbedResizeObserver();
  });
}

/** 正文区内拖拽/缩放时的对齐辅助线（页边界、中带中线、与其它控件边缘对齐时显示） */
const tplSnapGuides = ref<{ v: number[]; h: number[] }>({ v: [], h: [] });

function bodySnapPeers(): SnapPeer[] {
  const peers: SnapPeer[] = [];
  for (const e of list.value) peers.push({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h });
  for (const e of decorationEls.value) peers.push({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h });
  return peers;
}

function clearTplSnapGuides() {
  tplSnapGuides.value = { v: [], h: [] };
}

watch(
  () => props.embedInParentScroll,
  (v) => {
    if (v) {
      panX.value = 0;
      panY.value = 0;
      scheduleEmbedFitSync();
    } else {
      embedResizeObserver?.disconnect();
      embedResizeObserver = null;
    }
  },
  { immediate: true },
);

watch(viewportRef, () => {
  if (props.embedInParentScroll) scheduleEmbedFitSync();
});

watch(() => me.value.pageW, () => syncEmbedFitScale());

const snapBands = computed(() => {
  const s = activeLayoutSnapshotForSheet(props.tmpl, props.sheet);
  return { headerBandMm: s.headerBandMm, footerBandMm: s.footerBandMm };
});
const list = computed(() =>
  bodyElementsRef(props.tmpl, props.sheet, props.sheet === "body" ? props.bodyPageIndex : 0),
);

const zonePreviewPageResolved = computed(() => props.zonePreviewPage ?? 1);
const zonePreviewTotalResolved = computed(
  () => props.zonePreviewTotalPages ?? PAGE_NUMBER_PREVIEW_TOTAL_FALLBACK,
);

const headerEls = computed(() =>
  props.sheet === "cover"
    ? props.tmpl.coverHeaderElements
    : props.sheet === "back"
      ? props.tmpl.backHeaderElements
      : props.tmpl.headerElements,
);
const footerEls = computed(() =>
  props.sheet === "cover"
    ? props.tmpl.coverFooterElements
    : props.sheet === "back"
      ? props.tmpl.backFooterElements
      : props.tmpl.footerElements,
);
const decorationEls = computed(() => zoneBodyDecorRef(props.tmpl, props.sheet));

function canvasZoneElStyle(el: LayoutZoneElement): Record<string, string> {
  const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
  const flex = flexJustifyAlignForAxes(el.alignX, el.alignY);
  const wrap = getZoneTextWrapStyle(el);
  const base: Record<string, string> = {
    position: "absolute",
    boxSizing: "border-box",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    color: el.color,
    fontSize: `${el.fontSize}px`,
    ...(ff ? { fontFamily: ff } : {}),
    display: "flex",
    justifyContent: flex.justifyContent,
    alignItems: flex.alignItems,
    zIndex: String(normalizeZIndex(el.zIndex)),
    ...(wrap ?? { whiteSpace: "nowrap" }),
    overflow: "hidden",
  };
  if (el.type === "table") {
    return {
      ...base,
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      justifyContent: "stretch",
      padding: "2px",
      backgroundColor: zoneTableNodeShellBackgroundCss(),
      whiteSpace: "normal",
    };
  }
  if (el.type === "pageNumber" && normalizePageNumberMode(el.pageNumberMode) === "circle") {
    return {
      ...base,
      padding: "2px",
      backgroundColor: "transparent",
    };
  }
  if (el.type === "box") {
    const bc = typeof el.color === "string" ? el.color : "#18181b";
    return {
      ...base,
      backgroundColor: zoneFillBackgroundCss(el.bgColor),
      border: `1px solid ${bc}40`,
      borderRadius: "4px",
      padding: "2px 6px",
    };
  }
  if (el.type === "image") {
    return {
      ...base,
      backgroundColor: zoneFillBackgroundCss(el.bgColor),
    };
  }
  return {
    ...base,
    backgroundColor: zoneFillBackgroundCss(el.bgColor),
    padding: "2px 6px",
  };
}

function bandBox(m: PaperLayoutMetrics, which: "hdr" | "body" | "ftr"): Record<string, string> {
  if (which === "hdr") {
    return {
      position: "absolute",
      left: `${m.ml}px`,
      top: `${m.mt}px`,
      width: `${m.pageW - m.ml - m.mr}px`,
      height: `${m.hb}px`,
    };
  }
  if (which === "body") {
    return {
      position: "absolute",
      left: `${m.contentLeft}px`,
      top: `${m.contentTop}px`,
      width: `${m.contentW}px`,
      height: `${m.contentH}px`,
    };
  }
  return {
    position: "absolute",
    left: `${m.ml}px`,
    bottom: `${m.mb}px`,
    width: `${m.pageW - m.ml - m.mr}px`,
    height: `${m.fb}px`,
  };
}

const hdrStyle = computed(() => bandBox(me.value, "hdr"));
const bodyStyle = computed(() => bandBox(me.value, "body"));
const ftrStyle = computed(() => bandBox(me.value, "ftr"));

/** 版式未预留眉/脚带高度时，在纸张边距内给出示意（几何仍与导出一致） */
function marginHintStyle(which: "hdr" | "ftr"): Record<string, string> {
  const m = me.value;
  const h = Math.max(which === "hdr" ? m.mt : m.mb, 24);
  if (which === "hdr") {
    return {
      position: "absolute",
      left: `${m.ml}px`,
      top: "0",
      width: `${m.pageW - m.ml - m.mr}px`,
      height: `${h}px`,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
    };
  }
  return {
    position: "absolute",
    left: `${m.ml}px`,
    bottom: "0",
    width: `${m.pageW - m.ml - m.mr}px`,
    height: `${h}px`,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  };
}

const paperBoxStyle = computed(() => ({
  width: `${me.value.pageW}px`,
  height: `${me.value.pageH}px`,
  background: "#fff",
  border: "1px solid #d4d4d8",
  boxShadow: "0 12px 28px rgb(24 24 27 / 0.1)",
  position: "relative" as const,
}));

function hdrTxt() {
  if (props.sheet === "cover") return props.tmpl.coverHeaderText;
  if (props.sheet === "back") return props.tmpl.backHeaderText;
  return props.tmpl.headerText;
}

function ftrTxt() {
  if (props.sheet === "cover") return props.tmpl.coverFooterText;
  if (props.sheet === "back") return props.tmpl.backFooterText;
  return props.tmpl.footerText;
}

const headerHint = computed(() => hdrTxt() || "(页眉)");
const footerHint = computed(() => ftrTxt() || "(页脚)");

function elInnerFlexStyle(el: TemplateElement): Record<string, string> | undefined {
  if (el.type !== "text" && el.type !== "box" && el.type !== "date" && el.type !== "signature")
    return undefined;
  const { justifyContent, alignItems } = flexJustifyAlignForAxes(el.alignX, el.alignY);
  return { justifyContent, alignItems };
}

function textAlignForCanvasText(el: TemplateElement): Record<string, string> | undefined {
  if (el.type !== "text" && el.type !== "box" && el.type !== "date" && el.type !== "signature")
    return undefined;
  const ta =
    el.alignX === "center" ? "center" : el.alignX === "end" ? "right" : "left";
  const wrap = getZoneTextWrapStyle(el);
  return wrap ? { textAlign: ta, ...wrap } : { textAlign: ta };
}

function signatureStackJustify(el: TemplateElement): Record<string, string> | undefined {
  if (el.type !== "signature") return undefined;
  const jc =
    el.alignX === "center" ? "center" : el.alignX === "end" ? "flex-end" : "flex-start";
  return { justifyContent: jc };
}

/** 叠加水印时用 flex 对齐；单独水印时沿用 text-align（多行） */
function signatureWatermarkCanvasStyle(
  el: TemplateElement,
): Record<string, string> | undefined {
  if (el.type !== "signature") return undefined;
  const ta = textAlignForCanvasText(el);
  if (signatureShowsHandwriting(el) && el.imageSrc) {
    const jc =
      el.alignX === "center" ? "center" : el.alignX === "end" ? "flex-end" : "flex-start";
    return { ...ta, justifyContent: jc };
  }
  return ta;
}

function elInnerClass(el: TemplateElement): string {
  if (el.type === "table") return "el-inner--table";
  if (el.type === "text" || el.type === "box" || el.type === "date" || el.type === "signature")
    return "el-inner--textlike";
  return "";
}

function templateTableInnerStyle(el: TemplateElement): Record<string, string> {
  if (el.type !== "table") return {};
  return { background: zoneTableInnerBackgroundCss(el.bgColor) };
}

function tplTableCellStyle(el: TemplateElement, ri: number, ci: number): Record<string, string> {
  if (el.type !== "table") return {};
  const cell = tableGrid(el)[ri]?.[ci];
  return {
    backgroundColor: resolveTableCellBackgroundCss(
      { tableBgColor: el.bgColor, tableColBgColors: el.tableColBgColors },
      ci,
      cell,
    ),
  };
}

function elCss(el: TemplateElement) {
  const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
  const explicitZ = normalizeZIndex(el.zIndex ?? 0);
  const z =
    explicitZ !== 0 ? explicitZ : Math.min(200000, Math.max(0, Math.floor(el.y)));
  const s: Record<string, string> = {
    position: "absolute",
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    fontSize: `${el.fontSize}px`,
    color: el.color,
    background:
      el.type === "table"
        ? zoneTableNodeShellBackgroundCss()
        : el.bgColor === "transparent"
          ? "transparent"
          : el.bgColor,
    ...(ff ? { fontFamily: ff } : {}),
  };
  s.zIndex = selId.value === el.id ? String(400000 + z) : String(z);
  const wrap = getZoneTextWrapStyle(el);
  if (wrap) Object.assign(s, wrap);
  if (el.type === "box") s.border = `1px solid ${el.color}40`;
  return s;
}

function tplTableColIndices(el: TemplateElement): number[] {
  if (el.type !== "table") return [];
  const n = el.tableCols ?? 4;
  return Array.from({ length: n }, (_, i) => i);
}

/** SQL 填充预览在编辑画布上的可视行分配（避免 tbody 行数远超 el.h 导致尾部提示被裁掉） */
interface SqlFillEditorPreviewLayout {
  previewRowCount: number;
  visibleDataRows: number;
  showPageHint: boolean;
  showTruncateHint: boolean;
}

function tplSqlFillEditorPreviewLayout(el: TemplateElement): SqlFillEditorPreviewLayout | null {
  if (el.type !== "table" || !el.tableSqlFill?.enabled) return null;
  const pk = templateTableSqlFillPreviewKey(el.id);
  const pv = bindingPreview?.values.value[pk]?.tableSqlFill;
  if (!pv?.dataRows?.length || pv.error) return null;
  const sqlN = pv.dataRows.length;
  // 编辑画布：纵表「每条另起一页」只按首条展开；导出分页仍用完整 displayN
  const displayN = sqlFillEditorDisplayDataRowCount(el.tableSqlFill, sqlN);

  const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
  // 与 intrinsicOuterHeightForTemplateTable / tableSqlFillVerticalChromePx 对齐，勿再减额外余量
  const chrome = tableSqlFillVerticalChromePx();
  const inner = Math.max(0, el.h - chrome);
  const maxTotalRows = Math.max(1, Math.floor(inner / Math.max(1, rowH)));

  const paginationNeeded =
    props.sheet === "body" && sqlFillTableNeedsPreviewPagination(el, displayN, me.value.contentH, sqlN);
  const maxRowsCfg = clampTableSqlMaxRows(el.tableSqlFill.maxRows ?? 2000);
  const limitsTrunc =
    sqlN >= TABLE_SQL_FILL_PREVIEW_ROW_LIMIT ||
    sqlN >= maxRowsCfg ||
    displayN > TEMPLATE_BODY_TABLE_MAX_ROWS - 1;

  /**
   * 纵表：外框已按「表头+字段槽」贴合撑高；编辑态须完整显示这些行。
   * 分页/截断提示不再从行高预算里扣减（否则会出现蓝框很高、表体被裁短、底部大片空白）。
   * 提示改在表外/属性说明；此处仅在外框矮于内容时裁剪可见行。
   */
  if (isVerticalSqlFill(el.tableSqlFill)) {
    const visible = Math.min(displayN, Math.max(0, maxTotalRows - 1));
    return {
      previewRowCount: displayN,
      visibleDataRows: visible,
      showPageHint: false,
      // 仅在外框矮于内容时提示；勿因 limitsTrunc/分页占用行高，否则蓝框底部会留白挡住表体
      showTruncateHint: visible < displayN,
    };
  }

  let showPageHint = paginationNeeded;
  let showTruncateHint = limitsTrunc;

  const visibleFor = (sp: boolean, st: boolean): number =>
    Math.min(displayN, Math.max(0, maxTotalRows - 1 - sqlFillEditorFooterRowSlots(sp, st)));

  let visible = visibleFor(showPageHint, showTruncateHint);
  if (visible < displayN) showTruncateHint = true;
  visible = visibleFor(showPageHint, showTruncateHint);

  while (1 + sqlFillEditorFooterRowSlots(showPageHint, showTruncateHint) > maxTotalRows && showPageHint) {
    showPageHint = false;
  }
  visible = visibleFor(showPageHint, showTruncateHint);

  while (1 + sqlFillEditorFooterRowSlots(showPageHint, showTruncateHint) > maxTotalRows && showTruncateHint) {
    showTruncateHint = false;
  }
  visible = visibleFor(showPageHint, showTruncateHint);

  showTruncateHint = showTruncateHint || visible < displayN || limitsTrunc;
  while (1 + sqlFillEditorFooterRowSlots(showPageHint, showTruncateHint) > maxTotalRows && showPageHint) {
    showPageHint = false;
  }
  visible = visibleFor(showPageHint, showTruncateHint);

  while (1 + sqlFillEditorFooterRowSlots(showPageHint, showTruncateHint) > maxTotalRows && showTruncateHint) {
    showTruncateHint = false;
  }
  visible = visibleFor(showPageHint, showTruncateHint);

  const mustHint = visible < displayN || limitsTrunc;
  const minRowsForTruncateOnly = 1 + sqlFillEditorFooterRowSlots(false, true);
  if (mustHint && maxTotalRows >= minRowsForTruncateOnly) {
    showTruncateHint = true;
    while (1 + sqlFillEditorFooterRowSlots(showPageHint, showTruncateHint) > maxTotalRows && showPageHint) {
      showPageHint = false;
    }
    visible = visibleFor(showPageHint, showTruncateHint);
  }

  return {
    previewRowCount: displayN,
    visibleDataRows: visible,
    showPageHint,
    showTruncateHint,
  };
}

function tplTableRowIndices(el: TemplateElement): number[] {
  if (el.type !== "table") return [];
  const g = tableGrid(el);
  const base = g.length;
  const pk = templateTableSqlFillPreviewKey(el.id);
  const pv = bindingPreview?.values.value[pk]?.tableSqlFill;
  if (!el.tableSqlFill?.enabled || !pv?.dataRows?.length) {
    return Array.from({ length: base }, (_, i) => i);
  }
  const lay = tplSqlFillEditorPreviewLayout(el);
  const fallbackDisplay = sqlFillEditorDisplayDataRowCount(el.tableSqlFill, pv.dataRows.length);
  const visibleData = lay?.visibleDataRows ?? Math.min(fallbackDisplay, Math.max(0, base - 1));
  const total = Math.max(1, 1 + visibleData);
  return Array.from({ length: total }, (_, i) => i);
}

function formatTplBodyTableCell(el: TemplateElement, ri: number, ci: number): string {
  if (el.type !== "table") return "\u00a0";
  const fill = el.tableSqlFill;
  if (fill?.enabled) {
    const pk = templateTableSqlFillPreviewKey(el.id);
    const pv = bindingPreview?.values.value[pk]?.tableSqlFill;
    const loading = !!(bindingPreview?.loading.value && !pv?.dataRows?.length && !pv?.error);
    return formatSqlFillTableCellPreview({
      fill,
      rowIndex: ri,
      colIndex: ci,
      preview: pv ?? null,
      previewLoading: loading,
    });
  }
  const cell = tableGrid(el)[ri]?.[ci] ?? null;
  return cell ? formatTableCellPreview(cell) : "\u00a0";
}

function tplTableColInnerWidthsPx(el: TemplateElement): number[] {
  if (el.type !== "table") return [];
  return templateTableColumnInnerWidthsPx(el);
}

function onTplTableColumnResize(el: TemplateElement, boundaryIndex: number, deltaLayoutPx: number) {
  if (el.type !== "table") return;
  ensureTableGrid(el);
  const cols = el.tableCols ?? 4;
  const rows = el.tableRows ?? 3;
  const u = uniformTableCellBoxPx({
    outerW: el.w,
    outerH: el.h,
    rowCount: rows,
    colCount: cols,
    nodePadding: REPORT_TEMPLATE_TABLE_NODE_PADDING_PX,
  });
  const next = applyTableColumnResizeDeltaPx(u.innerW, cols, el.tableColWidthsPx, boundaryIndex, deltaLayoutPx);
  if (!next) return;
  el.tableColWidthsPx = next;
  clamp(el);
}

function tableGrid(el: TemplateElement): TemplateTableCell[][] {
  if (el.type !== "table") return [];
  return ensureTableGrid(el);
}

const tplVisualSqlColumnCatalog = ref<Record<string, VisualSqlTableColumnMeta[]>>({});

async function refreshTplVisualSqlColumnCatalog(): Promise<void> {
  const next: Record<string, VisualSqlTableColumnMeta[]> = {};
  for (const el of list.value) {
    if (el.type !== "table") continue;
    const f = el.tableSqlFill;
    if (!f?.enabled || f.fillMode !== "visual") continue;
    ensureVisualSource(f);
    const vs = f.visualSource!;
    const structureTable = visualSqlStructureTableName(vs);
    if (!vs.connectionId?.trim() || !structureTable) {
      next[el.id] = [];
      continue;
    }
    try {
      next[el.id] = await loadVisualSqlTableColumnsCached({
        connectionId: vs.connectionId.trim(),
        database: vs.database?.trim(),
        table: structureTable,
      });
    } catch {
      next[el.id] = [];
    }
  }
  tplVisualSqlColumnCatalog.value = next;
}

watch(
  () => list.value,
  () => {
    void refreshTplVisualSqlColumnCatalog();
  },
  { deep: true, immediate: true },
);

function tplVisualSqlStructureMissing(el: TemplateElement): boolean {
  if (el.type !== "table" || !el.tableSqlFill?.enabled || el.tableSqlFill.fillMode !== "visual") return false;
  return visualSqlNeedsStructureTable(el.tableSqlFill.visualSource);
}

function tplVisualSqlEmptyOptionLabel(el: TemplateElement): string {
  if (tplVisualSqlStructureMissing(el)) return "请先选结构参考表…";
  const opts = tplVisualSqlColumnCatalog.value[el.id];
  if (opts && opts.length === 0 && visualSqlStructureTableName(el.tableSqlFill?.visualSource)) {
    return "结构表无列…";
  }
  return "— 空白列 —";
}

function tplVisualSqlColumnSelectTitle(el: TemplateElement): string {
  if (tplVisualSqlStructureMissing(el)) {
    return "已绑定 OPC UA 表名时，请在右侧属性中指定一张库中现存的结构参考表，才能选择列名。";
  }
  const name = visualSqlStructureTableName(el.tableSqlFill?.visualSource);
  if (name && !(tplVisualSqlColumnCatalog.value[el.id]?.length)) {
    return `未能从结构参考表「${name}」加载列名；请确认该表存在。OPC 当前值不用于设计时选列。`;
  }
  return "";
}

function tplVisualOutputSelectValue(el: TemplateElement, ci: number): string {
  const fill = el.tableSqlFill;
  if (!fill) return "";
  return visualSqlColumnPickValue(fill, ci);
}

function onTplVisualOutputColumnChange(el: TemplateElement, ci: number, ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const fill = el.tableSqlFill;
  if (!fill || fill.fillMode !== "visual" || el.type !== "table") return;
  const cols = el.tableCols ?? 4;
  const cell = tableGrid(el)[0]?.[ci];
  applyVisualSqlOutputColumnPick(fill, cols, ci, v, cell);
}

function tplVerticalPendingOptionLabel(el: TemplateElement): string {
  if (tplVisualSqlStructureMissing(el)) return "请先选结构参考表…";
  const opts = tplVisualSqlColumnCatalog.value[el.id];
  if (opts && opts.length === 0 && visualSqlStructureTableName(el.tableSqlFill?.visualSource)) {
    return "结构表无列…";
  }
  return "— 请选择字段 —";
}

function tplVerticalSlotSelectValue(el: TemplateElement, ri: number): string {
  const fill = el.tableSqlFill;
  if (!fill) return TABLE_SQL_VERTICAL_FIELD_PENDING;
  return verticalSqlSlotPickValue(fill, ri - 1);
}

function onTplVerticalSlotChange(el: TemplateElement, ri: number, ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const fill = el.tableSqlFill;
  if (!fill || fill.fillMode !== "visual" || el.type !== "table") return;
  applyVerticalSqlSlotField(fill, ri - 1, v);
  syncTableRowsForVerticalSqlSlots(el, () => ensureTableGrid(el));
  const maxH = Math.max(20, me.value.contentH - el.y);
  clampTableElementOuterSize(el, me.value.contentW, maxH);
}

function tplTableRowTrStyle(el: TemplateElement): Record<string, string> | undefined {
  if (el.type !== "table") return undefined;
  return { height: `${clampTableRowHeightPx(el.tableRowHeightPx)}px` };
}

function tplSqlFillDataRowCount(el: TemplateElement): number {
  const pk = templateTableSqlFillPreviewKey(el.id);
  const sqlN = bindingPreview?.values.value[pk]?.tableSqlFill?.dataRows?.length ?? 0;
  if (el.tableSqlFill?.enabled && sqlN > 0) {
    return sqlFillEditorDisplayDataRowCount(el.tableSqlFill, sqlN);
  }
  return Math.max(0, (el.tableRows ?? 1) - 1);
}

function tplSqlFillPageHintVisible(el: TemplateElement): boolean {
  if (props.sheet !== "body" || el.type !== "table" || !el.tableSqlFill?.enabled) return false;
  const n = tplSqlFillDataRowCount(el);
  if (!n) return false;
  const lay = tplSqlFillEditorPreviewLayout(el);
  if (lay) return lay.showPageHint;
  const pk = templateTableSqlFillPreviewKey(el.id);
  const sqlN = bindingPreview?.values.value[pk]?.tableSqlFill?.dataRows?.length ?? 0;
  return sqlFillTableNeedsPreviewPagination(el, n, me.value.contentH, sqlN);
}

function tplSqlFillPageHintText(el: TemplateElement): string {
  const fill = el.tableSqlFill;
  if (!fill) return "";
  const pagePer =
    fill.layoutMode === "vertical" && fill.verticalMultiRecordMode === "page_per_record";
  const base = pagePer
    ? "编辑画布仅预览首条结果；导出预览将按「每条结果另起一页」分多页展示。"
    : "导出预览：本表数据将跨页续排；表格最后一页下方留白后，位于表下的控件将单独占一页预览。";
  if (fill.allowWidgetsBelowSqlFillTable) {
    return `${base} 若需在表下摆放控件，请使用左侧「＋页」新建正文页后再编排；否则预览会与分页规则不一致。`;
  }
  return `${base} 表格下方默认禁止摆放控件（可在填充设置中开启「允许在表格下方摆放控件」）。`;
}

/**
 * SQL 预览在画布上未展示全集或触及预览/配置上限时显示末尾一行提示。
 * 可视行数随 el.h 动态收紧，保证提示行落在裁切区域内。
 */
function tplSqlFillEditorTruncateHintVisible(el: TemplateElement): boolean {
  if (!el.tableSqlFill?.enabled) return false;
  if (bindingPreview?.loading.value) return false;
  const lay = tplSqlFillEditorPreviewLayout(el);
  return !!lay?.showTruncateHint;
}

function minTableResizeW(el: TemplateElement): number {
  return el.type === "table" ? minOuterSizeForTable(el).w : 20;
}

function minTableResizeH(el: TemplateElement): number {
  return el.type === "table" ? minOuterSizeForTable(el).h : 20;
}

function pickTableCell(el: TemplateElement, ri: number, ci: number) {
  if (props.interactionLocked) return;
  selId.value = el.id;
  if (cellPickRef) cellPickRef.value = { elId: el.id, row: ri, col: ci };
}

function isTableCellHot(el: TemplateElement, ri: number, ci: number): boolean {
  const p = cellPickRef?.value;
  return !!(p && p.elId === el.id && p.row === ri && p.col === ci);
}

function truncatePreview(s: string, n: number): string {
  const x = s.replace(/\s+/g, " ");
  return x.length <= n ? x : `${x.slice(0, n)}…`;
}

function formatTableCellPreview(cell: TemplateTableCell): string {
  if (cell.bindingKind === "opcua") {
    const id = cell.opcuaNodeId.trim();
    return id ? `⟨UA⟩ ${truncatePreview(id, 72)}` : "⟨UA⟩";
  }
  if (cell.bindingKind === "sql") {
    const q = cell.sqlText.trim();
    return q ? `⟨SQL⟩ ${truncatePreview(q, 56)}` : "⟨SQL⟩";
  }
  const t = cell.text.trim();
  return t.length > 0 ? t : "\u00a0";
}

function formatTplDate(el: TemplateElement): string {
  if (el.type !== "date") return "";
  const pat = (el.dateFormat || "").trim() || "HH:mm:ss";
  return formatLayoutDate(new Date(), pat);
}

function displayEl(el: TemplateElement): string {
  switch (el.type) {
    case "text":
    case "box":
      return el.text || "(空)";
    case "date":
      return formatTplDate(el);
    case "table":
      return `[表 ${el.tableRows ?? "?"}×${el.tableCols ?? "?"}]`;
    case "chart":
      return `[图·${el.chartKind}]`;
    case "parameter":
      return `[参] ${el.opcuaNodeId || el.text}`;
    case "signature": {
      const wm = signatureShowsWatermark(el) ? signatureWatermarkText(el) : "";
      const hw = signatureShowsHandwriting(el);
      if (hw && el.imageSrc && wm) return `[水印+手写] ${wm}`;
      if (hw && el.imageSrc) return "[手写]";
      if (wm && hw && !el.imageSrc) return `${wm} · （暂无手写图）`;
      if (wm) return wm;
      if (hw) return el.imageSrc ? "[手写]" : "（暂无手写图）";
      return "";
    }
    case "image":
      return el.imageSrc ? "[图像]" : "图片占位";
    default:
      return "";
  }
}

/** 画布拖动：超过阈值后才真正移动，避免表格单元格「点选」被当成拖拽 */
const MOVE_DRAG_THRESHOLD_PX = 5;

let move: null | {
  sid: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  dragStarted: boolean;
};
let resize: null | {
  sid: string;
  h: H;
  sx: number;
  sy: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
};

function clamp(el: TemplateElement): void {
  clampElementToLayout(el, me.value.contentW, me.value.contentH);
  applySqlFillBelowRestriction(el);
}

/** SQL 动态表（默认）禁止在与表横向重叠区域内摆放到逻辑底线之下 */
const SQL_FILL_BELOW_GAP_PX = 4;

function applySqlFillBelowRestriction(subject: TemplateElement): void {
  if (props.sheet !== "body") return;
  const vals = bindingPreview?.values.value ?? {};
  for (const t of list.value) {
    if (t.type !== "table" || !t.tableSqlFill?.enabled || t.tableSqlFill.allowWidgetsBelowSqlFillTable) continue;
    if (t.id === subject.id) continue;
    const pk = templateTableSqlFillPreviewKey(t.id);
    const dr = vals[pk]?.tableSqlFill?.dataRows?.length ?? 0;
    const logicalRows = dr > 0 ? dr : Math.max(0, (t.tableRows ?? 1) - 1);
    const bottom = estimatedSqlFillTableBottomY(t, logicalRows);
    if (!tplElementsHorizontallyOverlap(subject, t)) continue;
    if (subject.y >= bottom - 0.25) {
      subject.y = Math.max(0, bottom - subject.h - SQL_FILL_BELOW_GAP_PX);
    } else if (subject.y + subject.h > bottom - 0.25) {
      subject.y = Math.max(0, bottom - subject.h - SQL_FILL_BELOW_GAP_PX);
    }
  }
}

function beginMove(ev: PointerEvent, el: TemplateElement) {
  if (props.interactionLocked) return;
  clearTplSnapGuides();
  selId.value = el.id;
  move = {
    sid: el.id,
    sx: ev.clientX,
    sy: ev.clientY,
    ox: el.x,
    oy: el.y,
    dragStarted: false,
  };
  bindPtr();
}

function beginResize(ev: PointerEvent, el: TemplateElement, h: H) {
  if (props.interactionLocked) return;
  clearTplSnapGuides();
  selId.value = el.id;
  resize = { sid: el.id, h, sx: ev.clientX, sy: ev.clientY, ix: el.x, iy: el.y, iw: el.w, ih: el.h };
  bindPtr();
}

function bindPtr() {
  window.addEventListener("pointermove", ptrMove);
  window.addEventListener("pointerup", ptrUp, { once: true });
}

function ptrMove(ev: PointerEvent) {
  const sc = canvasScale.value || 1;
  if (move) {
    const el = list.value.find((x) => x.id === move!.sid);
    if (!el) return;
    const dxScr = ev.clientX - move!.sx;
    const dyScr = ev.clientY - move!.sy;
    if (!move!.dragStarted) {
      if (Math.hypot(dxScr, dyScr) < MOVE_DRAG_THRESHOLD_PX) return;
      move!.dragStarted = true;
    }
    el.x = Math.round(Math.max(0, move!.ox + dxScr / sc));
    el.y = Math.round(Math.max(0, move!.oy + dyScr / sc));
    const bw = me.value.contentW;
    const bh = me.value.contentH;
    const peers = bodySnapPeers();
    if (!ev.shiftKey) {
      const snapped = magneticSnapTranslate(el.x, el.y, el.w, el.h, bw, bh, peers, el.id);
      el.x = snapped.x;
      el.y = snapped.y;
    }
    clamp(el);
    tplSnapGuides.value = ev.shiftKey
      ? { v: [], h: [] }
      : alignmentGuidesForRect(el.x, el.y, el.w, el.h, bw, bh, peers, el.id);
    return;
  }
  if (resize) {
    const el = list.value.find((x) => x.id === resize!.sid);
    if (!el) return;
    const dx = (ev.clientX - resize.sx) / sc;
    const dy = (ev.clientY - resize.sy) / sc;
    const { h } = resize;
    let x = resize.ix;
    let y = resize.iy;
    let w = resize.iw;
    let hh = resize.ih;
    const floorW = el.type === "table" ? minTableResizeW(el) : 20;
    const floorH = el.type === "table" ? minTableResizeH(el) : 20;
    const ceilH =
      el.type === "table"
        ? el.tableSqlFill?.enabled
          ? me.value.contentH
          : intrinsicOuterHeightForTemplateTable(el)
        : Number.POSITIVE_INFINITY;
    if (h.includes("e")) w = Math.max(floorW, Math.round(resize.iw + dx));
    if (h.includes("s")) hh = Math.min(ceilH, Math.max(floorH, Math.round(resize.ih + dy)));
    if (h.includes("w")) {
      const nw = Math.max(floorW, Math.round(resize.iw - dx));
      x = Math.round(resize.ix + (resize.iw - nw));
      w = nw;
    }
    if (h.includes("n")) {
      const nh = Math.min(ceilH, Math.max(floorH, Math.round(resize.ih - dy)));
      y = Math.round(resize.iy + (resize.ih - nh));
      hh = nh;
    }
    if (ev.shiftKey && /nw|ne|sw|se/.test(h)) {
      const s = Math.max(w, hh, floorW, floorH);
      const capped = el.type === "table" ? Math.min(s, ceilH) : s;
      w = capped;
      hh = capped;
    }
    Object.assign(el, { x, y, w, h: hh });
    const bw = me.value.contentW;
    const bh = me.value.contentH;
    const peers = bodySnapPeers();
    if (!ev.shiftKey) {
      const snapped = magneticSnapResize(el.x, el.y, el.w, el.h, h, bw, bh, peers, el.id, floorW, floorH);
      Object.assign(el, snapped);
      if (el.type === "table" && !el.tableSqlFill?.enabled) {
        const cap = intrinsicOuterHeightForTemplateTable(el);
        if (el.h > cap) el.h = cap;
      }
    }
    clamp(el);
    tplSnapGuides.value = ev.shiftKey
      ? { v: [], h: [] }
      : alignmentGuidesForRect(el.x, el.y, el.w, el.h, bw, bh, peers, el.id);
  }
}

function ptrUp() {
  move = null;
  resize = null;
  clearTplSnapGuides();
  window.removeEventListener("pointermove", ptrMove);
}

onBeforeUnmount(() => {
  ptrUp();
  embedResizeObserver?.disconnect();
});

function onPaperBlank(ev: PointerEvent) {
  if (props.interactionLocked) return;
  const t = ev.target as HTMLElement;
  if (t.closest(".el-node")) return;
  /** 点击画布任意空白（含正文区、页眉页脚带，非控件）即取消选中，缩放手柄随选中状态消失 */
  selId.value = null;
}

function onDragOverRoot() {
  if (props.interactionLocked) return;
  dragOverRoot.value = true;
}

function onDragLeaveRoot(e: DragEvent) {
  const cur = e.currentTarget as HTMLElement;
  const rt = e.relatedTarget as Node | null;
  if (rt && cur.contains(rt)) return;
  dragOverRoot.value = false;
}

function toolType(s: string): TemplateControlType | null {
  const ok = ["text", "box", "image", "date", "table", "chart", "parameter", "signature"];
  return ok.includes(s) ? (s as TemplateControlType) : null;
}

async function onDrop(e: DragEvent) {
  if (props.interactionLocked) return;
  dragOverRoot.value = false;
  const tp = toolType(e.dataTransfer?.getData("application/x-template-tool") || e.dataTransfer?.getData("text/plain") || "");
  const layer = viewportRef.value?.querySelector(".el-root");
  if (!layer) return;
  const r = layer.getBoundingClientRect();
  const sc = canvasScale.value || 1;
  const x = Math.round((e.clientX - r.left) / sc - 20);
  const y = Math.round((e.clientY - r.top) / sc - 16);

  if (tp) {
    const el = makeElement(tp);
    el.x = Math.max(0, x);
    el.y = Math.max(0, y);
    clamp(el);
    list.value.push(el);
    selId.value = el.id;
    return;
  }

  const imgFile = pickFirstImageFileFromDataTransfer(e.dataTransfer);
  if (!imgFile) return;
  let dataUrl: string;
  try {
    dataUrl = await readImageFileAsDataUrl(imgFile);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
    return;
  }
  const el = makeElement("image");
  el.imageSrc = dataUrl;
  el.x = Math.max(0, x);
  el.y = Math.max(0, y);
  clamp(el);
  list.value.push(el);
  selId.value = el.id;
}

function onWheel(ev: WheelEvent) {
  if (props.interactionLocked) {
    ev.preventDefault();
    return;
  }
  if (ev.ctrlKey || ev.metaKey) {
    if (props.embedInParentScroll) {
      ev.preventDefault();
      return;
    }
    const z = Math.exp(-ev.deltaY * 0.001);
    viewScale.value = Math.min(2.8, Math.max(0.35, +(viewScale.value * z).toFixed(4)));
    return;
  }
  if (props.embedInParentScroll) {
    return;
  }
  panX.value -= ev.deltaX * 0.5;
  panY.value -= ev.deltaY * 0.5;
}

async function assignTplBodyImage(el: TemplateElement | null, f?: File | null) {
  if (!el || el.type !== "image") return;
  const file = f ?? null;
  if (!looksLikeImageFile(file)) return;
  try {
    el.imageSrc = await readImageFileAsDataUrl(file);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}

function beginTplBodyImagePick(el: TemplateElement) {
  if (props.interactionLocked) return;
  if (el.type !== "image") return;
  selId.value = el.id;
  tplBodyPendingSid = el.id;
  void nextTick(() => tplImgFileRef.value?.click());
}

async function onTplBodyImageChosen(ev: Event) {
  const inp = ev.target as HTMLInputElement;
  const file = inp.files?.[0];
  inp.value = "";
  const id = tplBodyPendingSid;
  tplBodyPendingSid = null;
  const el = id ? list.value.find((x) => x.id === id) ?? null : null;
  await assignTplBodyImage(el, file ?? null);
}

async function onTplImageDropFile(ev: DragEvent, el: TemplateElement) {
  if (props.interactionLocked) return;
  if (el.type !== "image") return;
  selId.value = el.id;
  await assignTplBodyImage(el, pickFirstImageFileFromDataTransfer(ev.dataTransfer));
}
</script>

<style scoped>
.cv-viewport {
  overflow: auto;
  background: radial-gradient(rgb(251 251 254), rgb(229 229 237));
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  min-height: 440px;
  touch-action: pan-x pan-y;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  position: relative;
}
/* 页眉/页脚弹窗打开：禁止操作正文画布并压低中间区高度，减少背后大块留白 */
.cv-viewport.cv-viewport--locked {
  pointer-events: none;
  user-select: none;
  opacity: 0.82;
  min-height: 240px;
  max-height: min(42vh, 360px);
  filter: saturate(0.9);
}
/* 嵌入父级单列滚动：不自建滚动条，滚轮交给外层，多页纵向拼接（类似 Word 连续视图） */
.cv-viewport.cv-viewport--embed-scroll {
  overflow: visible;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  background: transparent;
  border: none;
  border-radius: 0;
  overscroll-behavior: auto;
  touch-action: manipulation;
  box-sizing: border-box;
}
.cv-viewport.cv-viewport--embed-scroll .cv-embed-slot {
  flex-shrink: 0;
  box-sizing: border-box;
}
.cv-viewport.cv-viewport--embed-scroll .cv-scaler {
  margin-left: 0;
  margin-right: 0;
}
.cv-viewport.cv-viewport--embed-scroll.cv-viewport--locked {
  overflow: auto;
  width: auto;
  align-self: stretch;
}
.cv-sr-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.cv-scaler {
  transform-origin: 0 0;
  padding: 20px;
  display: inline-block;
}
.cv-band {
  position: absolute;
  box-sizing: border-box;
  background: rgb(239 239 246 / 0.55);
  overflow: hidden;
  display: flex;
  align-items: stretch;
  padding-left: 0;
}
.cv-band-inner {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.cv-zone-el {
  pointer-events: none;
}
.cv-zone-ph {
  font-size: 11px;
  color: #94a3b8;
}
.cv-zone-decor-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
.cv-snap-guide-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 40;
  overflow: visible;
}
.cv-snap-line {
  position: absolute;
  background: rgb(99 102 241 / 0.92);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.65);
}
.cv-snap-line--v {
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-0.5px);
}
.cv-snap-line--h {
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-0.5px);
}
.cv-band-missing {
  border: 1px dashed rgb(161 161 170 / 0.65);
  background: rgb(244 244 247 / 0.35);
}
.cv-body {
  position: absolute;
  box-sizing: border-box;
  background: rgb(250 250 252);
}
.cv-droptarget {
  outline: 2px dashed #818cf8;
  outline-offset: -2px;
  background: rgb(238 242 255 / 0.45);
}
.cv-hint {
  font-size: 11px;
  color: #71717a;
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}
.el-inner {
  display: flex;
  align-items: center;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  white-space: nowrap;
}
.el-inner--table {
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
  white-space: normal;
}
.el-inner--textlike {
  white-space: normal;
  min-height: 0;
}
.cv-text-display {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
.cv-sig-stack {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
}
.cv-sig-img {
  flex: 1;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
.cv-sig-img--front {
  position: relative;
  z-index: 1;
}
.cv-sig-watermark {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.25;
  font-weight: 700;
  color: transparent;
  -webkit-text-stroke: 1.12px rgb(148 163 184 / 0.9);
  -webkit-text-fill-color: transparent;
  paint-order: stroke fill;
}
.cv-sig-watermark--behind {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  z-index: 0;
  pointer-events: none;
  box-sizing: border-box;
  padding: 0 2px;
}
.cv-sig-handwriting-ph {
  flex: 1;
  min-width: 0;
  min-height: 0;
  font-size: 0.85em;
  opacity: 0.65;
  white-space: pre-wrap;
  word-break: break-word;
}
@supports not ((-webkit-text-stroke: 1px transparent) or (text-stroke: 1px transparent)) {
  .cv-sig-watermark {
    color: rgb(148 163 184 / 0.48);
    -webkit-text-stroke: 0 transparent;
    -webkit-text-fill-color: currentcolor;
  }
}
.cv-text-edit {
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
  overflow-y: auto;
  font: inherit;
  color: inherit;
  line-height: 1.35;
  letter-spacing: inherit;
  text-align: inherit;
  background: transparent;
  outline: none;
  box-shadow: none;
  caret-color: #4338ca;
  field-sizing: content;
}
.cv-text-edit:focus {
  outline: none;
}
.cv-table-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding-bottom: 1px;
}
.cv-table {
  width: 100%;
  height: auto;
  max-height: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  background: rgb(255 255 255 / 0.96);
}
.cv-table tbody td {
  height: inherit;
  box-sizing: border-box;
}
.cv-table tbody tr.cv-table-sql-page-hint-row,
.cv-table tbody tr.cv-table-sql-truncate-hint-row {
  height: auto;
}
.cv-table tbody tr.cv-table-sql-page-hint-row td,
.cv-table tbody tr.cv-table-sql-truncate-hint-row td {
  height: auto;
}
.cv-table-cell {
  border-top: 1px solid rgb(212 212 216);
  border-left: 1px solid rgb(212 212 216);
  padding: 3px 5px;
  vertical-align: middle;
  text-align: center;
  overflow: hidden;
  cursor: cell;
}
.cv-table-cell:last-child {
  border-right: 1px solid rgb(212 212 216);
}
.cv-table tbody tr:last-child:not(.cv-table-sql-page-hint-row):not(.cv-table-sql-truncate-hint-row) .cv-table-cell {
  border-bottom: 1px solid rgb(212 212 216);
}
.cv-table tbody tr:not(.cv-table-sql-page-hint-row):not(.cv-table-sql-truncate-hint-row):has(+ tr.cv-table-sql-page-hint-row)
  .cv-table-cell,
.cv-table tbody tr:not(.cv-table-sql-page-hint-row):not(.cv-table-sql-truncate-hint-row):has(+ tr.cv-table-sql-truncate-hint-row)
  .cv-table-cell {
  border-bottom: 1px solid rgb(212 212 216);
}
.cv-table-sql-page-hint-cell {
  padding: 6px 8px;
  font-size: max(10px, 0.78em);
  line-height: 1.45;
  color: #52525b;
  text-align: left;
  vertical-align: middle;
  background: rgb(250 250 250 / 0.96);
  cursor: default;
  overflow: visible;
  white-space: normal;
  word-break: break-word;
  border-top: 1px solid rgb(212 212 216);
  border-left: 1px solid rgb(212 212 216);
  border-right: 1px solid rgb(212 212 216);
  border-bottom: 1px solid rgb(212 212 216);
}
.cv-table-sql-truncate-hint-cell {
  padding: 6px 8px;
  font-size: max(10px, 0.8em);
  line-height: 1.45;
  color: #713f12;
  text-align: center;
  vertical-align: middle;
  font-weight: 600;
  background: rgb(254 249 195 / 0.92);
  cursor: default;
  overflow: visible;
  white-space: normal;
  word-break: break-word;
  border-top: 1px solid rgb(234 179 8 / 0.55);
  border-left: 1px solid rgb(212 212 216);
  border-right: 1px solid rgb(212 212 216);
  border-bottom: 1px solid rgb(212 212 216);
}
.cv-table-cell--hot {
  box-shadow: inset 0 0 0 2px #6366f1;
}
.cv-table-cell-txt {
  display: block;
  font-size: max(10px, 0.85em);
  line-height: 1.3;
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 100%;
  overflow: hidden;
}
.cv-table-cell-edit {
  display: block;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  resize: none;
  overflow-y: auto;
  max-height: 100%;
  font: inherit;
  color: inherit;
  font-size: max(10px, 0.85em);
  line-height: 1.35;
  letter-spacing: inherit;
  text-align: inherit;
  vertical-align: inherit;
  background: transparent;
  outline: none;
  box-shadow: none;
  caret-color: #4338ca;
  field-sizing: fixed;
  min-height: 0;
}
.cv-table-cell-edit:focus {
  outline: none;
}
.cv-table-cell-ddl {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 2px 4px;
  font: inherit;
  font-size: max(10px, 0.85em);
  line-height: 1.35;
  text-align: inherit;
  min-height: 0;
}
.cv-table-cell-ddl.tbl-sql-ddl--warn {
  border-color: #f59e0b;
  background: #fffbeb;
  color: #92400e;
}
.cv-img-slot {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
}
.cv-img-fit {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}
.cv-ph-img {
  font-size: 11px;
  color: #94a3b8;
  cursor: pointer;
  border-bottom: 1px dashed currentcolor;
}
.cv-ph-img:hover {
  color: #475569;
}
.el-node {
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  padding: 4px;
  position: relative;
  z-index: 1;
}
.el-node.sel {
  outline: 2px solid #6366f1;
  overflow: visible;
  z-index: 6;
}
.touch {
  touch-action: manipulation;
}
.hz {
  --cv-hz-hit: 44px;
  --cv-hz-out: 9px;
  position: absolute;
  width: var(--cv-hz-hit);
  height: var(--cv-hz-hit);
  margin: 0;
  border: none;
  padding: 0;
  background: transparent;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 3;
  /* 大块命中区会盖住表格单元格点击；仅让小圆点接收指针 */
  pointer-events: none;
}
.hz:focus {
  outline: none;
}
.hz:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
  border-radius: 4px;
}
.hz::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  margin-top: -6px;
  box-sizing: border-box;
  border-radius: 50%;
  background: linear-gradient(145deg, #818cf8 0%, #6366f1 55%, #4f46e5 100%);
  border: 2px solid #fff;
  box-shadow:
    0 1px 3px rgb(15 23 42 / 0.25),
    0 0 0 1px rgb(99 102 241 / 0.35);
  pointer-events: auto;
  cursor: inherit;
}
.hz:hover::after {
  background: linear-gradient(145deg, #6366f1 0%, #4f46e5 100%);
  box-shadow:
    0 2px 6px rgb(15 23 42 / 0.3),
    0 0 0 1px rgb(79 70 229 / 0.45);
}
.hz-nw {
  left: calc(-1 * var(--cv-hz-out));
  top: calc(-1 * var(--cv-hz-out));
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
}
.hz-ne {
  right: calc(-1 * var(--cv-hz-out));
  top: calc(-1 * var(--cv-hz-out));
  margin-right: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
  cursor: nesw-resize;
}
.hz-se {
  right: calc(-1 * var(--cv-hz-out));
  bottom: calc(-1 * var(--cv-hz-out));
  margin-right: calc(-0.5 * var(--cv-hz-hit));
  margin-bottom: calc(-0.5 * var(--cv-hz-hit));
}
.hz-sw {
  left: calc(-1 * var(--cv-hz-out));
  bottom: calc(-1 * var(--cv-hz-out));
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-bottom: calc(-0.5 * var(--cv-hz-hit));
  cursor: nesw-resize;
}
.hz-n {
  left: 50%;
  top: calc(-1 * var(--cv-hz-out));
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
  cursor: ns-resize;
}
.hz-s {
  left: 50%;
  bottom: calc(-1 * var(--cv-hz-out));
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-bottom: calc(-0.5 * var(--cv-hz-hit));
  cursor: ns-resize;
}
.hz-e {
  right: calc(-1 * var(--cv-hz-out));
  top: 50%;
  margin-right: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
  cursor: ew-resize;
}
.hz-w {
  left: calc(-1 * var(--cv-hz-out));
  top: 50%;
  margin-left: calc(-0.5 * var(--cv-hz-hit));
  margin-top: calc(-0.5 * var(--cv-hz-hit));
  cursor: ew-resize;
}
</style>
