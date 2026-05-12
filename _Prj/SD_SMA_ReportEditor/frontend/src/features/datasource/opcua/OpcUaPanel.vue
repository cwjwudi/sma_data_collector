<template>
  <div class="opcua">
    <div class="cols">
      <aside class="list-pane">
        <div class="list-head">
          <span>已保存连接</span>
          <button type="button" class="btn sm" @click="startNew">新建</button>
        </div>
        <ul class="server-ul">
          <li
            v-for="s in servers"
            :key="s.id"
            :class="{ active: selected?.id === s.id }"
            @click="selectServer(s)"
          >
            {{ s.name || s.endpoint_url }}
          </li>
        </ul>
      </aside>
      <div class="form-pane">
        <label>名称</label>
        <input v-model="form.name" class="input" />
        <label>Endpoint URL</label>
        <input v-model="form.endpoint_url" class="input" placeholder="opc.tcp://host:4840" />
        <label>用户名（可选）</label>
        <input v-model="form.username" class="input" />
        <label>密码（可选）</label>
        <input v-model="form.password" type="password" class="input" autocomplete="new-password" />
        <div class="actions">
          <button type="button" class="btn primary sm" @click="saveServer">保存</button>
          <button type="button" class="btn sm" @click="testDraft">测试连接（当前表单）</button>
          <button type="button" class="btn danger sm" v-if="form.id" @click="removeServer">删除</button>
        </div>
        <div v-if="msg" class="msg">{{ msg }}</div>
      </div>
      <div class="browse-pane" v-if="form.id">
        <div class="browse-head">
          <span>地址空间</span>
          <button type="button" class="btn sm" @click="refreshRoot">刷新根</button>
        </div>
        <OpcUaTree :nodes="treeNodes" @expand="loadChildren" @pick="pickNode" />
        <div v-if="pickedNode" class="detail">
          <div><strong>节点</strong> {{ pickedNode.node_id }}</div>
          <button type="button" class="btn sm" @click="readValue">读取数值</button>
          <pre v-if="readOut" class="pre">{{ readOut }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { apiFetch } from '@/api/client.js'
import OpcUaTree from './OpcUaTree.vue'

const servers = ref([])
const selected = ref(null)
const form = reactive({
  id: '',
  name: '',
  endpoint_url: '',
  username: '',
  password: '',
})
const msg = ref('')
const treeNodes = ref([])
const pickedNode = ref(null)
const readOut = ref('')

async function loadServers() {
  const data = await apiFetch('/opcua/servers')
  servers.value = data.servers || []
}

function selectServer(s) {
  selected.value = s
  form.id = s.id
  form.name = s.name || ''
  form.endpoint_url = s.endpoint_url || ''
  form.username = s.username || ''
  form.password = ''
  msg.value = ''
  treeNodes.value = []
  pickedNode.value = null
  readOut.value = ''
  refreshRoot()
}

function startNew() {
  selected.value = null
  form.id = ''
  form.name = ''
  form.endpoint_url = ''
  form.username = ''
  form.password = ''
  treeNodes.value = []
  pickedNode.value = null
}

async function saveServer() {
  msg.value = ''
  try {
    await apiFetch('/opcua/servers', {
      method: 'POST',
      body: {
        id: form.id || null,
        name: form.name,
        endpoint_url: form.endpoint_url,
        username: form.username || null,
        password: form.password || null,
      },
    })
    await loadServers()
    const created =
      servers.value.find((x) => x.name === form.name && x.endpoint_url === form.endpoint_url) ||
      servers.value.find((x) => x.endpoint_url === form.endpoint_url)
    if (created) selectServer(created)
    msg.value = '已保存'
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function removeServer() {
  if (!form.id) return
  await apiFetch(`/opcua/servers/${form.id}`, { method: 'DELETE' })
  await loadServers()
  startNew()
}

async function testDraft() {
  msg.value = ''
  try {
    const res = await apiFetch('/opcua/test', {
      method: 'POST',
      body: {
        endpoint_url: form.endpoint_url,
        username: form.username || null,
        password: form.password || null,
      },
    })
    msg.value = res.ok ? '连接成功' : res.message || '失败'
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function refreshRoot() {
  if (!form.id) return
  try {
    const res = await apiFetch(`/opcua/browse_saved/${form.id}`, { method: 'POST', body: {} })
    treeNodes.value = (res.nodes || []).map((n) => ({ ...n, children: [] }))
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function loadChildren(node) {
  if (!form.id || !node.node_id) return
  try {
    const res = await apiFetch(`/opcua/browse_saved/${form.id}`, {
      method: 'POST',
      body: { node_id: node.node_id },
    })
    node.children = (res.nodes || []).map((n) => ({ ...n, children: [] }))
    treeNodes.value = [...treeNodes.value]
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

function pickNode(n) {
  pickedNode.value = n
  readOut.value = ''
}

async function readValue() {
  if (!form.id || !pickedNode.value?.node_id) return
  try {
    const res = await apiFetch(`/opcua/read_saved/${form.id}`, {
      method: 'POST',
      body: { node_id: pickedNode.value.node_id },
    })
    readOut.value = JSON.stringify(res, null, 2)
  } catch (e) {
    readOut.value = e.message || String(e)
  }
}

onMounted(loadServers)
</script>

<style scoped>
.opcua {
  width: 100%;
}
.cols {
  display: grid;
  grid-template-columns: 200px 280px 1fr;
  gap: 16px;
  min-height: 420px;
}
.list-pane {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  background: #fafafa;
}
.list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}
.server-ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.server-ul li {
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.server-ul li.active {
  background: #eef2ff;
  color: #4338ca;
}
.form-pane {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.browse-pane {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  overflow: auto;
}
label {
  font-size: 12px;
  color: #374151;
}
.input {
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
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
  border-color: #fecaca;
  color: #b91c1c;
}
.btn.sm {
  padding: 4px 8px;
  font-size: 12px;
}
.msg {
  font-size: 13px;
  color: #374151;
}
.browse-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.detail {
  margin-top: 12px;
  font-size: 13px;
}
.pre {
  background: #111827;
  color: #e5e7eb;
  padding: 8px;
  border-radius: 6px;
  overflow: auto;
  max-height: 200px;
}
</style>
