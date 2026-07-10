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
      绑定导出文件夹后，将列出该目录下的 PDF（与「生成报表」中的<strong>自动导出文件夹</strong>共用）。手动另存到其它路径的文件不会出现在此列表。
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

    <p v-if="msg" class="msg">{{ msg }}</p>

    <p v-if="electronShell && !watchDir" class="rh-empty-hint">请先选择要监视的导出文件夹。</p>
    <p v-else-if="electronShell && watchDir && !loading && !rows.length" class="rh-empty-hint">
      文件夹内暂无 PDF 文件。
    </p>

    <div v-if="mode === 'list' && rows.length" class="tbl-panel">
      <table class="tbl">
        <thead>
          <tr>
            <th>文件名</th>
            <th>大小</th>
            <th>修改时间</th>
            <th class="th-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.filePath">
            <td class="rh-name-cell" :title="r.filePath">{{ r.name }}</td>
            <td class="td-meta">{{ formatSize(r.sizeBytes) }}</td>
            <td class="td-meta">{{ formatTime(r.modifiedAt) }}</td>
            <td class="td-actions">
              <button type="button" class="b ghost" @click="openFile(r)">打开</button>
              <button type="button" class="b ghost" @click="revealFile(r)">所在位置</button>
              <button type="button" class="b danger-soft" @click="deleteFile(r)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="mode === 'thumbs' && rows.length" class="grid">
      <div
        v-for="r in rows"
        :key="'card-' + r.filePath"
        class="card"
        :ref="(el) => setCardRef(r.filePath, el as Element | null)"
      >
        <div
          class="thumb-wrap"
          title="双击打开"
          @dblclick="openFile(r)"
        >
          <PdfExportThumb v-if="visibleCards.has(r.filePath)" :file-path="r.filePath" />
          <div v-else class="thumb-lazy-ph">滚动到此加载预览…</div>
        </div>
        <div class="foot">
          <div class="foot-line">
            <b :title="r.name">{{ r.name }}</b>
            <span class="foot-meta">{{ formatSize(r.sizeBytes) }} · {{ formatTime(r.modifiedAt) }}</span>
          </div>
          <div class="foot-actions">
            <button type="button" class="b primary" @click="openFile(r)">打开</button>
            <button type="button" class="b" @click="revealFile(r)">位置</button>
            <button type="button" class="b danger" @click="deleteFile(r)">删除</button>
          </div>
        </div>
      </div>
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

defineOptions({ name: "ReportHistory" });

export interface ExportPdfRow {
  name: string;
  filePath: string;
  fileUrl?: string;
  sizeBytes: number;
  modifiedAt: string;
}

/** 记住上次视图模式：默认「列表」以便打开页面即时呈现（缩略图逐个渲染 PDF 为重加载） */
const MODE_STORAGE_KEY = "rh-view-mode";
function readInitialMode(): "list" | "thumbs" {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    if (v === "list" || v === "thumbs") return v;
  } catch {
    /* ignore */
  }
  return "list";
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
const rows = ref<ExportPdfRow[]>([]);
const loading = ref(false);
const msg = ref("");

const electronShell = computed(
  () =>
    typeof window !== "undefined" &&
    Boolean(window.electronAPI?.scanExportPdfs && window.electronAPI?.deleteExportFile),
);

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(iso: string): string {
  return (iso || "").replace("T", " ").slice(0, 19);
}

async function refresh(): Promise<void> {
  msg.value = "";
  const dir = (watchDir.value || "").trim();
  if (!dir) {
    rows.value = [];
    return;
  }
  const api = window.electronAPI;
  if (!api?.scanExportPdfs) {
    msg.value = "当前环境无法扫描文件夹。";
    return;
  }
  loading.value = true;
  try {
    const res = await api.scanExportPdfs({ dir });
    if (!res?.ok) {
      rows.value = [];
      msg.value = res?.error || "扫描失败";
      return;
    }
    if (res.dir && res.dir !== dir) {
      watchDir.value = res.dir;
      saveReportExportPrefs({ watchDir: res.dir });
    }
    rows.value = (res.files || []) as ExportPdfRow[];
  } catch (e) {
    rows.value = [];
    msg.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function onPickDir(): Promise<void> {
  msg.value = "";
  const picked = await window.electronAPI?.pickExportDirectory?.({
    title: "选择导出文件夹（历史报表监视）",
    defaultPath: watchDir.value || undefined,
  });
  if (!picked) return;
  watchDir.value = picked;
  saveReportExportPrefs({ watchDir: picked });
  await refresh();
}

async function openFile(r: ExportPdfRow): Promise<void> {
  const res = await window.electronAPI?.shellOpenPath?.(r.filePath);
  if (res && !res.ok) msg.value = `打开失败：${res.error || "未知错误"}`;
}

async function revealFile(r: ExportPdfRow): Promise<void> {
  const res = await window.electronAPI?.showItemInFolder?.(r.filePath);
  if (res && !res.ok) msg.value = `无法定位文件：${res.error || "未知错误"}`;
}

async function deleteFile(r: ExportPdfRow): Promise<void> {
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
  rows.value = rows.value.filter((x) => x.filePath !== r.filePath);
  msg.value = "已删除。";
}

/** 缩略图卡片进入视口才挂载 PdfExportThumb（渲染 PDF），避免一次性渲染全部文件 */
const visibleCards = ref<Set<string>>(new Set());
const cardObserver = ref<IntersectionObserver | null>(null);
const cardEls = new Map<string, Element>();

function ensureCardObserver() {
  if (cardObserver.value || typeof IntersectionObserver === "undefined") return;
  cardObserver.value = new IntersectionObserver(
    (entries) => {
      let changed = false;
      const next = new Set(visibleCards.value);
      for (const e of entries) {
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

/** 备份恢复 / 云端下载后：从本机偏好重载监视文件夹并刷新列表，无需重启 */
async function onConfigRestored() {
  watchDir.value = loadReportExportPrefs().watchDir;
  if (watchDir.value) {
    await refresh();
  } else {
    rows.value = [];
  }
}

onActivated(async () => {
  ensureCardObserver();
  if (watchDir.value) await refresh();
});

onMounted(() => {
  window.addEventListener("report-editor-config-imported", onConfigRestored);
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
  margin-bottom: 14px;
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
.b.ghost:hover {
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
code {
  font-size: 0.92em;
}
</style>
