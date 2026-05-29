<template>
  <div ref="hostEl" class="tep-root" title="单击选中页；双击进入编辑画布并跳到该页">
    <div
      v-if="includeCover"
      class="tep-card"
      :class="{ 'tep-card--hl': activeSheet === 'cover' }"
      role="button"
      tabindex="0"
      @click.stop="onCardNavigate(navCover())"
      @dblclick.capture.stop="onCardEdit(navCover())"
      @keyup.enter.prevent="onCardNavigate(navCover())"
    >
      <div v-if="!pdfExportOmitCaptions" class="tep-cap">封面 · 第 1 / {{ totalPreviewPages }} 页</div>
      <TemplateMiniPage
        :template="tmpl"
        sheet="cover"
        :max-width-px="cardWidth"
        :max-height-px="miniPageMaxHeightPx"
        :preview-page="1"
        :preview-total-pages="totalPreviewPages"
      />
    </div>

    <div
      v-for="(card, idx) in expandedBodyCards"
      :key="'bp-' + card.bodyPageIndex + '-' + card.continuationIndex"
      class="tep-card"
      :class="{ 'tep-card--hl': activeSheet === 'body' && activeBodyPageIndex === card.bodyPageIndex }"
      role="button"
      tabindex="0"
      @click.stop="onCardNavigate(navBody(card.bodyPageIndex))"
      @dblclick.capture.stop="onCardEdit(navBody(card.bodyPageIndex))"
      @keyup.enter.prevent="onCardNavigate(navBody(card.bodyPageIndex))"
    >
      <div v-if="!pdfExportOmitCaptions" class="tep-cap">
        <template v-if="card.tailOnlyBelowBaseline">
          正文 · 第 {{ bodyCardPreviewPage(idx) }} / {{ totalPreviewPages }} 页（画布 {{ card.bodyPageIndex + 1 }} /
          {{ bodyPageTotal }} · 表下控件）
        </template>
        <template v-else>
          正文 · 第 {{ bodyCardPreviewPage(idx) }} / {{ totalPreviewPages }} 页（画布 {{ card.bodyPageIndex + 1 }} /
          {{ bodyPageTotal }}<template v-if="card.continuationIndex > 0"> · SQL 续表</template>）
        </template>
      </div>
      <TemplateMiniPage
        :template="tmpl"
        sheet="body"
        :body-page-index="card.bodyPageIndex"
        :body-continuation-index="card.continuationIndex"
        :sql-fill-table-slices="card.sqlFillTableSlices"
        :continuation-hide-other-body-elements="card.continuationHideOtherBodyElements"
        :sql-fill-hide-below="card.sqlFillHideBelow ?? null"
        :show-sql-fill-tail-divider-hint="!!card.showSqlFillTailDividerHint"
        :tail-only-below-baseline="!!card.tailOnlyBelowBaseline"
        :tail-baseline-y="card.tailBaselineY"
        :overflow-sql-fill-table-id="card.overflowSqlFillTableId"
        :max-width-px="cardWidth"
        :max-height-px="miniPageMaxHeightPx"
        :preview-page="bodyCardPreviewPage(idx)"
        :preview-total-pages="totalPreviewPages"
      />
    </div>

    <div
      v-if="includeBack"
      class="tep-card"
      :class="{ 'tep-card--hl': activeSheet === 'back' }"
      role="button"
      tabindex="0"
      @click.stop="onCardNavigate(navBack())"
      @dblclick.capture.stop="onCardEdit(navBack())"
      @keyup.enter.prevent="onCardNavigate(navBack())"
    >
      <div v-if="!pdfExportOmitCaptions" class="tep-cap">末页 · 第 {{ totalPreviewPages }} / {{ totalPreviewPages }} 页</div>
      <TemplateMiniPage
        :template="tmpl"
        sheet="back"
        :max-width-px="cardWidth"
        :max-height-px="miniPageMaxHeightPx"
        :preview-page="totalPreviewPages"
        :preview-total-pages="totalPreviewPages"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ReportTemplate } from "@/lib/report-template/model";
import { ensureBodyPages } from "@/lib/report-template/model";
import {
  templateHasBackSheet,
  templateHasCoverSheet,
  templateExportPageCount,
  type EditorSheet,
} from "@/lib/report-template/editor-sheet";
import type { ExportPreviewNavPayload } from "@/lib/report-template/export-preview-nav";
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import { computeExpandedBodyPreviewCards } from "@/lib/report-template/table-sql-fill-export-preview-split";
import TemplateMiniPage from "@/components/report-template/TemplateMiniPage.vue";

const props = defineProps<{
  tmpl: ReportTemplate;
  activeSheet: EditorSheet;
  /** 左侧当前选中的正文分页（0-based），用于预览卡片高亮 */
  activeBodyPageIndex: number;
  /** 绑定预览快照（用于 SQL 填充结果集分页） */
  previewBindingValues?: Record<string, BindingPreviewCell | undefined> | null;
  /**
   * 若指定则卡片宽度固定为该值（与纸张 CSS 像素宽对齐，用于 PDF 导出），不再监听容器宽度。
   */
  fixedCardWidthPx?: number | null;
  /**
   * PDF 等场景：省略卡片顶部灰字标题（「封面 · 第 n / m 页」），少占纵向像素。
   */
  pdfExportOmitCaptions?: boolean;
  /**
   * 覆盖 TemplateMiniPage 的 max-height-px（默认 32000）。
   * PDF 导出时应略小于一纸 CSS 高度，使 scale&lt;1，卡片总高度落入单页，避免「一页内容一页空白」。
   */
  miniMaxHeightPx?: number | null;
}>();

const miniPageMaxHeightPx = computed(() =>
  props.miniMaxHeightPx != null && Number.isFinite(props.miniMaxHeightPx) && props.miniMaxHeightPx > 0
    ? Math.floor(props.miniMaxHeightPx)
    : 32000,
);

const emit = defineEmits<{
  "preview-navigate": [payload: ExportPreviewNavPayload];
  "request-edit": [payload: ExportPreviewNavPayload];
}>();

let pendingNavigateTimer: ReturnType<typeof setTimeout> | null = null;

function navCover(): ExportPreviewNavPayload {
  return { sheet: "cover" };
}
function navBack(): ExportPreviewNavPayload {
  return { sheet: "back" };
}
function navBody(bodyPageIndex: number): ExportPreviewNavPayload {
  return { sheet: "body", bodyPageIndex };
}

function onCardNavigate(payload: ExportPreviewNavPayload) {
  if (pendingNavigateTimer) clearTimeout(pendingNavigateTimer);
  pendingNavigateTimer = setTimeout(() => {
    pendingNavigateTimer = null;
    emit("preview-navigate", payload);
  }, 220);
}

function onCardEdit(payload: ExportPreviewNavPayload) {
  if (pendingNavigateTimer) {
    clearTimeout(pendingNavigateTimer);
    pendingNavigateTimer = null;
  }
  emit("preview-navigate", payload);
  emit("request-edit", payload);
}

const hostEl = ref<HTMLElement | null>(null);
const cardWidth = ref(520);

watch(
  () => props.fixedCardWidthPx,
  (v) => {
    if (v != null && Number.isFinite(v) && v > 0) cardWidth.value = Math.floor(v);
  },
  { immediate: true },
);

const bodyPageTotal = computed(() => ensureBodyPages(props.tmpl).length);

const expandedBodyCards = computed(() =>
  computeExpandedBodyPreviewCards(props.tmpl, props.previewBindingValues ?? {}),
);

const includeCover = computed(() => templateHasCoverSheet(props.tmpl));
const includeBack = computed(() => templateHasBackSheet(props.tmpl));

const totalPreviewPages = computed(() =>
  templateExportPageCount(props.tmpl, expandedBodyCards.value.length),
);

function bodyCardPreviewPage(bodyCardIndex: number): number {
  return (includeCover.value ? 1 : 0) + bodyCardIndex + 1;
}

let ro: ResizeObserver | null = null;

onMounted(() => {
  if (props.fixedCardWidthPx != null && Number.isFinite(props.fixedCardWidthPx) && props.fixedCardWidthPx > 0) {
    return;
  }
  ro = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 520;
    cardWidth.value = Math.max(280, Math.floor(w - 36));
  });
  const el = hostEl.value;
  if (el) ro.observe(el);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  ro = null;
  if (pendingNavigateTimer) {
    clearTimeout(pendingNavigateTimer);
    pendingNavigateTimer = null;
  }
});
</script>

<style scoped>
.tep-root {
  box-sizing: border-box;
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding: 10px 10px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  background: radial-gradient(rgb(251 251 254), rgb(229 229 237));
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.tep-card {
  flex-shrink: 0;
  padding: 10px 12px 14px;
  border-radius: 12px;
  border: 2px solid transparent;
  background: rgb(250 250 252 / 0.92);
  box-shadow: 0 1px 0 rgb(24 24 27 / 0.06);
  cursor: pointer;
}
.tep-card:focus-visible {
  outline: 2px solid rgb(99 102 241 / 0.55);
  outline-offset: 2px;
}
.tep-card--hl {
  border-color: #818cf8;
  box-shadow:
    0 0 0 1px rgb(99 102 241 / 0.22),
    0 8px 22px rgb(24 24 27 / 0.06);
}
.tep-cap {
  font-size: 11px;
  font-weight: 600;
  color: #52525b;
  margin-bottom: 8px;
}
</style>
