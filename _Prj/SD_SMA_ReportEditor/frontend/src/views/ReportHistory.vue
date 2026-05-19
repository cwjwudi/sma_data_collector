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

    <table v-if="mode === 'list' && rows.length" class="tbl">
      <thead>
        <tr>
          <th>文件名</th>
          <th>大小</th>
          <th>修改时间</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.filePath">
          <td class="rh-name-cell" :title="r.filePath">{{ r.name }}</td>
          <td>{{ formatSize(r.sizeBytes) }}</td>
          <td>{{ formatTime(r.modifiedAt) }}</td>
          <td class="td-actions">
            <button type="button" class="b" @click="openFile(r)">打开</button>
            <button type="button" class="b" @click="revealFile(r)">所在位置</button>
            <button type="button" class="b danger" @click="deleteFile(r)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else-if="mode === 'thumbs' && rows.length" class="grid">
      <div v-for="r in rows" :key="'card-' + r.filePath" class="card">
        <div
          class="thumb-wrap"
          title="双击打开"
          @dblclick="openFile(r)"
        >
          <PdfExportThumb :file-path="r.filePath" />
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
import { computed, onMounted, ref } from "vue";
import PdfExportThumb from "@/components/report-history/PdfExportThumb.vue";
import {
  loadReportExportPrefs,
  saveReportExportPrefs,
} from "@/lib/report-export-prefs";

export interface ExportPdfRow {
  name: string;
  filePath: string;
  fileUrl?: string;
  sizeBytes: number;
  modifiedAt: string;
}

const mode = ref<"list" | "thumbs">("thumbs");
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
  if (!confirm(`确定删除文件？\n\n${r.name}\n\n此操作不可恢复。`)) return;
  msg.value = "";
  const res = await window.electronAPI?.deleteExportFile?.({ filePath: r.filePath });
  if (!res?.ok) {
    msg.value = `删除失败：${res?.error || "未知错误"}`;
    return;
  }
  rows.value = rows.value.filter((x) => x.filePath !== r.filePath);
  msg.value = "已删除。";
}

onMounted(async () => {
  if (watchDir.value) await refresh();
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
  max-width: 720px;
}
.rh-dir-inp {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  font-size: 13px;
  background: #fafafa;
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
.tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 14px;
  background: #fff;
}
.tbl th,
.tbl td {
  border: 1px solid #e4e4e7;
  padding: 8px;
  text-align: left;
  vertical-align: middle;
}
.rh-name-cell {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.td-actions {
  white-space: nowrap;
}
.td-actions .b {
  min-height: 34px;
  padding: 6px 10px;
  margin-right: 6px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 12px;
}
.card {
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
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
