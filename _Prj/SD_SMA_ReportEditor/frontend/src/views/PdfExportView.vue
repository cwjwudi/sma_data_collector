<template>
  <div class="pdf-export-root">
    <TemplateExportPreviewStack
      v-if="tmpl && useChromiumPrint"
      :tmpl="tmpl"
      active-sheet="cover"
      :active-body-page-index="0"
      :preview-binding-values="bindingPreview.values.value"
      :report-part-index="reportPartIndex"
      :fixed-card-width-px="fixedCardWidthPx"
      pdf-export-omit-captions
      :mini-max-height-px="pdfMiniMaxHeightPx"
    />
    <div v-else-if="errText" class="pdf-export-err">{{ errText }}</div>
    <div v-else-if="tmpl && !useChromiumPrint" class="pdf-export-pdflib-hint">
      pdf-lib · {{ layoutFidelity }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref, watch } from "vue";
import { useRoute } from "vue-router";
import TemplateExportPreviewStack from "@/components/report-template/TemplateExportPreviewStack.vue";
import { getTemplate } from "@/api/templates";
import type { ReportTemplate } from "@/lib/report-template/model";
import { useReportBindingPreview } from "@/composables/useReportBindingPreview";
import { reportBindingPreviewKey } from "@/lib/report-template/template-editor-context";
import { getPaperPageCssPx, PAPER_PRESETS, type PaperKind } from "@/lib/report-template/paper";
import { humanizePdfExportError } from "@/lib/pdfExportErrors";
import {
  collectBindingPreviewIssueDetails,
  summarizeBindingPreviewIssueDetails,
  type ExportFailureDiagnostics,
} from "@/lib/bindingPreviewErrors";
import { splitReportCountForPreview } from "@/lib/report-template/table-sql-fill-report-split";
import {
  clearPdfExportFillCache,
  getPdfExportFillCache,
  setPdfExportFillCache,
  shouldReusePdfExportFill,
} from "@/lib/report-template/pdf-export-fill-cache";
import {
  BINDING_FILL_OUTER_RETRY_DELAYS_MS,
  BINDING_FILL_OUTER_RETRY_MAX,
  isRetryableBindingFillSummary,
  retryDelayMs,
  sleepMs,
} from "@/lib/report-template/sql-fill-retry";
import { normalizePdfExportEngine, type PdfExportEngineId } from "@/lib/pdf-export-engine";
import { installPrintTableGridOverlays } from "@/lib/report-template/print-table-grid-overlay";
import { collectFontFamiliesFromTemplate } from "@/lib/report-template/font-families-collect";
import { pickBundledFontForExport } from "@/lib/report-template/font-availability";
import { ensureBundledLayoutFontsRegistered } from "@/lib/report-template/ensure-bundled-layout-fonts";
import { renderPdfLibExportPartBase64 } from "@/lib/report-template/pdf-lib-export-render";

const route = useRoute();
const tmpl = ref<ReportTemplate | null>(null);
const errText = ref<string | null>(null);

const exportEngine = computed<PdfExportEngineId>(() => {
  const raw = route.query.engine;
  const s = Array.isArray(raw) ? raw[0] : raw;
  return normalizePdfExportEngine(s);
});
const useChromiumPrint = computed(() => exportEngine.value === "chromium");

const layoutFidelity = computed(() => {
  const raw = route.query.layoutFidelity;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const v = String(s || "").trim().toLowerCase();
  if (v === "layout-v2") return "layout-v2" as const;
  return "draft-v1" as const;
});

/** 五档对照批导等：绑定失败仍继续渲染，便于离线比版式 */
const allowBindingIssues = computed(() => {
  const raw = route.query.allowBindingIssues;
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s === "1" || s === "true";
});

const bindingPreview = useReportBindingPreview(tmpl);
provide(reportBindingPreviewKey, bindingPreview);
let bootSeq = 0;

const reportPartIndex = computed(() => {
  const raw = route.query.reportPartIndex;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(String(s ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
});

const fixedCardWidthPx = computed(() => {
  const t = tmpl.value;
  if (!t) return 520;
  return getPaperPageCssPx(t.paperKind as PaperKind, t.orientation).widthPx;
});

/**
 * 导出 1:1 铺满 @page（019）：max 高 = 纸面 CSS px，配合 exactPageFit（不扣 inset、无 +3）。
 * 防拆页靠打印 CSS（tep-card break + padding:0），不再靠缩小内容留 slack。
 */
const pdfMiniMaxHeightPx = computed(() => {
  const t = tmpl.value;
  if (!t) return null;
  const { heightPx } = getPaperPageCssPx(t.paperKind as PaperKind, t.orientation);
  return Math.max(200, heightPx);
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

type ExportBootPhases = { tplMs: number; dataMs: number; paintMs: number };

type ExportReadyExtra = {
  pdfBase64?: string;
  engine?: PdfExportEngineId;
  exportMode?: "coexist" | "fidelity";
  layoutFidelity?: string;
  fontFamily?: string;
  fontEmbedded?: boolean;
  pageCount?: number;
  pdfLibMs?: number;
  printToPDFSkipped?: boolean;
};

function signalReady(
  ok: boolean,
  error?: string,
  totalReports?: number,
  phases?: ExportBootPhases,
  diagnostics?: ExportFailureDiagnostics,
  extra?: ExportReadyExtra,
): void {
  stopExportHeartbeat();
  // 注意：stats 须转成纯对象。Vue reactive 代理经 IPC 会抛
  // "An object could not be cloned"，完成信号丢失导致主进程等到超时（0.2.3~0.2.5 结批失败根因）
  const s = bindingPreview.lastStats.value;
  window.electronAPI?.notifyPdfExportReady?.({
    ok,
    error,
    totalReports,
    stats: s
      ? { opcReads: s.opcReads, sqlQueries: s.sqlQueries, sqlRows: s.sqlRows, mongoQueries: s.mongoQueries }
      : undefined,
    phases,
    diagnostics: diagnostics || undefined,
    ...(extra || {}),
  });
}

/** 取数期间向主进程发心跳：大模版慢取数不再被固定 2 分钟超时误杀 */
let exportHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startExportHeartbeat(): void {
  if (exportHeartbeatTimer) return;
  window.electronAPI?.notifyPdfExportHeartbeat?.();
  exportHeartbeatTimer = setInterval(() => {
    window.electronAPI?.notifyPdfExportHeartbeat?.();
  }, 10_000);
}

function stopExportHeartbeat(): void {
  if (exportHeartbeatTimer) {
    clearInterval(exportHeartbeatTimer);
    exportHeartbeatTimer = null;
  }
}

async function waitPaintReady(): Promise<void> {
  try {
    await ensureBundledLayoutFontsRegistered();
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise<void>((r) => setTimeout(r, 120));
}

async function boot(): Promise<void> {
  const seq = ++bootSeq;
  tmpl.value = null;
  errText.value = null;
  const id = String(route.query.templateId || "").trim();
  if (!id) {
    // 预热待命：主进程预加载本页常驻，结批时仅切 hash 进入导出，静默等待即可
    if (route.query.prewarm != null) {
      clearPdfExportFillCache();
      return;
    }
    errText.value = humanizePdfExportError("缺少 templateId");
    signalReady(false, errText.value);
    return;
  }
  startExportHeartbeat();
  const tplStartMs = Date.now();
  try {
    const loaded = await getTemplate(id);
    if (seq !== bootSeq) return;
    tmpl.value = loaded;
  } catch (e) {
    if (seq !== bootSeq) return;
    errText.value = humanizePdfExportError(e);
    signalReady(false, errText.value);
    return;
  }
  const tplMs = Date.now() - tplStartMs;

  const t = tmpl.value;
  injectPrintPageCss(t);

  const partIdx = reportPartIndex.value;
  const cached = getPdfExportFillCache(id);
  const reuseFill = shouldReusePdfExportFill({
    templateId: id,
    reportPartIndex: partIdx,
    cache: cached,
  });

  const dataStartMs = Date.now();
  let issueDetails = collectBindingPreviewIssueDetails({});
  let fillAttempt = 0;
  let totalReports = 1;

  if (reuseFill && cached) {
    // 030：后续分卷复用首份全量取数快照，仅按 reportPartIndex 内存切片渲染
    bindingPreview.values.value = cached.values;
    bindingPreview.lastStats.value = cached.stats
      ? {
          opcReads: 0,
          sqlQueries: 0,
          sqlRows: 0,
          mongoQueries: 0,
        }
      : null;
    totalReports = cached.totalReports;
  } else {
    while (fillAttempt < BINDING_FILL_OUTER_RETRY_MAX) {
      fillAttempt += 1;
      if (fillAttempt > 1) {
        await sleepMs(retryDelayMs(fillAttempt - 2, BINDING_FILL_OUTER_RETRY_DELAYS_MS));
        if (seq !== bootSeq) return;
      }
      await bindingPreview.refresh({ opc: true, sql: true, silent: true, fullSqlFill: true });
      if (seq !== bootSeq) return;
      issueDetails = collectBindingPreviewIssueDetails(bindingPreview.values.value);
      if (!issueDetails.length) break;
      const summary = summarizeBindingPreviewIssueDetails(issueDetails);
      if (fillAttempt >= BINDING_FILL_OUTER_RETRY_MAX || !isRetryableBindingFillSummary(summary)) {
        break;
      }
    }
  }
  const dataMs = Date.now() - dataStartMs;
  if (issueDetails.length && !allowBindingIssues.value) {
    clearPdfExportFillCache();
    errText.value = humanizePdfExportError(summarizeBindingPreviewIssueDetails(issueDetails));
    const s = bindingPreview.lastStats.value;
    signalReady(false, errText.value, undefined, { tplMs, dataMs, paintMs: 0 }, {
      stage: "binding_fill",
      issueCount: issueDetails.length,
      issues: issueDetails.slice(0, 40),
      stats: s
        ? { opcReads: s.opcReads, sqlQueries: s.sqlQueries, sqlRows: s.sqlRows, mongoQueries: s.mongoQueries }
        : undefined,
      templateId: id,
      fillAttempts: fillAttempt,
    });
    return;
  }
  if (!reuseFill) {
    totalReports = splitReportCountForPreview(t, bindingPreview.values.value);
    setPdfExportFillCache({
      templateId: id,
      values: bindingPreview.values.value,
      totalReports,
      stats: bindingPreview.lastStats.value,
    });
  }
  const paintStartMs = Date.now();
  if (!useChromiumPrint.value) {
    // 同机优先：跳过 DOM 预览栈与 printToPDF，矢量写 PDF
    try {
      // pdf-lib：Noto TTF/VF subset 在 macOS Preview 会缺字乱距；矢量默认嵌朱雀仿宋（可 subset）
      const picked = pickBundledFontForExport(collectFontFamiliesFromTemplate(t));
      const preferFangsong = picked.id === "fangsong" || picked.id === "noto-sans-sc";
      let fontRes = await window.electronAPI?.getBundledCjkFont?.({
        key: preferFangsong ? "fangsong" : picked.id,
      });
      if (!fontRes?.ok) {
        fontRes = await window.electronAPI?.getBundledCjkFont?.({ key: "fangsong" });
      }
      const bundledFontId = "fangsong";
      const { pdfBase64, meta } = await renderPdfLibExportPartBase64({
        tmpl: t,
        previewValues: bindingPreview.values.value,
        reportPartIndex: partIdx,
        fontBytesBase64: fontRes?.ok ? fontRes.base64 : null,
        bundledFontId,
        layoutFidelity: layoutFidelity.value,
      });
      if (seq !== bootSeq) return;
      signalReady(true, undefined, totalReports, { tplMs, dataMs, paintMs: Date.now() - paintStartMs }, undefined, {
        pdfBase64,
        engine: "pdf-lib",
        exportMode: "coexist",
        layoutFidelity: meta.layoutFidelity,
        fontFamily: meta.fontFamily,
        fontEmbedded: meta.fontEmbedded,
        pageCount: meta.pageCount,
        pdfLibMs: meta.pdfLibMs,
        printToPDFSkipped: true,
      });
    } catch (e) {
      if (seq !== bootSeq) return;
      errText.value = humanizePdfExportError(e);
      signalReady(false, errText.value, undefined, { tplMs, dataMs, paintMs: Date.now() - paintStartMs });
    }
    return;
  }

  await nextTick();
  await waitPaintReady();
  // D21c：格级 border/box-shadow 在 printToPDF 仍断点；canvas 整表格线位图
  await installPrintTableGridOverlays(document);
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  signalReady(true, undefined, totalReports, { tplMs, dataMs, paintMs: Date.now() - paintStartMs }, undefined, {
    engine: "chromium",
    exportMode: "fidelity",
    printToPDFSkipped: false,
  });
}

onMounted(() => {
  void boot();
});

// 监听 fullPath：预热窗口热切换（仅改 hash，含 seq 去重参数）也能可靠触发重新取数
watch(
  () => route.fullPath,
  () => {
    void boot();
  },
);
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
  /*
   * 迷你预览改为块级；保留角色色 outline / 纸边粗色（021）。
   * 仅清列表用的圆角与投影，避免垫出额外「相框」感；padding 必须为 0 以免超 @page。
   */
  .pdf-export-root .mpc,
  .pdf-export-root .mpc-slot {
    display: block !important;
    padding: 0 !important;
    border-radius: 0 !important;
  }
  .pdf-export-root .mpc-tag {
    display: none !important;
  }
  .pdf-export-root .mpp-paper,
  .pdf-export-root .mb-inner.mpp-paper {
    border-radius: 0 !important;
    box-shadow: none !important;
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
.pdf-export-pdflib-hint {
  padding: 12px 16px;
  color: #64748b;
  font: 12px/1.4 system-ui, sans-serif;
}
</style>
