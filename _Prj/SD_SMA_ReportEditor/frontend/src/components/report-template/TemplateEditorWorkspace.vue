<template>
  <div class="ted" v-if="editing">
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
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import { bodyElementsRef, metricsForSheet } from "@/lib/report-template/editor-sheet";
import { clampElementToLayout, cloneDeepTemplate } from "@/lib/report-template/snapshot-fingerprint";

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

const sel = computed(() => {
  const t = editing.value;
  if (!t || !selId.value) return null;
  return bodyElementsRef(t, sh.value).find((x) => x.id === selId.value) ?? null;
});

async function boot() {
  const id = String(route.params.id || "");
  if (!id) return router.replace({ name: "TemplateManager" });
  hint.value = "";
  try {
    const remote = await api.getTemplate(id);
    editing.value = cloneDeepTemplate(remote);
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

function onKey(ev) {
  const t = ev.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
  if (ev.key === "Delete" || ev.key === "Backspace") delSel();
}

onMounted(() => {
  boot();
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
  border-bottom: 1px solid #e4e4e7;
  background: #fafafa;
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
  padding: 6px;
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
.del {
  border: 1px solid #fca5a5;
  background: #fff;
  color: #991b1b;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
}
</style>
