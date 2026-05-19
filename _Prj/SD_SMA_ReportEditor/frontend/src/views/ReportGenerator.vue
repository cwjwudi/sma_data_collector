<template>
  <div class="rg-page">
    <h2 class="rg-title">生成报表</h2>
    <p class="rg-lead">
      导出 PDF 与模版编辑器中<strong>导出预览</strong>栈一致（同一套控件缩放与 OPC/SQL 绑定填充）。请在<strong>Electron 桌面版</strong>中使用完整导出能力。
    </p>

    <div v-if="!electronShell" class="rg-banner rg-banner--warn">
      当前运行在浏览器壳：无法弹出系统保存对话框与后台渲染 PDF。请使用 <code>npm run electron:dev</code> 或安装版客户端。
    </div>

    <section class="rg-card">
      <h3 class="rg-h3">手动导出 PDF</h3>
      <div class="rg-row">
        <label class="rg-lbl" for="rg-tpl">报表模版</label>
        <select id="rg-tpl" v-model="prefs.templateId" class="rg-select">
          <option :value="null">请选择…</option>
          <option v-for="row in templateRows" :key="row.item.id" :value="row.item.id">
            {{ templateSelectLabel(row.seq, row.item.name) }}
          </option>
        </select>
      </div>
      <div class="rg-row rg-row--check">
        <label><input v-model="prefs.manualOpenAfter" type="checkbox" />导出完成后打开 PDF（桌面壳）</label>
      </div>
      <div class="rg-actions">
        <button type="button" class="btn primary" :disabled="manualBusy || !canManualExport" @click="onManualExport">
          {{ manualBusy ? "导出中…" : "选择保存位置并导出 PDF" }}
        </button>
      </div>
      <p v-if="manualHint" class="rg-hint">{{ manualHint }}</p>
    </section>

    <section class="rg-card">
      <h3 class="rg-h3">OPC UA 条件自动导出</h3>
      <div class="rg-switch-row">
        <span class="rg-switch-label" id="rg-auto-enabled-lbl">启用自动导出</span>
        <button
          type="button"
          class="rg-switch"
          :class="{ 'rg-switch--on': prefs.auto.enabled }"
          role="switch"
          aria-labelledby="rg-auto-enabled-lbl"
          :aria-checked="prefs.auto.enabled"
          :disabled="!electronShell"
          @click="toggleAutoEnabled"
        />
      </div>
      <p v-if="!electronShell" class="rg-mini rg-mini--switch">自动导出仅在 Electron 桌面版可用。</p>

      <div class="rg-auto-fields" :class="{ 'rg-auto-fields--off': !prefs.auto.enabled }">
      <div class="rg-export-dir-block">
        <span class="rg-lbl">导出文件夹</span>
        <div class="rg-tabs" role="tablist" aria-label="导出文件夹来源">
          <button
            type="button"
            role="tab"
            class="rg-tab"
            :class="{ 'rg-tab--on': prefs.autoExportDirSource === 'default' }"
            :aria-selected="prefs.autoExportDirSource === 'default'"
            @click="setExportDirTab('default')"
          >
            默认文件夹
          </button>
          <button
            type="button"
            role="tab"
            class="rg-tab"
            :class="{ 'rg-tab--on': prefs.autoExportDirSource === 'opcua' }"
            :aria-selected="prefs.autoExportDirSource === 'opcua'"
            @click="setExportDirTab('opcua')"
          >
            绑定 OPC UA
          </button>
        </div>

        <div class="rg-tab-panel" role="tabpanel">
          <template v-if="prefs.autoExportDirSource === 'default'">
            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-auto-dir">导出目录</label>
              <div class="rg-inline">
                <input
                  id="rg-auto-dir"
                  v-model="prefs.autoExportDir"
                  type="text"
                  readonly
                  class="rg-inp rg-inp--grow"
                  placeholder="未选择（点击下方按钮）"
                />
                <button type="button" class="btn" :disabled="!electronShell" @click="onPickAutoDir">选择文件夹…</button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-auto-dir-fallback">保底目录</label>
              <div class="rg-inline">
                <input
                  id="rg-auto-dir-fallback"
                  v-model="prefs.autoExportDir"
                  type="text"
                  readonly
                  class="rg-inp rg-inp--grow"
                  placeholder="未选择（点击下方按钮）"
                />
                <button type="button" class="btn" :disabled="!electronShell" @click="onPickAutoDir">选择文件夹…</button>
              </div>
              <p class="rg-mini rg-mini--indent">OPC 路径变量为空或读取失败时，导出到此保底目录。</p>
            </div>
            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-dir-opc-var">OPC 目录变量（String）</label>
              <div class="rg-inline">
                <input
                  id="rg-dir-opc-var"
                  :value="prefs.autoExportDirOpcNodeId"
                  type="text"
                  readonly
                  class="rg-inp rg-inp--grow rg-mono"
                  placeholder="未绑定"
                />
                <button type="button" class="btn" @click="openRgOpcPick('exportDir')">打开 OPC UA 绑定树</button>
              </div>
              <p v-if="exportDirOpcServerLabel" class="rg-mini rg-mini--indent">连接：{{ exportDirOpcServerLabel }}</p>
              <p class="rg-mini rg-mini--indent">展开地址空间时仅显示 String 类型变量；文件夹节点可继续展开浏览。</p>
            </div>
          </template>
        </div>
      </div>

      <div class="rg-export-dir-block">
        <span class="rg-lbl">自动导出文件名</span>
        <div class="rg-tabs" role="tablist" aria-label="自动导出文件名">
          <button
            type="button"
            role="tab"
            class="rg-tab"
            :class="{ 'rg-tab--on': prefs.autoFileNameSource === 'segments' }"
            :aria-selected="prefs.autoFileNameSource === 'segments'"
            @click="setFileNameTab('segments')"
          >
            勾选片段
          </button>
          <button
            type="button"
            role="tab"
            class="rg-tab"
            :class="{ 'rg-tab--on': prefs.autoFileNameSource === 'opcua' }"
            :aria-selected="prefs.autoFileNameSource === 'opcua'"
            @click="setFileNameTab('opcua')"
          >
            OPC UA + 哈希
          </button>
        </div>

        <div class="rg-tab-panel" role="tabpanel">
          <template v-if="prefs.autoFileNameSource === 'segments'">
            <div class="rg-row rg-row--in-panel">
              <span class="rg-lbl">包含片段</span>
              <div class="rg-seg-grid">
                <label
                  v-for="opt in fileNameSegmentOptions"
                  :key="opt.id"
                  class="rg-seg-chk"
                  :title="opt.hint"
                >
                  <input
                    type="checkbox"
                    :checked="prefs.autoFileNameSegments.includes(opt.id)"
                    @change="toggleFileNameSegment(opt.id)"
                  />
                  {{ opt.label }}
                </label>
              </div>
              <p class="rg-mini rg-mini--indent">至少勾选一项；建议勾选「随机哈希」避免重名覆盖。</p>
            </div>
          </template>

          <template v-else>
            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-fn-opc-var">OPC 文件名变量（String）</label>
              <div class="rg-inline">
                <input
                  id="rg-fn-opc-var"
                  :value="prefs.autoFileNameOpcNodeId"
                  type="text"
                  readonly
                  class="rg-inp rg-inp--grow rg-mono"
                  placeholder="未绑定"
                />
                <button type="button" class="btn" @click="openRgOpcPick('fileName')">打开 OPC UA 绑定树</button>
              </div>
              <p v-if="fileNameOpcServerLabel" class="rg-mini rg-mini--indent">连接：{{ fileNameOpcServerLabel }}</p>
              <p class="rg-mini rg-mini--indent">
                导出为 <code>基名 + 连接符 + 8位哈希.pdf</code>；OPC 为空或失败时回退「模版名 + 时间戳 + 哈希」。
              </p>
            </div>
          </template>

          <div class="rg-row rg-row--in-panel rg-row--compact">
            <label class="rg-lbl" for="rg-fn-sep">片段连接符</label>
            <input id="rg-fn-sep" v-model="prefs.autoFileNameSeparator" type="text" class="rg-inp rg-inp--sep" maxlength="8" spellcheck="false" />
          </div>
          <p class="rg-mini rg-mini--indent">预览（示意）：<code>{{ autoFileNamePreview }}</code></p>
        </div>
      </div>

      <div class="rg-row">
        <label class="rg-lbl" for="rg-opc-srv">OPC UA 连接</label>
        <select id="rg-opc-srv" v-model="prefs.auto.serverId" class="rg-select">
          <option value="">请选择…</option>
          <option v-for="s in opcServers" :key="s.id" :value="s.id">{{ s.name || s.id }}</option>
        </select>
      </div>
      <div class="rg-row">
        <label class="rg-lbl" for="rg-node">触发节点 NodeId</label>
        <input id="rg-node" v-model.trim="prefs.auto.nodeId" type="text" class="rg-inp" spellcheck="false" placeholder="例如 ns=2;s=..." />
      </div>
      <div class="rg-row">
        <label class="rg-lbl" for="rg-mode">触发条件</label>
        <select id="rg-mode" v-model="prefs.auto.mode" class="rg-select">
          <option value="rising">上升沿（由假→真，首次采样不误触发）</option>
          <option value="truthy">为真时触发（配合冷却避免重复）</option>
          <option value="equals">值等于下方文本</option>
        </select>
      </div>
      <div v-if="prefs.auto.mode === 'equals'" class="rg-row">
        <label class="rg-lbl" for="rg-eq">比较文本</label>
        <input id="rg-eq" v-model.trim="prefs.auto.equalsText" type="text" class="rg-inp" spellcheck="false" />
      </div>
      <div class="rg-row rg-split">
        <div>
          <label class="rg-lbl" for="rg-poll">轮询间隔（秒）</label>
          <input id="rg-poll" v-model.number="prefs.auto.pollSec" type="number" min="0.5" max="300" step="0.5" class="rg-inp rg-inp--num" />
        </div>
        <div>
          <label class="rg-lbl" for="rg-cool">导出冷却（秒）</label>
          <input id="rg-cool" v-model.number="prefs.auto.cooldownSec" type="number" min="1" max="3600" step="1" class="rg-inp rg-inp--num" />
        </div>
      </div>
      <div class="rg-row rg-row--check">
        <label><input v-model="prefs.auto.openAfter" type="checkbox" :disabled="!electronShell" />导出完成后打开 PDF</label>
      </div>
      <p v-if="autoStatus" class="rg-hint">{{ autoStatus }}</p>
      </div>
    </section>

    <OpcUaNodePickerModal
      v-model="opcPickOpen"
      data-type-filter="String"
      hide-search
      title="绑定 OPC UA String 变量"
      :lead="opcPickLead"
      :initial-server-id="opcPickInitialServerId"
      @confirm="onRgOpcPickConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { listTemplateSummaries, type TemplateSummary } from "@/api/templates";
import { apiFetch } from "@/api/client.js";
import {
  loadReportGeneratorPrefs,
  saveReportGeneratorPrefs,
  type AutoExportDirSource,
  type AutoFileNameSource,
  type ReportGeneratorPrefs,
} from "@/lib/report-generator-prefs";
import { loadReportExportPrefs, saveReportExportPrefs } from "@/lib/report-export-prefs";
import { templateSelectLabel, templateSelectRows } from "@/lib/template-display-order";
import { evaluateAutoOpcTrigger, createOpcTriggerPollState, type OpcTriggerPollState } from "@/lib/auto-opc-trigger";
import { resolveAutoExportDir } from "@/lib/resolve-auto-export-dir";
import OpcUaNodePickerModal from "@/features/datasource/opcua/OpcUaNodePickerModal.vue";
import {
  AUTO_FILE_NAME_SEGMENT_OPTIONS,
  buildAutoExportFileName,
  formatExportTs,
  previewAutoExportFileName,
  type AutoFileNameSegment,
} from "@/lib/auto-export-filename";

const prefs = ref<ReportGeneratorPrefs>(loadReportGeneratorPrefs());
const exportWatchDir = loadReportExportPrefs().watchDir;
if (exportWatchDir && !prefs.value.autoExportDir) {
  prefs.value.autoExportDir = exportWatchDir;
}
const summaries = ref<TemplateSummary[]>([]);
const templateRows = computed(() => templateSelectRows(summaries.value));
const opcServers = ref<{ id: string; name?: string }[]>([]);
type RgOpcPickTarget = "exportDir" | "fileName";
const opcPickOpen = ref(false);
const opcPickTarget = ref<RgOpcPickTarget | null>(null);

const fileNameSegmentOptions = AUTO_FILE_NAME_SEGMENT_OPTIONS;

function opcServerLabel(serverId: string): string {
  const id = serverId.trim();
  if (!id) return "";
  const s = opcServers.value.find((x) => x.id === id);
  return s?.name?.trim() || s?.id || id;
}

const exportDirOpcServerLabel = computed(() => opcServerLabel(prefs.value.autoExportDirOpcServerId));
const fileNameOpcServerLabel = computed(() => opcServerLabel(prefs.value.autoFileNameOpcServerId));

const opcPickInitialServerId = computed(() => {
  if (opcPickTarget.value === "exportDir") return prefs.value.autoExportDirOpcServerId;
  if (opcPickTarget.value === "fileName") return prefs.value.autoFileNameOpcServerId;
  return "";
});

const opcPickLead = computed(() => {
  if (opcPickTarget.value === "exportDir") {
    return "选择已保存的 OPC UA 连接，在地址空间中展开并点击 String 变量作为导出目录路径；非 String 变量在展开时不会显示。确定后写入 NodeId，仍可手工修改。";
  }
  if (opcPickTarget.value === "fileName") {
    return "选择 String 变量作为导出文件名基名（不含扩展名）；系统将自动追加随机哈希与 .pdf。非 String 变量在展开时不会显示。";
  }
  return "选择 String 类型变量并绑定。";
});

const electronShell = computed(() => typeof window !== "undefined" && Boolean(window.electronAPI?.runPdfExport));

const manualBusy = ref(false);
const manualHint = ref("");

const autoStatus = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;
let opcPollState: OpcTriggerPollState = createOpcTriggerPollState();
let lastExportAt = 0;

watch(
  () => [prefs.value.auto.enabled, prefs.value.auto.mode, prefs.value.auto.serverId, prefs.value.auto.nodeId],
  () => {
    opcPollState = createOpcTriggerPollState();
  },
);

watch(
  prefs,
  (p) => saveReportGeneratorPrefs(JSON.parse(JSON.stringify(p)) as ReportGeneratorPrefs),
  { deep: true },
);

watch(
  () => prefs.value.autoExportDir,
  (d) => {
    const dir = typeof d === "string" && d.trim() ? d.trim() : null;
    saveReportExportPrefs({ watchDir: dir });
  },
);

const selectedTemplateName = computed(() => {
  const tid = prefs.value.templateId;
  if (!tid) return "模版名";
  return summaries.value.find((x) => x.id === tid)?.name || tid;
});

const autoFileNamePreview = computed(() =>
  previewAutoExportFileName(prefs.value, selectedTemplateName.value),
);

const canManualExport = computed(() => electronShell.value && Boolean(prefs.value.templateId));

function toggleAutoEnabled() {
  if (!electronShell.value) return;
  prefs.value.auto.enabled = !prefs.value.auto.enabled;
}

function setExportDirTab(source: AutoExportDirSource) {
  if (prefs.value.autoExportDirSource === source) return;
  prefs.value.autoExportDirSource = source;
}

function setFileNameTab(source: AutoFileNameSource) {
  if (prefs.value.autoFileNameSource === source) return;
  prefs.value.autoFileNameSource = source;
}

function openRgOpcPick(target: RgOpcPickTarget) {
  opcPickTarget.value = target;
  opcPickOpen.value = true;
}

function onRgOpcPickConfirm(payload: { serverId: string; nodeId: string }) {
  const sid = payload.serverId.trim();
  const nid = payload.nodeId.trim();
  const target = opcPickTarget.value;
  opcPickTarget.value = null;
  if (!nid) return;
  if (target === "exportDir") {
    if (sid) prefs.value.autoExportDirOpcServerId = sid;
    prefs.value.autoExportDirOpcNodeId = nid;
  } else if (target === "fileName") {
    if (sid) prefs.value.autoFileNameOpcServerId = sid;
    prefs.value.autoFileNameOpcNodeId = nid;
  }
}

function toggleFileNameSegment(id: AutoFileNameSegment) {
  const cur = prefs.value.autoFileNameSegments;
  if (cur.includes(id)) {
    prefs.value.autoFileNameSegments = cur.filter((s) => s !== id);
  } else {
    prefs.value.autoFileNameSegments = [...cur, id];
  }
}

async function loadSummaries(): Promise<void> {
  try {
    summaries.value = await listTemplateSummaries();
  } catch {
    summaries.value = [];
  }
}

async function loadOpcServers(): Promise<void> {
  try {
    const pkg = (await apiFetch("/opcua/servers")) as { servers?: { id: string; name?: string }[] };
    opcServers.value = pkg.servers || [];
  } catch {
    opcServers.value = [];
  }
}

async function onManualExport(): Promise<void> {
  manualHint.value = "";
  const api = window.electronAPI;
  if (!api?.runPdfExport || !api.showSavePdfDialog) {
    manualHint.value = "当前环境不支持 PDF 导出。";
    return;
  }
  const tid = prefs.value.templateId;
  if (!tid) return;

  const tmeta = summaries.value.find((x) => x.id === tid);
  const suggestName = `${(tmeta?.name || "报表").replace(/[/\\?%*:|"<>]/g, "_")}_${formatExportTs()}.pdf`;

  const filePath = await api.showSavePdfDialog({
    title: "导出 PDF",
    defaultPath: suggestName,
  });
  if (!filePath) {
    manualHint.value = "已取消保存。";
    return;
  }

  manualBusy.value = true;
  try {
    await api.runPdfExport({
      templateId: tid,
      filePath,
      openAfter: prefs.value.manualOpenAfter,
    });
    manualHint.value = `已保存：${filePath}`;
  } catch (e) {
    manualHint.value = e instanceof Error ? e.message : String(e);
  } finally {
    manualBusy.value = false;
  }
}

async function onPickAutoDir(): Promise<void> {
  const title =
    prefs.value.autoExportDirSource === "opcua" ? "选择保底导出目录" : "选择导出目录";
  const p = await window.electronAPI?.pickExportDirectory?.({ title });
  if (p) {
    prefs.value.autoExportDir = p;
    saveReportExportPrefs({ watchDir: p });
  }
}

async function runAutoPdfExport(): Promise<void> {
  const api = window.electronAPI;
  if (!api?.runPdfExport || !api.pathJoin) return;

  const tid = prefs.value.templateId;
  if (!tid) return;

  const resolved = await resolveAutoExportDir(prefs.value);
  const dir = resolved.dir.trim();
  if (!dir) return;

  const tmeta = summaries.value.find((x) => x.id === tid);
  const built = await buildAutoExportFileName(prefs.value, tmeta?.name || tid);
  const filePath = await api.pathJoin(dir, built.base);

  await api.runPdfExport({
    templateId: tid,
    filePath,
    openAfter: prefs.value.auto.openAfter,
  });
  lastExportAt = Date.now();
  const notes = [resolved.note, built.note].filter(Boolean).join("；");
  const noteSuffix = notes ? `（${notes}）` : "";
  autoStatus.value = `[自动] 已导出 ${filePath}${noteSuffix}`;
}

async function pollAutoTriggerOnce(): Promise<void> {
  if (!electronShell.value || !prefs.value.auto.enabled) return;

  const tid = prefs.value.templateId;
  const srv = prefs.value.auto.serverId.trim();
  const nodeId = prefs.value.auto.nodeId.trim();

  if (!tid || !srv || !nodeId) {
    autoStatus.value = "[自动] 等待模版与 OPC 触发节点配置完整…";
    return;
  }

  const resolved = await resolveAutoExportDir(prefs.value);
  if (!resolved.dir.trim()) {
    autoStatus.value = `[自动] ${resolved.note || "请配置默认或 OPC 导出文件夹…"}`;
    return;
  }

  let raw: unknown;
  try {
    const res = await apiFetch(`/opcua/read_saved/${encodeURIComponent(srv)}`, {
      method: "POST",
      body: { node_id: nodeId },
    });
    if (!res || typeof res !== "object") throw new Error("无效 OPC 响应");
    const r = res as { ok?: boolean; message?: string; value?: unknown };
    if (r.ok === false) throw new Error(String(r.message || "读 OPC 失败"));
    raw = r.value;
  } catch (e) {
    autoStatus.value = `[自动] OPC 读取失败：${e instanceof Error ? e.message : String(e)}`;
    opcPollState = createOpcTriggerPollState();
    return;
  }

  const fire = evaluateAutoOpcTrigger(prefs.value.auto.mode, raw, prefs.value.auto.equalsText, opcPollState);
  const cooldownMs = Math.max(1, prefs.value.auto.cooldownSec) * 1000;
  const since = Date.now() - lastExportAt;

  if (fire && since >= cooldownMs) {
    try {
      await runAutoPdfExport();
    } catch (e) {
      autoStatus.value = `[自动] 导出失败：${e instanceof Error ? e.message : String(e)}`;
    }
    return;
  }

  autoStatus.value = fire ? `[自动] 条件满足；冷却中（剩余约 ${Math.max(0, Math.ceil((cooldownMs - since) / 1000))}s）…` : "[自动] 监听中…";
}

function restartPollLoop(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!electronShell.value || !prefs.value.auto.enabled) return;

  const sec = prefs.value.auto.pollSec;
  const ms = Math.round(Math.min(300, Math.max(0.5, Number(sec) || 2)) * 1000);

  void pollAutoTriggerOnce();
  pollTimer = setInterval(() => void pollAutoTriggerOnce(), ms);
}

onMounted(async () => {
  await Promise.all([loadSummaries(), loadOpcServers()]);
  restartPollLoop();
});

watch(
  () => [prefs.value.auto.enabled, prefs.value.auto.pollSec, electronShell.value],
  () => restartPollLoop(),
);

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.rg-page {
  max-width: 820px;
}
.rg-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 10px;
}
.rg-lead {
  color: #52525b;
  font-size: 14px;
  line-height: 1.55;
  margin-bottom: 16px;
}
.rg-banner {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.5;
}
.rg-banner--warn {
  background: #fef9c3;
  border: 1px solid #eab30855;
  color: #713f12;
}
.rg-card {
  border: 1px solid rgb(228 228 231);
  border-radius: 10px;
  padding: 14px 16px 18px;
  margin-bottom: 16px;
  background: rgb(250 250 252 / 0.95);
}
.rg-h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
  color: #27272a;
}
.rg-row {
  margin-bottom: 10px;
}
.rg-row--check label {
  font-size: 13px;
  color: #3f3f46;
}
.rg-row--check input {
  margin-right: 6px;
}
.rg-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 520px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #fff;
}
.rg-switch-label {
  font-size: 14px;
  font-weight: 600;
  color: #27272a;
}
.rg-switch {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: 1px solid #d4d4d8;
  background: #e4e4e7;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.rg-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(24 24 27 / 0.15);
  transition: transform 0.15s ease;
}
.rg-switch--on {
  background: #4f46e5;
  border-color: #4338ca;
}
.rg-switch--on::after {
  transform: translateX(20px);
}
.rg-switch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.rg-mini--switch {
  margin-top: -6px;
  margin-bottom: 10px;
}
.rg-mini--indent {
  margin-top: 6px;
  margin-bottom: 0;
}
.rg-mini--warn {
  color: #b45309;
}
.rg-export-dir-block {
  margin-bottom: 18px;
}
.rg-export-dir-block > .rg-lbl {
  display: block;
  margin-bottom: 8px;
}
.rg-tabs {
  display: inline-flex;
  gap: 0;
  padding: 3px;
  border-radius: 10px;
  border: 1px solid #e4e4e7;
  background: #f4f4f5;
  margin-bottom: 12px;
}
.rg-tab {
  margin: 0;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  color: #52525b;
  line-height: 1.2;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
}
.rg-tab--on {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.rg-tab-panel {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #e4e4e7;
  background: #fafafa;
}
.rg-row--in-panel {
  margin-bottom: 14px;
}
.rg-row--in-panel:last-child {
  margin-bottom: 0;
}
.rg-dir-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-top: 4px;
}
.rg-radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #3f3f46;
  cursor: pointer;
}
.rg-inline--wrap {
  flex-wrap: wrap;
  margin-top: 4px;
}
.rg-select--mt {
  margin-top: 8px;
}
.rg-row--compact {
  margin-top: -4px;
}
.rg-inp--sep {
  max-width: 72px;
}
.rg-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.rg-seg-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin-top: 6px;
}
.rg-seg-chk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #3f3f46;
  cursor: pointer;
}
.rg-auto-fields {
  transition: opacity 0.15s ease;
}
.rg-auto-fields--off {
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}
.rg-auto-fields--off :is(input, select, button) {
  cursor: not-allowed;
}
.rg-lbl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
  margin-bottom: 4px;
}
.rg-select,
.rg-inp {
  width: 100%;
  max-width: 520px;
  box-sizing: border-box;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid rgb(212 212 216);
  font-size: 13px;
  background: #fff;
}
.rg-inp--grow {
  flex: 1;
  min-width: 0;
}
.rg-inp--num {
  max-width: 140px;
}
.rg-inline {
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: 640px;
}
.rg-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-width: 520px;
}
@media (max-width: 640px) {
  .rg-split {
    grid-template-columns: 1fr;
  }
}
.rg-actions {
  margin-top: 12px;
}
.btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgb(212 212 216);
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.btn.primary {
  background: #4f46e5;
  border-color: #4338ca;
  color: #fff;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.rg-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #3f3f46;
  word-break: break-all;
}
.rg-mini {
  font-size: 12px;
  color: #71717a;
  margin: -4px 0 10px;
  line-height: 1.45;
}
code {
  font-size: 0.92em;
}
</style>
