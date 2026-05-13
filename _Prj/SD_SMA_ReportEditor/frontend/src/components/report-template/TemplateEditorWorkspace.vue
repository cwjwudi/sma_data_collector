<template>
  <div class="ted" v-if="editing">
    <div class="ted-top">
      <header class="bar">
      <button type="button" class="link" @click="back">← 模板列表</button>
      <input v-model.trim="editing.name" class="name" aria-label="名称" />
      <select v-model="editing.paperKind" class="ddl" @change="reclamp">
        <option v-for="pk in pkList" :key="pk" :value="pk">{{ paperLabel[pk] }}</option>
      </select>
      <select v-model="editing.orientation" class="ddl" @change="reclamp">
        <option value="portrait">纵向</option>
        <option value="landscape">横向</option>
      </select>
      <button type="button" class="btn" @click="save">保存</button>
      <span class="note">{{ hint }}</span>
      </header>
      <div class="preset-bar">
        <span class="preset-bar-label">引用版式</span>
        <template v-if="layoutPresetsAll.length">
        <label class="preset-lbl"
          >正文
          <select
            class="preset-ddl"
            :value="editing.layoutPresetId || ''"
            @change="onPresetBind('body', $event)"
          >
            <option value="">不绑定 ID（仅占位）</option>
            <option v-for="p in bodyPresets" :key="'b' + p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="preset-lbl"
          >封面
          <select
            class="preset-ddl"
            :value="editing.coverLayoutPresetId || ''"
            @change="onPresetBind('cover', $event)"
          >
            <option value="">不绑定 ID</option>
            <option v-for="p in coverPresets" :key="'c' + p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="preset-lbl"
          >末页
          <select
            class="preset-ddl"
            :value="editing.backLayoutPresetId || ''"
            @change="onPresetBind('back', $event)"
          >
            <option value="">不绑定 ID</option>
            <option v-for="p in backPresets" :key="'k' + p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        </template>
        <span v-else class="preset-empty">暂无版式列表（离线或需在「版式与页眉页脚」中建库）。仍可编辑当前快照。</span>
      </div>
    </div>
    <div class="cols">
      <aside class="left">
        <h5>拖拽到画布</h5>
        <button
          v-for="tp in toolbox"
          :key="tp"
          draggable="true"
          class="tool"
          type="button"
          @dragstart="dragStart($event, tp)"
        >
          {{ toolNames[tp] }}
        </button>
        <h5>页</h5>
        <button type="button" :class="{ on: sh === 'body' }" @click="sh = 'body'">正文</button>
        <button type="button" :class="{ on: sh === 'cover' }" @click="sh = 'cover'">封面</button>
        <button type="button" :class="{ on: sh === 'back' }" @click="sh = 'back'">末页</button>
        <h5>眉脚</h5>
        <button type="button" class="btn" @click="openHdr">页眉…</button>
        <button type="button" class="btn" @click="openFtr">页脚…</button>
        <button type="button" class="btn" @click="openSigIf">手写签名…</button>
      </aside>
      <main class="mid">
        <TemplateBodyCanvas v-model:selected-id="selId" :tmpl="editing" :sheet="sh" />
      </main>
      <aside class="right" v-if="sel">
        <h5>属性</h5>
        <textarea v-if="sel.type !== 'signature'" v-model="sel.text" rows="2"></textarea>
        <label>h<input v-model.number="sel.fontSize" type="number" min="8" /></label>
        <label>X<input type="number" v-model.number="sel.x" /></label>
        <label>Y<input type="number" v-model.number="sel.y" /></label>
        <label>W<input type="number" v-model.number="sel.w" /></label>
        <label>H<input type="number" v-model.number="sel.h" /></label>
        <template v-if="sel.type === 'parameter'">
          <label>绑定
            <select v-model="sel.bindingKind"><option value="none">无</option><option value="opcua">OPC UA</option><option value="sql">SQL</option></select>
          </label>
          <input v-model="sel.opcuaNodeId" placeholder="节点 ID" />
        </template>
        <template v-if="sel.type === 'table' || sel.type === 'chart'">
          <label><select v-model="sel.bindingKind"><option value="none">无</option><option value="sql">SQL</option></select></label>
          <textarea v-model="sel.sqlText" rows="3"></textarea>
        </template>
        <template v-if="sel.type === 'chart'">
          <select v-model="sel.chartKind"><option value="line">折线</option><option value="bar">柱状</option></select>
        </template>
        <template v-if="sel.type === 'signature'">
          <input v-model="sel.signerLabel" placeholder="签署说明" />
          <label class="lab">签名库
            <select :value="sel.signatureAssetId" class="ddl" @change="onPickSigLibrary($event)">
              <option value="">不使用库条目（手写/粘贴）</option>
              <option v-for="s in sigChoices" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
          <small class="muted">手写板仍可覆盖当前预览图的 imageSrc；库 id 会与模版一并保存。</small>
        </template>
        <template v-if="sel.type === 'image'">
          <textarea v-model="sel.imageSrc" rows="2" placeholder="URL / data URL"></textarea>
        </template>
        <button type="button" class="del" @click="delSel">删除</button>
      </aside>
      <aside v-else class="right grey"><p>点选画布控件。</p></aside>
    </div>

    <HeaderFooterZoneDialog v-model="dlgHdr" :tmpl="editing" :sheet="sh" zone="header" />
    <HeaderFooterZoneDialog v-model="dlgFtr" :tmpl="editing" :sheet="sh" zone="footer" />
    <SignaturePadDialog v-model="dlgSig" @confirm="sigOk" />
  </div>
  <div v-else class="wait">载入中…</div>
</template>

<script setup>
import TemplateBodyCanvas from "@/components/report-template/TemplateBodyCanvas.vue";
import HeaderFooterZoneDialog from "@/components/report-template/HeaderFooterZoneDialog.vue";
import SignaturePadDialog from "@/components/report-template/SignaturePadDialog.vue";
import * as api from "@/api/templates";
import * as sigApi from "@/api/signatures";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import { bodyElementsRef, metricsForSheet } from "@/lib/report-template/editor-sheet";
import { clampElementToLayout, cloneDeepTemplate } from "@/lib/report-template/snapshot-fingerprint";
import { refreshLayoutPresets } from "@/lib/report-template/layout-registry";
import { applyLayoutPresetToTemplate } from "@/lib/report-template/layout-apply";

const pkList = /** @type {const} */ (["A5", "A4", "A3", "Letter"]);
const paperLabel = PAPER_LABEL;
const toolbox = /** @type {const} */ (["text", "box", "image", "table", "chart", "parameter", "signature"]);
/** @type {Record<string,string>} */
const toolNames = {
  text: "文本",
  box: "色块",
  image: "图片",
  table: "表格(SQL)",
  chart: "图表",
  parameter: "数据参数",
  signature: "电子签名",
};

const route = useRoute();
const router = useRouter();

const editing = ref(null);
const selId = ref(null);
const sh = ref("body");
const dlgHdr = ref(false);
const dlgFtr = ref(false);
const dlgSig = ref(false);
const hint = ref("");
const sigChoices = ref([]);
/** @type {import('vue').Ref<import('@/lib/report-template/layout-model').LayoutPreset[]>} */
const layoutPresetsAll = ref([]);

const sel = computed(() => {
  const t = editing.value;
  if (!t || !selId.value) return null;
  return bodyElementsRef(t, sh.value).find((x) => x.id === selId.value) ?? null;
});

const bodyPresets = computed(() => layoutPresetsAll.value.filter((p) => p.pageRole === "normal"));
const coverPresets = computed(() => layoutPresetsAll.value.filter((p) => p.pageRole === "cover"));
const backPresets = computed(() => layoutPresetsAll.value.filter((p) => p.pageRole === "back"));

async function loadLayoutPresetsList() {
  layoutPresetsAll.value = await refreshLayoutPresets();
}

/** @param {'body'|'cover'|'back'} slot */
function onPresetBind(slot, ev) {
  const presetId = typeof ev.target?.value === "string" ? ev.target.value : "";
  const t = editing.value;
  if (!t) return;
  if (!presetId) {
    if (slot === "body") t.layoutPresetId = null;
    else if (slot === "cover") t.coverLayoutPresetId = null;
    else t.backLayoutPresetId = null;
    hint.value = "已断开该项的版式 ID 绑定（沿用当前纸上快照）。";
    reclamp();
    return;
  }
  const p = layoutPresetsAll.value.find((x) => x.id === presetId);
  if (!p) {
    hint.value = "所选版式未找到。";
    return;
  }
  applyLayoutPresetToTemplate(t, p, slot);
  reclamp();
  hint.value =
    slot === "body"
      ? `已用「${p.name}」替换正文纸张与眉脚布局。`
      : slot === "cover"
        ? `已用「${p.name}」替换封面版式区。`
        : `已用「${p.name}」替换末页封尾版式区。`;
}

async function boot() {
  const id = String(route.params.id || "");
  if (!id) return router.replace({ name: "TemplateManager" });
  hint.value = "";
  try {
    const remote = await api.getTemplate(id);
    editing.value = cloneDeepTemplate(remote);
    await loadLayoutPresetsList();
  } catch {
    hint.value = "无法从后端载入（请开启 FastAPI）。已返回列表。";
    return router.replace({ name: "TemplateManager" });
  }
  selId.value = null;
}

function reclamp() {
  const t = editing.value;
  if (!t) return;
  for (const s of /** @type {const} */ (["body", "cover", "back"])) {
    const m = metricsForSheet(t, s);
    for (const el of bodyElementsRef(t, s)) clampElementToLayout(el, m.contentW, m.contentH);
  }
}

async function save() {
  const t = editing.value;
  if (!t) return;
  t.updatedAt = new Date().toISOString();
  t.schemaVersion = 2;
  reclamp();
  try {
    await api.putTemplate(t.id, t);
    hint.value = "已保存。";
  } catch (e) {
    hint.value = "保存失败：" + String(e.message || e);
  }
}

function back() {
  router.push({ name: "TemplateManager" });
}

function dragStart(ev, tp) {
  ev.dataTransfer.setData("application/x-template-tool", tp);
  ev.dataTransfer.setData("text/plain", tp);
}

function delSel() {
  const t = editing.value;
  if (!t || !selId.value) return;
  const arr = bodyElementsRef(t, sh.value);
  const ix = arr.findIndex((x) => x.id === selId.value);
  if (ix >= 0) arr.splice(ix, 1);
  selId.value = null;
}

function openHdr() {
  dlgHdr.value = true;
}

function openFtr() {
  dlgFtr.value = true;
}

function openSigIf() {
  if (!sel.value || sel.value.type !== "signature") {
    hint.value = "请先选中「电子签名」控件再打开手写板。";
    return;
  }
  dlgSig.value = true;
}

function sigOk(dataUrl) {
  if (!sel.value || sel.value.type !== "signature") return;
  sel.value.imageSrc = dataUrl;
}

async function refreshSigChoices() {
  try {
    sigChoices.value = await sigApi.listSignatures();
  } catch {
    sigChoices.value = [];
  }
}

async function onPickSigLibrary(ev) {
  const id = typeof ev.target?.value === "string" ? ev.target.value : "";
  if (!sel.value || sel.value.type !== "signature") return;
  sel.value.signatureAssetId = id;
  if (!id) {
    hint.value = "已清空签名库绑定。";
    return;
  }
  try {
    const a = await sigApi.getSignature(id);
    sel.value.imageSrc = a.imageSrc;
    hint.value = "已从签名库载入图像。";
  } catch {
    hint.value = "读取签名条目失败";
  }
}

function onKey(ev) {
  const t = ev.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
  if (ev.key === "Delete" || ev.key === "Backspace") delSel();
}

onMounted(async () => {
  await boot();
  refreshSigChoices();
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<style scoped>
.ted {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 48px);
  min-height: 0;
}
.ted-top {
  flex: none;
  border-bottom: 1px solid #e4e4e7;
  background: #fafafa;
}
.preset-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 6px 8px 8px;
  font-size: 12px;
}
.preset-bar-label {
  font-weight: 600;
  color: #3f3f46;
}
.preset-lbl {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #52525b;
}
.preset-ddl {
  min-width: 140px;
  max-width: 220px;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
}
.preset-empty {
  color: #71717a;
}
.wait {
  padding: 2rem;
  color: #71717a;
}
.bar {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-bottom: none;
  background: transparent;
}
.link {
  border: none;
  background: none;
  color: #4f46e5;
  cursor: pointer;
  font-size: 14px;
}
.name {
  flex: 1;
  max-width: 280px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
}
.ddl {
  padding: 4px;
  border-radius: 6px;
}
.btn {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
}
.note {
  font-size: 12px;
  color: #71717a;
}
.cols {
  flex: 1;
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 260px;
  min-height: 0;
}
.left {
  padding: 8px;
  border-right: 1px solid #e4e4e7;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.left h5 {
  margin: 4px 0 0;
  font-size: 12px;
}
.left button.on {
  outline: 2px solid #6366f1;
}
.tool {
  border: 1px dashed #999;
  background: #fff;
  cursor: grab;
  padding: 10px 8px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: 6px;
  text-align: left;
  touch-action: manipulation;
}
.mid {
  min-height: 0;
}
.right {
  border-left: 1px solid #e4e4e7;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  font-size: 13px;
}
.right.grey {
  background: #fafafa;
  color: #71717a;
}
.right label {
  font-size: 12px;
  display: flex;
  gap: 4px;
  align-items: center;
}
.right .lab {
  align-items: stretch;
  flex-direction: column;
}
.right .muted {
  display: block;
  font-size: 11px;
  color: #71717a;
  line-height: 1.3;
}
.del {
  border: 1px solid #fca5a5;
  background: #fff;
  color: #991b1b;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
}
</style>
