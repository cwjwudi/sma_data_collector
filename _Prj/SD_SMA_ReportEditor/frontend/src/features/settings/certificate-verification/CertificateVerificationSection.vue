<template>
  <section class="settings-section">
    <h3 class="settings-section__title">证书验证</h3>
    <p class="settings-hint">
      输入许可证或证书内容进行验证，可延长软件使用权；多次验证可累加授权天数。
    </p>

    <dl class="settings-meta">
      <div class="settings-meta-row">
        <dt>授权状态</dt>
        <dd :class="{ 'license-status--active': status.active }">
          {{ status.active ? '有效' : '未激活或已过期' }}
        </dd>
      </div>
      <div v-if="status.active" class="settings-meta-row">
        <dt>剩余天数</dt>
        <dd>{{ status.remainingDays }} 天</dd>
      </div>
      <div v-if="status.expiresAt" class="settings-meta-row">
        <dt>到期时间</dt>
        <dd>{{ formatDemoLicenseExpiry(status.expiresAt) }}</dd>
      </div>
      <div v-if="status.activations > 0" class="settings-meta-row">
        <dt>累计验证</dt>
        <dd>{{ status.activations }} 次</dd>
      </div>
    </dl>

    <div class="settings-field-row settings-field-row--inline">
      <div class="settings-field-group settings-field-group--grow">
        <label class="settings-field-label" for="demo-license-code">证书 / 许可证内容</label>
        <input
          id="demo-license-code"
          v-model="codeInput"
          type="text"
          class="settings-input"
          autocomplete="off"
          spellcheck="false"
          placeholder="粘贴或输入证书内容"
          :disabled="busy"
          @keydown.enter.prevent="submit"
        />
      </div>
      <button type="button" class="settings-btn settings-btn--primary" :disabled="busy || !codeInput.trim()" @click="submit">
        验证并续期
      </button>
    </div>

    <p v-if="msg" class="settings-msg" :class="{ 'settings-msg--ok': msgTone === 'ok', 'settings-msg--err': msgTone === 'err' }">
      {{ msg }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  formatDemoLicenseExpiry,
  getDemoLicenseStatus,
  type DemoLicenseStatus,
  verifyDemoLicenseCode,
} from './demo-license-store'

const codeInput = ref('')
const busy = ref(false)
const msg = ref('')
const msgTone = ref<'ok' | 'err' | ''>('')
const status = ref<DemoLicenseStatus>(getDemoLicenseStatus())

function refreshStatus() {
  status.value = getDemoLicenseStatus()
}

function setMsg(text: string, tone: 'ok' | 'err' | '') {
  msg.value = text
  msgTone.value = tone
}

function submit() {
  const code = codeInput.value.trim()
  if (!code) return

  busy.value = true
  setMsg('', '')

  const result = verifyDemoLicenseCode(code)
  if (!result.ok) {
    if (result.reason === 'storage_error') {
      setMsg('无法保存授权信息，请检查浏览器存储是否可用。', 'err')
    } else {
      setMsg('证书无效，请核对内容后重试。', 'err')
    }
    busy.value = false
    return
  }

  refreshStatus()
  codeInput.value = ''
  setMsg(
    `验证成功，已增加 ${result.addedDays} 天使用权；当前剩余 ${result.remainingDays} 天，到期 ${formatDemoLicenseExpiry(result.expiresAt)}。`,
    'ok',
  )
  busy.value = false
}

onMounted(() => {
  refreshStatus()
})
</script>

<style scoped>
.license-status--active {
  color: #166534 !important;
}
</style>
