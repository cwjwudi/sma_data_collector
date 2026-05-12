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
        <div class="browse-body">
          <div class="tree-wrap">
            <OpcUaTree
              :nodes="treeNodes"
              :truncation-hint="truncationHint"
              @toggle="onToggleNode"
              @pick="pickNode"
            />
          </div>
          <div class="detail-wrap">
            <div v-if="pickedNode" class="detail">
              <div class="detail-line">
                <strong>节点</strong>
                <span class="detail-nid mono">{{ pickedNode.node_id }}</span>
              </div>
              <button type="button" class="btn sm" @click="readValue">读取数值</button>
              <pre v-if="readOut" class="pre">{{ readOut }}</pre>
            </div>
            <div v-else class="detail-placeholder">点击树中节点可选中，并在此读取数值</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, shallowRef, triggerRef } from 'vue'
import { apiFetch } from '@/api/client.js'
import OpcUaTree from './OpcUaTree.vue'

const BROWSE_PAGE_LIMIT = 80

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
const treeNodes = shallowRef([])
const pickedNode = ref(null)
const readOut = ref('')
const truncationHint = ref('')

function wrapOpcNode(raw) {
  return {
    ...raw,
    children: [],
    expanded: false,
    loading: false,
    loaded: false,
    errorMessage: null,
  }
}

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
  truncationHint.value = ''
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
  truncationHint.value = ''
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
  truncationHint.value = ''
  try {
    const res = await apiFetch(`/opcua/browse_saved/${form.id}`, { method: 'POST', body: {} })
    const list = res.nodes || []
    treeNodes.value = list.map((n) => wrapOpcNode(n))
    if (list.length >= BROWSE_PAGE_LIMIT) {
      truncationHint.value = `根层级仅显示前 ${BROWSE_PAGE_LIMIT} 个子节点（服务器可能还有更多）。`
    }
  } catch (e) {
    msg.value = e.message || String(e)
  }
}

async function onToggleNode(node) {
  if (!form.id || !node.node_id || node.loading) return
  if (node.loaded) {
    node.expanded = !node.expanded
    triggerRef(treeNodes)
    return
  }
  node.loading = true
  node.errorMessage = null
  triggerRef(treeNodes)
  try {
    const res = await apiFetch(`/opcua/browse_saved/${form.id}`, {
      method: 'POST',
      body: { node_id: node.node_id },
    })
    const list = res.nodes || []
    node.children = list.map((n) => wrapOpcNode(n))
    node.loaded = true
    node.expanded = true
    if (list.length >= BROWSE_PAGE_LIMIT) {
      truncationHint.value = `节点「${node.display_name || node.browse_name || node.node_id}」下仅显示前 ${BROWSE_PAGE_LIMIT} 个子节点。`
    }
  } catch (e) {
    node.errorMessage = e.message || String(e)
    msg.value = node.errorMessage
  } finally {
    node.loading = false
    triggerRef(treeNodes)
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
  min-width: 0;
}
.cols {
  display: grid;
  grid-template-columns: 200px minmax(240px, 280px) minmax(0, 1fr);
  gap: 16px;
  min-height: 420px;
  align-items: stretch;
}
.list-pane,
.form-pane,
.browse-pane {
  min-width: 0;
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
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.browse-body {
  display: flex;
  flex-direction: row;
  gap: 16px;
  flex: 1;
  min-height: 280px;
  min-width: 0;
}
@media (max-width: 1100px) {
  .browse-body {
    flex-direction: column;
  }
  .tree-wrap {
    max-height: 45vh;
  }
}
.tree-wrap {
  flex: 1;
  min-width: 0;
  overflow: auto;
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  padding: 8px 4px;
  background: #fafafa;
}
.detail-wrap {
  width: 280px;
  flex-shrink: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
@media (max-width: 1100px) {
  .detail-wrap {
    width: 100%;
  }
}
.detail-placeholder {
  font-size: 12px;
  color: #9ca3af;
  padding: 8px 0;
}
.detail-line {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 13px;
  word-break: break-all;
}
.detail-nid {
  font-size: 11px;
  color: #4b5563;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
  flex-shrink: 0;
}
.detail {
  font-size: 13px;
  padding: 8px 0;
}
.pre {
  background: #111827;
  color: #e5e7eb;
  padding: 8px;
  border-radius: 6px;
  overflow: auto;
  max-height: min(240px, 40vh);
  font-size: 12px;
  margin-top: 8px;
}
</style>
