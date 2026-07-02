<template>
  <div class="page lp">
    <header class="hdr">
      <h2 class="page-title">版式与页眉页脚</h2>
      <div class="hdr-row">
        <label class="flab">
          显示范围
          <select v-model="roleFilter" class="inp">
            <option value="all">全部（分栏展示）</option>
            <option value="normal">正文页</option>
            <option value="cover">封面</option>
            <option value="back">末页</option>
          </select>
        </label>
        <button type="button" class="b" @click="mode = mode === 'list' ? 'thumbs' : 'list'">
          {{ mode === "list" ? "缩略图" : "列表" }}
        </button>
      </div>
    </header>
    <p v-if="loading" class="loading-hint">正在加载版式，请稍候…</p>
    <p v-else-if="msg" class="msg">{{ msg }}</p>
    <p v-if="offline" class="warn">
      无法连接后端，列表与保存使用浏览器本地（可与「设置 › 浏览器数据迁移」上传到服务器）。
    </p>
    <p v-if="!loading && !presets.length" class="empty-all">
      当前还没有任何版式。请在下方对应分栏内点击「新建…」按钮创建封面、正文页或末页版式。
    </p>
    <p v-else-if="presets.length" class="drag-hint">
      {{
        mode === "list"
          ? "在各分类表格中拖动序号列握柄可调整该类别内的排列顺序"
          : "在各分类卡片上拖动左上角握柄可调整该类别内的排列顺序"
      }}
    </p>

    <div v-if="mode === 'list'" class="lp-stack">
      <section v-for="sec in visibleSections" :key="'list-' + sec.role" class="lp-section">
        <div class="lp-section-head">
          <h3 class="lp-section-h">{{ sec.title }}</h3>
          <button type="button" class="b primary lp-new" @click="createPresetForSection(sec.role)">
            {{ newPresetButtonLabel(sec.role) }}
          </button>
        </div>
        <table class="tbl">
            <thead>
              <tr>
                <th class="col-seq">序号</th>
                <th>名称</th>
                <th>用途</th>
                <th>纸张</th>
                <th>更新</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!presetGroups[sec.role].length">
                <td colspan="6" class="empty">此类别暂无版式。</td>
              </tr>
              <tr
                v-for="(p, i) in presetGroups[sec.role]"
                :key="p.id"
                :id="'lp-preset-' + p.id"
                :class="{
                  'lp-row--hl': highlightId === p.id,
                  'lp-row--dragging': dragId === p.id,
                  'lp-row--drag-over': dragOverId === p.id && dragId !== p.id,
                }"
                @dragover.prevent="onDragOver(sec.role, p.id)"
                @dragleave="onDragLeave(p.id)"
                @drop.prevent="onDragDrop(sec.role, p.id)"
              >
                <td class="col-seq">
                  <div class="row-seq-cell">
                    <button
                      type="button"
                      class="row-drag-handle"
                      draggable="true"
                      title="拖动排序"
                      aria-label="拖动排序"
                      @dragstart="onDragStart($event, sec.role, p.id)"
                      @dragend="onDragEnd"
                      @click.prevent
                    >
                      <svg
                        class="row-drag-handle-icon"
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="9" cy="6" r="1.5" />
                        <circle cx="15" cy="6" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" />
                        <circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="18" r="1.5" />
                        <circle cx="15" cy="18" r="1.5" />
                      </svg>
                    </button>
                    <span class="row-seq-num">{{ i + 1 }}</span>
                  </div>
                </td>
                <td>{{ p.name }}</td>
                <td>{{ roleLabel(p.pageRole) }}</td>
                <td>{{ dimFor(p) }}</td>
                <td>{{ fmtUpdated(p.updatedAt) }}</td>
                <td class="td-actions">
                  <button type="button" class="b primary" @click="goEditor(p.id)">编辑</button>
                  <button type="button" class="b" @click="duplicatePreset(p)">复制</button>
                  <button type="button" class="b danger" @click="removePreset(p.id)">删除</button>
                </td>
              </tr>
            </tbody>
        </table>
      </section>
    </div>

    <div v-else class="lp-stack">
      <section v-for="sec in visibleSections" :key="'thumbs-' + sec.role" class="lp-section">
        <div class="lp-section-head">
          <h3 class="lp-section-h">{{ sec.title }}</h3>
          <button type="button" class="b primary lp-new" @click="createPresetForSection(sec.role)">
            {{ newPresetButtonLabel(sec.role) }}
          </button>
        </div>
        <div class="grid">
            <p v-if="!presetGroups[sec.role].length" class="empty-section">此类别暂无版式。</p>
            <div
              v-for="(p, i) in presetGroups[sec.role]"
              :id="'lp-preset-' + p.id"
              :key="'card-' + p.id"
              class="card"
              :class="{
                'card--hl': highlightId === p.id,
                'card--dragging': dragId === p.id,
                'card--drag-over': dragOverId === p.id && dragId !== p.id,
              }"
              @dragover.prevent="onDragOver(sec.role, p.id)"
              @dragleave="onDragLeave(p.id)"
              @drop.prevent="onDragDrop(sec.role, p.id)"
            >
              <div class="lp-card-top">
                <button
                  type="button"
                  class="card-drag-handle"
                  draggable="true"
                  title="拖动排序"
                  aria-label="拖动排序"
                  @dragstart="onDragStart($event, sec.role, p.id)"
                  @dragend="onDragEnd"
                  @click.prevent
                >
                  <svg
                    class="card-drag-handle-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="6" r="1.5" />
                    <circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" />
                    <circle cx="15" cy="18" r="1.5" />
                  </svg>
                </button>
                <span class="lp-card-seq" aria-label="序号">{{ i + 1 }}</span>
              </div>
              <div
                class="micro-wrap"
                title="双击进入编辑"
                @dblclick="goEditor(p.id)"
              >
                <LayoutPresetMiniPage :preset="p" :max-width-px="200" :max-height-px="260" />
              </div>
              <div class="foot">
                <div class="foot-line">
                  <b>{{ p.name }}</b>
                  {{ roleLabel(p.pageRole) }} · {{ dimFor(p) }} · {{ fmtUpdated(p.updatedAt) }}
                </div>
                <div class="foot-actions">
                  <button type="button" class="b primary" @click="goEditor(p.id)">编辑</button>
                  <button type="button" class="b" @click="duplicatePreset(p)">复制</button>
                  <button type="button" class="b danger" @click="removePreset(p.id)">删除</button>
                </div>
              </div>
            </div>
        </div>
      </section>
    </div>

    <!-- Electron 等环境常禁用 window.prompt，复制命名用应用内弹层 -->
    <div v-if="dupDlg" class="lp-dup-backdrop" @click.self="closeDupDlg">
      <div class="lp-dup-modal" role="dialog" aria-modal="true" aria-labelledby="lp-dup-title">
        <h3 id="lp-dup-title" class="lp-dup-title">复制版式</h3>
        <p class="lp-dup-desc">
          将复制「{{ dupSource?.name }}」的全部页眉、页脚与装饰控件。确定后会在当前列表中新增一条版式。
        </p>
        <label class="lp-dup-lbl" for="lp-dup-name">新版式名称</label>
        <input
          id="lp-dup-name"
          ref="dupNameInputEl"
          v-model.trim="dupNameInput"
          type="text"
          class="lp-dup-inp"
          maxlength="128"
          autocomplete="off"
          @keydown.enter.prevent="confirmDuplicatePreset"
        />
        <div class="lp-dup-actions">
          <button type="button" class="b" @click="closeDupDlg">取消</button>
          <button type="button" class="b primary" :disabled="!dupNameInput.trim()" @click="confirmDuplicatePreset">
            复制
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { LocationQuery } from "vue-router";
import LayoutPresetMiniPage from "@/components/report-template/LayoutPresetMiniPage.vue";
import type { LayoutPageRole, LayoutPreset } from "@/lib/report-template/layout-model";
import {
  createEmptyLayoutPreset,
  duplicateLayoutPreset,
  LAYOUT_PAGE_ROLE_LABEL,
} from "@/lib/report-template/layout-model";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import {
  applyLayoutPresetDisplayOrders,
  insertLayoutPresetAfter,
  pruneLayoutDisplayOrder,
  reorderLayoutPresetInRole,
} from "@/lib/layout-display-order";
import {
  deleteLayoutPresetFlexible,
  refreshLayoutPresets,
  saveLayoutPresetFlexible,
  isLayoutsOffline,
  layoutPresetsSnapshot,
} from "@/lib/report-template/layout-registry";
import { useStaleGuard } from "@/composables/useStaleGuard";
import { appConfirm } from "@/composables/useAppConfirm";

const route = useRoute();
const router = useRouter();
const { begin: beginLoad, isStale: isLoadStale } = useStaleGuard();

const mode = ref<"list" | "thumbs">("thumbs");
const roleFilter = ref<"all" | LayoutPageRole>("all");
const msg = ref("");
const loading = ref(false);
const ROLE_SECTION_META: { role: LayoutPageRole; title: string }[] = [
  { role: "cover", title: "封面版式" },
  { role: "normal", title: "正文页版式（页眉页脚区）" },
  { role: "back", title: "末页版式（封尾）" },
];

const presets = ref<LayoutPreset[]>([]);
const offline = computed(() => isLayoutsOffline());

/** 复制版式：应用内命名弹层（避免 Electron 下 window.prompt 无效） */
const dupDlg = ref(false);
const dupSource = ref<LayoutPreset | null>(null);
const dupNameInput = ref("");
const dupNameInputEl = ref<HTMLInputElement | null>(null);
/** 复制成功后短暂高亮并滚动到新版式卡片/行 */
const highlightId = ref<string | null>(null);
const dragRole = ref<LayoutPageRole | null>(null);
const dragId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);

/** 按用途分组，供上下分栏各区块渲染 */
const presetGroups = computed((): Record<LayoutPageRole, LayoutPreset[]> => {
  const g: Record<LayoutPageRole, LayoutPreset[]> = {
    cover: [],
    normal: [],
    back: [],
  };
  for (const p of presets.value) {
    g[p.pageRole].push(p);
  }
  return g;
});

const visibleSections = computed(() => {
  if (roleFilter.value === "all") return ROLE_SECTION_META;
  return ROLE_SECTION_META.filter((s) => s.role === roleFilter.value);
});

function newPresetButtonLabel(role: LayoutPageRole): string {
  if (role === "cover") return "新建封面版式";
  if (role === "back") return "新建末页版式（封尾）";
  return "新建正文版式（眉脚）";
}

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
  const token = beginLoad();
  loading.value = true;
  msg.value = "";
  try {
    const list = await refreshLayoutPresets();
    if (isLoadStale(token)) return;
    presets.value = applyLayoutPresetDisplayOrders(list);
  } catch (e) {
    if (isLoadStale(token)) return;
    presets.value = [];
    msg.value = "加载版式失败：" + String((e as Error).message || e);
  } finally {
    if (!isLoadStale(token)) loading.value = false;
  }
}

function onDragStart(e: DragEvent, role: LayoutPageRole, id: string) {
  dragRole.value = role;
  dragId.value = id;
  dragOverId.value = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  const row =
    e.currentTarget instanceof HTMLElement
      ? e.currentTarget.closest("tr") || e.currentTarget.closest(".card")
      : null;
  if (row && e.dataTransfer) {
    const offsetX = row instanceof HTMLTableRowElement ? 28 : 40;
    const offsetY = row instanceof HTMLTableRowElement ? 18 : 24;
    e.dataTransfer.setDragImage(row, offsetX, offsetY);
  }
}

function onDragEnd() {
  dragRole.value = null;
  dragId.value = null;
  dragOverId.value = null;
}

function onDragOver(role: LayoutPageRole, targetId: string) {
  if (!dragId.value || dragRole.value !== role || dragId.value === targetId) return;
  dragOverId.value = targetId;
}

function onDragLeave(targetId: string) {
  if (dragOverId.value === targetId) dragOverId.value = null;
}

function onDragDrop(role: LayoutPageRole, targetId: string) {
  const fromId = dragId.value;
  const fromRole = dragRole.value;
  dragRole.value = null;
  dragId.value = null;
  dragOverId.value = null;
  if (!fromId || fromRole !== role || fromId === targetId) return;
  presets.value = reorderLayoutPresetInRole(presets.value, role, fromId, targetId);
}

function goEditor(id: string) {
  router.push({ name: "LayoutPresetEditor", params: { id } });
}

async function removePreset(id: string) {
  if (
    !(await appConfirm({
      title: "删除版式",
      message: "删除此版式？引用它的模版会失去关联 ID，请先确认模版侧已调整。",
      confirmText: "删除",
      danger: true,
    }))
  ) {
    return;
  }
  msg.value = "";
  const victim = presets.value.find((x) => x.id === id);
  try {
    await deleteLayoutPresetFlexible(id);
    if (victim) pruneLayoutDisplayOrder(id, victim.pageRole);
    await reload();
    msg.value = "已删除。";
  } catch (e) {
    msg.value = "删除失败：" + String((e as Error).message || e);
  }
}

function duplicatePreset(p: LayoutPreset) {
  dupSource.value = p;
  dupNameInput.value = `${p.name}（副本）`;
  dupDlg.value = true;
  void nextTick(() => {
    dupNameInputEl.value?.focus();
    dupNameInputEl.value?.select();
  });
}

function closeDupDlg() {
  dupDlg.value = false;
  dupSource.value = null;
}

async function scrollToPresetCard(id: string) {
  await nextTick();
  document.getElementById(`lp-preset-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function afterDuplicateSaved(
  newId: string,
  sourceId: string,
  source: "remote" | "local",
  warning?: string,
) {
  highlightId.value = newId;
  if (source === "remote") {
    await reload();
    msg.value = "已复制为新版式。";
  } else {
    presets.value = applyLayoutPresetDisplayOrders(layoutPresetsSnapshot());
    msg.value = warning ? "已复制到本地缓存：" + warning : "已复制为新版式（本地缓存）。";
  }
  const created = presets.value.find((x) => x.id === newId);
  if (created && sourceId) {
    presets.value = insertLayoutPresetAfter(presets.value, created.pageRole, newId, sourceId);
  }
  if (created && roleFilter.value !== "all" && roleFilter.value !== created.pageRole) {
    roleFilter.value = created.pageRole;
  }
  await scrollToPresetCard(newId);
}

async function confirmDuplicatePreset() {
  const p = dupSource.value;
  const trimmed = dupNameInput.value.trim();
  if (!p) return;
  if (!trimmed) {
    msg.value = "名称不能为空。";
    return;
  }
  const sourceId = p.id;
  closeDupDlg();
  msg.value = "";
  try {
    const copy = duplicateLayoutPreset(p, trimmed);
    const r = await saveLayoutPresetFlexible(copy);
    if (!r.ok) {
      msg.value = "复制失败：" + r.message;
      return;
    }
    await afterDuplicateSaved(
      copy.id,
      sourceId,
      r.source,
      r.source === "local" ? r.warning : undefined,
    );
  } catch (e) {
    msg.value = "复制失败：" + String((e as Error).message || e);
  }
}

function parseRouteRole(q: LocationQuery): LayoutPageRole | undefined {
  const raw = typeof q.role === "string" ? q.role : Array.isArray(q.role) ? q.role[0] : undefined;
  if (raw === "cover" || raw === "normal" || raw === "back") return raw;
  return undefined;
}

async function createPreset(
  initialRole?: LayoutPageRole,
  opts?: { snapRoleFilter?: boolean },
): Promise<string | null> {
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
    const snap = opts?.snapRoleFilter ?? true;
    if (snap) {
      roleFilter.value =
        initialRole === "normal" ? "normal" : initialRole === "cover" ? "cover" : "back";
    }
  } else {
    fresh.name = "新建版式";
  }
  try {
    const r = await saveLayoutPresetFlexible(fresh);
    if (!r.ok) {
      msg.value = "创建失败：" + r.message;
      return null;
    }
    if (r.source === "remote") {
      await reload();
    } else {
      presets.value = applyLayoutPresetDisplayOrders(layoutPresetsSnapshot());
      msg.value = "已创建但未写入服务器：" + r.warning;
    }
    return fresh.id;
  } catch (e) {
    msg.value = "创建失败：" + String((e as Error).message || e);
    return null;
  }
}

async function createPresetForSection(role: LayoutPageRole) {
  const id = await createPreset(role, {
    snapRoleFilter: roleFilter.value !== "all",
  });
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
.lp-stack {
  margin-top: 16px;
}
.lp-section + .lp-section {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid #e4e4e7;
}
.lp-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
  margin-bottom: 10px;
}
.lp-section-h {
  margin: 0;
  flex: 1 1 160px;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: #27272a;
}
.lp-new {
  flex-shrink: 0;
}
.empty-all {
  text-align: center;
  color: #71717a;
  padding: 16px;
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.45;
  background: #fafafa;
  border-radius: 8px;
  border: 1px dashed #d4d4d8;
}
.empty-section {
  grid-column: 1 / -1;
  margin: 0;
  padding: 16px;
  text-align: center;
  color: #71717a;
  font-size: 13px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px dashed #d4d4d8;
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
.b.primary:hover {
  background: #4338ca;
  border-color: #3730a3;
}
.b.danger {
  background: #dc2626;
  color: #fff;
  border-color: #b91c1c;
}
.b.danger:hover {
  background: #b91c1c;
  border-color: #991b1b;
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
.loading-hint {
  font-size: 13px;
  color: #64748b;
  margin: 8px 0 0;
}
.warn {
  font-size: 12px;
  color: #a16207;
  margin: 8px 0 0;
}
.drag-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0;
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
.col-seq {
  width: 88px;
  text-align: center;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #64748b;
  vertical-align: middle;
  white-space: nowrap;
}
.row-seq-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.row-seq-num {
  min-width: 1.25em;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #64748b;
}
.row-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fafafa;
  color: #71717a;
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
}
.row-drag-handle:hover {
  background: #f4f4f5;
  border-color: #d4d4d8;
  color: #4f46e5;
}
.row-drag-handle:active {
  cursor: grabbing;
}
.row-drag-handle-icon {
  display: block;
  pointer-events: none;
}
.lp-row--dragging td {
  opacity: 0.55;
}
.lp-row--drag-over td {
  background: #eef2ff;
  box-shadow: inset 0 2px 0 #818cf8;
}
.td-actions {
  white-space: nowrap;
}
.td-actions .b {
  min-height: 36px;
  padding: 6px 12px;
}
.td-actions .b + .b {
  margin-left: 8px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  margin-top: 0;
}
.card {
  position: relative;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  touch-action: manipulation;
}
.lp-card-seq {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #475569;
  line-height: 1;
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
  cursor: pointer;
}
.foot {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #3f3f46;
}
.foot-line {
  word-break: break-word;
}
.foot-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.foot-actions .b {
  min-height: 36px;
  padding: 6px 12px;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
}
.lp-row--hl td {
  background: rgb(238 242 255);
}
.card--hl {
  outline: 2px solid rgb(129 140 248 / 0.65);
  outline-offset: 2px;
}
.card--dragging {
  opacity: 0.55;
}
.card--drag-over {
  border-color: #818cf8;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}
.lp-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.card-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fafafa;
  color: #71717a;
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
}
.card-drag-handle:hover {
  background: #f4f4f5;
  border-color: #d4d4d8;
  color: #4f46e5;
}
.card-drag-handle:active {
  cursor: grabbing;
}
.card-drag-handle-icon {
  display: block;
  pointer-events: none;
}
.lp-dup-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.55);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.lp-dup-modal {
  background: #fff;
  padding: 1.1rem 1.25rem 1rem;
  border-radius: 10px;
  max-width: 96vw;
  width: 420px;
  box-shadow: 0 20px 50px rgb(0 0 0 / 0.22);
}
.lp-dup-title {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
  font-weight: 600;
}
.lp-dup-desc {
  margin: 0 0 0.85rem;
  font-size: 12px;
  color: #52525b;
  line-height: 1.45;
}
.lp-dup-lbl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
  margin-bottom: 4px;
}
.lp-dup-inp {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  font-size: 14px;
}
.lp-dup-inp:focus {
  outline: 2px solid rgb(129 140 248 / 0.5);
  outline-offset: 1px;
  border-color: #818cf8;
}
.lp-dup-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
  margin-top: 12px;
}
.lp-dup-actions .b.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
