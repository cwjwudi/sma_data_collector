<template>
  <details class="qq-details" open>
    <summary class="qq-summary">快捷查询</summary>
    <div class="qq-body">
      <p v-if="!connectionId" class="qq-empty">未选择连接</p>

      <template v-else-if="isMongo">
        <p class="qq-context">
          <template v-if="activeCollection">
            当前集合：<strong>{{ activeCollection }}</strong>
          </template>
          <template v-else>未选中集合：请在左侧架构浏览中选择<strong>数据库</strong>与<strong>集合</strong>。</template>
        </p>

        <template v-if="activeCollection">
          <p class="qq-section-title">针对当前集合</p>
          <div class="qq-presets">
            <div v-for="(p, i) in mongoPresetsSelected" :key="'mc-' + i" class="qq-card">
              <button type="button" class="qq-card-btn" @click="emit('fill-mongo', p.mongo)">{{ p.title }}</button>
              <p class="qq-desc">{{ p.desc }}</p>
            </div>
          </div>
        </template>
        <template v-else>
          <p class="qq-section-title">通用提示（填入后需先选好集合再运行）</p>
          <div class="qq-presets">
            <div v-for="(p, i) in mongoPresetsGeneric" :key="'mg-' + i" class="qq-card">
              <button type="button" class="qq-card-btn" @click="emit('fill-mongo', p.mongo)">{{ p.title }}</button>
              <p class="qq-desc">{{ p.desc }}</p>
            </div>
          </div>
        </template>
      </template>

      <template v-else>
        <p class="qq-context">
          <template v-if="activeTable">
            当前对象：<strong>{{ activeTable }}</strong>
            <span v-if="kindLabel">（{{ kindLabel }}）</span>
          </template>
          <template v-else>未选中表或视图：请在左侧架构浏览中选择对象；或使用下方<strong>通用语句</strong>探测连接。</template>
        </p>

        <template v-if="activeTable">
          <p class="qq-section-title">针对当前{{ kindLabel || '对象' }}</p>
          <div class="qq-presets">
            <div v-for="(p, i) in sqlPresetsTable" :key="'st-' + i" class="qq-card">
              <button type="button" class="qq-card-btn" @click="emit('fill-sql', p.sql)">{{ p.title }}</button>
              <p class="qq-desc">{{ p.desc }}</p>
            </div>
          </div>

          <div class="qq-detail">
            <button type="button" class="btn sm" @click="loadColumns">{{ detailCols.length ? '重新加载列' : '加载列信息' }}</button>
            <div v-if="detailLoading" class="qq-muted">加载列…</div>
            <div v-else-if="detailErr" class="qq-err">{{ detailErr }}</div>
            <template v-else-if="detailCols.length">
              <div class="qq-chip-row">
                <span v-for="c in detailCols.slice(0, 16)" :key="c.name" class="chip" :title="c.data_type">{{ c.name }}</span>
                <span v-if="detailCols.length > 16" class="qq-muted">…共 {{ detailCols.length }} 列</span>
              </div>
              <button type="button" class="btn sm primary" @click="fillSelectColumns">填充前 {{ Math.min(12, detailCols.length) }} 列</button>
              <p class="qq-desc">生成 SELECT 列出前几列，可在编辑器中增删字段。</p>
            </template>
          </div>
        </template>

        <template v-else>
          <p class="qq-section-title">通用语句（不依赖选中表）</p>
          <div class="qq-presets">
            <div v-for="(p, i) in sqlPresetsGeneric" :key="'sg-' + i" class="qq-card">
              <button type="button" class="qq-card-btn" @click="emit('fill-sql', p.sql)">{{ p.title }}</button>
              <p class="qq-desc">{{ p.desc }}</p>
            </div>
          </div>
        </template>
      </template>
    </div>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'

const props = defineProps({
  connectionId: { type: String, default: '' },
  engine: { type: String, default: '' },
  database: { type: String, default: '' },
  activeTable: { type: String, default: '' },
  activeCollection: { type: String, default: '' },
  /** 来自 catalog.tables[].kind，如 BASE TABLE / VIEW */
  activeTableKind: { type: String, default: '' },
})

const emit = defineEmits(['fill-sql', 'fill-mongo'])

const isMongo = computed(() => props.engine === 'mongodb')

const kindLabel = computed(() => {
  const k = String(props.activeTableKind || '').toUpperCase()
  if (k.includes('VIEW')) return '视图'
  if (k.includes('TABLE')) return '表'
  return ''
})

function quoteIdent(raw) {
  const e = (props.engine || '').toLowerCase()
  const n = String(raw || '')
  if (!/^[a-zA-Z0-9_]+$/.test(n)) {
    return '"' + n.replace(/"/g, '""') + '"'
  }
  if (e === 'mysql' || e === 'mariadb') return '`' + n + '`'
  return '"' + n.replace(/"/g, '""') + '"'
}

const sqlPresetsTable = computed(() => {
  const t = props.activeTable
  if (!t) return []
  const qi = quoteIdent(t)
  const e = (props.engine || '').toLowerCase()
  const list = [
    {
      title: '预览数据',
      desc: '返回最多 100 行，便于快速浏览当前对象的全部字段。',
      sql: `SELECT * FROM ${qi} LIMIT 100`,
    },
    {
      title: '统计行数',
      desc: '使用 COUNT(*) 统计总行数，不产生明细行。',
      sql: `SELECT COUNT(*) AS row_count FROM ${qi}`,
    },
  ]
  if (e === 'mysql' || e === 'mariadb') {
    list.push({
      title: '查看结构',
      desc: '列出列名与类型（等价于 DESC），便于编写 SELECT。',
      sql: `DESCRIBE ${qi}`,
    })
    list.push({
      title: '执行计划',
      desc: '查看优化器对该 SELECT 的执行计划（抽样 LIMIT 1）。',
      sql: `EXPLAIN SELECT * FROM ${qi} LIMIT 1`,
    })
  } else if (e === 'postgres') {
    list.push({
      title: '执行计划',
      desc: 'PostgreSQL 对该查询的 EXPLAIN 文本。',
      sql: `EXPLAIN SELECT * FROM ${qi} LIMIT 1`,
    })
    const tl = String(t).replace(/'/g, "''")
    list.push({
      title: '列清单（系统目录）',
      desc: '从 information_schema 读取列名与类型（默认 public）。',
      sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tl}' ORDER BY ordinal_position`,
    })
  } else if (e === 'sqlite') {
    list.push({
      title: '执行计划',
      desc: 'SQLite 对该查询的逻辑执行计划（EXPLAIN QUERY PLAN）。',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM ${qi} LIMIT 1`,
    })
  }
  return list
})

const sqlPresetsGeneric = computed(() => {
  const e = (props.engine || '').toLowerCase()
  if (e === 'mysql' || e === 'mariadb') {
    return [
      {
        title: '列出数据库',
        desc: 'SHOW DATABASES：查看实例上有哪些库（只读）。',
        sql: 'SHOW DATABASES',
      },
      {
        title: '连通性测试',
        desc: 'SELECT 1：确认当前连接可用。',
        sql: 'SELECT 1 AS ok',
      },
    ]
  }
  if (e === 'postgres') {
    return [
      {
        title: '当前数据库名',
        desc: '返回会话当前连接的 database 名称。',
        sql: 'SELECT current_database() AS db',
      },
      {
        title: '服务器版本',
        desc: '返回 PostgreSQL 版本字符串。',
        sql: 'SELECT version()',
      },
    ]
  }
  if (e === 'sqlite') {
    return [
      {
        title: '列出表与视图',
        desc: '从 sqlite_master 读取对象清单（最多 200 条）。',
        sql: "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name LIMIT 200",
      },
      {
        title: '连通性测试',
        desc: 'SELECT 1：确认当前文件库可读。',
        sql: 'SELECT 1 AS ok',
      },
    ]
  }
  return []
})

const mongoPresetsSelected = [
  {
    title: '取样文档',
    desc: '不限条件取最多 50 条文档（可按需在编辑器中加 $match）。',
    mongo: '[{"$limit":50}]',
  },
  {
    title: '文档计数',
    desc: '统计集合中文档总数（聚合为一行）。',
    mongo: '[{"$group":{"_id":null,"n":{"$sum":1}}}]',
  },
  {
    title: '匹配后取样',
    desc: '空匹配占位 + 限额；可将 $match 改为实际条件。',
    mongo: '[{"$match":{}},{"$limit":50}]',
  },
]

const mongoPresetsGeneric = [
  {
    title: '占位管道',
    desc: '填入示例 LIMIT；请先选好数据库与集合后再点击运行。',
    mongo: '[{"$limit":10}]',
  },
]

const detailCols = ref([])
const detailLoading = ref(false)
const detailErr = ref('')

watch(
  () => props.connectionId,
  () => {
    detailCols.value = []
    detailErr.value = ''
  },
)

watch(
  () => props.activeTable,
  () => {
    detailCols.value = []
    detailErr.value = ''
  },
)

async function loadColumns() {
  const tableName = props.activeTable
  if (!tableName || !props.connectionId || isMongo.value) return
  detailErr.value = ''
  detailLoading.value = true
  detailCols.value = []
  try {
    const data = await apiFetch('/database/table/columns', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || undefined,
        table: tableName,
      },
    })
    detailCols.value = data.columns || []
  } catch (e) {
    detailErr.value = e.message || String(e)
    detailCols.value = []
  } finally {
    detailLoading.value = false
  }
}

function fillSelectColumns() {
  const tableName = props.activeTable
  if (!tableName || !detailCols.value.length) return
  const qi = quoteIdent(tableName)
  const max = 12
  const picked = detailCols.value.slice(0, max).map((c) => quoteIdent(c.name))
  let sql = `SELECT ${picked.join(', ')}\nFROM ${qi}\nLIMIT 100`
  if (detailCols.value.length > max) {
    sql += `\n-- 共 ${detailCols.value.length} 列，已列出前 ${max} 列，按需增删`
  }
  emit('fill-sql', sql)
}
</script>

<style scoped>
.qq-details {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fafafa;
}
.qq-summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  color: #111827;
}
.qq-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qq-context {
  margin: 0;
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
}
.qq-section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.qq-presets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.qq-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}
.qq-card-btn {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #111827;
}
.qq-card-btn:hover {
  background: #eef2ff;
  border-color: #818cf8;
}
.qq-desc {
  margin: 6px 0 0;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.45;
}
.qq-empty {
  font-size: 12px;
  color: #9ca3af;
}
.qq-detail {
  padding: 8px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
}
.qq-muted {
  font-size: 11px;
  color: #9ca3af;
}
.qq-err {
  font-size: 11px;
  color: #b91c1c;
}
.qq-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 8px 0;
}
.chip {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #eef2ff;
  color: #4338ca;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
