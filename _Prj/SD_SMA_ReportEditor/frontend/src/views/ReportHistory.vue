<template>
  <div class="page rh">
    <header class="hdr">
      <h2 class="page-title">历史报表</h2>
      <div class="hdr-actions">
        <button
          type="button"
          class="b"
          :class="{ 'b-on': split }"
          :disabled="!electronShell"
          @click="toggleSplit"
        >
          {{ split ? "退出分屏" : "分屏" }}
        </button>
        <button type="button" class="b" :disabled="!electronShell || !watchDir || transferring" @click="refreshAll">
          {{ loadingAny ? "刷新中…" : "刷新" }}
        </button>
        <button type="button" class="b" @click="mode = mode === 'list' ? 'thumbs' : 'list'">
          {{ mode === "list" ? "缩略图" : "列表" }}
        </button>
      </div>
    </header>

    <p class="rh-lead">
      绑定导出文件夹后，可进入<strong>子文件夹</strong>分页浏览本层 PDF（与「生成报表」中的<strong>自动导出文件夹</strong>共用）。
      <template v-if="split">
        分屏下可在<strong>导出目录 ⇄ 目标目录</strong>之间<strong>复制 / 移动</strong>（仅桌面版）。
      </template>
      <template v-else> 不会一次平铺全部子目录文件。手动另存到其它路径的文件不会出现在此列表。 </template>
    </p>

    <div v-if="!electronShell" class="rh-banner rh-banner--warn">
      浏览本机导出文件夹仅桌面安装版可用；局域网浏览器无法读取工控机本地磁盘。请在本机 Electron 客户端中操作。
    </div>

    <div v-if="split && electronShell" class="rh-split-bar">
      <button type="button" class="b primary" :disabled="transferring" @click="onPickRightRoot">选右侧路径…</button>
      <template v-if="pendingRemovable">
        <span class="rh-removable-msg">
          检测到可移动存储「{{ pendingRemovable.label }}」（{{ pendingRemovable.path }}）
        </span>
        <button type="button" class="b" :disabled="transferring" @click="confirmOpenRemovable">确认打开到右侧</button>
        <button type="button" class="b ghost" :disabled="transferring" @click="dismissRemovable">忽略</button>
      </template>
      <span class="rh-split-spacer" />
      <button
        type="button"
        class="b"
        :disabled="!canTransferLeftToRight || transferring"
        title="将左侧选中复制到右侧当前目录"
        @click="runTransfer('left', 'copy')"
      >
        → 复制
      </button>
      <button
        type="button"
        class="b"
        :disabled="!canTransferLeftToRight || transferring"
        title="将左侧选中移动到右侧当前目录"
        @click="runTransfer('left', 'move')"
      >
        → 移动
      </button>
      <button
        type="button"
        class="b"
        :disabled="!canTransferRightToLeft || transferring"
        title="将右侧选中复制到左侧当前目录"
        @click="runTransfer('right', 'copy')"
      >
        ← 复制
      </button>
      <button
        type="button"
        class="b"
        :disabled="!canTransferRightToLeft || transferring"
        title="将右侧选中移动到左侧当前目录"
        @click="runTransfer('right', 'move')"
      >
        ← 移动
      </button>
    </div>

    <p v-if="msg" class="msg">{{ msg }}</p>

    <div v-if="!split" class="rh-single">
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
          <button type="button" class="b primary" :disabled="!electronShell" @click="onPickLeftRoot">
            选择文件夹…
          </button>
        </div>
      </div>
      <ReportHistoryPane
        title="导出目录"
        :mode="mode"
        :root-dir="watchDir"
        :rel-segments="left.relSegments"
        :entries="left.entries"
        :total="left.total"
        :page-index="left.pageIndex"
        :page-size="pageSize"
        :busy="left.loading || transferring"
        :disabled="!electronShell"
        :selectable="false"
        :selected="left.selected"
        :show-row-actions="true"
        empty-root-text="请先选择要监视的导出文件夹。"
        @pick-root="onPickLeftRoot"
        @go-depth="(d) => goToDepth('left', d)"
        @go-up="() => goUp('left')"
        @enter-dir="(p) => enterDir('left', p)"
        @open-file="openFile"
        @reveal-file="revealFile"
        @delete-file="deleteFile"
        @page="(i) => goPage('left', i)"
        @page-size="onPageSizeChange"
        @update:selected="(s) => (left.selected = s)"
      />
    </div>

    <div v-else class="rh-split">
      <ReportHistoryPane
        class="rh-split-pane"
        title="左：导出目录"
        :mode="mode"
        :root-dir="watchDir"
        :rel-segments="left.relSegments"
        :entries="left.entries"
        :total="left.total"
        :page-index="left.pageIndex"
        :page-size="pageSize"
        :busy="left.loading || transferring"
        :selectable="true"
        :selected="left.selected"
        :show-row-actions="true"
        :show-pick-root="true"
        pick-label="选导出目录…"
        root-placeholder="未绑定导出监视目录"
        empty-root-text="请先选择导出监视目录。"
        @pick-root="onPickLeftRoot"
        @go-depth="(d) => goToDepth('left', d)"
        @go-up="() => goUp('left')"
        @enter-dir="(p) => enterDir('left', p)"
        @open-file="openFile"
        @reveal-file="revealFile"
        @delete-file="deleteFile"
        @page="(i) => goPage('left', i)"
        @page-size="onPageSizeChange"
        @update:selected="(s) => (left.selected = s)"
      />
      <ReportHistoryPane
        class="rh-split-pane"
        title="右：目标目录"
        :mode="mode"
        :root-dir="rightRoot"
        :rel-segments="right.relSegments"
        :entries="right.entries"
        :total="right.total"
        :page-index="right.pageIndex"
        :page-size="pageSize"
        :busy="right.loading || transferring"
        :selectable="true"
        :selected="right.selected"
        :show-row-actions="false"
        :show-pick-root="true"
        pick-label="选路径…"
        root-placeholder="手选本机路径 / 确认后的可移动存储"
        empty-root-text="请点击「选右侧路径…」或确认打开可移动存储。"
        @pick-root="onPickRightRoot"
        @go-depth="(d) => goToDepth('right', d)"
        @go-up="() => goUp('right')"
        @enter-dir="(p) => enterDir('right', p)"
        @open-file="openFile"
        @reveal-file="revealFile"
        @delete-file="deleteFile"
        @page="(i) => goPage('right', i)"
        @page-size="onPageSizeChange"
        @update:selected="(s) => (right.selected = s)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import ReportHistoryPane, {
  type ExportEntry,
  type PdfEntry,
} from "@/components/report-history/ReportHistoryPane.vue";
import {
  loadReportExportPrefs,
  saveReportExportPrefs,
} from "@/lib/report-export-prefs";
import { entryPathOf, summarizeTransferResult } from "@/lib/history-selection";
import {
  buildHistoryTransferAudit,
  buildRemovableDismissAudit,
  buildRemovableOpenAudit,
  buildSelectRightRootAudit,
} from "@/lib/history-audit";
import { auditLog } from "@/lib/auditLog";
import { appConfirm, appConfirmSaveLeave } from "@/composables/useAppConfirm";
import { usePageLifecycle } from "@/composables/usePageLifecycle";
import { segmentsForDepth, shouldApplyScanGeneration } from "@/lib/report-history-nav";

defineOptions({ name: "ReportHistory" });

const { register: registerPageTask } = usePageLifecycle("ReportHistory");

type Side = "left" | "right";

type PaneState = {
  cwd: string;
  relSegments: string[];
  entries: ExportEntry[];
  total: number;
  pageIndex: number;
  loading: boolean;
  selected: Set<string>;
  scanGen: number;
};

const MODE_STORAGE_KEY = "rh-view-mode";
const PAGE_SIZE_KEY = "rh-page-size";
const SPLIT_KEY = "rh-split";
const RIGHT_ROOT_KEY = "rh-right-root";

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

function readSplit(): boolean {
  try {
    return localStorage.getItem(SPLIT_KEY) === "1";
  } catch {
    return false;
  }
}

function readRightRoot(): string | null {
  try {
    return localStorage.getItem(RIGHT_ROOT_KEY) || null;
  } catch {
    return null;
  }
}

function makePane(): PaneState {
  return {
    cwd: "",
    relSegments: [],
    entries: [],
    total: 0,
    pageIndex: 0,
    loading: false,
    selected: new Set(),
    scanGen: 0,
  };
}

const mode = ref<"list" | "thumbs">(readInitialMode());
watch(mode, (m) => {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, m);
  } catch {
    /* ignore */
  }
});

const split = ref(readSplit());
const watchDir = ref<string | null>(loadReportExportPrefs().watchDir);
const rightRoot = ref<string | null>(readRightRoot());
const pageSize = ref(readInitialPageSize());
const msg = ref("");
const transferring = ref(false);

const left = reactive(makePane());
const right = reactive(makePane());

type RemovableVol = { path: string; label: string; platform: string };
const pendingRemovable = ref<RemovableVol | null>(null);
const dismissedRemovablePaths = ref<Set<string>>(new Set());
let removableTimer: ReturnType<typeof setInterval> | null = null;

const electronShell = computed(
  () =>
    typeof window !== "undefined" &&
    Boolean(
      (window.electronAPI?.scanExportEntries || window.electronAPI?.scanExportPdfs) &&
        window.electronAPI?.deleteExportFile,
    ),
);

const loadingAny = computed(() => left.loading || right.loading);

const canTransferLeftToRight = computed(
  () =>
    Boolean(watchDir.value && rightRoot.value && left.selected.size && left.cwd && right.cwd) &&
    !transferring.value,
);

const canTransferRightToLeft = computed(
  () =>
    Boolean(watchDir.value && rightRoot.value && right.selected.size && left.cwd && right.cwd) &&
    !transferring.value,
);

function paneOf(side: Side): PaneState {
  return side === "left" ? left : right;
}

function rootOf(side: Side): string | null {
  return side === "left" ? watchDir.value : rightRoot.value;
}

function setRoot(side: Side, path: string | null) {
  if (side === "left") {
    watchDir.value = path;
    if (path) saveReportExportPrefs({ watchDir: path });
  } else {
    rightRoot.value = path;
    try {
      if (path) localStorage.setItem(RIGHT_ROOT_KEY, path);
      else localStorage.removeItem(RIGHT_ROOT_KEY);
    } catch {
      /* ignore */
    }
  }
}

function toggleSplit() {
  split.value = !split.value;
  try {
    localStorage.setItem(SPLIT_KEY, split.value ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (split.value) {
    startRemovablePoll();
    void refresh("right");
  } else {
    stopRemovablePoll();
    left.selected = new Set();
    right.selected = new Set();
  }
}

async function joinUnderRoot(side: Side, segments: string[]): Promise<string> {
  const root = (rootOf(side) || "").trim();
  if (!segments.length) return root;
  const api = window.electronAPI;
  if (api?.pathJoin) {
    return (await api.pathJoin(root, ...segments)) || [root, ...segments].join("/");
  }
  return [root, ...segments].join("/");
}

async function refresh(side: Side): Promise<void> {
  const pane = paneOf(side);
  const root = (rootOf(side) || "").trim();
  if (!root) {
    pane.entries = [];
    pane.total = 0;
    pane.relSegments = [];
    pane.cwd = "";
    return;
  }
  const api = window.electronAPI;
  if (!api?.scanExportEntries && !api?.scanExportPdfs) {
    msg.value = "当前环境无法扫描文件夹。";
    return;
  }

  const gen = ++pane.scanGen;
  pane.loading = true;
  try {
    const browse = (pane.cwd || root).trim() || root;
    if (api.scanExportEntries) {
      const res = await api.scanExportEntries({
        rootDir: root,
        cwd: browse,
        offset: pane.pageIndex * pageSize.value,
        limit: pageSize.value,
        sort: "mtime_desc",
      });
      if (!shouldApplyScanGeneration(gen, pane.scanGen)) return;
      if (!res?.ok) {
        pane.entries = [];
        pane.total = 0;
        msg.value = res?.error || "扫描失败";
        if (side === "right" && /不存在|拔|ENOENT/i.test(res?.error || "")) {
          msg.value = `右侧目录不可用：${res?.error || "可能已拔出"}。请重新选择路径。`;
        }
        return;
      }
      if (side === "left" && res.rootDir && res.rootDir !== root) {
        setRoot("left", res.rootDir);
      }
      pane.cwd = res.cwd || browse;
      pane.relSegments = Array.isArray(res.relSegments) ? res.relSegments : [];
      pane.total = res.total ?? 0;
      pane.entries = (res.entries || []) as ExportEntry[];
      return;
    }

    const res = await api.scanExportPdfs!({ dir: browse });
    if (!shouldApplyScanGeneration(gen, pane.scanGen)) return;
    if (!res?.ok) {
      pane.entries = [];
      pane.total = 0;
      msg.value = res?.error || "扫描失败";
      return;
    }
    const files = res.files || [];
    pane.total = files.length;
    const start = pane.pageIndex * pageSize.value;
    pane.entries = files.slice(start, start + pageSize.value).map((f) => ({
      kind: "pdf" as const,
      name: f.name,
      filePath: f.filePath,
      fileUrl: f.fileUrl,
      sizeBytes: f.sizeBytes,
      modifiedAt: f.modifiedAt,
    }));
    pane.cwd = res.dir || browse;
    pane.relSegments = [];
  } catch (e) {
    if (!shouldApplyScanGeneration(gen, pane.scanGen)) return;
    pane.entries = [];
    pane.total = 0;
    msg.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (shouldApplyScanGeneration(gen, pane.scanGen)) pane.loading = false;
  }
}

async function refreshAll() {
  msg.value = "";
  await refresh("left");
  if (split.value) await refresh("right");
}

async function enterDir(side: Side, dirPath: string) {
  const pane = paneOf(side);
  pane.cwd = dirPath;
  pane.pageIndex = 0;
  pane.selected = new Set();
  await refresh(side);
}

async function goToDepth(side: Side, depth: number) {
  const pane = paneOf(side);
  const segs = depth < 0 ? [] : segmentsForDepth(pane.relSegments, depth);
  pane.cwd = await joinUnderRoot(side, segs);
  pane.pageIndex = 0;
  pane.selected = new Set();
  await refresh(side);
}

async function goUp(side: Side) {
  const pane = paneOf(side);
  if (!pane.relSegments.length) return;
  await goToDepth(side, pane.relSegments.length - 2);
}

function goPage(side: Side, idx: number) {
  const pane = paneOf(side);
  const max = Math.max(0, Math.ceil(pane.total / pageSize.value) - 1);
  pane.pageIndex = Math.max(0, Math.min(max, idx));
  void refresh(side);
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
  } catch {
    /* ignore */
  }
  left.pageIndex = 0;
  right.pageIndex = 0;
  void refreshAll();
}

async function onPickLeftRoot() {
  msg.value = "";
  const picked = await window.electronAPI?.pickExportDirectory?.({
    title: "选择导出文件夹（历史报表监视）",
    defaultPath: watchDir.value || undefined,
  });
  if (!picked) return;
  setRoot("left", picked);
  left.cwd = picked;
  left.relSegments = [];
  left.pageIndex = 0;
  left.selected = new Set();
  await refresh("left");
}

async function onPickRightRoot() {
  msg.value = "";
  const picked = await window.electronAPI?.pickExportDirectory?.({
    title: "选择右侧目标目录",
    defaultPath: rightRoot.value || undefined,
  });
  if (!picked) return;
  setRoot("right", picked);
  right.cwd = picked;
  right.relSegments = [];
  right.pageIndex = 0;
  right.selected = new Set();
  void auditLog(buildSelectRightRootAudit(picked));
  await refresh("right");
}

function selectedPaths(side: Side): string[] {
  const pane = paneOf(side);
  const out: string[] = [];
  for (const e of pane.entries) {
    const key = e.kind === "dir" ? `d:${e.path}` : `p:${e.filePath}`;
    if (pane.selected.has(key)) out.push(entryPathOf(e));
  }
  // 也保留不在本页但已选的 key（跨页）——首版仅本页可见选中有效；清空不可见
  return out.filter(Boolean);
}

async function askConflictPolicy(sampleName: string): Promise<"overwrite" | "rename" | "skip" | null> {
  const result = await appConfirmSaveLeave({
    title: "目标已存在同名项",
    message: `例如「${sampleName}」等与目标目录重名。\n请选择对本批全部冲突项的处理方式：`,
    saveText: "全部覆盖",
    discardText: "全部改名",
    cancelText: "全部跳过",
  });
  if (result === "confirm") return "overwrite";
  if (result === "discard") return "rename";
  if (result === "cancel") return "skip";
  return null;
}

async function runTransfer(from: Side, modeOp: "copy" | "move") {
  msg.value = "";
  const to: Side = from === "left" ? "right" : "left";
  const sourceRoot = rootOf(from);
  const destRoot = rootOf(to);
  const srcPane = paneOf(from);
  const destPane = paneOf(to);
  const sources = selectedPaths(from);
  if (!sourceRoot || !destRoot || !sources.length || !destPane.cwd) {
    msg.value = "请先绑定两侧目录并选中要传输的项目。";
    return;
  }

  if (modeOp === "move") {
    const ok = await appConfirm({
      title: "确认移动",
      message: `将把 ${sources.length} 项移动到对侧当前目录。\n移动成功后会从源位置删除，是否继续？`,
      confirmText: "移动",
      danger: true,
    });
    if (!ok) return;
  }

  const api = window.electronAPI;
  if (!api?.historyTransfer) {
    msg.value = "当前客户端不支持复制/移动，请升级桌面版。";
    return;
  }

  transferring.value = true;
  try {
    const dry = await api.historyTransfer({
      sources,
      destDir: destPane.cwd,
      sourceRoot,
      destRoot,
      mode: modeOp,
      dryRun: true,
    });
    if (!dry?.ok && !dry?.needsConflictDecision) {
      msg.value = dry?.error || "预检失败";
      return;
    }

    let conflict: "skip" | "overwrite" | "rename" | undefined;
    if (dry.needsConflictDecision || (dry.conflicts && dry.conflicts.length)) {
      const sample = dry.conflicts?.[0]?.name || "同名项";
      const decided = await askConflictPolicy(sample);
      if (!decided) return;
      conflict = decided;
    }

    const res = await api.historyTransfer({
      sources,
      destDir: destPane.cwd,
      sourceRoot,
      destRoot,
      mode: modeOp,
      conflict,
    });
    msg.value = summarizeTransferResult(res) + (res.error ? ` · ${res.error}` : "");
    void auditLog(
      buildHistoryTransferAudit({
        mode: modeOp,
        from,
        sourceRoot,
        destRoot,
        destDir: destPane.cwd,
        conflict,
        sourceCount: sources.length,
        res,
      }),
    );
    srcPane.selected = new Set();
    await refresh(from);
    await refresh(to);
  } catch (e) {
    msg.value = e instanceof Error ? e.message : String(e);
  } finally {
    transferring.value = false;
  }
}

async function openFile(r: PdfEntry) {
  const res = await window.electronAPI?.shellOpenPath?.(r.filePath);
  if (res && !res.ok) msg.value = `打开失败：${res.error || "未知错误"}`;
}

async function revealFile(r: PdfEntry) {
  const res = await window.electronAPI?.showItemInFolder?.(r.filePath);
  if (res && !res.ok) msg.value = `无法定位文件：${res.error || "未知错误"}`;
}

async function deleteFile(r: PdfEntry) {
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
  await refresh("left");
  if (split.value) await refresh("right");
}

function normalizeVolKey(p: string): string {
  return (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

async function pollRemovable(opts?: { resetBaseline?: boolean }) {
  if (!split.value || !window.electronAPI?.listRemovableVolumes) return;
  try {
    const res = await window.electronAPI.listRemovableVolumes(
      opts?.resetBaseline ? { resetBaseline: true } : undefined,
    );
    if (!res?.ok) {
      if (res?.error) msg.value = `可移动存储检测失败：${res.error}（仍可用「选右侧路径…」）`;
      return;
    }
    const vols = res.volumes || [];
    const right = normalizeVolKey(rightRoot.value || "");
    const candidate = vols.find((v) => {
      const p = normalizeVolKey(v.path || "");
      if (!p) return false;
      if (dismissedRemovablePaths.value.has(p)) return false;
      if (right && (right === p || right.startsWith(`${p}/`))) return false;
      return true;
    });
    if (candidate) {
      pendingRemovable.value = candidate;
    } else if (pendingRemovable.value) {
      const pendingKey = normalizeVolKey(pendingRemovable.value.path || "");
      const still = vols.some((v) => normalizeVolKey(v.path || "") === pendingKey);
      if (!still) pendingRemovable.value = null;
    }
  } catch {
    /* ignore */
  }
}

async function confirmOpenRemovable() {
  const vol = pendingRemovable.value;
  if (!vol) return;
  setRoot("right", vol.path);
  right.cwd = vol.path;
  right.relSegments = [];
  right.pageIndex = 0;
  right.selected = new Set();
  pendingRemovable.value = null;
  void auditLog(buildRemovableOpenAudit(vol));
  await refresh("right");
}

function dismissRemovable() {
  if (pendingRemovable.value) {
    dismissedRemovablePaths.value.add(normalizeVolKey(pendingRemovable.value.path));
    void auditLog(buildRemovableDismissAudit(pendingRemovable.value));
  }
  pendingRemovable.value = null;
}

function startRemovablePoll() {
  stopRemovablePoll();
  if (!split.value) return;
  // 开启分屏时重置 Win 盘符基线，便于「先开分屏再插盘」用新盘符差集检出
  void pollRemovable({ resetBaseline: true });
  removableTimer = setInterval(() => void pollRemovable(), 5000);
}

function stopRemovablePoll() {
  if (removableTimer) {
    clearInterval(removableTimer);
    removableTimer = null;
  }
}

/** B 级 · page-focus：离页 / 退出分屏 / 最小化均停；结批 A 级不受影响（032 Q4′） */
registerPageTask({
  id: "removable-volume-poll",
  scope: "page-focus",
  pause: stopRemovablePoll,
  resume: () => {
    if (split.value) startRemovablePoll();
  },
});

async function onConfigRestored() {
  watchDir.value = loadReportExportPrefs().watchDir;
  left.cwd = watchDir.value || "";
  left.relSegments = [];
  left.pageIndex = 0;
  left.selected = new Set();
  if (watchDir.value) await refresh("left");
  else {
    left.entries = [];
    left.total = 0;
  }
}

onActivated(async () => {
  if (watchDir.value) {
    if (!left.cwd) left.cwd = watchDir.value;
    await refresh("left");
  }
  if (split.value && rightRoot.value) {
    if (!right.cwd) right.cwd = rightRoot.value;
    await refresh("right");
  }
  // 可移动卷轮询由 usePageLifecycle（page-focus）resume
});

onMounted(() => {
  window.addEventListener("report-editor-config-imported", onConfigRestored);
  if (watchDir.value && !left.cwd) left.cwd = watchDir.value;
  if (rightRoot.value && !right.cwd) right.cwd = rightRoot.value;
  // 可移动卷轮询由 usePageLifecycle resume（首挂 onMounted 已触发）
});

onUnmounted(() => {
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
.rh-split-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.rh-split-spacer {
  flex: 1;
  min-width: 8px;
}
.rh-removable-msg {
  font-size: 13px;
  color: #92400e;
  font-weight: 600;
}
.rh-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.rh-split-pane {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: rgb(255 255 255 / 0.75);
  min-height: 320px;
}
@media (max-width: 960px) {
  .rh-split {
    grid-template-columns: 1fr;
  }
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
.b.ghost {
  background: #fff;
  border-color: #e2e8f0;
  color: #475569;
}
.b-on {
  background: #eef2ff;
  border-color: #a5b4fc;
  color: #3730a3;
  font-weight: 600;
}
</style>
