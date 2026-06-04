<template>
  <div ref="hostEl" class="tep-root" title="单击选中页面；双击进入编辑画布并跳到该页">
    <template v-for="(report, reportIdx) in previewReports" :key="'report-' + reportIdx">
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
        <div v-if="!pdfExportOmitCaptions" class="tep-cap">
          封面 · 第 {{ reportCoverPreviewPage(reportIdx) }} / {{ totalPreviewPages }} 页{{ reportSuffix(report) }}
        </div>
        <TemplateMiniPage
          :template="tmpl"
          sheet="cover"
          :preview-binding-values="report.previewValues"
          :max-width-px="cardWidth"
          :max-height-px="miniPageMaxHeightPx"
          :preview-page="reportCoverPreviewPage(reportIdx)"
          :preview-total-pages="totalPreviewPages"
        />
      </div>

      <div
        v-for="(card, idx) in report.bodyCards"
        :key="'rp-' + reportIdx + '-bp-' + card.bodyPageIndex + '-' + card.continuationIndex"
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
            正文 · 第 {{ reportBodyPreviewPage(reportIdx, idx) }} / {{ totalPreviewPages }} 页（画布
            {{ card.bodyPageIndex + 1 }} / {{ bodyPageTotal }} · 表下控件）{{ reportSuffix(report) }}
          </template>
          <template v-else>
            正文 · 第 {{ reportBodyPreviewPage(reportIdx, idx) }} / {{ totalPreviewPages }} 页（画布
            {{ card.bodyPageIndex + 1 }} / {{ bodyPageTotal
            }}<template v-if="card.continuationIndex > 0"> · SQL 续表</template>）{{ reportSuffix(report) }}
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
          :preview-binding-values="report.previewValues"
          :max-width-px="cardWidth"
          :max-height-px="miniPageMaxHeightPx"
          :preview-page="reportBodyPreviewPage(reportIdx, idx)"
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
        <div v-if="!pdfExportOmitCaptions" class="tep-cap">
          末页 · 第 {{ reportBackPreviewPage(reportIdx) }} / {{ totalPreviewPages }} 页{{ reportSuffix(report) }}
        </div>
        <TemplateMiniPage
          :template="tmpl"
          sheet="back"
          :preview-binding-values="report.previewValues"
          :max-width-px="cardWidth"
          :max-height-px="miniPageMaxHeightPx"
          :preview-page="reportBackPreviewPage(reportIdx)"
          :preview-total-pages="totalPreviewPages"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ReportTemplate } from "@/lib/report-template/model";
import { ensureBodyPages } from "@/lib/report-template/model";
import {
  templateHasBackSheet,
  templateHasCoverSheet,
  type EditorSheet,
} from "@/lib/report-template/editor-sheet";
import type { ExportPreviewNavPayload } from "@/lib/report-template/export-preview-nav";
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";
import {
  computeExpandedBodyPreviewCards,
  type ExpandedBodyPreviewCard,
} from "@/lib/report-template/table-sql-fill-export-preview-split";
import {
  buildSqlFillSplitReportPlan,
  previewValuesForSplitReport,
} from "@/lib/report-template/table-sql-fill-report-split";
import TemplateMiniPage from "@/components/report-template/TemplateMiniPage.vue";

type PreviewValues = Record<string, BindingPreviewCell | undefined>;

interface PreviewReport {
  reportIndex: number;
  totalReports: number;
  previewValues: PreviewValues;
  bodyCards: ExpandedBodyPreviewCard[];
}

const props = defineProps<{
  tmpl: ReportTemplate;
  activeSheet: EditorSheet;
  activeBodyPageIndex: number;
  previewBindingValues?: Record<string, BindingPreviewCell | undefined> | null;
  reportPartIndex?: number | null;
  fixedCardWidthPx?: number | null;
  pdfExportOmitCaptions?: boolean;
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
const includeCover = computed(() => templateHasCoverSheet(props.tmpl));
const includeBack = computed(() => templateHasBackSheet(props.tmpl));

const allPreviewReports = computed<PreviewReport[]>(() => {
  const base = (props.previewBindingValues ?? {}) as PreviewValues;
  const plan = buildSqlFillSplitReportPlan(props.tmpl, base);
  if (!plan) {
    return [
      {
        reportIndex: 0,
        totalReports: 1,
        previewValues: base,
        bodyCards: computeExpandedBodyPreviewCards(props.tmpl, base),
      },
    ];
  }

  return plan.chunks.map((_rows, idx) => {
    const previewValues = previewValuesForSplitReport(base, plan, idx);
    return {
      reportIndex: idx,
      totalReports: plan.chunks.length,
      previewValues,
      bodyCards: computeExpandedBodyPreviewCards(props.tmpl, previewValues),
    };
  });
});

const previewReports = computed<PreviewReport[]>(() => {
  const all = allPreviewReports.value;
  const idx = props.reportPartIndex;
  if (idx == null || !Number.isFinite(idx)) return all;
  const i = Math.trunc(idx);
  if (i < 0 || i >= all.length) return all;
  return [all[i]];
});

function reportPageCount(report: PreviewReport): number {
  return (includeCover.value ? 1 : 0) + report.bodyCards.length + (includeBack.value ? 1 : 0);
}

function reportStartPage(reportIdx: number): number {
  let n = 1;
  for (let i = 0; i < reportIdx; i++) n += reportPageCount(previewReports.value[i]);
  return n;
}

const totalPreviewPages = computed(() =>
  previewReports.value.reduce((sum, report) => sum + reportPageCount(report), 0),
);

function reportCoverPreviewPage(reportIdx: number): number {
  return reportStartPage(reportIdx);
}

function reportBodyPreviewPage(reportIdx: number, bodyCardIndex: number): number {
  return reportStartPage(reportIdx) + (includeCover.value ? 1 : 0) + bodyCardIndex;
}

function reportBackPreviewPage(reportIdx: number): number {
  return reportStartPage(reportIdx) + reportPageCount(previewReports.value[reportIdx]) - 1;
}

function reportSuffix(report: PreviewReport): string {
  return report.totalReports > 1 ? `（第 ${report.reportIndex + 1} / ${report.totalReports} 份）` : "";
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
