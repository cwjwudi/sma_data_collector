<template>
  <div class="vb">
    <label>主表</label>
    <input v-model="baseTable" class="input" placeholder="orders" />
    <label>列（逗号分隔，可写 table.col）</label>
    <input v-model="columns" class="input" placeholder="id, user_id, amount" />
    <label>JOIN（每行：join表 | 左 table.col | 右 table.col）</label>
    <div v-for="(j, idx) in joins" :key="idx" class="join-row">
      <input v-model="j.table" class="input sm" placeholder="users" />
      <input v-model="j.on_left" class="input sm" placeholder="orders.user_id" />
      <input v-model="j.on_right" class="input sm" placeholder="users.id" />
      <button type="button" class="btn sm" @click="joins.splice(idx, 1)">删</button>
    </div>
    <button type="button" class="btn sm" @click="joins.push({ table: '', on_left: '', on_right: '' })">添加 JOIN</button>
    <div class="actions">
      <button type="button" class="btn sm" @click="buildOnly">生成 SQL</button>
      <button type="button" class="btn primary sm" @click="runVisual">生成并运行</button>
    </div>
    <pre v-if="sqlOut" class="pre">{{ sqlOut }}</pre>
    <div v-if="msg" class="msg">{{ msg }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { apiFetch } from '@/api/client.js'

const props = defineProps({
  connectionId: { type: String, default: '' },
  database: { type: String, default: '' },
})

const emit = defineEmits(['result'])

const baseTable = ref('')
const columns = ref('')
const joins = ref([])
const sqlOut = ref('')
const msg = ref('')

async function buildOnly() {
  msg.value = ''
  sqlOut.value = ''
  try {
    const data = await apiFetch('/database/visual/build_sql', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || null,
        base_table: baseTable.value,
        joins: joins.value.filter((x) => x.table && x.on_left && x.on_right),
        columns: columns.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        limit: 100,
      },
    })
    sqlOut.value = data.sql || ''
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function runVisual() {
  msg.value = ''
  try {
    const data = await apiFetch('/database/visual/run', {
      method: 'POST',
      body: {
        connection_id: props.connectionId,
        database: props.database || null,
        base_table: baseTable.value,
        joins: joins.value.filter((x) => x.table && x.on_left && x.on_right),
        columns: columns.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        limit: 100,
      },
    })
    sqlOut.value = data.sql || ''
    emit('result', data)
  } catch (e) {
    msg.value = e.message || String(e)
  }
}
</script>

<style scoped>
.vb {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.input {
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}
.input.sm {
  flex: 1;
}
.join-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.actions {
  display: flex;
  gap: 8px;
}
.btn {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}
.btn.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
.pre {
  background: #111827;
  color: #e5e7eb;
  padding: 8px;
  border-radius: 6px;
  font-size: 12px;
  overflow: auto;
}
.msg {
  color: #b91c1c;
  font-size: 12px;
}
</style>
