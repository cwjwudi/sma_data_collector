<template>
  <div class="ddl-panel">
    <div v-if="!canPreview" class="ddl-hint">
      DDL 预览仅支持 SQL 引擎且需在左侧选中<strong>数据表</strong>；MongoDB 可使用 ER 图或其它工具查看结构。
    </div>

    <template v-else>
      <div v-if="loading" class="ddl-loading">加载 DDL…</div>
      <div v-else-if="errorMessage" class="ddl-err">{{ errorMessage }}</div>
      <template v-else-if="ddlText.trim()">
        <p class="ddl-meta">
          <span v-if="charsetHint" class="ddl-chip">检测到字符集：{{ charsetHint }}</span>
          <span v-if="riskHintCount > 0" class="ddl-chip ddl-chip-warn">{{ riskHintCount }} 列疑似 NOT NULL 且无默认值</span>
        </p>
        <details v-if="riskHintCount > 0" class="ddl-fix-card" open>
          <summary class="ddl-fix-sum">自动修复 SQL（可复制）</summary>
          <div class="ddl-fix-body">
            <p class="ddl-fix-note">
              以下为<strong>启发式</strong>生成的 ALTER，请在<strong>测试库</strong>验证后再用于生产；日期时间列默认补
              <code>CURRENT_TIMESTAMP</code>，其它类型按常见占位推断。
            </p>
            <ul v-if="fixResult.warnings.length" class="ddl-fix-warns">
              <li v-for="(w, i) in fixResult.warnings" :key="'fw-' + i">{{ w }}</li>
            </ul>
            <textarea
              v-if="fixResult.sql.trim()"
              readonly
              class="ddl-fix-ta"
              :rows="fixTaRows"
              :value="fixResult.sql"
            />
            <p v-else class="ddl-fix-empty">当前风险列无法自动生成 MODIFY（例如 TEXT/BLOB），请手写迁移语句。</p>
            <div class="ddl-fix-actions">
              <button type="button" class="btn-fix" :disabled="!fixResult.sql.trim()" @click="copyFixSql">
                复制修复 SQL
              </button>
              <span v-if="copyHint" class="ddl-copy-hint">{{ copyHint }}</span>
            </div>
          </div>
        </details>
        <details
          v-for="seg in segments"
          :key="seg.kind + seg.title"
          class="ddl-card"
          :open="seg.kind === 'columns' || seg.kind === 'preamble' || seg.kind === 'raw'"
        >
          <summary class="ddl-sum">{{ seg.title }}（{{ seg.lines.length }} 行）</summary>
          <div class="ddl-card-body">
            <template v-if="seg.kind === 'columns'">
              <div
                v-for="(line, i) in seg.lines"
                :key="'col-' + i"
                class="ddl-line-wrap"
                :class="{ 'ddl-row-risk': columnRisk(line) }"
              >
                <code class="ddl-line-code" v-html="columnHtml(line)" />
              </div>
            </template>
            <pre v-else class="ddl-pre"><code class="hljs" v-html="highlightBlock(seg.lines.join('\n'))" /></pre>
          </div>
        </details>
      </template>
      <div v-else class="ddl-empty">暂无 DDL 内容</div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import hljs from 'highlight.js/lib/core'
import sql from 'highlight.js/lib/languages/sql'
import 'highlight.js/styles/github-dark.css'
import { parseDdlSegments } from './parseDdlSegments.js'
import { extractCharsetFromDdl } from './ddlTypeTooltips.js'
import { columnLineToHtml, isNotNullWithoutDefaultRisk, escapeHtml } from './ddlColumnLineHtml.js'
import { generateNotNullDefaultFixSql, listRiskColumnLines } from './ddlRiskFixSql.js'

hljs.registerLanguage('sql', sql)

const props = defineProps({
  engine: { type: String, default: '' },
  ddlText: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  canPreview: { type: Boolean, default: false },
})

const segments = computed(() => parseDdlSegments(props.ddlText, props.engine))

const charsetHint = computed(() => extractCharsetFromDdl(props.ddlText))

const riskHintCount = computed(() => listRiskColumnLines(segments.value).length)

const fixResult = computed(() => generateNotNullDefaultFixSql(props.engine, props.ddlText, segments.value))

const fixTaRows = computed(() => Math.min(14, Math.max(4, fixResult.value.sql.split('\n').length + 1)))

const copyHint = ref('')
let copyTimer = null

async function copyFixSql() {
  const sql = fixResult.value.sql.trim()
  if (!sql) return
  try {
    await navigator.clipboard.writeText(sql)
    copyHint.value = '已复制到剪贴板'
  } catch {
    copyHint.value = '复制失败，请在文本框内手动复制'
  }
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyHint.value = ''
  }, 2600)
}

function highlightBlock(code) {
  if (!code.trim()) return ''
  try {
    return hljs.highlight(code, { language: 'sql', ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

function columnHtml(line) {
  return columnLineToHtml(line, charsetHint.value)
}

function columnRisk(line) {
  const t = line.trim()
  if (!t) return false
  return isNotNullWithoutDefaultRisk(line)
}
</script>

<style scoped>
.ddl-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
}
.ddl-hint {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  padding: 10px;
  border-radius: 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}
.ddl-loading {
  font-size: 13px;
  color: #4b5563;
}
.ddl-err {
  font-size: 13px;
  color: #b91c1c;
  padding: 10px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
}
.ddl-empty {
  font-size: 13px;
  color: #9ca3af;
}
.ddl-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.ddl-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
}
.ddl-chip-warn {
  background: #fef9c3;
  color: #854d0e;
}
.ddl-fix-card {
  border: 1px solid #fcd34d;
  border-radius: 8px;
  background: #fffbeb;
  overflow: hidden;
}
.ddl-fix-sum {
  cursor: pointer;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #92400e;
  background: #fef3c7;
  list-style: none;
}
.ddl-fix-sum::-webkit-details-marker {
  display: none;
}
.ddl-fix-sum::before {
  content: '▸ ';
  display: inline-block;
  transition: transform 0.12s ease;
  margin-right: 4px;
}
.ddl-fix-card[open] > .ddl-fix-sum::before {
  transform: rotate(90deg);
}
.ddl-fix-body {
  padding: 10px 12px;
  border-top: 1px solid #fcd34d;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ddl-fix-note {
  margin: 0;
  font-size: 12px;
  color: #78350f;
  line-height: 1.5;
}
.ddl-fix-note code {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  background: #fde68a;
}
.ddl-fix-warns {
  margin: 0;
  padding-left: 18px;
  font-size: 11px;
  color: #b45309;
  line-height: 1.45;
}
.ddl-fix-ta {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #d97706;
  background: #fffdf7;
  color: #1c1917;
  resize: vertical;
  min-height: 72px;
}
.ddl-fix-empty {
  margin: 0;
  font-size: 12px;
  color: #92400e;
}
.ddl-fix-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.btn-fix {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d97706;
  background: #ea580c;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}
.btn-fix:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ddl-copy-hint {
  font-size: 12px;
  color: #15803d;
}
.ddl-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.ddl-sum {
  cursor: pointer;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  background: #f9fafb;
  list-style: none;
}
.ddl-sum::-webkit-details-marker {
  display: none;
}
.ddl-sum::before {
  content: '▸ ';
  display: inline-block;
  transition: transform 0.12s ease;
  margin-right: 4px;
}
details[open] > .ddl-sum::before {
  transform: rotate(90deg);
}
.ddl-card-body {
  border-top: 1px solid #e5e7eb;
  padding: 8px 10px;
  max-height: 360px;
  overflow: auto;
  background: #0d1117;
}
.ddl-pre {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.ddl-line-wrap {
  border-radius: 4px;
  padding: 2px 6px;
  margin: 2px 0;
}
.ddl-row-risk {
  background: rgba(250, 204, 21, 0.35);
  border-left: 3px solid #ca8a04;
  padding-left: 8px;
}
.ddl-line-code {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: #e6edf3;
}
:deep(.ddl-kw) {
  color: #d2a8ff;
  font-weight: 600;
}
:deep(.ddl-tip) {
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  cursor: help;
  color: #79c0ff;
}
:deep(.hljs) {
  background: transparent;
  padding: 0;
  color: #e6edf3;
}
:deep(.hljs-keyword) {
  color: #ff7b72;
}
:deep(.hljs-string) {
  color: #a5d6ff;
}
:deep(.hljs-number) {
  color: #79c0ff;
}
:deep(.hljs-comment) {
  color: #8b949e;
}
</style>
