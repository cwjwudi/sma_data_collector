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
  return eng === "mysql" || eng === "mariadb" || eng === "postgres" || eng === "postgresql";
});

const compiledSql = computed(() => compileScalarVisualSql(props.visual));

const filteredPickTables = computed(() => {
  const q = tablePickQ.value.trim().toLowerCase();
  const list = catalogTables.value.filter((x) => x.name);
  if (!q) return list;
  return list.filter((x) => x.name.toLowerCase().includes(q));
});

function setFillMode(mode: ScalarSqlFillMode) {
  if (mode === props.fillMode) return;
  emit("update:fillMode", mode);
  if (mode === "visual") compile();
}

function onManualSqlInput(ev: Event) {
  emit("update:sqlText", (ev.target as HTMLTextAreaElement).value);
}

function visualsEqual(a: ScalarSqlVisualConfig, b: ScalarSqlVisualConfig): boolean {
  return (
    a.connectionId === b.connectionId &&
    a.database === b.database &&
    a.table === b.table &&
    a.engine === b.engine &&
    a.valueColumn === b.valueColumn &&
    a.whereColumn === b.whereColumn &&
    a.whereParamSlot === b.whereParamSlot
  );
}

let lastEmittedVisual: ScalarSqlVisualConfig | null = null;

function emitVisual(v: ScalarSqlVisualConfig) {
  if (lastEmittedVisual && visualsEqual(lastEmittedVisual, v)) return;
  lastEmittedVisual = { ...v };
  emit("update:visual", v);
}

function compile() {
  // 同步回写可视化配置（取值列/筛选列由 v-model 写在 props 副本上，需 emit 持久化）
  emitVisual({ ...props.visual });
  const sql = compileScalarVisualSql(props.visual);
  if (sql && sql !== props.sqlText) emit("update:sqlText", sql);
}

async function loadConnections() {
  try {
    const data = await apiFetch("/database/connections");
    connections.value = (data.connections || [])
      .map((x: { id?: string; name?: string; engine?: string }) => ({
        id: String(x.id ?? ""),
        name: String(x.name ?? x.id ?? ""),
        engine: String(x.engine ?? ""),
      }))
      .filter((c: { engine: string }) => {
        // 标量 SQL 仅支持 SQL 引擎，Mongo 等不可选
        const e = c.engine.toLowerCase();
        return e === "mysql" || e === "mariadb" || e === "postgres" || e === "postgresql" || e === "sqlite";
      });
  } catch (e) {
    catalogErr.value = e instanceof Error ? e.message : String(e);
  }
}

function normalizeCatalogNames(raw: unknown): string[] {
  // 后端 databases 为字符串数组；tables 为 {name, kind} 对象数组，两种都兼容
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x : String((x as { name?: unknown })?.name ?? "")))
    .filter(Boolean);
}

async function loadCatalog() {
  catalogErr.value = "";
  const cid = props.visual.connectionId.trim();
  if (!cid) {
    catalogDatabases.value = [];
    catalogTables.value = [];
    tableColumns.value = [];
    return;
  }
  try {
    // 首请求不带 database：MySQL/PG 返回库列表，SQLite 直接返回表列表
    const listCat = await apiFetch("/database/catalog", {
      method: "POST",
      body: { connection_id: cid },
    });
    catalogDatabases.value = normalizeCatalogNames(listCat.databases);

    const db = props.visual.database.trim();
    if (db) {
      const dbCat = await apiFetch("/database/catalog", {
        method: "POST",
        body: { connection_id: cid, database: db },
      });
      catalogTables.value = normalizeCatalogNames(dbCat.tables).map((name) => ({ name }));
    } else {
      catalogTables.value = normalizeCatalogNames(listCat.tables).map((name) => ({ name }));
    }

    const c = connections.value.find((x) => x.id === cid);
    if (c?.engine && c.engine !== props.visual.engine) {
      emitVisual({ ...props.visual, engine: c.engine });
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
  emitVisual({ ...defaultScalarSqlVisual(), connectionId: props.visual.connectionId });
  void loadCatalog();
}

function onDatabaseChange() {
  emitVisual({ ...props.visual, table: "", valueColumn: "", whereColumn: "" });
  void loadCatalog();
}

function openTablePicker() {
  tablePickQ.value = "";
  tablePickOpen.value = true;
}

async function pickTable(name: string) {
  emitVisual({ ...props.visual, table: name, valueColumn: "", whereColumn: "" });
  tablePickOpen.value = false;
  await loadColumns();
  compile();
}

/**
 * 仅在连接/库/表「值」真正变化时重载目录（如画布上切换选中元素）。
 * 注意必须用多源数组写法：单个 getter 返回新数组会被 Vue 视为每次都变化，
 * 若回调再 emit 触发重渲染将形成死循环（0.2.4 曾因此点「点选生成」卡死）。
 */
watch(
  [() => props.visual.connectionId, () => props.visual.database, () => props.visual.table],
  () => {
    lastEmittedVisual = null;
    void loadCatalog().then(() => loadColumns());
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
  align-self: flex-start;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  overflow: hidden;
  background: #fafafa;
}
.ssqb-seg-btn {
  margin: 0;
  padding: 6px 14px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  line-height: 1.2;
}
.ssqb-seg-btn + .ssqb-seg-btn {
  box-shadow: inset 1px 0 0 #e4e4e7;
}
.ssqb-seg-btn:hover:not(.ssqb-seg-on) {
  background: rgb(244 244 245 / 0.85);
  color: #18181b;
}
.ssqb-seg-on {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
/* 属性面板同款输入/按钮样式（父级 scoped 样式无法作用到本组件内部） */
.lpep-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  background: #fff;
}
.lpep-file-btn {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
}
.lpep-file-btn:hover:not(:disabled) {
  background: #e0e7ff;
}
.lpep-file-btn:disabled {
  opacity: 0.5;
  cursor: default;
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
