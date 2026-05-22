<template>
  <div class="pdf-export-root">
    <TemplateExportPreviewStack
      v-if="tmpl"
      :tmpl="tmpl"
      active-sheet="cover"
      :active-body-page-index="0"
      :preview-binding-values="bindingPreview.values.value"
      :fixed-card-width-px="fixedCardWidthPx"
      pdf-export-omit-captions
      :mini-max-height-px="pdfMiniMaxHeightPx"
    />
    <div v-else-if="errText" class="pdf-export-err">{{ errText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref } from "vue";
import { useRoute } from "vue-router";
import TemplateExportPreviewStack from "@/components/report-template/TemplateExportPreviewStack.vue";
import { getTemplate } from "@/api/templates";
import type { ReportTemplate } from "@/lib/report-template/model";
import { useReportBindingPreview } from "@/composables/useReportBindingPreview";
import { reportBindingPreviewKey } from "@/lib/report-template/template-editor-context";
import { getPaperPageCssPx, PAPER_PRESETS, type PaperKind } from "@/lib/report-template/paper";
import { humanizePdfExportError } from "@/lib/pdfExportErrors";
import {
  collectBindingPreviewIssues,
  summarizeBindingPreviewIssues,
} from "@/lib/bindingPreviewErrors";

const route = useRoute();
const tmpl = ref<ReportTemplate | null>(null);
const errText = ref<string | null>(null);

const bindingPreview = useReportBindingPreview(tmpl);
provide(reportBindingPreviewKey, bindingPreview);

const fixedCardWidthPx = computed(() => {
  const t = tmpl.value;
  if (!t) return 520;
  return getPaperPageCssPx(t.paperKind as PaperKind, t.orientation).widthPx;
});

/**
 * 迷你预览默认 scale=1 时 mini-wrap 高度≈一纸；再加卡片标题与内边距会略高于 PDF @page，
 * Chromium 会把每张卡拆成两页（第二页常近乎空白）。限制 max-height 使整体略缩小，单卡落入一页。
 */
const pdfMiniMaxHeightPx = computed(() => {
  const t = tmpl.value;
  if (!t) return null;
  const { heightPx } = getPaperPageCssPx(t.paperKind as PaperKind, t.orientation);
  const slackPx = 28; /* TemplateMiniPage scaledSize +3 与取整；caption 已在 PDF 省略 */
  return Math.max(200, heightPx - slackPx);
});

function injectPrintPageCss(t: ReportTemplate): void {
  const d = PAPER_PRESETS[t.paperKind as PaperKind];
  const portrait = t.orientation !== "landscape";
  const wmm = portrait ? d.widthMm : d.heightMm;
  const hmm = portrait ? d.heightMm : d.widthMm;
  let el = document.getElementById("pdf-export-page-style");
  if (!el) {
    el = document.createElement("style");
    el.id = "pdf-export-page-style";
    document.head.appendChild(el);
  }
  el.textContent = `@media print {
  @page { size: ${wmm}mm ${hmm}mm; margin: 0; }
}`;
}

function signalReady(ok: boolean, error?: string): void {
  window.electronAPI?.notifyPdfExportReady?.({ ok, error });
}

async function waitPaintReady(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise<void>((r) => setTimeout(r, 120));
}

async function boot(): Promise<void> {
  const id = String(route.query.templateId || "").trim();
  if (!id) {
    errText.value = humanizePdfExportError("缺少 templateId");
    signalReady(false, errText.value);
    return;
  }
  try {
    tmpl.value = await getTemplate(id);
  } catch (e) {
    errText.value = humanizePdfExportError(e);
    signalReady(false, errText.value);
    return;
  }

  const t = tmpl.value;
  injectPrintPageCss(t);

  await bindingPreview.refresh({ opc: true, sql: true, silent: true });
  const bindingIssues = collectBindingPreviewIssues(bindingPreview.values.value);
  if (bindingIssues.length) {
    errText.value = humanizePdfExportError(summarizeBindingPreviewIssues(bindingIssues));
    signalReady(false, errText.value);
    return;
  }
  await nextTick();
  await waitPaintReady();
  signalReady(true);
}

onMounted(() => {
  void boot();
});
</script>

<style>
/*
 * 全局 style.css 将 html/body/#app 设为 height:100% + overflow:hidden（主导航防双滚动）。
 * Chromium 打印/pdf 会按「裁剪后的可视区域」分页，结果常变成只有 1 页 —— 此处打印时必须放开高度与溢出。
 */
@media print {
  html,
  body,
  #app {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    display: block !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .pdf-export-root {
    min-height: 0 !important;
    overflow: visible !important;
  }
  /* flex + overflow:auto 在打印时容易导致不分页或裁剪；导出栈改为块级并强制分页 */
  .pdf-export-root .tep-root {
    display: block !important;
    padding: 0 !important;
    gap: 0 !important;
    background: #fff !important;
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    min-height: 0 !important;
    flex: none !important;
    align-items: stretch !important;
  }
  .pdf-export-root .tep-card {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    padding: 0 !important;
    border: none !important;
    /* 避免单张逻辑页被拆到两页 PDF */
    break-inside: avoid;
    page-break-inside: avoid;
    /* 仅用「下一卡片前置分页」，避免 break-after + Chromium 在部分机型上出现「内容页后多一页空白」 */
    page-break-after: auto !important;
    break-after: auto !important;
    box-shadow: none !important;
  }
  .pdf-export-root .tep-card:not(:first-child) {
    page-break-before: always;
    break-before: page;
  }
  /* 迷你预览外壳为 inline-flex，打印时分页偶发异常；导出时改为普通块级 */
  .pdf-export-root .mpc,
  .pdf-export-root .mpc-slot {
    display: block !important;
    padding: 0 !important;
  }
}
.pdf-export-root {
  min-height: 100vh;
  box-sizing: border-box;
}
.pdf-export-err {
  padding: 16px;
  color: #b91c1c;
  font: 14px/1.5 system-ui, sans-serif;
}
</style>
