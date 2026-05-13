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
        <button type="button" class="b" @click="mode = mode === 'list' ? 'thumbs' : 'list'">
          {{ mode === "list" ? "缩略图" : "列表" }}
        </button>
        <button type="button" class="b primary" @click="handleCreateBlank">新建版式</button>
      </div>
    </header>
    <p v-if="msg" class="msg">{{ msg }}</p>
    <p v-if="offline" class="warn">
      无法连接后端，列表与保存使用浏览器本地（可与「设置 › 浏览器数据迁移」上传到服务器）。
    </p>

    <table v-if="mode === 'list'" class="tbl">
      <thead>
        <tr>
          <th>名称</th>
          <th>用途</th>
          <th>纸张</th>
          <th>更新</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!filteredPresets.length">
          <td colspan="5" class="empty">暂无版式。</td>
        </tr>
        <tr v-for="p in filteredPresets" :key="p.id">
          <td>{{ p.name }}</td>
          <td>{{ roleLabel(p.pageRole) }}</td>
          <td>{{ dimFor(p) }}</td>
          <td>{{ fmtUpdated(p.updatedAt) }}</td>
          <td>
            <a href="#" class="lnk" @click.prevent="goEditor(p.id)">编辑</a>
            <a href="#" class="lnk danger" @click.prevent="removePreset(p.id)">删除</a>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="grid">
      <div v-for="p in filteredPresets" :key="'card-' + p.id" class="card">
        <div class="micro-wrap">
          <LayoutPresetMiniPage :preset="p" :max-width-px="200" :max-height-px="260" />
        </div>
        <div class="foot">
          <b>{{ p.name }}</b>
          {{ roleLabel(p.pageRole) }} · {{ dimFor(p) }} · {{ fmtUpdated(p.updatedAt) }}
          <a href="#" class="lnk" @click.prevent="goEditor(p.id)">编辑</a>
          <a href="#" class="lnk danger" @click.prevent="removePreset(p.id)">删除</a>
        </div>
      </div>
      <div v-if="mode === 'thumbs' && !filteredPresets.length" class="empty-grid">暂无版式，请点击「新建版式」。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { LocationQuery } from "vue-router";
import LayoutPresetMiniPage from "@/components/report-template/LayoutPresetMiniPage.vue";
import type { LayoutPageRole, LayoutPreset } from "@/lib/report-template/layout-model";
import {
  createEmptyLayoutPreset,
  LAYOUT_PAGE_ROLE_LABEL,
} from "@/lib/report-template/layout-model";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import {
  deleteLayoutPresetFlexible,
  refreshLayoutPresets,
  saveLayoutPresetFlexible,
  isLayoutsOffline,
} from "@/lib/report-template/layout-registry";

const route = useRoute();
const router = useRouter();

const mode = ref<"list" | "thumbs">("thumbs");
const roleFilter = ref<"all" | LayoutPageRole>("all");
const msg = ref("");
const presets = ref<LayoutPreset[]>([]);
const offline = computed(() => isLayoutsOffline());

const filteredPresets = computed(() => {
  if (roleFilter.value === "all") return presets.value;
  return presets.value.filter((p) => p.pageRole === roleFilter.value);
});

function roleLabel(r: LayoutPageRole) {
  return LAYOUT_PAGE_ROLE_LABEL[r];
}

function dimFor(p: LayoutPreset) {
  return PAPER_LABEL[p.paperKind] + (p.orientation === "landscape" ? " · 横" : " · 纵");
}

function fmtUpdated(at: string) {
  return (at || "").replace("T", " ").slice(0, 19);
}

async function reload() {
  msg.value = "";
  presets.value = await refreshLayoutPresets();
}

function goEditor(id: string) {
  router.push({ name: "LayoutPresetEditor", params: { id } });
}

async function removePreset(id: string) {
  if (!confirm("删除此版式？引用它的模版会失去关联 ID，请先确认模版侧已调整。")) return;
  msg.value = "";
  try {
    await deleteLayoutPresetFlexible(id);
    await reload();
    msg.value = "已删除。";
  } catch (e) {
    msg.value = "删除失败：" + String((e as Error).message || e);
  }
}

function parseRouteRole(q: LocationQuery): LayoutPageRole | undefined {
  const raw = typeof q.role === "string" ? q.role : Array.isArray(q.role) ? q.role[0] : undefined;
  if (raw === "cover" || raw === "normal" || raw === "back") return raw;
  return undefined;
}

async function createPreset(initialRole?: LayoutPageRole): Promise<string | null> {
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
    roleFilter.value =
      initialRole === "normal" ? "normal" : initialRole === "cover" ? "cover" : "back";
  } else {
    fresh.name = "新建版式";
  }
  try {
    await saveLayoutPresetFlexible(fresh);
    await reload();
    return fresh.id;
  } catch (e) {
    msg.value = "创建失败：" + String((e as Error).message || e);
    return null;
  }
}

async function handleCreateBlank() {
  const id = await createPreset();
  if (id) goEditor(id);
}

async function applyRouteIntent() {
  const roleHint = parseRouteRole(route.query);
  if (roleHint) roleFilter.value = roleHint;
  const wantNew = route.query.new === "1" || route.query.new === 1;
  if (!wantNew) return;
  await router.replace({
    path: route.path,
    hash: route.hash,
    query: roleHint ? { role: roleHint } : {},
  });
  const id = await createPreset(roleHint);
  if (id) router.push({ name: "LayoutPresetEditor", params: { id } });
}

watch(
  () => route.fullPath,
  async () => {
    if (route.name !== "LayoutPresets") return;
    if (route.query.new !== "1" && route.query.new !== 1) return;
    await applyRouteIntent();
  },
);

onMounted(async () => {
  await reload();
  await applyRouteIntent();
});
</script>

<style scoped>
.lp {
  padding: 0 4px;
  touch-action: manipulation;
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
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.b {
  padding: 8px 14px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  touch-action: manipulation;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.inp {
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  background: #fff;
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
  margin-top: 12px;
  font-size: 14px;
  background: #fff;
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
  min-height: 44px;
  margin-right: 10px;
  color: #4f46e5;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
}
.lnk.danger {
  color: #b91c1c;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.card {
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  touch-action: manipulation;
}
.micro-wrap {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 200px;
  padding: 8px;
  background: #f4f4f5;
  border-radius: 8px;
  -webkit-overflow-scrolling: touch;
  overflow: auto;
}
.foot {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #3f3f46;
}
.empty-grid {
  grid-column: 1 / -1;
  text-align: center;
  color: #71717a;
  padding: 32px;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
}
</style>
