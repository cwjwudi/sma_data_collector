<template>
  <div class="tsv-panel">
    <p v-if="catalogErr" class="tsv-err">{{ catalogErr }}</p>
    <p v-if="engineHint" class="tsv-hint">{{ engineHint }}</p>

    <label class="tsv-lab">
      数据源连接
      <select v-model="vs.connectionId" :class="selectFieldClass" @change="onConnChange">
        <option value="">请选择…</option>
        <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}（{{ c.engine }}）</option>
      </select>
    </label>

    <template v-if="vs.connectionId && showDatabasePick">
      <label class="tsv-lab">
        数据库
        <select v-model="vs.database" :class="selectFieldClass" @change="onDatabaseChange">
          <option value="">请选择…</option>
          <!-- 目录尚未加载/加载失败时，仍显示已保存的库名，避免下拉框空白 -->
          <option v-if="vs.database && !catalogDatabases.includes(vs.database)" :value="vs.database">
            {{ vs.database }}
          </option>
          <option v-for="d in catalogDatabases" :key="'db-' + d" :value="d">{{ d }}</option>
        </select>
      </label>
    </template>

    <div class="tsv-lab tsv-table-section">
      <span class="tsv-table-section-label">数据表</span>
      <div class="tsv-table-pick-row">
        <div class="tsv-table-picked" :class="{ 'tsv-table-picked--empty': !vs.table.trim() }">
          {{ vs.table.trim() ? vs.table : "未选择（请在列表中点选）" }}
        </div>
        <button
          type="button"
          class="tsv-table-pick-btn"
          :class="actionBtnClass"
          :disabled="tablePickBlocked"
          @click="openTablePicker"
        >
          浏览…
        </button>
      </div>
      <p class="tsv-muted">从当前连接的库中列出全部表，支持筛选；无需手输表名。</p>
      <p class="tsv-muted">输出列请在画布表格<strong>第一行</strong>各列的下拉框中选择字段；顺序与表格列从左到右一致。</p>
    </div>

    <div class="tsv-headers" v-if="vs.columns.some((c) => String(c || '').trim())">
      <div class="tsv-headers-head">
        <span class="tsv-subtit">列头名称</span>
      </div>
      <label v-for="ci in headerColumnIndices" :key="'th-' + ci" class="tsv-header-row">
        <span class="tsv-header-field">{{ vs.columns[ci] || `第 ${ci + 1} 列` }}</span>
        <input
          v-model.trim="fill.resultColumnNames[ci]"
          class="tsv-text-inp"
          :placeholder="vs.columns[ci] || `第 ${ci + 1} 列`"
        />
      </label>
    </div>

    <div class="tsv-filters">
      <div class="tsv-filters-head">
        <span class="tsv-subtit">筛选条件（启发式）</span>
        <button type="button" :class="actionBtnClass" @click="addFilter">＋ 添加条件</button>
      </div>
      <p class="tsv-muted">
        等值适合编号/状态；日期/时间范围可用日期控件；数值范围用于序号类字段。请先用选项卡选择「手写默认值」或「OPC UA」，再在下方区域填写；选
        OPC UA 时会自动打开节点选择。
      </p>

      <div v-for="(flt, fi) in fill.visualFilters" :key="flt.id" class="tsv-filter-card">
        <div class="tsv-filter-top">
          <label class="tsv-inline">
            列
            <select v-model="flt.column" :class="selectFieldClass">
              <option value="">—</option>
              <option v-for="c in tableColumns" :key="'fc-' + flt.id + '-' + c.name" :value="c.name">{{ c.name }}</option>
            </select>
          </label>
          <label class="tsv-inline">
            规则
            <select v-model="flt.kind" :class="selectFieldClass" @change="onFilterKindChange(flt)">
              <option value="equality">等于（编号 / 状态 / 文本）</option>
              <option value="date_between">日期范围</option>
              <option value="datetime_between">日期时间范围</option>
              <option value="numeric_between">数值范围（序号等）</option>
            </select>
          </label>
          <button type="button" class="tsv-mini-btn danger" @click="removeFilter(fi)">删除</button>
        </div>

        <div v-if="flt.column.trim()" class="tsv-dist-row">
          <button
            type="button"
            :class="actionBtnClass"
            :disabled="distinctBusy === flt.id || !canQueryDistinct"
            @click="loadDistinctHints(flt)"
          >
            从数据库加载该列样例值
          </button>
          <datalist :id="'dv-' + flt.id">
            <option v-for="(s, di) in distinctHints[flt.id] || []" :key="'dv-' + flt.id + '-' + di" :value="s" />
          </datalist>
        </div>

        <template v-if="flt.kind === 'equality'">
          <div class="tsv-binding-shell">
            <div class="tsv-seg" role="tablist" aria-label="筛选取值方式">
              <button
                type="button"
                role="tab"
                class="tsv-seg-btn"
                :class="{ 'tsv-seg-btn--on': flt.bindings[0].source === 'literal' }"
                :aria-selected="flt.bindings[0].source === 'literal'"
                @click="selectVisualBindingTab(fi, 0, 'literal')"
              >
                手写默认值
              </button>
              <button
                type="button"
                role="tab"
                class="tsv-seg-btn"
                :class="{ 'tsv-seg-btn--on': flt.bindings[0].source === 'opcua' }"
                :aria-selected="flt.bindings[0].source === 'opcua'"
                @click="selectVisualBindingTab(fi, 0, 'opcua')"
              >
                OPC UA
              </button>
              <button
                type="button"
                role="tab"
                class="tsv-seg-btn"
                :class="{ 'tsv-seg-btn--on': flt.bindings[0].source === 'batch_no' }"
                :aria-selected="flt.bindings[0].source === 'batch_no'"
                @click="selectVisualBindingTab(fi, 0, 'batch_no')"
              >
                批次号
              </button>
            </div>
            <div class="tsv-tab-panel" role="tabpanel">
              <template v-if="flt.bindings[0].source === 'literal'">
                <label class="tsv-lab">
                  筛选值
                  <input
                    v-model="flt.defaults[0]"
                    :list="'dv-' + flt.id"
                    class="tsv-text-inp"
                    placeholder="如状态码、编号"
                  />
                </label>
              </template>
              <template v-else-if="flt.bindings[0].source === 'opcua'">
                <label class="tsv-lab">
                  默认值（OPC 无值时用）
                  <input v-model="flt.defaults[0]" :list="'dv-' + flt.id" class="tsv-text-inp" placeholder="可选" />
                </label>
                <label class="tsv-lab">
                  节点 ID
                  <input
                    v-model.trim="flt.bindings[0].opcuaNodeId"
                    class="tsv-text-inp tsv-node-id-inp"
                    type="text"
                    placeholder="选择节点后填入，或可手输 NodeId"
                    spellcheck="false"
                    autocomplete="off"
                  />
                </label>
                <button type="button" :class="actionBtnClass" @click="pickOpc(fi, 0)">选择节点…</button>
              </template>
              <template v-else-if="flt.bindings[0].source === 'batch_no'">
                <p class="tsv-muted">导出时按「结批批次号」筛选，与输出参数控件的批次号来源一致。{{ batchBindingHint }}</p>
                <label class="tsv-lab">
                  默认值（批次号读取失败时用）
                  <input v-model="flt.defaults[0]" :list="'dv-' + flt.id" class="tsv-text-inp" placeholder="可选" />
                </label>
              </template>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="tsv-range-bound">
            <span class="tsv-mini-t">下界</span>
            <div class="tsv-binding-shell">
              <div class="tsv-seg" role="tablist" aria-label="下界取值方式">
                <button
                  type="button"
                  role="tab"
                  class="tsv-seg-btn"
                  :class="{ 'tsv-seg-btn--on': flt.bindings[0].source === 'literal' }"
                  :aria-selected="flt.bindings[0].source === 'literal'"
                  @click="selectVisualBindingTab(fi, 0, 'literal')"
                >
                  手写
                </button>
                <button
                  type="button"
                  role="tab"
                  class="tsv-seg-btn"
                  :class="{ 'tsv-seg-btn--on': flt.bindings[0].source === 'opcua' }"
                  :aria-selected="flt.bindings[0].source === 'opcua'"
                  @click="selectVisualBindingTab(fi, 0, 'opcua')"
                >
                  OPC UA
                </button>
              </div>
              <div class="tsv-tab-panel" role="tabpanel">
                <template v-if="flt.bindings[0].source === 'literal'">
                  <label class="tsv-lab">
                    值
                    <input
                      v-model="flt.defaults[0]"
                      class="tsv-text-inp"
                      :type="flt.kind === 'date_between' ? 'date' : flt.kind === 'datetime_between' ? 'datetime-local' : 'text'"
                    />
                  </label>
                </template>
                <template v-else-if="flt.bindings[0].source === 'opcua'">
                  <label class="tsv-lab">
                    默认值（OPC 无值时用）
                    <input
                      v-model="flt.defaults[0]"
                      class="tsv-text-inp"
                      :type="flt.kind === 'date_between' ? 'date' : flt.kind === 'datetime_between' ? 'datetime-local' : 'text'"
                    />
                  </label>
                  <label class="tsv-lab">
                    节点 ID
                    <input
                      v-model.trim="flt.bindings[0].opcuaNodeId"
                      class="tsv-text-inp tsv-node-id-inp"
                      type="text"
                      placeholder="NodeId"
                      spellcheck="false"
                      autocomplete="off"
                    />
                  </label>
                  <button type="button" :class="actionBtnClass" @click="pickOpc(fi, 0)">选择节点…</button>
                </template>
              </div>
            </div>
          </div>

          <div class="tsv-range-bound">
            <span class="tsv-mini-t">上界</span>
            <div class="tsv-binding-shell">
              <div class="tsv-seg" role="tablist" aria-label="上界取值方式">
                <button
                  type="button"
                  role="tab"
                  class="tsv-seg-btn"
                  :class="{ 'tsv-seg-btn--on': flt.bindings[1].source === 'literal' }"
                  :aria-selected="flt.bindings[1].source === 'literal'"
                  @click="selectVisualBindingTab(fi, 1, 'literal')"
                >
                  手写
                </button>
                <button
                  type="button"
                  role="tab"
                  class="tsv-seg-btn"
                  :class="{ 'tsv-seg-btn--on': flt.bindings[1].source === 'opcua' }"
                  :aria-selected="flt.bindings[1].source === 'opcua'"
                  @click="selectVisualBindingTab(fi, 1, 'opcua')"
                >
                  OPC UA
                </button>
              </div>
              <div class="tsv-tab-panel" role="tabpanel">
                <template v-if="flt.bindings[1].source === 'literal'">
                  <label class="tsv-lab">
                    值
                    <input
                      v-model="flt.defaults[1]"
                      class="tsv-text-inp"
                      :type="flt.kind === 'date_between' ? 'date' : flt.kind === 'datetime_between' ? 'datetime-local' : 'text'"
                    />
                  </label>
                </template>
                <template v-else-if="flt.bindings[1].source === 'opcua'">
                  <label class="tsv-lab">
                    默认值（OPC 无值时用）
                    <input
                      v-model="flt.defaults[1]"
                      class="tsv-text-inp"
                      :type="flt.kind === 'date_between' ? 'date' : flt.kind === 'datetime_between' ? 'datetime-local' : 'text'"
                    />
                  </label>
                  <label class="tsv-lab">
                    节点 ID
                    <input
                      v-model.trim="flt.bindings[1].opcuaNodeId"
                      class="tsv-text-inp tsv-node-id-inp"
                      type="text"
                      placeholder="NodeId"
                      spellcheck="false"
                      autocomplete="off"
                    />
                  </label>
                  <button type="button" :class="actionBtnClass" @click="pickOpc(fi, 1)">选择节点…</button>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <label class="tsv-lab">
      生成的查询 SQL（只读，保存模板时一并写入；p0、p1 等为参数占位符）
      <textarea :value="fill.querySql" class="tsv-text-inp tsv-sql-preview" rows="3" readonly spellcheck="false" />
    </label>
    <div v-if="paramLegend.length" class="tsv-param-legend">
      <p class="tsv-muted">占位符在预览 / 导出时按以下来源取实际值：</p>
      <p v-for="line in paramLegend" :key="line" class="tsv-muted tsv-legend-line">{{ line }}</p>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="tablePickOpen" class="tsv-tpick-mask" role="presentation" @click.self="closeTablePicker">
      <div class="tsv-tpick-dialog" role="dialog" aria-modal="true" aria-labelledby="tsv-tpick-title">
        <div class="tsv-tpick-head">
          <h4 id="tsv-tpick-title" class="tsv-tpick-title">选择数据表</h4>
          <button type="button" class="tsv-tpick-x" aria-label="关闭" @click="closeTablePicker">×</button>
        </div>
        <input
          v-model.trim="tablePickQ"
          type="search"
          class="tsv-tpick-search"
          placeholder="筛选表名…"
          autocomplete="off"
          spellcheck="false"
        />
        <ul class="tsv-tpick-list" role="listbox">
          <li
            v-for="t in filteredPickTables"
            :key="'tpick-' + t.name"
            class="tsv-tpick-item"
            :class="{ 'tsv-tpick-item--on': t.name === vs.table }"
            role="option"
            @click="pickTableFromDialog(t.name)"
          >
            {{ t.name }}
          </li>
        </ul>
        <p v-if="filteredPickTables.length === 0" class="tsv-muted tsv-tpick-empty">
          {{ catalogTables.length === 0 ? "暂无表列表，请确认已选连接与数据库。" : "没有匹配的表名。" }}
        </p>
        <div class="tsv-tpick-foot">
          <button type="button" :class="actionBtnClass" @click="closeTablePicker">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { apiFetch } from "@/api/client.js";
import type {
  TableSqlFillConfig,
  TableSqlParamBinding,
  TableSqlParamSource,
  VisualSqlFilter,
} from "@/lib/report-template/table-sql-fill";
import {
  defaultVisualSqlFilter,
  ensureTableSqlResultColumnNames,
  ensureVisualOutputColumnSlots,
  ensureVisualSource,
  normalizeVisualSqlFilterShape,
} from "@/lib/report-template/table-sql-fill";
import { formatAutoBatchOpcBindingHint, resolveAutoBatchOpcBinding } from "@/lib/auto-batch-opc-binding";
import { loadVisualSqlTableColumnsCached } from "@/lib/report-template/table-sql-visual-catalog";
import { buildDistinctSelectSql, visualFilterParamSlotBase } from "@/lib/report-template/table-sql-visual-compile";
import { computed, nextTick, ref, watch, withDefaults } from "vue";

const props = withDefaults(
  defineProps<{
    fill: TableSqlFillConfig;
    columnCount: number;
    textareaClass?: string;
    /** 下拉框专用 class（由父级传入或与 textareaClass 区分） */
    selectClass?: string;
    /** 与侧栏次要按钮一致，例如 lpep-file-btn */
    buttonClass?: string;
  }>(),
  { textareaClass: "lpep-inp", selectClass: "", buttonClass: "" },
);

const actionBtnClass = computed(() => {
  const extra = (props.buttonClass || "").trim();
  /** 侧栏传入的 buttonClass 多为父组件 scoped，无法作用于本子组件；始终以 .tsv-action-btn 为基底 */
  return ["tsv-action-btn", extra].filter(Boolean).join(" ");
});

const selectFieldClass = computed(() => {
  const c = (props.selectClass || "").trim();
  return c || "tbl-sql-ddl";
});

const emit = defineEmits<{
  opcPickParam: [slot: number];
}>();

const connections = ref<{ id: string; name: string; engine: string; database?: string }[]>([]);
const catalogDatabases = ref<string[]>([]);
const catalogTables = ref<{ name: string }[]>([]);
const tableColumns = ref<{ name: string; type?: string }[]>([]);
const catalogErr = ref("");
const distinctBusy = ref<string | null>(null);
const distinctHints = ref<Record<string, string[]>>({});

const tablePickOpen = ref(false);
const tablePickQ = ref("");

const vs = computed(() => ensureVisualSource(props.fill));

const activeConn = computed(() => connections.value.find((c) => c.id === vs.value.connectionId) ?? null);

const showDatabasePick = computed(() => {
  // 连接列表未加载完时回退到已保存的 engine，避免重开面板时数据库一栏闪失
  const e = (activeConn.value?.engine || vs.value.engine || "").toLowerCase();
  return e === "mysql" || e === "mariadb" || e === "postgres";
});

const batchBindingHint = computed(() => formatAutoBatchOpcBindingHint(resolveAutoBatchOpcBinding()));

/** 只读 SQL 下方的占位符取值说明：仅列出 querySql 中实际出现的 {{pN}} */
const paramLegend = computed(() => {
  const sql = props.fill.querySql || "";
  const params = props.fill.params || [];
  const used = new Set<number>();
  const re = /\{\{p(\d+)\}\}/g;
  for (let m = re.exec(sql); m; m = re.exec(sql)) used.add(Number(m[1]));
  const lines: string[] = [];
  for (const i of [...used].sort((a, b) => a - b)) {
    const p = params[i];
    if (!p) continue;
    const fb = (p.literalFallback || "").trim();
    if (p.source === "opcua") {
      const node = (p.opcuaNodeId || "").trim() || "（未绑定节点）";
      lines.push(`{{p${i}}} → 导出时读 OPC UA：${node}${fb ? `；读不到时用默认值 ${fb}` : ""}`);
    } else if (p.source === "batch_no") {
      lines.push(`{{p${i}}} → 导出时读结批批次号${fb ? `；读不到时用默认值 ${fb}` : ""}`);
    } else {
      lines.push(`{{p${i}}} → 手写值 ${fb ? `“${fb}”` : "（空，导出时按 NULL 处理）"}`);
    }
  }
  return lines;
});

const engineHint = computed(() => {
  const e = (vs.value.engine || "").toLowerCase();
  if (!vs.value.connectionId) return "";
  if (e === "mongodb") return "MongoDB 不支持 SQL 可视化，请改用「手写 SQL」模式。";
  return "";
});

const canQueryDistinct = computed(() => {
  const v = vs.value;
  if (!v.connectionId || !v.table.trim()) return false;
  const e = (v.engine || "").toLowerCase();
  if (e === "mongodb") return false;
  if (showDatabasePick.value && !(v.database || "").trim()) return false;
  return true;
});

/** 不可打开表浏览时的禁用条件（连接未选 / MySQL·Pg 未选库 / Mongo） */
const tablePickBlocked = computed(() => {
  const v = vs.value;
  if (!v.connectionId.trim()) return true;
  const eng = (v.engine || "").toLowerCase();
  if (eng === "mongodb") return true;
  if (showDatabasePick.value && !(v.database || "").trim()) return true;
  return false;
});

const filteredPickTables = computed(() => {
  const q = tablePickQ.value.trim().toLowerCase();
  const list = catalogTables.value.filter((x) => x.name);
  if (!q) return list;
  return list.filter((x) => x.name.toLowerCase().includes(q));
});

const headerColumnIndices = computed(() => Array.from({ length: Math.max(1, props.columnCount) }, (_, i) => i));

watch(
  () => vs.value.connectionId,
  async (id) => {
    catalogErr.value = "";
    if (!id) return;
    const c = connections.value.find((x) => x.id === id);
    vs.value.engine = (c?.engine || "").toLowerCase();
    catalogDatabases.value = [];
    catalogTables.value = [];
    tableColumns.value = [];
    vs.value.table = "";
    vs.value.database = vs.value.database || "";
    if ((vs.value.engine || "") === "mongodb") return;
    await refreshCatalogLevel();
  },
);

watch(
  () => vs.value.database,
  async () => {
    if (!vs.value.connectionId || (vs.value.engine || "") === "mongodb") return;
    await refreshCatalogLevel();
  },
);

async function loadConnections() {
  catalogErr.value = "";
  try {
    const data = await apiFetch("/database/connections");
    connections.value = data.connections || [];
  } catch (e) {
    catalogErr.value = e instanceof Error ? e.message : String(e);
  }
}

async function refreshCatalogLevel() {
  if (!vs.value.connectionId) return;
  try {
    const body: Record<string, string> = { connection_id: vs.value.connectionId };
    if (showDatabasePick.value && vs.value.database.trim()) body.database = vs.value.database.trim();
    const cat = await apiFetch("/database/catalog", { method: "POST", body });
    if (Array.isArray(cat.databases)) {
      catalogDatabases.value = cat.databases;
      if (!vs.value.database.trim() && activeConn.value?.database) {
        vs.value.database = activeConn.value.database;
      }
    }
    catalogTables.value = (cat.tables || []).map((x: { name?: string }) => ({ name: String(x.name ?? "") }));
  } catch (e) {
    catalogErr.value = e instanceof Error ? e.message : String(e);
  }
}

async function loadTableColumns() {
  tableColumns.value = [];
  distinctHints.value = {};
  if (!vs.value.connectionId || !vs.value.table.trim()) return;
  try {
    tableColumns.value = await loadVisualSqlTableColumnsCached({
      connectionId: vs.value.connectionId,
      database: vs.value.database,
      table: vs.value.table.trim(),
    });
  } catch (e) {
    catalogErr.value = e instanceof Error ? e.message : String(e);
  }
}

function onDatabaseChange() {
  vs.value.table = "";
  tableColumns.value = [];
  distinctHints.value = {};
  void refreshCatalogLevel();
}

function onConnChange() {
  distinctHints.value = {};
}

function onTableChange() {
  distinctHints.value = {};
  void loadTableColumns();
}

async function openTablePicker() {
  if (tablePickBlocked.value) {
    if (!vs.value.connectionId.trim()) catalogErr.value = "请先选择数据源连接";
    else if (showDatabasePick.value && !(vs.value.database || "").trim())
      catalogErr.value = "请先选择数据库";
    return;
  }
  catalogErr.value = "";
  tablePickQ.value = "";
  await refreshCatalogLevel();
  tablePickOpen.value = true;
}

function closeTablePicker() {
  tablePickOpen.value = false;
}

function pickTableFromDialog(name: string) {
  vs.value.table = name.trim();
  onTableChange();
  closeTablePicker();
}

function addFilter() {
  const f = defaultVisualSqlFilter();
  normalizeVisualSqlFilterShape(f);
  props.fill.visualFilters.push(f);
}

function removeFilter(i: number) {
  props.fill.visualFilters.splice(i, 1);
}

function onFilterKindChange(flt: VisualSqlFilter) {
  normalizeVisualSqlFilterShape(flt);
}

function onVisualBindingSourceChange(b: TableSqlParamBinding) {
  if (b.source !== "opcua") b.opcuaNodeId = "";
}

function selectVisualBindingTab(fi: number, bi: number, source: TableSqlParamSource) {
  const flt = props.fill.visualFilters[fi];
  if (!flt?.bindings[bi]) return;
  const b = flt.bindings[bi];
  const prev = b.source;
  b.source = source;
  onVisualBindingSourceChange(b);
  if (source === "opcua" && prev !== "opcua") {
    nextTick(() => pickOpc(fi, bi));
  }
}

function pickOpc(fi: number, bi: number) {
  emit("opcPickParam", visualFilterParamSlotBase(props.fill.visualFilters, fi) + bi);
}

async function loadDistinctHints(flt: VisualSqlFilter) {
  if (!canQueryDistinct.value || !flt.column.trim()) return;
  distinctBusy.value = flt.id;
  catalogErr.value = "";
  try {
    const eng = (vs.value.engine || "mysql").toLowerCase();
    const sql = buildDistinctSelectSql(eng, vs.value.table.trim(), flt.column.trim(), 80);
    const data = await apiFetch("/database/query/sql", {
      method: "POST",
      body: {
        connection_id: vs.value.connectionId,
        database: vs.value.database.trim() || undefined,
        sql,
        limit: 120,
      },
    });
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const vals: string[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const raw = o.__dv ?? Object.values(o)[0];
      const s = raw === null || raw === undefined ? "" : String(raw).trim();
      if (s && !vals.includes(s)) vals.push(s);
    }
    distinctHints.value = { ...distinctHints.value, [flt.id]: vals };
  } catch (e) {
    catalogErr.value = e instanceof Error ? e.message : String(e);
  } finally {
    distinctBusy.value = null;
  }
}

watch(
  () => props.columnCount,
  (n) => {
    ensureVisualOutputColumnSlots(props.fill, n);
    ensureTableSqlResultColumnNames(props.fill, n);
  },
  { immediate: true },
);

/** 切换或清空数据表后，筛选条件与画布输出列仍指向旧表，需重置 */
watch(
  () => vs.value.table.trim(),
  (next, prev) => {
    if (prev === undefined) return;
    if (next === prev) return;
    props.fill.visualFilters.splice(0, props.fill.visualFilters.length);
    const cols = props.fill.visualSource?.columns;
    if (cols?.length) {
      for (let i = 0; i < cols.length; i++) cols[i] = "";
    }
    if (props.fill.resultColumnNames?.length) {
      for (let i = 0; i < props.fill.resultColumnNames.length; i++) props.fill.resultColumnNames[i] = "";
    }
  },
);

/**
 * 重开面板时按已保存选择补拉目录与表字段：
 * 否则数据库下拉与筛选「列」下拉在用户重新更换连接前一直是空列表（表现为不显示库名）。
 */
async function initCatalogForSavedSelection() {
  const v = vs.value;
  if (!v.connectionId.trim() || (v.engine || "").toLowerCase() === "mongodb") return;
  await refreshCatalogLevel();
  if (v.table.trim()) {
    await loadTableColumns();
  }
}

void loadConnections().then(() => initCatalogForSavedSelection());
</script>

<style scoped>
.tsv-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}
.tsv-err {
  margin: 0;
  font-size: 12px;
  color: #b91c1c;
}
.tsv-hint {
  margin: 0;
  font-size: 12px;
  color: #92400e;
}
.tsv-lab {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #52525b;
}
.tsv-muted {
  margin: 0;
  font-size: 11px;
  color: #71717a;
  line-height: 1.45;
}
.tsv-subtit {
  font-size: 12px;
  font-weight: 600;
  color: #27272a;
}
.tsv-mini-t {
  display: block;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #52525b;
}
.tsv-mini-btn {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e4e4e7;
  background: #fff;
  cursor: pointer;
}
.tsv-mini-btn.danger {
  border-color: #fecaca;
  color: #b91c1c;
}
/** 与属性侧栏 lpep-file-btn / hz-soft-btn / tbl-sql-side-btn 一致（父级 scoped 无法渗入本子组件） */
.tsv-action-btn {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
  align-self: flex-start;
}
.tsv-action-btn:hover:not(:disabled) {
  background: #e0e7ff;
}
.tsv-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tsv-filters-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tsv-filter-card {
  border: 1px dashed #d4d4d8;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tsv-headers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px dashed #d4d4d8;
  border-radius: 8px;
}
.tsv-headers-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tsv-header-row {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #52525b;
}
.tsv-header-field {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #3f3f46;
}
.tsv-filter-top {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
}
.tsv-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #52525b;
}
.tsv-dist-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tsv-blabel {
  min-width: 4.5rem;
  color: #64748b;
}

.tsv-binding-shell {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.tsv-seg {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: #f4f4f5;
  box-sizing: border-box;
}
.tsv-seg-btn {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 8px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  line-height: 1.25;
  color: #52525b;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}
.tsv-seg-btn:hover {
  color: #18181b;
  background: rgb(255 255 255 / 0.65);
}
.tsv-seg-btn--on {
  background: #fff;
  color: #3730a3;
  font-weight: 600;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.06);
}
.tsv-tab-panel {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tsv-tab-panel > .tsv-action-btn {
  align-self: flex-start;
}

/** 与侧栏 lpep-inp / tbl-sql-ddl 一致（勿依赖父组件 scoped 类名） */
input.tsv-text-inp {
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}
.tsv-text-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.35;
  color: #18181b;
  background: #fff;
  min-height: 34px;
}
.tsv-text-inp:focus {
  outline: none;
  border-color: #a5b4fc;
  box-shadow: 0 0 0 1px rgb(99 102 241 / 0.25);
}
textarea.tsv-text-inp.tsv-sql-preview {
  min-height: 4.5rem;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.tsv-param-legend {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 1px dashed #e4e4e7;
  border-radius: 8px;
  background: #fafafa;
}
.tsv-legend-line {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.tsv-range-bound {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #f4f4f5;
}
.tsv-range-bound:first-of-type {
  padding-top: 0;
  border-top: none;
}

.tsv-table-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tsv-table-section-label {
  font-size: 12px;
  color: #52525b;
}
.tsv-table-pick-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}
.tsv-table-picked {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.45;
  background: #fafafa;
  color: #18181b;
  display: flex;
  align-items: center;
  word-break: break-all;
}
.tsv-table-picked--empty {
  color: #a1a1aa;
}
.tsv-table-pick-btn {
  flex-shrink: 0;
  align-self: stretch;
  white-space: nowrap;
}

/** 与数据库填充侧栏一致的下拉外观（本组件内 select） */
.tbl-sql-ddl {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.35;
  color: #18181b;
  background: #fff;
  min-height: 34px;
  appearance: auto;
  cursor: pointer;
}
.tbl-sql-ddl:focus {
  outline: none;
  border-color: #a5b4fc;
  box-shadow: 0 0 0 1px rgb(99 102 241 / 0.25);
}
</style>

<!-- Teleport 挂到 body，无 scoped 以保证遮罩与对话框样式生效 -->
<style>
.tsv-tpick-mask {
  position: fixed;
  inset: 0;
  z-index: 60000;
  background: rgb(24 24 27 / 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}
.tsv-tpick-dialog {
  width: min(420px, 100%);
  max-height: min(560px, 90vh);
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 18px 48px rgb(15 23 42 / 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tsv-tpick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #e4e4e7;
}
.tsv-tpick-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #27272a;
}
.tsv-tpick-x {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  font-weight: 400;
  cursor: pointer;
  color: #52525b;
}
.tsv-tpick-x:hover {
  background: #f4f4f5;
  color: #18181b;
}
.tsv-tpick-x:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgb(99 102 241 / 0.35);
}
.tsv-tpick-search {
  margin: 10px 14px 0;
  width: calc(100% - 28px);
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.35;
  color: #18181b;
  background: #fff;
  min-height: 34px;
}
.tsv-tpick-search::placeholder {
  color: #a1a1aa;
}
.tsv-tpick-search:focus {
  outline: none;
  border-color: #a5b4fc;
  box-shadow: 0 0 0 1px rgb(99 102 241 / 0.25);
}
.tsv-tpick-list {
  margin: 10px 0 0;
  padding: 0 8px 8px;
  list-style: none;
  overflow-y: auto;
  flex: 1;
  min-height: 120px;
  max-height: 340px;
}
.tsv-tpick-item {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: #18181b;
  word-break: break-all;
}
.tsv-tpick-item:hover {
  background: #f4f4f5;
}
.tsv-tpick-item--on {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.tsv-tpick-empty {
  margin: 0 14px 10px;
}
.tsv-tpick-foot {
  padding: 10px 14px;
  border-top: 1px solid #e4e4e7;
  display: flex;
  justify-content: flex-end;
}
</style>
