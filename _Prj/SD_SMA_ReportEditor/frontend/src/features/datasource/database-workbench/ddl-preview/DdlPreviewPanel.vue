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
import { computed } from 'vue'
import hljs from 'highlight.js/lib/core'
import sql from 'highlight.js/lib/languages/sql'
import 'highlight.js/styles/github-dark.css'
import { parseDdlSegments } from './parseDdlSegments.js'
import { extractCharsetFromDdl } from './ddlTypeTooltips.js'
import { columnLineToHtml, isNotNullWithoutDefaultRisk, escapeHtml } from './ddlColumnLineHtml.js'

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

const riskHintCount = computed(() => {
  const colSeg = segments.value.find((s) => s.kind === 'columns')
  if (!colSeg) return 0
  return colSeg.lines.filter((ln) => ln.trim() && isNotNullWithoutDefaultRisk(ln)).length
})

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
