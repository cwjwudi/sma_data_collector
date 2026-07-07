<template>
  <div class="ssqb">
    <div class="ssqb-mode">
      <span class="ssqb-mode-lbl">SQL 方式</span>
      <div class="ssqb-seg" role="group">
        <button
          type="button"
          class="ssqb-seg-btn"
          :class="{ 'ssqb-seg-on': fillMode === 'visual' }"
          @click="setFillMode('visual')"
        >
          点选生成
        </button>
        <button
          type="button"
          class="ssqb-seg-btn"
          :class="{ 'ssqb-seg-on': fillMode === 'manual' }"
          @click="setFillMode('manual')"
        >
          手写 SQL
        </button>
      </div>
    </div>

    <template v-if="fillMode === 'visual'">
      <p v-if="catalogErr" class="ssqb-err">{{ catalogErr }}</p>
      <label class="ssqb-lab">
        数据源连接
        <select v-model="visual.connectionId" class="lpep-inp" @change="onConnChange">
          <option value="">请选择…</option>
          <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}（{{ c.engine }}）</option>
        </select>
      </label>
      <label v-if="showDatabasePick" class="ssqb-lab">
        数据库
        <select v-model="visual.database" class="lpep-inp" @change="onDatabaseChange">
          <option value="">请选择…</option>
          <option v-for="d in catalogDatabases" :key="'db-' + d" :value="d">{{ d }}</option>
        </select>
      </label>
      <div class="ssqb-lab">
        <span>数据表</span>
        <div class="ssqb-table-row">
          <div class="ssqb-table-picked">{{ visual.table.trim() || "未选择" }}</div>
          <button type="button" class="lpep-file-btn" :disabled="!visual.connectionId" @click="openTablePicker">
            浏览…
          </button>
        </div>
      </div>
      <label class="ssqb-lab">
        取值列（首行首列）
        <select v-model="visual.valueColumn" class="lpep-inp" :disabled="!tableColumns.length" @change="compile">
          <option value="">请选择…</option>
          <option v-for="c in tableColumns" :key="'vc-' + c.name" :value="c.name">{{ c.name }}</option>
        </select>
      </label>
      <label class="ssqb-lab">
        筛选列（可选，等于参数）
        <select v-model="visual.whereColumn" class="lpep-inp" :disabled="!tableColumns.length" @change="compile">
          <option value="">无筛选</option>
          <option v-for="c in tableColumns" :key="'wc-' + c.name" :value="c.name">{{ c.name }}</option>
        </select>
      </label>
      <label v-if="visual.whereColumn.trim()" class="ssqb-lab">
        筛选使用参数
        <select v-model.number="visual.whereParamSlot" class="lpep-inp" @change="compile">
          <option :value="0">{{p0}}</option>
          <option :value="1">{{p1}}</option>
        </select>
      </label>
      <label class="ssqb-lab">
        生成的 SQL（只读）
        <textarea :value="compiledSql" class="lpep-inp ssqb-sql-preview" rows="2" readonly spellcheck="false" />
      </label>
    </template>

    <label v-else class="ssqb-lab">
      SQL 查询
      <textarea
        :value="sqlText"
        rows="4"
        class="lpep-inp"
        spellcheck="false"
        placeholder="只读查询；导出预览取首行首列作为显示值"
        @input="onManualSqlInput"
      />
    </label>

    <Teleport to="body">
      <div v-if="tablePickOpen" class="ssqb-tpick-mask" @click.self="tablePickOpen = false">
        <div class="ssqb-tpick-dialog" role="dialog" aria-modal="true">
          <div class="ssqb-tpick-head">
            <strong>选择数据表</strong>
            <button type="button" class="ssqb-tpick-x" @click="tablePickOpen = false">×</button>
          </div>
          <input v-model.trim="tablePickQ" type="search" class="lpep-inp" placeholder="筛选表名…" />
          <ul class="ssqb-tpick-list">
            <li
              v-for="t in filteredPickTables"
              :key="'tp-' + t.name"
              class="ssqb-tpick-item"
              :class="{ 'ssqb-tpick-on': t.name === visual.table }"
              @click="pickTable(t.name)"
            >
              {{ t.name }}
            </li>
          </ul>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { apiFetch } from "@/api/client.js";
import { compileScalarVisualSql } from "@/lib/report-template/scalar-sql-visual-compile";
import {
  defaultScalarSqlVisual,
  type ScalarSqlFillMode,
  type ScalarSqlVisualConfig,
} from "@/lib/report-template/scalar-sql-visual";
import { loadVisualSqlTableColumnsCached } from "@/lib/report-template/table-sql-visual-catalog";

const props = defineProps<{
  sqlText: string;
  fillMode: ScalarSqlFillMode;
  visual: ScalarSqlVisualConfig;
}>();

const emit = defineEmits<{
  "update:sqlText": [v: string];
  "update:fillMode": [v: ScalarSqlFillMode];
  "update:visual": [v: ScalarSqlVisualConfig];
}>();

const p0 = "{{p0}}";
const p1 = "{{p1}}";

const connections = ref<{ id: string; name: string; engine: string }[]>([]);
const catalogDatabases = ref<string[]>([]);
const catalogTables = ref<{ name: string }[]>([]);
const tableColumns = ref<{ name: string }[]>([]);
const catalogErr = ref("");
const tablePickOpen = ref(false);
const tablePickQ = ref("");

const showDatabasePick = computed(() => {
  const c = connections.value.find((x) => x.id === props.visual.connectionId);
  const eng = (c?.engine || "").toLowerCase();
  return eng === "mysql" || eng === "mariadb" || eng === "postgres";
});

const compiledSql = computed(() => compileScalarVisualSql(props.visual));

const filteredPickTables = computed(() => {
  const q = tablePickQ.value.trim().toLowerCase();
  const list = catalogTables.value.filter((x) => x.name);
  if (!q) return list;
  return list.filter((x) => x.name.toLowerCase().includes(q));
});

function setFillMode(mode: ScalarSqlFillMode) {
  emit("update:fillMode", mode);
  if (mode === "visual") compile();
}

function onManualSqlInput(ev: Event) {
  emit("update:sqlText", (ev.target as HTMLTextAreaElement).value);
}

function compile() {
  // 同步回写可视化配置：取值列/筛选列等否则只改到临时副本，保存后丢失
  emit("update:visual", { ...props.visual });
  const sql = compileScalarVisualSql(props.visual);
  if (sql) emit("update:sqlText", sql);
}

async function loadConnections() {
  try {
    const data = await apiFetch("/database/connections");
    connections.value = (data.connections || []).map((x: { id?: string; name?: string; engine?: string }) => ({
      id: String(x.id ?? ""),
      name: String(x.name ?? x.id ?? ""),
      engine: String(x.engine ?? ""),
    }));
  } catch (e) {
    catalogErr.value = e instanceof Error ? e.message : String(e);
  }
}

async function loadCatalog() {
  catalogErr.value = "";
  catalogDatabases.value = [];
  catalogTables.value = [];
  tableColumns.value = [];
  const cid = props.visual.connectionId.trim();
  if (!cid) return;
  try {
    const body: Record<string, string> = { connection_id: cid };
    if (props.visual.database.trim()) body.database = props.visual.database.trim();
    const cat = await apiFetch("/database/catalog", { method: "POST", body });
    catalogDatabases.value = (cat.databases || []).map((x: { name?: string }) => String(x.name ?? ""));
    catalogTables.value = (cat.tables || []).map((x: { name?: string }) => ({ name: String(x.name ?? "") }));
    const c = connections.value.find((x) => x.id === cid);
    if (c?.engine) {
      const v = { ...props.visual, engine: c.engine };
      emit("update:visual", v);
    }
  } catch (e) {
    catalogErr.value = e instanceof Error ? e.message : String(e);
  }
}

async function loadColumns() {
  tableColumns.value = [];
  const cid = props.visual.connectionId.trim();
  const tbl = props.visual.table.trim();
  if (!cid || !tbl) return;
  try {
    tableColumns.value = await loadVisualSqlTableColumnsCached({
      connectionId: cid,
      database: props.visual.database,
      table: tbl,
    });
  } catch (e) {
    catalogErr.value = e instanceof Error ? e.message : String(e);
  }
}

function onConnChange() {
  const v = { ...defaultScalarSqlVisual(), connectionId: props.visual.connectionId };
  emit("update:visual", v);
  void loadCatalog();
}

function onDatabaseChange() {
  const v = { ...props.visual, table: "", valueColumn: "", whereColumn: "" };
  emit("update:visual", v);
  void loadCatalog();
}

function openTablePicker() {
  tablePickQ.value = "";
  tablePickOpen.value = true;
}

async function pickTable(name: string) {
  const v = { ...props.visual, table: name, valueColumn: "", whereColumn: "" };
  emit("update:visual", v);
  tablePickOpen.value = false;
  await loadColumns();
  compile();
}

watch(
  () => [props.visual.connectionId, props.visual.database, props.visual.table],
  () => {
    void loadCatalog().then(() => loadColumns()).then(() => compile());
  },
);

watch(
  () => props.fillMode,
  (m) => {
    if (m === "visual") compile();
  },
);

onMounted(() => {
  void loadConnections().then(() => loadCatalog()).then(() => loadColumns());
});
</script>

<style scoped>
.ssqb-mode {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.ssqb-mode-lbl {
  font-size: 12px;
  color: var(--text-secondary, #52525b);
}
.ssqb-seg {
  display: inline-flex;
  border: 1px solid var(--border-subtle, #d4d4d8);
  border-radius: 6px;
  overflow: hidden;
}
.ssqb-seg-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: none;
  background: #fff;
  cursor: pointer;
}
.ssqb-seg-on {
  background: #2563eb;
  color: #fff;
}
.ssqb-lab {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 12px;
}
.ssqb-table-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.ssqb-table-picked {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border-subtle, #e4e4e7);
  border-radius: 6px;
  font-size: 12px;
  min-height: 32px;
}
.ssqb-sql-preview {
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.ssqb-err {
  color: #b91c1c;
  font-size: 12px;
}
.ssqb-tpick-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ssqb-tpick-dialog {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  width: min(420px, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ssqb-tpick-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ssqb-tpick-x {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
}
.ssqb-tpick-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  max-height: 50vh;
}
.ssqb-tpick-item {
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}
.ssqb-tpick-item:hover,
.ssqb-tpick-on {
  background: #eff6ff;
}
</style>
