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
          <option v-for="t in summaries" :key="t.id" :value="t.id">{{ t.name }}</option>
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
      <div class="rg-row rg-row--check">
        <label><input v-model="prefs.auto.enabled" type="checkbox" :disabled="!electronShell" />启用自动导出</label>
      </div>

      <div class="rg-row">
        <label class="rg-lbl" for="rg-auto-dir">导出文件夹</label>
        <div class="rg-inline">
          <input id="rg-auto-dir" v-model="prefs.autoExportDir" type="text" readonly class="rg-inp rg-inp--grow" placeholder="未选择（点击下方按钮）" />
          <button type="button" class="btn" :disabled="!electronShell" @click="onPickAutoDir">选择文件夹…</button>
        </div>
      </div>

      <div class="rg-row">
        <label class="rg-lbl" for="rg-pattern">文件名模式</label>
        <input
          id="rg-pattern"
          v-model="prefs.autoFilePattern"
          type="text"
          class="rg-inp"
          spellcheck="false"
          placeholder="{name}_{ts}.pdf"
        />
      </div>
      <p class="rg-mini">占位符：<code>{name}</code> 模版名称；<code>{ts}</code> 时间戳 <code>yyyyMMdd_HHmmss</code>（不含扩展名时自动补 .pdf）。</p>

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
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { listTemplateSummaries, type TemplateSummary } from "@/api/templates";
import { apiFetch } from "@/api/client.js";
import {
  loadReportGeneratorPrefs,
  saveReportGeneratorPrefs,
  type ReportGeneratorPrefs,
} from "@/lib/report-generator-prefs";
import { evaluateAutoOpcTrigger, createOpcTriggerPollState, type OpcTriggerPollState } from "@/lib/auto-opc-trigger";

const prefs = ref<ReportGeneratorPrefs>(loadReportGeneratorPrefs());
const summaries = ref<TemplateSummary[]>([]);
const opcServers = ref<{ id: string; name?: string }[]>([]);

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

const canManualExport = computed(() => electronShell.value && Boolean(prefs.value.templateId));

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatTs(d = new Date()): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function buildExportBaseName(templateName: string): string {
  let s = prefs.value.autoFilePattern || "{name}_{ts}.pdf";
  s = s.replace(/\{name\}/g, templateName.replace(/[/\\?%*:|"<>]/g, "_"));
  s = s.replace(/\{ts\}/g, formatTs());
  if (!s.toLowerCase().endsWith(".pdf")) s += ".pdf";
  return s;
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
  const suggestName = `${(tmeta?.name || "报表").replace(/[/\\?%*:|"<>]/g, "_")}_${formatTs()}.pdf`;

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
  const p = await window.electronAPI?.pickExportDirectory?.({ title: "自动导出目录" });
  if (p) prefs.value.autoExportDir = p;
}

async function runAutoPdfExport(): Promise<void> {
  const api = window.electronAPI;
  if (!api?.runPdfExport || !api.pathJoin) return;

  const tid = prefs.value.templateId;
  const dir = (prefs.value.autoExportDir || "").trim();
  if (!tid || !dir) return;

  const tmeta = summaries.value.find((x) => x.id === tid);
  const base = buildExportBaseName(tmeta?.name || tid);
  const filePath = await api.pathJoin(dir, base);

  await api.runPdfExport({
    templateId: tid,
    filePath,
    openAfter: prefs.value.auto.openAfter,
  });
  lastExportAt = Date.now();
  autoStatus.value = `[自动] 已导出 ${filePath}`;
}

async function pollAutoTriggerOnce(): Promise<void> {
  if (!electronShell.value || !prefs.value.auto.enabled) return;

  const tid = prefs.value.templateId;
  const dir = (prefs.value.autoExportDir || "").trim();
  const srv = prefs.value.auto.serverId.trim();
  const nodeId = prefs.value.auto.nodeId.trim();

  if (!tid || !dir || !srv || !nodeId) {
    autoStatus.value = "[自动] 等待模版、导出文件夹与 OPC 节点配置完整…";
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
