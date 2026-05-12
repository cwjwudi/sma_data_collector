<template>
  <div class="cm">
    <div class="row-head">
      <h4>连接</h4>
      <button type="button" class="btn sm" @click="$emit('new')">新建连接</button>
    </div>
    <ul class="conn-list">
      <li
        v-for="c in connections"
        :key="c.id"
        :class="{ active: c.id === activeId }"
        @click="$emit('select', c)"
      >
        <span class="name">{{ c.name || c.engine }}</span>
        <span class="badge">{{ c.engine }}</span>
      </li>
    </ul>
    <div v-if="draft" class="form">
      <label>名称</label>
      <input v-model="draft.name" class="input" />
      <label>引擎</label>
      <select v-model="draft.engine" class="input">
        <option value="mysql">MySQL</option>
        <option value="mariadb">MariaDB</option>
        <option value="postgres">PostgreSQL</option>
        <option value="sqlite">SQLite</option>
        <option value="mongodb">MongoDB</option>
      </select>
      <template v-if="draft.engine !== 'sqlite'">
        <label>主机</label>
        <input v-model="draft.host" class="input" placeholder="127.0.0.1" />
        <label>端口</label>
        <input v-model.number="draft.port" type="number" class="input" />
        <label>用户名</label>
        <input v-model="draft.username" class="input" />
        <label>密码（可选）</label>
        <input v-model="draft.password" type="password" class="input" />
      </template>
      <template v-if="draft.engine === 'sqlite'">
        <label>SQLite 文件路径（后端所在机器路径）</label>
        <input v-model="draft.sqlite_path" class="input" placeholder="D:\\data\\app.db" />
      </template>
      <template v-if="draft.engine !== 'sqlite' && draft.engine !== 'mongodb'">
        <label>数据库名（可选， browsing 时可再选）</label>
        <input v-model="draft.database" class="input" />
      </template>
      <template v-if="draft.engine === 'mongodb'">
        <label>默认数据库（可选）</label>
        <input v-model="draft.database" class="input" />
        <label>authSource</label>
        <input v-model="draft.mongo_auth_source" class="input" />
      </template>
      <div class="actions">
        <button type="button" class="btn primary sm" @click="() => save(false)">保存</button>
        <button type="button" class="btn sm" @click="test">测试</button>
        <button type="button" class="btn danger sm" v-if="draft.id" @click="remove">删除</button>
      </div>
      <p class="hint">连接信息保存在本地 config.json。测试连接成功后会自动保存；也可直接点「保存」。正式安装包使用应用用户目录下的数据文件夹。</p>
      <div v-if="msg" class="msg">{{ msg }}</div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { apiFetch } from '@/api/client.js'

const props = defineProps({
  connections: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['select', 'updated', 'new'])

const draft = reactive({
  id: '',
  name: '',
  engine: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  database: '',
  username: '',
  password: '',
  sqlite_path: '',
  mongo_auth_source: 'admin',
})

const msg = ref('')

watch(
  () => props.modelValue,
  (v) => {
    msg.value = ''
    if (!v) {
      draft.id = ''
      draft.name = ''
      draft.engine = 'mysql'
      draft.host = '127.0.0.1'
      draft.port = 3306
      draft.database = ''
      draft.username = ''
      draft.password = ''
      draft.sqlite_path = ''
      draft.mongo_auth_source = 'admin'
      return
    }
    Object.assign(draft, {
      id: v.id || '',
      name: v.name || '',
      engine: v.engine || 'mysql',
      host: v.host || '127.0.0.1',
      port: v.port ?? (v.engine === 'postgres' ? 5432 : v.engine === 'mongodb' ? 27017 : 3306),
      database: v.database || '',
      username: v.username || '',
      password: '',
      sqlite_path: v.sqlite_path || '',
      mongo_auth_source: v.mongo_auth_source || 'admin',
    })
  },
  { immediate: true },
)

function saveBody() {
  return {
    id: draft.id || null,
    name: draft.name,
    engine: draft.engine,
    host: draft.engine === 'sqlite' ? null : draft.host,
    port: draft.engine === 'sqlite' ? null : draft.port,
    database: draft.database || null,
    username: draft.engine === 'sqlite' ? null : draft.username,
    password: draft.password || null,
    sqlite_path: draft.sqlite_path || null,
    mongo_auth_source: draft.mongo_auth_source || 'admin',
  }
}

async function save(afterTest = false) {
  msg.value = ''
  try {
    const data = await apiFetch('/database/connections', {
      method: 'POST',
      body: saveBody(),
    })
    const list = data.connections || []
    const sid = data.saved_id
    const mine =
      sid ||
      list.find((x) => x.name === draft.name && x.engine === draft.engine)?.id ||
      list[list.length - 1]?.id ||
      null
    emit('updated', mine)
    msg.value = afterTest ? '连接成功，已保存到本地配置' : '已保存'
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function test() {
  msg.value = ''
  try {
    const res = await apiFetch('/database/test', {
      method: 'POST',
      body: { id: null, ...saveBody() },
    })
    if (res.ok) {
      await save(true)
    } else {
      msg.value = res.message || '失败'
    }
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function remove() {
  if (!draft.id) return
  await apiFetch(`/database/connections/${draft.id}`, { method: 'DELETE' })
  emit('updated', null)
  emit('new')
}
</script>

<style scoped>
.cm {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
  min-width: 260px;
}
.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.conn-list {
  list-style: none;
  padding: 0;
  margin: 8px 0;
}
.conn-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.conn-list li.active {
  background: #eef2ff;
}
.badge {
  font-size: 11px;
  background: #e5e7eb;
  padding: 2px 6px;
  border-radius: 4px;
}
.form {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.input {
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.btn.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
.btn.danger {
  color: #b91c1c;
}
.btn.sm {
  padding: 4px 8px;
  font-size: 12px;
}
.msg {
  font-size: 12px;
  color: #374151;
}
.hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #6b7280;
}
label {
  font-size: 12px;
  color: #4b5563;
}
</style>
