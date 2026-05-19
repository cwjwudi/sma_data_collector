<template>
  <div class="page tm">
    <header class="hdr">
      <h2 class="page-title">模版管理</h2>
      <div>
        <button type="button" class="b" @click="mode = mode === 'list' ? 'thumbs' : 'list'">
          {{ mode === "list" ? "缩略图" : "列表" }}
        </button>
        <button type="button" class="b primary" @click="wizard = true">新建整份模版…</button>
      </div>
    </header>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <table v-if="mode === 'list'" class="tbl">
      <thead>
        <tr>
          <th>名称</th>
          <th>纸张</th>
          <th>更新</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td colspan="4" class="empty">暂无模版</td>
        </tr>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ r.name }}</td>
          <td>{{ r.dim }}</td>
          <td>{{ r.updated }}</td>
          <td class="td-act">
            <div class="foot-actions foot-actions--table">
              <a
                href="#"
                class="lnk"
                title="仅在编辑器中编排正文画布上的控件与眉脚元素"
                @click.prevent="goEditor(r.id)"
                >改正文</a
              >
              <a href="#" class="lnk danger" @click.prevent="delTpl(r.id)">删除</a>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="grid">
      <div v-for="r in rows" :key="'g' + r.id" class="card">
        <template v-if="cache[r.id]">
          <div class="row3">
            <div class="micro">
              <span class="micro-t">封面</span>
              <div class="micro-body">
                <TemplateMiniPage
                  :template="cache[r.id]"
                  sheet="cover"
                  :max-width-px="230"
                  :max-height-px="300"
                />
              </div>
              <label class="micro-lab">版式</label>
              <select
                class="micro-preset"
                :value="boundPresetId(cache[r.id], 'cover')"
                @change="onApplyPreset(r.id, 'cover', $event)"
              >
                <option value="">选用已建版式…</option>
                <option v-for="p in coverPresetsList" :key="'pc-' + p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <button type="button" class="b-micro" @click.stop="goLayoutsNew('cover')">新建封面版式</button>
            </div>
            <div class="micro">
              <span class="micro-t">页眉 · 页脚 · 正文纸</span>
              <div class="micro-body bands">
                <TemplateMiniBands
                  :template="cache[r.id]"
                  sheet="body"
                  gap-label="正文区（示意省略）"
                  :max-width-px="230"
                  :max-height-px="300"
                />
              </div>
              <label class="micro-lab">正文版式</label>
              <select
                class="micro-preset"
                :value="boundPresetId(cache[r.id], 'body')"
                @change="onApplyPreset(r.id, 'body', $event)"
              >
                <option value="">选用已建版式…</option>
                <option v-for="p in bodyPresetsList" :key="'pb-' + p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <button type="button" class="b-micro" @click.stop="goLayoutsNew('normal')">新建正文版式（眉脚）</button>
            </div>
            <div class="micro">
              <span class="micro-t">封尾 · 末页</span>
              <div class="micro-body">
                <TemplateMiniPage
                  :template="cache[r.id]"
                  sheet="back"
                  :max-width-px="230"
                  :max-height-px="300"
                />
              </div>
              <label class="micro-lab">版式</label>
              <select
                class="micro-preset"
                :value="boundPresetId(cache[r.id], 'back')"
                @change="onApplyPreset(r.id, 'back', $event)"
              >
                <option value="">选用已建版式…</option>
                <option v-for="p in backPresetsList" :key="'pk-' + p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <button type="button" class="b-micro" @click.stop="goLayoutsNew('back')">新建末页版式</button>
            </div>
          </div>
        </template>
        <div v-else class="skel">加载…</div>
        <div class="foot">
          <div class="foot-meta">
            <b class="foot-template-name">{{ r.name }}</b>
            <span class="foot-template-meta">{{ r.dim }} · {{ r.updated }}</span>
          </div>
          <div class="foot-actions">
            <a
              href="#"
              class="lnk"
              title="仅在编辑器中编排正文画布上的控件与眉脚元素"
              @click.prevent="goEditor(r.id)"
              >改正文</a
            >
            <a href="#" class="lnk danger" @click.prevent="delTpl(r.id)">删除</a>
          </div>
        </div>
      </div>
    </div>

    <NewTemplateWizardDialog v-model="wizard" @created="created" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import * as api from "@/api/templates";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import {
  clampElementToLayout,
  cloneDeepTemplate,
} from "@/lib/report-template/snapshot-fingerprint";
import { bodyElementsRef, metricsForSheet } from "@/lib/report-template/editor-sheet";
import { applyLayoutPresetToTemplate, resyncTemplateBoundPresets } from "@/lib/report-template/layout-apply";
import { refreshLayoutPresets } from "@/lib/report-template/layout-registry";
import {
  loadTemplates as loadLocal,
  saveTemplates,
  ensureBodyPages,
  syncLegacyElementsAlias,
  TEMPLATE_SCHEMA_VERSION,
} from "@/lib/report-template/model";
import TemplateMiniPage from "@/components/report-template/TemplateMiniPage.vue";
import TemplateMiniBands from "@/components/report-template/TemplateMiniBands.vue";
import NewTemplateWizardDialog from "@/components/report-template/NewTemplateWizardDialog.vue";

const router = useRouter();
const mode = ref("thumbs");
const wizard = ref(false);
const msg = ref("");
const summaries = ref([]);
const cache = ref({});
const offline = ref(false);
/** @type {import('vue').Ref<import('@/lib/report-template/layout-model').LayoutPreset[]>} */
const layoutPresetsAll = ref([]);

const coverPresetsList = computed(() =>
  layoutPresetsAll.value.filter((p) => p.pageRole === "cover"),
);
const bodyPresetsList = computed(() =>
  layoutPresetsAll.value.filter((p) => p.pageRole === "normal"),
);
const backPresetsList = computed(() =>
  layoutPresetsAll.value.filter((p) => p.pageRole === "back"),
);

const rows = computed(() =>
  summaries.value.map((s) => ({
    id: s.id,
    name: s.name,
    dim: PAPER_LABEL[s.paperKind] + (s.orientation === "landscape" ? "·横" : "·纵"),
    updated: (s.updatedAt || "").replace("T", " ").slice(0, 19),
  })),
);

async function load() {
  msg.value = "";
  try {
    const list = await api.listTemplateSummaries();
    summaries.value = list;
    offline.value = false;
  } catch {
    offline.value = true;
    const local = loadLocal();
    summaries.value = local.map((t) => ({
      id: t.id,
      name: t.name,
      updatedAt: t.updatedAt,
      paperKind: t.paperKind,
      orientation: t.orientation,
    }));
    msg.value = "无法连接后端，已显示本地模版摘要。";
    cache.value = Object.fromEntries(local.map((t) => [t.id, t]));
  }
}

async function hydrateThumbs() {
  for (const s of summaries.value) {
    if (cache.value[s.id]) continue;
    try {
      const t = await api.getTemplate(s.id);
      cache.value[s.id] = t;
    } catch {
      cache.value[s.id] = null;
    }
  }
}

async function loadPresets() {
  try {
    layoutPresetsAll.value = await refreshLayoutPresets();
  } catch {
    layoutPresetsAll.value = [];
  }
}

/** 缩略图缓存中的模版：按绑定 ID 拉齐版式库最新快照（仅内存，不写服务器） */
function resyncAllCachedTemplates() {
  const presets = layoutPresetsAll.value;
  if (!presets.length) return;
  for (const id of Object.keys(cache.value)) {
    const t = cache.value[id];
    if (t && typeof t === "object") {
      resyncTemplateBoundPresets(t, presets);
      reclampTemplate(t);
    }
  }
}

/** @param {import('@/lib/report-template/model').ReportTemplate} t */
function reclampTemplate(t) {
  const pages = ensureBodyPages(t);
  syncLegacyElementsAlias(t);
  for (const s of /** @type {const} */ (["body", "cover", "back"])) {
    const m = metricsForSheet(t, s);
    if (s === "body") {
      for (const row of pages) {
        for (const el of row) clampElementToLayout(el, m.contentW, m.contentH);
      }
    } else {
      for (const el of bodyElementsRef(t, s)) clampElementToLayout(el, m.contentW, m.contentH);
    }
  }
}

/** @param {import('@/lib/report-template/model').ReportTemplate} t @param {'cover'|'body'|'back'} slot */
function boundPresetId(t, slot) {
  if (slot === "cover") return t.coverLayoutPresetId || "";
  if (slot === "body") return t.layoutPresetId || "";
  return t.backLayoutPresetId || "";
}

/** @param {string} templateId @param {'cover'|'body'|'back'} slot */
async function onApplyPreset(templateId, slot, ev) {
  const presetId = typeof ev.target?.value === "string" ? ev.target.value : "";
  const t = cache.value[templateId];
  if (!t) return;
  msg.value = "";

  if (!presetId) {
    if (slot === "body") t.layoutPresetId = null;
    else if (slot === "cover") t.coverLayoutPresetId = null;
    else t.backLayoutPresetId = null;
    reclampTemplate(t);
    await persistFullTemplate(t);
    return;
  }

  const expectedRole = slot === "body" ? "normal" : slot;
  const p = layoutPresetsAll.value.find((x) => x.id === presetId);
  if (!p || p.pageRole !== expectedRole) {
    msg.value = "所选条目与用途不匹配或未找到。";
    ev.target.value = boundPresetId(t, slot);
    return;
  }

  applyLayoutPresetToTemplate(t, p, slot);
  reclampTemplate(t);
  await persistFullTemplate(t);
}

/** @param {import('@/lib/report-template/model').ReportTemplate} t */
async function persistFullTemplate(t) {
  ensureBodyPages(t);
  syncLegacyElementsAlias(t);
  t.updatedAt = new Date().toISOString();
  t.schemaVersion = TEMPLATE_SCHEMA_VERSION;
  try {
    await api.putTemplate(t.id, t);
    msg.value = "已更新该模版的版式引用并保存。";
    summaries.value = summaries.value.map((s) =>
      s.id === t.id ? { ...s, updatedAt: t.updatedAt } : s,
    );
  } catch {
    const list = loadLocal();
    const ix = list.findIndex((x) => x.id === t.id);
    if (ix >= 0) list[ix] = t;
    else list.push(t);
    saveTemplates(list);
    offline.value = true;
    msg.value = "已写入本机模版库并已保存。"
    summaries.value = summaries.value.map((s) =>
      s.id === t.id ? { ...s, updatedAt: t.updatedAt } : s,
    );
  }
}

watch(
  () => mode.value,
  async (m) => {
    if (m !== "thumbs") return;
    await loadPresets();
    if (!offline.value) await hydrateThumbs();
    else {
      const local = loadLocal();
      cache.value = Object.fromEntries(local.map((x) => [x.id, x]));
    }
    resyncAllCachedTemplates();
  },
);

function goLayoutsNew(role) {
  router.push({
    path: "/layouts",
    query: role ? { new: "1", role } : { new: "1" },
  });
}

function goEditor(id) {
  router.push({ name: "TemplateEditor", params: { id } });
}

async function delTpl(id) {
  if (!confirm("删除此模版？")) return;
  try {
    await api.deleteTemplate(id);
  } catch {
    /* ignore offline */
  }
  summaries.value = summaries.value.filter((x) => x.id !== id);
  delete cache.value[id];
}

async function created(t) {
  try {
    await api.putTemplate(t.id, t);
  } catch {
    const list = loadLocal();
    if (!list.some((x) => x.id === t.id)) {
      list.push(t);
      saveTemplates(list);
    }
    msg.value += " 新建模版已写入本机 localStorage；可在「设置 › 浏览器数据迁移」上传到服务器。";
  }
  cache.value[t.id] = cloneDeepTemplate(t);
  summaries.value = [
    {
      id: t.id,
      name: t.name,
      updatedAt: t.updatedAt,
      paperKind: t.paperKind,
      orientation: t.orientation,
    },
    ...summaries.value.filter((x) => x.id !== t.id),
  ];
  goEditor(t.id);
}

onMounted(async () => {
  await load();
  if (mode.value === "thumbs") {
    await loadPresets();
    if (!offline.value) await hydrateThumbs();
    else {
      const local = loadLocal();
      cache.value = Object.fromEntries(local.map((x) => [x.id, x]));
    }
    resyncAllCachedTemplates();
  }
});
</script>

<style scoped>
.tm {
  padding: 0 4px;
  touch-action: manipulation;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.b {
  margin-left: 8px;
  padding: 8px 14px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  touch-action: manipulation;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.msg {
  font-size: 12px;
  color: #b45309;
  margin: 8px 0;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 14px;
}
.tbl th,
.tbl td {
  border: 1px solid #e4e4e7;
  padding: 8px;
  text-align: left;
}
.empty {
  color: #71717a;
  padding: 24px;
  text-align: center;
}
.lnk {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 44px;
  padding: 0 14px;
  box-sizing: border-box;
  margin: 0;
  border-radius: 6px;
  color: #4f46e5;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(79, 70, 229, 0.12);
}
.lnk:active {
  background: rgba(79, 70, 229, 0.08);
}
.lnk.danger {
  color: #b91c1c;
}
.lnk.danger:active {
  background: rgba(185, 28, 28, 0.08);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(700px, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.card {
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  touch-action: manipulation;
}
.row3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}
@media (max-width: 920px) {
  .row3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .row3 {
    grid-template-columns: 1fr;
  }
}
.micro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #eef0f6;
  border-radius: 8px;
  background: #fcfcfd;
}
.micro-t {
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
}
.micro-body {
  min-height: 312px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
}
.micro-body.bands {
  margin-top: 4px;
}
.micro-lab {
  align-self: stretch;
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.micro-preset {
  align-self: stretch;
  width: 100%;
  min-height: 44px;
  padding: 6px 8px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  font-size: 12px;
  color: #1e293b;
  cursor: pointer;
  touch-action: manipulation;
}
.b-micro {
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
  touch-action: manipulation;
}
.b-micro:hover {
  background: #e0e7ff;
}
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 16px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f4f4f5;
  font-size: 13px;
  line-height: 1.5;
}
.foot-meta {
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.foot-template-name {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  color: #0f172a;
}
.foot-template-meta {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
}
.foot-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.foot-actions--table {
  justify-content: flex-end;
}
.td-act {
  white-space: nowrap;
  vertical-align: middle;
}
.skel {
  min-height: 120px;
  color: #71717a;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
}
</style>
