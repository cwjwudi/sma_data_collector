<template>
  <section class="card">
    <h3>运行环境诊断</h3>
    <p class="hint">检查后端运行环境、端口与数据目录。修复仅执行创建目录、写入默认配置等安全操作。</p>
    <div class="actions">
      <button type="button" class="btn primary" :disabled="loading" @click="runCheck">一键检查</button>
      <button type="button" class="btn" :disabled="loading || fixing" @click="runFix">一键修复（安全项）</button>
    </div>
    <div v-if="nodeTools.node || nodeTools.npm" class="node-tools">
      <span v-if="nodeTools.node">Node {{ nodeTools.node }}</span>
      <span v-if="nodeTools.npm">npm {{ nodeTools.npm }}</span>
    </div>
    <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
    <div v-if="fixResult" class="fix-result">
      <div v-if="fixResult.applied?.length">已执行：{{ fixResult.applied.join('，') }}</div>
      <div v-if="fixResult.errors?.length" class="warn">{{ fixResult.errors.join('；') }}</div>
    </div>
    <table v-if="checks.length" class="table">
      <thead>
        <tr>
          <th>检查项</th>
          <th>状态</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in checks" :key="c.id">
          <td>{{ c.label }}</td>
          <td><span :class="['badge', statusClass(c.status)]">{{ c.status }}</span></td>
          <td>{{ c.detail }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { apiFetch } from '@/api/client.js'

const loading = ref(false)
const fixing = ref(false)
const checks = ref([])
const nodeTools = ref({ node: null, npm: null })
const errorMsg = ref('')
const fixResult = ref(null)

function statusClass(s) {
  if (s === 'ok') return 'ok'
  if (s === 'warn') return 'warn'
  return 'fail'
}

async function runCheck() {
  loading.value = true
  errorMsg.value = ''
  fixResult.value = null
  try {
    const data = await apiFetch('/environment/check')
    checks.value = data.checks || []
    nodeTools.value = data.node_tools || {}
  } catch (e) {
    errorMsg.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}

async function runFix() {
  fixing.value = true
  errorMsg.value = ''
  fixResult.value = null
  try {
    fixResult.value = await apiFetch('/environment/fix', {
      method: 'POST',
      body: { actions: ['ensure_directories', 'write_default_config'] },
    })
    await runCheck()
  } catch (e) {
    errorMsg.value = e.message || String(e)
  } finally {
    fixing.value = false
  }
}
</script>

<style scoped>
.card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
}
.hint {
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.btn {
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
.btn.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table th,
.table td {
  border: 1px solid #e5e7eb;
  padding: 8px;
  text-align: left;
}
.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  text-transform: uppercase;
}
.badge.ok {
  background: #dcfce7;
  color: #166534;
}
.badge.warn {
  background: #fef9c3;
  color: #854d0e;
}
.badge.fail {
  background: #fee2e2;
  color: #991b1b;
}
.error {
  color: #b91c1c;
  margin-bottom: 8px;
  font-size: 13px;
}
.fix-result {
  font-size: 13px;
  margin-bottom: 8px;
}
.warn {
  color: #92400e;
}
.node-tools {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
  display: flex;
  gap: 12px;
}
</style>
