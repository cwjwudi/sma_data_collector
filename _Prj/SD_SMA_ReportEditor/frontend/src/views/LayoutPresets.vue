<template>
  <div class="page lp">
    <header class="hdr">
      <h2 class="page-title">版式与页眉页脚</h2>
      <div class="hdr-row">
        <label class="flab">
          页面用途筛选
          <select v-model="roleFilter" class="inp">
            <option value="all">全部</option>
            <option value="normal">正文页</option>
            <option value="cover">封面</option>
            <option value="back">末页</option>
          </select>
        </label>
        <button type="button" class="b primary" @click="createPreset">新建版式</button>
      </div>
    </header>
    <p v-if="msg" class="msg">{{ msg }}</p>
    <p v-if="offline" class="warn">
      无法连接后端，列表与保存使用浏览器本地（可与「设置 › 浏览器数据迁移」上传到服务器）。
    </p>

    <div class="split">
      <div class="left">
        <table class="tbl">
          <thead>
            <tr>
              <th>名称</th>
              <th>用途</th>
              <th>纸张</th>
              <th>更新</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredRows.length">
              <td colspan="4" class="empty">暂无版式。</td>
            </tr>
            <tr
              v-for="r in filteredRows"
              :key="r.id"
              :class="{ sel: selId === r.id }"
              class="crow"
              @click="pick(r.id)"
            >
              <td>{{ r.name }}</td>
              <td>{{ roleLabel(r.pageRole) }}</td>
              <td>{{ r.dim }}</td>
              <td>{{ r.updated }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="working" class="detail">
        <h3 class="dh">编辑「{{ working.name }}」</h3>
        <div class="grid-form">
          <label>名称<input v-model.trim="working.name" class="inp" /></label>
          <label>
            页面用途（pageRole）
            <select v-model="working.pageRole" class="inp">
              <option value="normal">正文页 · _repeat 中间页</option>
              <option value="cover">封面 · 首页</option>
              <option value="back">末页 · 封尾</option>
            </select>
          </label>
          <label>
            纸张
            <select v-model="working.paperKind" class="inp">
              <option v-for="pk in pkList" :key="pk" :value="pk">{{ PAPER_LABEL[pk] }}</option>
            </select>
          </label>
          <label>
            方向
            <select v-model="working.orientation" class="inp">
              <option value="portrait">纵向</option>
              <option value="landscape">横向</option>
            </select>
          </label>
          <label v-for="fld in mmFields" :key="fld.k">
            {{ fld.lab }}（mm）<input v-model.number="working[fld.k]" type="number" min="0" class="inp" />
          </label>
        </div>
        <p class="muted">
          <strong>画布</strong>与「模板管理」一致：同一页上显示页眉带、正文区、页脚带，可缩放平移。从左侧将控件拖入对应灰色带或正文区。
        </p>
        <div class="pe-cols">
          <aside class="pe-left">
            <h5 class="pe-h5">拖拽到画布</h5>
            <button
              v-for="t in presetToolTypes"
              :key="t"
              type="button"
              class="pe-tool"
              draggable="true"
              @dragstart="(e) => onPresetToolDragStart(e, t)"
            >
              {{ presetToolLabels[t] }}
            </button>
            <p class="pe-hint">
              <strong>Ctrl / ⌘ + 滚轮</strong>缩放画布；拖入后点选可改属性；末页/封面版式同样适用。
            </p>
            <button type="button" class="b ghost" @click="openPopupEditor">全屏放大编辑…</button>
          </aside>
          <main class="pe-mid">
            <LayoutPresetPaperCanvas v-model:selected-id="presetCanvasSelId" :preset="working" />
          </main>
          <aside class="pe-right">
            <LayoutPresetElementProps :el="selectedPresetEl" @remove="removeSelectedPresetEl" />
          </aside>
        </div>
        <div class="foot-actions">
          <button type="button" class="b primary" @click="savePreset" :disabled="saving">保存版式</button>
          <button type="button" class="b danger-outline" @click="removePreset">删除</button>
        </div>
      </div>
      <div v-else class="detail grey">请先在左侧选择一个版式，或点击「新建版式」。</div>
    </div>

    <LayoutPresetZonesDialog
      v-if="working"
      v-model="dlgOpen"
      v-model:selected-id="presetCanvasSelId"
      :preset="working"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { LocationQuery } from "vue-router";
import LayoutPresetZonesDialog from "@/components/report-template/LayoutPresetZonesDialog.vue";
import LayoutPresetPaperCanvas from "@/components/report-template/LayoutPresetPaperCanvas.vue";
import LayoutPresetElementProps from "@/components/report-template/LayoutPresetElementProps.vue";
import type { LayoutPageRole, LayoutPreset } from "@/lib/report-template/layout-model";
import type { LayoutControlType } from "@/lib/report-template/layout-zone-element";
import {
  createEmptyLayoutPreset,
  hydrateLayoutPreset,
  LAYOUT_PAGE_ROLE_LABEL,
} from "@/lib/report-template/layout-model";
import { PAPER_LABEL, type PaperKind } from "@/lib/report-template/paper";
import {
  deleteLayoutPresetFlexible,
  refreshLayoutPresets,
  saveLayoutPresetFlexible,
  isLayoutsOffline,
} from "@/lib/report-template/layout-registry";

const pkList = ["A5", "A4", "A3", "Letter"] as PaperKind[];

const route = useRoute();
const router = useRouter();

const roleFilter = ref<"all" | LayoutPageRole>("all");
const msg = ref("");
const saving = ref(false);
const presets = ref<LayoutPreset[]>([]);
const selId = ref<string | null>(null);
const working = ref<LayoutPreset | null>(null);
const offline = computed(() => isLayoutsOffline());

const dlgOpen = ref(false);
const presetCanvasSelId = ref<string | null>(null);

const presetToolLabels: Record<LayoutControlType, string> = {
  text: "文本",
  box: "色块",
  image: "图片",
  pageNumber: "页码",
  date: "日期",
};
const presetToolTypes: LayoutControlType[] = ["text", "box", "image", "pageNumber", "date"];

function onPresetToolDragStart(e: DragEvent, t: LayoutControlType) {
  e.dataTransfer?.setData("application/x-zone-tool", t);
  e.dataTransfer?.setData("text/plain", t);
}

const selectedPresetEl = computed(() => {
  const w = working.value;
  const id = presetCanvasSelId.value;
  if (!w || !id) return null;
  const h = w.headerElements.find((x) => x.id === id);
  if (h) return h;
  const f = w.footerElements.find((x) => x.id === id);
  if (f) return f;
  return w.bodyElements.find((x) => x.id === id) ?? null;
});

function removeSelectedPresetEl() {
  const w = working.value;
  const id = presetCanvasSelId.value;
  if (!w || !id) return;
  for (const arr of [w.headerElements, w.footerElements, w.bodyElements]) {
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) {
      arr.splice(i, 1);
      presetCanvasSelId.value = null;
      return;
    }
  }
}

const mmFields = [
  { k: "marginTopMm" as const, lab: "上边距" },
  { k: "marginRightMm" as const, lab: "右边距" },
  { k: "marginBottomMm" as const, lab: "下边距" },
  { k: "marginLeftMm" as const, lab: "左边距" },
  { k: "headerBandMm" as const, lab: "页眉带高度" },
  { k: "footerBandMm" as const, lab: "页脚带高度" },
];

const rows = computed(() =>
  presets.value.map((p) => ({
    id: p.id,
    name: p.name,
    pageRole: p.pageRole,
    dim: PAPER_LABEL[p.paperKind] + (p.orientation === "landscape" ? " · 横" : " · 纵"),
    updated: (p.updatedAt || "").replace("T", " ").slice(0, 19),
  })),
);

const filteredRows = computed(() => {
  if (roleFilter.value === "all") return rows.value;
  return rows.value.filter((r) => r.pageRole === roleFilter.value);
});

function roleLabel(r: LayoutPageRole) {
  return LAYOUT_PAGE_ROLE_LABEL[r];
}

async function reload() {
  msg.value = "";
  presets.value = await refreshLayoutPresets();
}

function clonePreset(p: LayoutPreset): LayoutPreset {
  return hydrateLayoutPreset(JSON.parse(JSON.stringify(p)));
}

function pick(id: string) {
  selId.value = id;
  const p = presets.value.find((x) => x.id === id);
  working.value = p ? clonePreset(p) : null;
  presetCanvasSelId.value = null;
}

function parseRouteRole(q: LocationQuery): LayoutPageRole | undefined {
  const raw = typeof q.role === "string" ? q.role : Array.isArray(q.role) ? q.role[0] : undefined;
  if (raw === "cover" || raw === "normal" || raw === "back") return raw;
  return undefined;
}

async function createPreset(initialRole?: LayoutPageRole) {
  msg.value = "";
  const fresh = createEmptyLayoutPreset();
  if (initialRole) {
    fresh.pageRole = initialRole;
    fresh.name =
      initialRole === "cover"
        ? "新建封面版式"
        : initialRole === "back"
          ? "新建末页版式（封尾）"
          : "新建正文版式（页眉页脚）";
    roleFilter.value = initialRole === "normal" ? "normal" : initialRole === "cover" ? "cover" : "back";
  } else {
    fresh.name = "新建版式";
  }
  await saveLayoutPresetFlexible(fresh);
  await reload();
  pick(fresh.id);
  msg.value = "已创建新版式（已尝试保存到服务器）。可在右侧完善并再次保存。";
}

/** 模版管理页的「新建 xxx 版式」跳转：?new=1&role=cover|normal|back */
async function applyRouteIntent() {
  const roleHint = parseRouteRole(route.query);
  if (roleHint) roleFilter.value = roleHint;
  const wantNew = route.query.new === "1" || route.query.new === 1;
  if (!wantNew) return;
  const cleaned: Record<string, string | undefined> = {};
  if (roleHint) cleaned.role = roleHint;
  await router.replace({
    path: route.path,
    hash: route.hash,
    query: cleaned,
  });
  await createPreset(roleHint);
}

async function savePreset() {
  const w = working.value;
  if (!w?.name.trim()) {
    msg.value = "名称不能为空。";
    return;
  }
  saving.value = true;
  msg.value = "";
  try {
    w.updatedAt = new Date().toISOString();
    await saveLayoutPresetFlexible(w);
    await reload();
    pick(w.id);
    msg.value = "版式已保存。";
  } catch (e) {
    msg.value = "保存失败：" + String((e as Error).message || e);
  } finally {
    saving.value = false;
  }
}

async function removePreset() {
  const w = working.value;
  if (!w) return;
  if (!confirm("删除此版式？引用它的模版会失去关联 ID，请先确认模版侧已调整。")) return;
  msg.value = "";
  try {
    await deleteLayoutPresetFlexible(w.id);
    working.value = null;
    selId.value = null;
    presetCanvasSelId.value = null;
    await reload();
    msg.value = "已删除。";
  } catch (e) {
    msg.value = "删除失败：" + String((e as Error).message || e);
  }
}

function openPopupEditor() {
  dlgOpen.value = true;
}

watch(
  () => route.fullPath,
  async () => {
    if (route.query.new !== "1" && route.query.new !== 1) return;
    await applyRouteIntent();
  },
);

onMounted(async () => {
  await reload();
  await applyRouteIntent();
  if (presets.value.length && !selId.value) pick(presets.value[0]!.id);
});
</script>

<style scoped>
.lp {
  padding: 0 4px;
}
.hdr-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.flab {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #3f3f46;
}
.split {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(520px, 1.6fr);
  gap: 20px;
  margin-top: 12px;
  align-items: start;
}
@media (max-width: 900px) {
  .split {
    grid-template-columns: 1fr;
  }
}
.detail {
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  padding: 14px;
  background: #fafafa;
}
.detail.grey {
  color: #71717a;
  background: #f4f4f5;
}
.dh {
  margin: 0 0 10px;
  font-size: 1rem;
}
.grid-form {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}
.grid-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #52525b;
}
.inp {
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  background: #fff;
}
.muted {
  font-size: 12px;
  color: #71717a;
  margin: 0 0 10px;
}
.pe-cols {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr) 248px;
  gap: 0;
  min-height: 480px;
  margin: 12px 0 0;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
@media (max-width: 1100px) {
  .pe-cols {
    grid-template-columns: 1fr;
  }
  .pe-left,
  .pe-right {
    border: none !important;
    border-bottom: 1px solid #e4e4e7 !important;
  }
}
.pe-left {
  padding: 10px;
  border-right: 1px solid #e4e4e7;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fafafa;
  overflow: auto;
}
.pe-h5 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
}
.pe-tool {
  border: 1px dashed #999;
  background: #fff;
  cursor: grab;
  padding: 6px 8px;
  border-radius: 6px;
  text-align: left;
  touch-action: manipulation;
  font-size: 12px;
}
.pe-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #71717a;
  line-height: 1.35;
}
.pe-mid {
  min-height: 0;
  min-width: 0;
  background: #f4f4f5;
}
.pe-right {
  padding: 10px;
  border-left: 1px solid #e4e4e7;
  background: #fafafa;
  overflow: auto;
  font-size: 13px;
}
.b.ghost {
  border-style: dashed;
  background: transparent;
  font-size: 12px;
}
.foot-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.b {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.b.danger-outline {
  border-color: #f87171;
  color: #b91c1c;
}
.msg {
  font-size: 12px;
  color: #b45309;
  margin: 8px 0 0;
}
.warn {
  font-size: 12px;
  color: #a16207;
  margin: 8px 0 0;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  background: #fff;
}
.tbl th,
.tbl td {
  border: 1px solid #e4e4e7;
  padding: 8px;
  text-align: left;
}
.crow {
  cursor: pointer;
}
.crow:hover {
  background: #fafafa;
}
.crow.sel {
  outline: 2px solid #6366f1;
  background: rgb(238 242 255);
}
.empty {
  color: #71717a;
  padding: 24px;
  text-align: center;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
}
</style>
