<template>
  <div class="page rh">
    <header class="hdr">
      <h2 class="page-title">历史报表</h2>
      <div class="hdr-actions">
        <button type="button" class="b" :disabled="!electronShell || !watchDir || loading" @click="refresh">
          {{ loading ? "刷新中…" : "刷新" }}
        </button>
        <button type="button" class="b" @click="mode = mode === 'list' ? 'thumbs' : 'list'">
          {{ mode === "list" ? "缩略图" : "列表" }}
        </button>
      </div>
    </header>

    <p class="rh-lead">
      绑定导出文件夹后，可进入<strong>子文件夹</strong>分页浏览本层 PDF（与「生成报表」中的<strong>自动导出文件夹</strong>共用）。不会一次平铺全部子目录文件。手动另存到其它路径的文件不会出现在此列表。
    </p>

    <div v-if="!electronShell" class="rh-banner rh-banner--warn">
      当前运行在浏览器壳，无法读取本地文件夹。请使用 <code>npm run electron:dev</code> 或安装版客户端。
    </div>

    <div class="rh-dir-row">
      <label class="rh-dir-lbl" for="rh-watch-dir">导出文件夹</label>
      <div class="rh-dir-inline">
        <input
          id="rh-watch-dir"
          :value="watchDir || ''"
          type="text"
          readonly
          class="rh-dir-inp"
          placeholder="未绑定（点击下方选择）"
        />
        <button type="button" class="b primary" :disabled="!electronShell" @click="onPickDir">选择文件夹…</button>
      </div>
    </div>

    <nav v-if="electronShell && watchDir" class="rh-crumbs" aria-label="当前路径">
      <button type="button" class="rh-crumb" :disabled="loading || !relSegments.length" @click="goToDepth(-1)">
        根目录
      </button>
      <template v-for="(seg, i) in relSegments" :key="'c-' + i + '-' + seg">
        <span class="rh-crumb-sep" aria-hidden="true">/</span>
        <button
          type="button"
          class="rh-crumb"
          :class="{ 'rh-crumb--current': i === relSegments.length - 1 }"
          :disabled="loading || i === relSegments.length - 1"
          @click="goToDepth(i)"
        >
          {{ seg }}
        </button>
      </template>
      <button
        v-if="relSegments.length"
        type="button"
        class="b ghost rh-up"
        :disabled="loading"
        @click="goUp"
      >
        上级
      </button>
    </nav>

    <p v-if="msg" class="msg">{{ msg }}</p>

    <p v-if="electronShell && !watchDir" class="rh-empty-hint">请先选择要监视的导出文件夹。</p>
    <p v-else-if="electronShell && watchDir && !loading && !entries.length && total === 0" class="rh-empty-hint">
      当前文件夹内暂无子文件夹或 PDF。
    </p>

    <div v-if="mode === 'list' && entries.length" class="tbl-panel">
      <table class="tbl">
        <thead>
          <tr>
            <th>名称</th>
            <th>大小</th>
            <th>修改时间</th>
            <th class="th-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="entryKey(e)">
            <td class="rh-name-cell" :title="entryTitle(e)">
              <button
                v-if="e.kind === 'dir'"
                type="button"
                class="rh-folder-btn"
                :disabled="loading"
                @click="enterDir(e.path)"
              >
                <span class="rh-folder-ico" aria-hidden="true"></span>
                {{ e.name }}
              </button>
              <span v-else>{{ e.name }}</span>
            </td>
            <td class="td-meta">{{ e.kind === "pdf" ? formatSize(e.sizeBytes) : "文件夹" }}</td>
            <td class="td-meta">{{ formatTime(e.modifiedAt || "") }}</td>
            <td class="td-actions">
              <template v-if="e.kind === 'dir'">
                <button type="button" class="b ghost" :disabled="loading" @click="enterDir(e.path)">进入</button>
              </template>
              <template v-else>
                <button type="button" class="b ghost" @click="openFile(e)">打开</button>
                <button type="button" class="b ghost" @click="revealFile(e)">所在位置</button>
                <button type="button" class="b danger-soft" @click="deleteFile(e)">删除</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="mode === 'thumbs' && entries.length" class="grid">
      <div
        v-for="e in entries"
        :key="'card-' + entryKey(e)"
        class="card"
        :class="{ 'card--folder': e.kind === 'dir' }"
        :ref="(el) => (e.kind === 'pdf' ? setCardRef(e.filePath, el as Element | null) : undefined)"
      >
        <template v-if="e.kind === 'dir'">
          <button type="button" class="folder-card-btn" :disabled="loading" @click="enterDir(e.path)">
            <span class="folder-card-ico" aria-hidden="true"></span>
            <span class="folder-card-name" :title="e.name">{{ e.name }}</span>
            <span class="folder-card-hint">点击进入</span>
          </button>
        </template>
        <template v-else>
          <div class="thumb-wrap" title="双击打开" @dblclick="openFile(e)">
            <PdfExportThumb v-if="visibleCards.has(e.filePath)" :file-path="e.filePath" />
            <div v-else class="thumb-lazy-ph">滚动到此加载预览…</div>
          </div>
          <div class="foot">
            <div class="foot-line">
              <b :title="e.name">{{ e.name }}</b>
              <span class="foot-meta">{{ formatSize(e.sizeBytes) }} · {{ formatTime(e.modifiedAt) }}</span>
            </div>
            <div class="foot-actions">
              <button type="button" class="b primary" @click="openFile(e)">打开</button>
              <button type="button" class="b" @click="revealFile(e)">位置</button>
              <button type="button" class="b danger" @click="deleteFile(e)">删除</button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div v-if="electronShell && watchDir && total > 0" class="rh-pager">
      <span class="rh-pager-meta">共 {{ total }} 项 · 第 {{ pageIndex + 1 }} / {{ pageCount }} 页</span>
      <label class="rh-pager-limit">
        每页
        <select v-model.number="pageSize" class="rh-select" :disabled="loading" @change="onPageSizeChange">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <button type="button" class="b" :disabled="loading || pageIndex <= 0" @click="goPage(pageIndex - 1)">
        上一页
      </button>
      <button
        type="button"
        class="b"
        :disabled="loading || pageIndex + 1 >= pageCount"
        @click="goPage(pageIndex + 1)"
      >
        下一页
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import PdfExportThumb from "@/components/report-history/PdfExportThumb.vue";
import {
  loadReportExportPrefs,
  saveReportExportPrefs,
} from "@/lib/report-export-prefs";
import { appConfirm } from "@/composables/useAppConfirm";
import { segmentsForDepth, shouldApplyScanGeneration } from "@/lib/report-history-nav";

defineOptions({ name: "ReportHistory" });

type DirEntry = { kind: "dir"; name: string; path: string; modifiedAt?: string };
type PdfEntry = {
  kind: "pdf";
  name: string;
  filePath: string;
  fileUrl?: string;
  sizeBytes: number;
  modifiedAt: string;
};
type ExportEntry = DirEntry | PdfEntry;

/** @deprecated 兼容旧类型名；现为 PDF 行 */
export type ExportPdfRow = Omit<PdfEntry, "kind"> & { kind?: "pdf" };

const MODE_STORAGE_KEY = "rh-view-mode";
const PAGE_SIZE_KEY = "rh-page-size";

function readInitialMode(): "list" | "thumbs" {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    if (v === "list" || v === "thumbs") return v;
  } catch {
    /* ignore */
  }
  return "list";
}

function readInitialPageSize(): number {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    if (n === 20 || n === 50 || n === 100) return n;
  } catch {
    /* ignore */
  }
  return 50;
}

const mode = ref<"list" | "thumbs">(readInitialMode());
watch(mode, (m) => {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, m);
  } catch {
    /* ignore */
  }
});

const watchDir = ref<string | null>(loadReportExportPrefs().watchDir);
const cwd = ref<string>("");
const relSegments = ref<string[]>([]);
const entries = ref<ExportEntry[]>([]);
const total = ref(0);
const pageIndex = ref(0);
const pageSize = ref(readInitialPageSize());
const loading = ref(false);
const msg = ref("");
let scanGen = 0;

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value) || 1));

const electronShell = computed(
  () =>
    typeof window !== "undefined" &&
    Boolean(
      (window.electronAPI?.scanExportEntries || window.electronAPI?.scanExportPdfs) &&
        window.electronAPI?.deleteExportFile,
    ),
);

function entryKey(e: ExportEntry): string {
  return e.kind === "dir" ? `d:${e.path}` : `p:${e.filePath}`;
}

function entryTitle(e: ExportEntry): string {
  return e.kind === "dir" ? e.path : e.filePath;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(iso: string): string {
  return (iso || "").replace("T", " ").slice(0, 19);
}

async function joinUnderRoot(segments: string[]): Promise<string> {
  const root = (watchDir.value || "").trim();
  if (!segments.length) return root;
  const api = window.electronAPI;
  if (api?.pathJoin) {
    return (await api.pathJoin(root, ...segments)) || [root, ...segments].join("/");
  }
  return [root, ...segments].join("/");
}

async function refresh(): Promise<void> {
  msg.value = "";
  const root = (watchDir.value || "").trim();
  if (!root) {
    entries.value = [];
    total.value = 0;
    relSegments.value = [];
    cwd.value = "";
    return;
  }
  const api = window.electronAPI;
  if (!api?.scanExportEntries && !api?.scanExportPdfs) {
    msg.value = "当前环境无法扫描文件夹。";
    return;
  }

  const gen = ++scanGen;
  loading.value = true;
  try {
    const browse = (cwd.value || root).trim() || root;
    if (api.scanExportEntries) {
      const res = await api.scanExportEntries({
        rootDir: root,
        cwd: browse,
        offset: pageIndex.value * pageSize.value,
        limit: pageSize.value,
        sort: "mtime_desc",
      });
      if (!shouldApplyScanGeneration(gen, scanGen)) return;
      if (!res?.ok) {
        entries.value = [];
        total.value = 0;
        msg.value = res?.error || "扫描失败";
        return;
      }
      if (res.rootDir && res.rootDir !== root) {
        watchDir.value = res.rootDir;
        saveReportExportPrefs({ watchDir: res.rootDir });
      }
      cwd.value = res.cwd || browse;
      relSegments.value = Array.isArray(res.relSegments) ? res.relSegments : [];
      total.value = res.total ?? 0;
      entries.value = (res.entries || []) as ExportEntry[];
      visibleCards.value = new Set();
      return;
    }

    // 旧壳回退：仅本层 PDF、无文件夹
    const res = await api.scanExportPdfs!({ dir: browse });
    if (!shouldApplyScanGeneration(gen, scanGen)) return;
    if (!res?.ok) {
      entries.value = [];
      total.value = 0;
      msg.value = res?.error || "扫描失败";
      return;
    }
    const files = (res.files || []) as ExportPdfRow[];
    total.value = files.length;
    const start = pageIndex.value * pageSize.value;
    entries.value = files.slice(start, start + pageSize.value).map((f) => ({
      kind: "pdf" as const,
      name: f.name,
      filePath: f.filePath,
      fileUrl: f.fileUrl,
      sizeBytes: f.sizeBytes,
      modifiedAt: f.modifiedAt,
    }));
    cwd.value = res.dir || browse;
    relSegments.value = [];
  } catch (e) {
    if (!shouldApplyScanGeneration(gen, scanGen)) return;
    entries.value = [];
    total.value = 0;
    msg.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (shouldApplyScanGeneration(gen, scanGen)) loading.value = false;
  }
}

async function enterDir(dirPath: string): Promise<void> {
  cwd.value = dirPath;
  pageIndex.value = 0;
  await refresh();
}

async function goToDepth(depth: number): Promise<void> {
  // depth -1 = root；0..n-1 = 该段为止
  const segs = depth < 0 ? [] : segmentsForDepth(relSegments.value, depth);
  cwd.value = await joinUnderRoot(segs);
  pageIndex.value = 0;
  await refresh();
}

async function goUp(): Promise<void> {
  if (!relSegments.value.length) return;
  await goToDepth(relSegments.value.length - 2);
}

function goPage(idx: number): void {
  const max = pageCount.value - 1;
  pageIndex.value = Math.max(0, Math.min(max, idx));
  void refresh();
}

function onPageSizeChange(): void {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(pageSize.value));
  } catch {
    /* ignore */
  }
  pageIndex.value = 0;
  void refresh();
}

async function onPickDir(): Promise<void> {
  msg.value = "";
  const picked = await window.electronAPI?.pickExportDirectory?.({
    title: "选择导出文件夹（历史报表监视）",
    defaultPath: watchDir.value || undefined,
  });
  if (!picked) return;
  watchDir.value = picked;
  cwd.value = picked;
  relSegments.value = [];
  pageIndex.value = 0;
  saveReportExportPrefs({ watchDir: picked });
  await refresh();
}

async function openFile(r: PdfEntry): Promise<void> {
  const res = await window.electronAPI?.shellOpenPath?.(r.filePath);
  if (res && !res.ok) msg.value = `打开失败：${res.error || "未知错误"}`;
}

async function revealFile(r: PdfEntry): Promise<void> {
  const res = await window.electronAPI?.showItemInFolder?.(r.filePath);
  if (res && !res.ok) msg.value = `无法定位文件：${res.error || "未知错误"}`;
}

async function deleteFile(r: PdfEntry): Promise<void> {
  if (
    !(await appConfirm({
      title: "删除文件",
      message: `确定删除文件？\n\n${r.name}\n\n此操作不可恢复。`,
      confirmText: "删除",
      danger: true,
    }))
  ) {
    return;
  }
  msg.value = "";
  const res = await window.electronAPI?.deleteExportFile?.({ filePath: r.filePath });
  if (!res?.ok) {
    msg.value = `删除失败：${res?.error || "未知错误"}`;
    return;
  }
  msg.value = "已删除。";
  await refresh();
}

const visibleCards = ref<Set<string>>(new Set());
const cardObserver = ref<IntersectionObserver | null>(null);
const cardEls = new Map<string, Element>();

function ensureCardObserver() {
  if (cardObserver.value || typeof IntersectionObserver === "undefined") return;
  cardObserver.value = new IntersectionObserver(
    (ioEntries) => {
      let changed = false;
      const next = new Set(visibleCards.value);
      for (const e of ioEntries) {
        if (!e.isIntersecting) continue;
        const fp = e.target instanceof HTMLElement ? e.target.dataset.fp : "";
        if (fp && !next.has(fp)) {
          next.add(fp);
          changed = true;
        }
      }
      if (changed) visibleCards.value = next;
    },
    { root: null, rootMargin: "400px 0px", threshold: 0.01 },
  );
  for (const el of cardEls.values()) cardObserver.value.observe(el);
}

function setCardRef(filePath: string, el: Element | null) {
  if (el instanceof HTMLElement) {
    el.dataset.fp = filePath;
    cardEls.set(filePath, el);
    if (cardObserver.value) cardObserver.value.observe(el);
  } else {
    const prev = cardEls.get(filePath);
    if (prev && cardObserver.value) cardObserver.value.unobserve(prev);
    cardEls.delete(filePath);
  }
}

async function onConfigRestored() {
  watchDir.value = loadReportExportPrefs().watchDir;
  cwd.value = watchDir.value || "";
  relSegments.value = [];
  pageIndex.value = 0;
  if (watchDir.value) {
    await refresh();
  } else {
    entries.value = [];
    total.value = 0;
  }
}

onActivated(async () => {
  ensureCardObserver();
  if (watchDir.value) {
    if (!cwd.value) cwd.value = watchDir.value;
    await refresh();
  }
});

onMounted(() => {
  window.addEventListener("report-editor-config-imported", onConfigRestored);
  if (watchDir.value && !cwd.value) cwd.value = watchDir.value;
});

onUnmounted(() => {
  if (cardObserver.value) {
    cardObserver.value.disconnect();
    cardObserver.value = null;
  }
  window.removeEventListener("report-editor-config-imported", onConfigRestored);
});
</script>

<style scoped>
.rh {
  padding: 0 4px;
  touch-action: manipulation;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.hdr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}
.rh-lead {
  color: #52525b;
  font-size: 13px;
  line-height: 1.55;
  margin: 10px 0 14px;
}
.rh-banner {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 12px;
  line-height: 1.5;
}
.rh-banner--warn {
  background: #fef9c3;
  border: 1px solid #eab30855;
  color: #713f12;
}
.rh-dir-row {
  margin-bottom: 10px;
}
.rh-dir-lbl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
  margin-bottom: 6px;
}
.rh-dir-inline {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.rh-dir-inp {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  background: rgb(255 255 255 / 0.9);
  color: #334155;
}
.rh-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 2px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.rh-crumb {
  border: none;
  background: transparent;
  color: #4338ca;
  font-size: 13px;
  font-weight: 600;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rh-crumb:hover:not(:disabled) {
  background: #eef2ff;
}
.rh-crumb:disabled {
  cursor: default;
  opacity: 0.85;
}
.rh-crumb--current {
  color: #1e293b;
  cursor: default;
}
.rh-crumb-sep {
  color: #94a3b8;
  font-size: 12px;
  user-select: none;
}
.rh-up {
  margin-left: 8px;
  min-height: 32px !important;
  padding: 0 10px !important;
  border-radius: 999px !important;
  font-size: 12px !important;
}
.rh-empty-hint {
  color: #71717a;
  font-size: 13px;
  margin: 12px 0;
}
.msg {
  font-size: 12px;
  color: #b45309;
  margin: 8px 0;
}
.b {
  padding: 8px 14px;
  min-height: 40px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.b:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.b.danger {
  background: #dc2626;
  color: #fff;
  border-color: #b91c1c;
}
.b.ghost {
  background: #fff;
  border-color: #e2e8f0;
  color: #475569;
}
.b.ghost:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1e293b;
}
.b.danger-soft {
  background: transparent;
  border-color: transparent;
  color: #dc2626;
}
.b.danger-soft:hover {
  background: #fef2f2;
  border-color: #fecaca;
}
.rh-folder-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: #1e293b;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rh-folder-btn:hover:not(:disabled) {
  color: #4338ca;
}
.rh-folder-ico {
  flex-shrink: 0;
  width: 14px;
  height: 11px;
  border: 2px solid #6366f1;
  border-radius: 2px 2px 1px 1px;
  box-sizing: border-box;
  position: relative;
  background: #eef2ff;
}
.rh-folder-ico::before {
  content: "";
  position: absolute;
  left: -2px;
  top: -5px;
  width: 6px;
  height: 3px;
  border-radius: 1px 1px 0 0;
  background: #6366f1;
}
.tbl-panel {
  margin-top: 10px;
  border-radius: 12px;
  border: 1px solid rgb(228 228 231 / 0.95);
  background: rgb(255 255 255 / 0.92);
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.06);
  overflow: hidden;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.tbl thead th {
  padding: 11px 14px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.tbl tbody td {
  padding: 12px 14px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}
.tbl tbody tr:last-child td {
  border-bottom: none;
}
.tbl tbody tr:hover td {
  background: #f8fafc;
}
.th-act {
  text-align: right;
}
.td-meta {
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
}
.rh-name-cell {
  max-width: 0;
  width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: #1e293b;
}
.td-actions {
  white-space: nowrap;
  text-align: right;
}
.td-actions .b {
  min-height: 32px;
  padding: 0 12px;
  margin-left: 6px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 12px;
}
.card {
  border: 1px solid rgb(228 228 231 / 0.95);
  border-radius: 12px;
  padding: 12px;
  background: rgb(255 255 255 / 0.92);
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.05);
}
.card--folder {
  display: flex;
  align-items: stretch;
  min-height: 160px;
}
.folder-card-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  background: #f8fafc;
  border-radius: 8px;
  cursor: pointer;
  padding: 16px;
  color: #1e293b;
}
.folder-card-btn:hover:not(:disabled) {
  background: #eef2ff;
}
.folder-card-ico {
  width: 48px;
  height: 36px;
  border: 3px solid #6366f1;
  border-radius: 4px 4px 2px 2px;
  background: #eef2ff;
  position: relative;
  box-sizing: border-box;
}
.folder-card-ico::before {
  content: "";
  position: absolute;
  left: -3px;
  top: -10px;
  width: 18px;
  height: 8px;
  border-radius: 2px 2px 0 0;
  background: #6366f1;
}
.folder-card-name {
  font-weight: 700;
  font-size: 14px;
  word-break: break-all;
  text-align: center;
}
.folder-card-hint {
  font-size: 11px;
  color: #64748b;
}
.thumb-wrap {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 200px;
  max-height: 280px;
  overflow: hidden;
  padding: 6px;
  background: #f4f4f5;
  border-radius: 8px;
  cursor: pointer;
}
.thumb-lazy-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 200px;
  font-size: 12px;
  color: #a1a1aa;
}
.foot {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.45;
  color: #3f3f46;
}
.foot-line b {
  display: block;
  word-break: break-all;
  margin-bottom: 4px;
}
.foot-meta {
  color: #71717a;
  font-size: 11px;
}
.foot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.foot-actions .b {
  min-height: 32px;
  padding: 5px 10px;
  font-size: 12px;
}
.rh-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 0;
}
.rh-pager-meta {
  font-size: 13px;
  color: #64748b;
  margin-right: auto;
}
.rh-pager-limit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}
.rh-select {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  font-size: 13px;
  background: #fff;
}
code {
  font-size: 0.92em;
}
</style>
