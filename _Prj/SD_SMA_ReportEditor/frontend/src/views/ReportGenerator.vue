<template>
  <div class="rg-page">
    <h2 class="rg-title">生成报表</h2>
    <p class="rg-lead">
      导出 PDF 与模版编辑器中<strong>导出预览</strong>栈一致（同一套控件缩放与 OPC/SQL 绑定填充）。请在<strong>Electron 桌面版</strong>中使用完整导出能力。
    </p>

    <div v-if="!electronShell" class="rg-banner rg-banner--warn">
      当前运行在浏览器壳：无法弹出系统保存对话框与后台渲染 PDF。请使用 <code>npm run electron:dev</code> 或安装版客户端。
    </div>

    <section class="rg-card">
      <h3 class="rg-h3">手动导出 PDF</h3>
      <div class="rg-row">
        <label class="rg-lbl" for="rg-tpl">报表模版</label>
        <select id="rg-tpl" v-model="prefs.templateId" class="rg-select">
          <option :value="null">请选择…</option>
          <option v-for="row in templateRows" :key="row.item.id" :value="row.item.id">
            {{ templateSelectLabel(row.seq, row.item.name) }}
          </option>
        </select>
      </div>
      <div class="rg-switch-row">
        <span class="rg-switch-label" id="rg-manual-open-lbl">导出完成后打开 PDF（桌面壳）</span>
        <button
          type="button"
          class="rg-switch"
          :class="{ 'rg-switch--on': prefs.manualOpenAfter }"
          role="switch"
          aria-labelledby="rg-manual-open-lbl"
          :aria-checked="prefs.manualOpenAfter"
          :disabled="!electronShell"
          @click="toggleManualOpenAfter"
        />
      </div>
      <div class="rg-actions">
        <button type="button" class="btn primary" :disabled="manualBusy || !canManualExport" @click="onManualExport">
          {{ manualBusy ? "导出中…" : "选择保存位置并导出 PDF" }}
        </button>
      </div>
      <p v-if="manualHint" class="rg-hint">{{ manualHint }}</p>
    </section>

    <section class="rg-card">
      <h3 class="rg-h3">导出结果反馈（OPC UA 写回 PLC）</h3>
      <div class="rg-switch-row">
        <span class="rg-switch-label" id="rg-export-opc-lbl">启用导出结果写回</span>
        <button
          type="button"
          class="rg-switch"
          :class="{ 'rg-switch--on': prefs.exportResultOpc.enabled }"
          role="switch"
          aria-labelledby="rg-export-opc-lbl"
          :aria-checked="prefs.exportResultOpc.enabled"
          @click="toggleExportResultOpc"
        />
      </div>
      <p class="rg-mini rg-mini--switch">
        手动或自动导出完成后，将成功/失败状态、摘要信息与文件路径写入下方 OPC 变量，供 PLC 读取。
      </p>

      <div class="rg-auto-fields" :class="{ 'rg-auto-fields--off': !prefs.exportResultOpc.enabled }">
        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-export-opc-srv">已保存连接</label>
          <select id="rg-export-opc-srv" v-model="prefs.exportResultOpc.serverId" class="rg-select">
            <option value="">请选择…</option>
            <option v-for="s in opcServers" :key="s.id" :value="s.id">{{ s.name || s.id }}</option>
          </select>
        </div>
        <p v-if="prefs.exportResultOpc.enabled && !opcServers.length" class="rg-mini rg-mini--indent rg-mini--warn">
          暂无已保存的 OPC UA 连接。请先到
          <router-link :to="{ name: 'DataSourceConfig', query: { tab: 'opc' } }">数据源配置 → OPC UA</router-link>
          添加并保存连接。
        </p>

        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-export-opc-status">状态节点（Boolean / Int）</label>
          <div class="rg-inline">
            <select v-model="prefs.exportResultOpc.statusKind" class="rg-select">
              <option value="bool">Boolean（成功 true / 失败 false）</option>
              <option value="int">Int（成功 1 / 失败 0）</option>
            </select>
            <input
              id="rg-export-opc-status"
              :value="prefs.exportResultOpc.statusNodeId"
              type="text"
              readonly
              class="rg-inp rg-inp--grow rg-mono"
              placeholder="未绑定"
            />
            <button type="button" class="btn" @click="openRgOpcPick('feedbackStatus')">从地址空间选择…</button>
          </div>
        </div>

        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-export-opc-msg">信息节点（String）</label>
          <div class="rg-inline">
            <input
              id="rg-export-opc-msg"
              :value="prefs.exportResultOpc.messageNodeId"
              type="text"
              readonly
              class="rg-inp rg-inp--grow rg-mono"
              placeholder="未绑定"
            />
            <button type="button" class="btn" @click="openRgOpcPick('feedbackMessage')">从地址空间选择…</button>
          </div>
          <p class="rg-mini rg-mini--indent">成功时写入「OK: 文件名」；失败时写入错误摘要（首行）。</p>
        </div>

        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-export-opc-path">路径节点（String，可选）</label>
          <div class="rg-inline">
            <input
              id="rg-export-opc-path"
              :value="prefs.exportResultOpc.filePathNodeId"
              type="text"
              readonly
              class="rg-inp rg-inp--grow rg-mono"
              placeholder="未绑定"
            />
            <button type="button" class="btn" @click="openRgOpcPick('feedbackFilePath')">从地址空间选择…</button>
          </div>
          <p class="rg-mini rg-mini--indent">成功时写入完整 PDF 路径；失败时写入空字符串。</p>
        </div>

        <p v-if="exportResultOpcServerLabel" class="rg-mini rg-mini--indent">当前连接：{{ exportResultOpcServerLabel }}</p>
      </div>
    </section>

    <section class="rg-card">
      <h3 class="rg-h3">OPC UA 条件自动导出</h3>
      <div class="rg-switch-row">
        <span class="rg-switch-label" id="rg-auto-enabled-lbl">启用自动导出</span>
        <button
          type="button"
          class="rg-switch"
          :class="{ 'rg-switch--on': prefs.auto.enabled }"
          role="switch"
          aria-labelledby="rg-auto-enabled-lbl"
          :aria-checked="prefs.auto.enabled"
          :disabled="!electronShell"
          @click="toggleAutoEnabled"
        />
      </div>
      <p v-if="!electronShell" class="rg-mini rg-mini--switch">自动导出仅在 Electron 桌面版可用。</p>

      <div class="rg-auto-fields" :class="{ 'rg-auto-fields--off': !prefs.auto.enabled }">
      <div class="rg-export-dir-block">
        <span class="rg-lbl">导出文件夹</span>
        <div class="rg-tabs" role="tablist" aria-label="导出文件夹来源">
          <button
            type="button"
            role="tab"
            class="rg-tab"
            :class="{ 'rg-tab--on': prefs.autoExportDirSource === 'default' }"
            :aria-selected="prefs.autoExportDirSource === 'default'"
            @click="setExportDirTab('default')"
          >
            默认文件夹
          </button>
          <button
            type="button"
            role="tab"
            class="rg-tab"
            :class="{ 'rg-tab--on': prefs.autoExportDirSource === 'opcua' }"
            :aria-selected="prefs.autoExportDirSource === 'opcua'"
            @click="setExportDirTab('opcua')"
          >
            绑定 OPC UA
          </button>
        </div>

        <div class="rg-tab-panel" role="tabpanel">
          <template v-if="prefs.autoExportDirSource === 'default'">
            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-auto-dir">导出目录</label>
              <div class="rg-inline">
                <input
                  id="rg-auto-dir"
                  v-model="prefs.autoExportDir"
                  type="text"
                  readonly
                  class="rg-inp rg-inp--grow"
                  placeholder="未选择（点击下方按钮）"
                />
                <button type="button" class="btn" :disabled="!electronShell" @click="onPickAutoDir">选择文件夹…</button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-auto-dir-fallback">保底目录</label>
              <div class="rg-inline">
                <input
                  id="rg-auto-dir-fallback"
                  v-model="prefs.autoExportDir"
                  type="text"
                  readonly
                  class="rg-inp rg-inp--grow"
                  placeholder="未选择（点击下方按钮）"
                />
                <button type="button" class="btn" :disabled="!electronShell" @click="onPickAutoDir">选择文件夹…</button>
              </div>
              <p class="rg-mini rg-mini--indent">OPC 路径变量为空或读取失败时，导出到此保底目录。</p>
            </div>
            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-dir-opc-var">OPC 目录变量（String）</label>
              <div class="rg-inline">
                <input
                  id="rg-dir-opc-var"
                  :value="prefs.autoExportDirOpcNodeId"
                  type="text"
                  readonly
                  class="rg-inp rg-inp--grow rg-mono"
                  placeholder="未绑定"
                />
                <button type="button" class="btn" @click="openRgOpcPick('exportDir')">打开 OPC UA 绑定树</button>
              </div>
              <p v-if="exportDirOpcServerLabel" class="rg-mini rg-mini--indent">连接：{{ exportDirOpcServerLabel }}</p>
              <p class="rg-mini rg-mini--indent">展开地址空间时仅显示 String 类型变量；文件夹节点可继续展开浏览。</p>
            </div>
          </template>
        </div>
      </div>

      <div class="rg-export-dir-block">
        <span class="rg-lbl">自动导出文件名</span>
        <div class="rg-tabs" role="tablist" aria-label="自动导出文件名">
          <button
            type="button"
            role="tab"
            class="rg-tab"
            :class="{ 'rg-tab--on': prefs.autoFileNameSource === 'segments' }"
            :aria-selected="prefs.autoFileNameSource === 'segments'"
            @click="setFileNameTab('segments')"
          >
            勾选片段
          </button>
          <button
            type="button"
            role="tab"
            class="rg-tab"
            :class="{ 'rg-tab--on': prefs.autoFileNameSource === 'opcua' }"
            :aria-selected="prefs.autoFileNameSource === 'opcua'"
            @click="setFileNameTab('opcua')"
          >
            OPC UA + 哈希
          </button>
        </div>

        <div class="rg-tab-panel" role="tabpanel">
          <template v-if="prefs.autoFileNameSource === 'segments'">
            <div class="rg-row rg-row--in-panel">
              <span class="rg-lbl">包含片段</span>
              <div class="rg-seg-bar" role="group" aria-label="文件名片段">
                <button
                  v-for="opt in fileNameSegmentOptions"
                  :key="opt.id"
                  type="button"
                  class="rg-seg-btn"
                  :class="{ 'rg-seg-btn--on': prefs.autoFileNameSegments.includes(opt.id) }"
                  :title="opt.hint"
                  :aria-pressed="prefs.autoFileNameSegments.includes(opt.id)"
                  @click="toggleFileNameSegment(opt.id)"
                >
                  {{ opt.label }}
                </button>
              </div>
              <p class="rg-mini rg-mini--indent rg-mini--after-seg">点击按钮切换片段（至少保留一项）；建议包含「随机哈希」避免重名。</p>
            </div>
          </template>

          <template v-else>
            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-fn-opc-var">OPC 文件名变量（String）</label>
              <div class="rg-inline">
                <input
                  id="rg-fn-opc-var"
                  :value="prefs.autoFileNameOpcNodeId"
                  type="text"
                  readonly
                  class="rg-inp rg-inp--grow rg-mono"
                  placeholder="未绑定"
                />
                <button type="button" class="btn" @click="openRgOpcPick('fileName')">打开 OPC UA 绑定树</button>
              </div>
              <p v-if="fileNameOpcServerLabel" class="rg-mini rg-mini--indent">连接：{{ fileNameOpcServerLabel }}</p>
              <p class="rg-mini rg-mini--indent">
                绑定树仅显示 String 类型变量；导出值为字符串基名（不含 .pdf）。
              </p>
            </div>
            <div class="rg-row rg-row--in-panel">
              <span class="rg-lbl">随机哈希</span>
              <div class="rg-seg-bar" role="group" aria-label="追加随机哈希">
                <button
                  type="button"
                  class="rg-seg-btn"
                  :class="{ 'rg-seg-btn--on': prefs.autoFileNameOpcAppendHash }"
                  title="导出时在 OPC 基名后追加时间戳（yyyyMMdd_HHmmss）与 8 位十六进制，降低重名概率"
                  :aria-pressed="prefs.autoFileNameOpcAppendHash"
                  @click="prefs.autoFileNameOpcAppendHash = !prefs.autoFileNameOpcAppendHash"
                >
                  追加随机哈希（8 位）
                </button>
              </div>
              <p class="rg-mini rg-mini--indent rg-mini--after-seg">
                点击按钮切换；开启后导出为 <code>基名_时间戳_哈希.pdf</code>，关闭则为 <code>基名.pdf</code>。
              </p>
            </div>
            <p class="rg-mini rg-mini--indent rg-mini--after-seg">
              OPC 为空、非 String 或读取失败时，回退为勾选片段规则。
            </p>
          </template>

          <div class="rg-row rg-row--in-panel rg-row--compact">
            <label class="rg-lbl" for="rg-fn-sep">片段连接符</label>
            <input id="rg-fn-sep" v-model="prefs.autoFileNameSeparator" type="text" class="rg-inp rg-inp--sep" maxlength="8" spellcheck="false" />
          </div>
          <p class="rg-mini rg-mini--indent">预览（示意）：<code>{{ autoFileNamePreview }}</code></p>
        </div>
      </div>

      <div class="rg-export-dir-block">
        <div class="rg-binding-block-head">
          <span class="rg-lbl">保存触发变量绑定</span>
          <button type="button" class="btn btn--sm" @click="addAutoTriggerBinding">+ 新建绑定</button>
        </div>
        <p v-if="!prefs.auto.bindings.length" class="rg-mini rg-mini--indent">
          暂无绑定。点击「新建绑定」添加 OPC 变量，并为每条绑定单独选择要导出的报表模版。
        </p>
        <div
          v-for="(binding, bi) in prefs.auto.bindings"
          :key="binding.id"
          class="rg-binding-card"
          :class="{ 'rg-binding-card--off': !binding.enabled }"
        >
          <div class="rg-binding-card-head">
            <span class="rg-binding-card-title">绑定 {{ bi + 1 }}</span>
            <div class="rg-binding-card-head-actions">
              <div class="rg-switch-row rg-switch-row--compact">
                <span class="rg-switch-label" :id="`rg-bind-en-lbl-${binding.id}`">启用</span>
                <button
                  type="button"
                  class="rg-switch rg-switch--sm"
                  :class="{ 'rg-switch--on': binding.enabled }"
                  role="switch"
                  :aria-labelledby="`rg-bind-en-lbl-${binding.id}`"
                  :aria-checked="binding.enabled"
                  @click="binding.enabled = !binding.enabled"
                />
              </div>
              <button
                type="button"
                class="btn btn--sm btn--ghost"
                title="删除此绑定"
                @click="removeAutoTriggerBinding(binding.id)"
              >
                删除
              </button>
            </div>
          </div>
          <div class="rg-row rg-row--in-panel">
            <label class="rg-lbl" :for="`rg-bind-tpl-${binding.id}`">导出模版</label>
            <select :id="`rg-bind-tpl-${binding.id}`" v-model="binding.templateId" class="rg-select">
              <option :value="null">请选择…</option>
              <option v-for="row in templateRows" :key="row.item.id" :value="row.item.id">
                {{ templateSelectLabel(row.seq, row.item.name) }}
              </option>
            </select>
          </div>
          <div class="rg-row rg-row--in-panel">
            <label class="rg-lbl" :for="`rg-bind-srv-${binding.id}`">已保存连接</label>
            <select :id="`rg-bind-srv-${binding.id}`" v-model="binding.serverId" class="rg-select">
              <option value="">请选择…</option>
              <option v-for="s in opcServers" :key="s.id" :value="s.id">{{ s.name || s.id }}</option>
            </select>
          </div>
          <div class="rg-row rg-row--in-panel">
            <label class="rg-lbl" :for="`rg-bind-node-${binding.id}`">触发节点 NodeId</label>
            <div class="rg-inline">
              <input
                :id="`rg-bind-node-${binding.id}`"
                v-model.trim="binding.nodeId"
                type="text"
                class="rg-inp rg-inp--grow rg-mono"
                spellcheck="false"
                placeholder="例如 ns=2;s=..."
              />
              <button type="button" class="btn" @click="openRgOpcPick(rgTriggerPickTarget(binding.id))">
                从地址空间选择…
              </button>
            </div>
          </div>
          <div class="rg-row rg-row--in-panel">
            <label class="rg-lbl" :for="`rg-bind-mode-${binding.id}`">触发条件</label>
            <select :id="`rg-bind-mode-${binding.id}`" v-model="binding.mode" class="rg-select">
              <option value="rising">上升沿（假→真；首次采样为真时也触发）</option>
              <option value="falling">下降沿（真→假；首次采样为假时也触发）</option>
              <option value="equals">值等于（与下方比较值相等时触发）</option>
            </select>
          </div>
          <div v-if="binding.mode === 'equals'" class="rg-row rg-row--in-panel">
            <label class="rg-lbl" :for="`rg-bind-cmp-${binding.id}`">比较值</label>
            <input
              :id="`rg-bind-cmp-${binding.id}`"
              v-model.trim="binding.compareValue"
              type="text"
              class="rg-inp"
              spellcheck="false"
              placeholder="例如 1、true、OK"
            />
            <p class="rg-mini rg-mini--indent">
              与 OPC 变量读数按文本/数值比较；首次采样已相等，或由不等变为相等时触发。
            </p>
          </div>
          <div
            v-if="prefs.auto.enabled && binding.enabled && bindingChartUi(binding.id)?.show"
            class="rg-row rg-row--in-panel rg-binding-chart"
          >
            <span class="rg-lbl">近期数值</span>
            <AutoTriggerValueSparkline :samples="bindingChartUi(binding.id)?.samples ?? []" />
            <p class="rg-mini rg-mini--indent">
              自动导出开启后每秒采样；保留最近 {{ triggerChartMaxSamples }} 个点（约
              {{ triggerChartMaxSamples }} 秒）。String 类型变量不显示曲线。
            </p>
          </div>
          <div class="rg-row rg-row--in-panel rg-trigger-log-block">
            <div class="rg-trigger-log-head">
              <button
                type="button"
                class="rg-trigger-log-toggle"
                :aria-expanded="isTriggerLogExpanded(binding.id)"
                @click="toggleTriggerLogExpanded(binding.id)"
              >
                <span class="rg-trigger-log-chevron" :class="{ 'rg-trigger-log-chevron--open': isTriggerLogExpanded(binding.id) }" aria-hidden="true">▸</span>
                <span class="rg-lbl rg-lbl--inline">触发记录</span>
                <span class="rg-trigger-log-count">（{{ binding.triggerLog.length }}）</span>
              </button>
              <div v-if="binding.triggerLog.length" class="rg-trigger-log-actions">
                <button type="button" class="btn btn--sm" @click="exportBindingTriggerHistory(binding, bi)">
                  导出 history logger
                </button>
                <button type="button" class="btn btn--sm btn--ghost" @click="clearBindingTriggerLog(binding.id)">
                  清空
                </button>
              </div>
            </div>
            <div v-show="isTriggerLogExpanded(binding.id)" class="rg-trigger-log-body">
              <p v-if="!binding.triggerLog.length" class="rg-mini rg-mini--indent">尚无触发记录；条件满足并尝试导出后会写入。</p>
              <template v-else>
                <p v-if="binding.triggerLog.length > triggerLogUiMax" class="rg-mini rg-mini--indent">
                  仅显示最近 {{ triggerLogUiMax }} 条，共 {{ binding.triggerLog.length }} 条；完整记录可点「导出 history logger」。
                </p>
                <div class="rg-trigger-log-wrap">
                  <table class="rg-trigger-log-table">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>触发事件</th>
                        <th>生成文件名</th>
                        <th>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in triggerLogUiSlice(binding.triggerLog)" :key="row.id">
                        <td class="rg-trigger-log-time">{{ formatTriggerLogTime(row.at) }}</td>
                        <td>{{ row.event }}</td>
                        <td class="rg-trigger-log-file" :title="row.filePath || row.fileName">
                          <code>{{ row.fileName }}</code>
                        </td>
                        <td>
                          <span
                            class="rg-trigger-log-status"
                            :class="row.success ? 'rg-trigger-log-status--ok' : 'rg-trigger-log-status--fail'"
                            :title="row.message"
                          >
                            {{ row.success ? "成功" : "失败" }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
            </div>
          </div>
        </div>
        <p class="rg-mini rg-mini--indent rg-mini--bindings-hint">
          在「数据源 → OPC UA」中保存连接；开启自动导出后每秒检测触发变量，条件满足即导出对应模版，无冷却等待。
        </p>
      </div>
      <p v-if="autoStatus" class="rg-hint">{{ autoStatus }}</p>
      </div>
    </section>

    <OpcUaNodePickerModal
      v-model="opcPickOpen"
      :key="opcPickModalKey"
      :data-type-filter="activeOpcDataTypeFilter"
      :hide-search="opcPickHideSearch"
      :title="opcPickTitle"
      :lead="opcPickLead"
      :initial-server-id="opcPickInitialServerId"
      :external-servers="opcServers"
      @confirm="onRgOpcPickConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { listTemplateSummaries, type TemplateSummary } from "@/api/templates";
import { apiFetch } from "@/api/client.js";
import {
  loadReportGeneratorPrefs,
  saveReportGeneratorPrefs,
  type AutoExportDirSource,
  type AutoFileNameSource,
  type ReportGeneratorPrefs,
} from "@/lib/report-generator-prefs";
import { loadReportExportPrefs, saveReportExportPrefs } from "@/lib/report-export-prefs";
import { templateSelectLabel, templateSelectRows } from "@/lib/template-display-order";
import { evaluateAutoOpcTrigger, createOpcTriggerPollState, type OpcTriggerPollState } from "@/lib/auto-opc-trigger";
import { resolveAutoExportDir } from "@/lib/resolve-auto-export-dir";
import { readSavedOpcNodeValue, readSavedOpcStringValue } from "@/lib/opcua-string-variables";
import { opcDataTypeLabelMatchesFilter } from "@/features/datasource/opcua/opcua-tree-utils.js";
import {
  AUTO_TRIGGER_CHART_MAX_SAMPLES,
  coerceOpcTriggerNumericSample,
  isOpcTriggerChartEligible,
  NumericSampleRing,
} from "@/lib/auto-trigger-value-history";
import AutoTriggerValueSparkline from "@/components/AutoTriggerValueSparkline.vue";
import {
  appendTriggerLogEntry,
  autoTriggerEventLabel,
  AUTO_TRIGGER_LOG_UI_MAX,
  buildTriggerHistoryLoggerText,
  defaultTriggerHistoryLoggerFileName,
  downloadTextFile,
  formatTriggerLogTime,
  triggerLogUiSlice,
} from "@/lib/auto-trigger-log";
import {
  bindingConfigKey,
  AUTO_OPC_POLL_INTERVAL_MS,
  createAutoTriggerBinding,
  isTriggerBindingActive,
  isTriggerBindingComplete,
  parseRgTriggerPickTarget,
  rgTriggerPickTarget,
  type AutoTriggerBinding,
} from "@/lib/auto-trigger-bindings";
import OpcUaNodePickerModal from "@/features/datasource/opcua/OpcUaNodePickerModal.vue";
import {
  AUTO_FILE_NAME_SEGMENT_OPTIONS,
  buildAutoExportFileName,
  formatExportTs,
  previewAutoExportFileName,
  type AutoFileNameSegment,
} from "@/lib/auto-export-filename";
import { humanizePdfExportError } from "@/lib/pdfExportErrors";
import { runTemplateExportPreflight } from "@/lib/templateExportPreflight";
import { showAppToast } from "@/composables/useAppToast";
import {
  isExportResultOpcFeedbackConfigured,
  writeExportResultToOpcua,
  type ExportResultWritePayload,
} from "@/lib/exportResultOpcFeedback";

const prefs = ref<ReportGeneratorPrefs>(loadReportGeneratorPrefs());
const exportWatchDir = loadReportExportPrefs().watchDir;
if (exportWatchDir && !prefs.value.autoExportDir) {
  prefs.value.autoExportDir = exportWatchDir;
}
const summaries = ref<TemplateSummary[]>([]);
const templateRows = computed(() => templateSelectRows(summaries.value));
const opcServers = ref<{ id: string; name?: string }[]>([]);
type RgOpcPickTarget =
  | "exportDir"
  | "fileName"
  | "feedbackStatus"
  | "feedbackMessage"
  | "feedbackFilePath"
  | string;
const opcPickOpen = ref(false);
const opcPickTarget = ref<RgOpcPickTarget | null>(null);
/** 与 opcPickTarget 同步设置，避免确认/关闭时 target 先清空导致绑定树丢失 String 筛选 */
const activeOpcDataTypeFilter = ref("");

const fileNameSegmentOptions = AUTO_FILE_NAME_SEGMENT_OPTIONS;

function opcServerLabel(serverId: string): string {
  const id = serverId.trim();
  if (!id) return "";
  const s = opcServers.value.find((x) => x.id === id);
  return s?.name?.trim() || s?.id || id;
}

const exportDirOpcServerLabel = computed(() => opcServerLabel(prefs.value.autoExportDirOpcServerId));
const fileNameOpcServerLabel = computed(() => opcServerLabel(prefs.value.autoFileNameOpcServerId));
const exportResultOpcServerLabel = computed(() => opcServerLabel(prefs.value.exportResultOpc.serverId));

function isFeedbackStringPickTarget(t: RgOpcPickTarget | null): boolean {
  return t === "feedbackMessage" || t === "feedbackFilePath";
}

function isFeedbackPickTarget(t: RgOpcPickTarget | null): boolean {
  return t === "feedbackStatus" || isFeedbackStringPickTarget(t);
}

const opcPickModalKey = computed(() => {
  const t = opcPickTarget.value;
  if (t === "exportDir") return "pick-exportDir";
  if (t === "fileName") return "pick-fileName";
  if (t === "feedbackStatus") return "pick-feedbackStatus";
  if (t === "feedbackMessage") return "pick-feedbackMessage";
  if (t === "feedbackFilePath") return "pick-feedbackFilePath";
  const bid = parseRgTriggerPickTarget(t);
  if (bid) return `pick-trigger-${bid}`;
  return "pick-idle";
});

const opcPickHideSearch = computed(() => {
  const t = opcPickTarget.value;
  if (t === "feedbackStatus" || isFeedbackStringPickTarget(t)) return false;
  return (
    t === "exportDir" ||
    t === "fileName" ||
    Boolean(parseRgTriggerPickTarget(t))
  );
});

const opcPickTitle = computed(() => {
  if (parseRgTriggerPickTarget(opcPickTarget.value)) return "选择 OPC UA 触发变量";
  if (opcPickTarget.value === "fileName") return "绑定 OPC UA String 变量（文件名）";
  if (opcPickTarget.value === "exportDir") return "绑定 OPC UA String 变量（目录）";
  if (opcPickTarget.value === "feedbackStatus") return "绑定 OPC UA 状态变量（Boolean / Int）";
  if (opcPickTarget.value === "feedbackMessage") return "绑定 OPC UA String 变量（导出信息）";
  if (opcPickTarget.value === "feedbackFilePath") return "绑定 OPC UA String 变量（文件路径）";
  return "绑定 OPC UA 变量";
});

const opcPickInitialServerId = computed(() => {
  if (opcPickTarget.value === "exportDir") return prefs.value.autoExportDirOpcServerId;
  if (opcPickTarget.value === "fileName") return prefs.value.autoFileNameOpcServerId;
  if (isFeedbackPickTarget(opcPickTarget.value)) return prefs.value.exportResultOpc.serverId;
  const bindId = parseRgTriggerPickTarget(opcPickTarget.value);
  if (bindId) {
    return prefs.value.auto.bindings.find((b) => b.id === bindId)?.serverId || "";
  }
  return "";
});

const opcPickLead = computed(() => {
  if (opcPickTarget.value === "exportDir") {
    return "选择已保存的 OPC UA 连接，在地址空间中展开并点击 String 变量作为导出目录路径；非 String 变量在展开时不会显示。确定后写入 NodeId，仍可手工修改。";
  }
  if (opcPickTarget.value === "fileName") {
    return "选择 String 类型变量作为导出文件名基名（不含 .pdf）；绑定树仅显示 String。是否追加随机哈希可在确认后于面板按钮切换。";
  }
  if (opcPickTarget.value === "feedbackStatus") {
    const kind = prefs.value.exportResultOpc.statusKind === "int" ? "Int" : "Boolean";
    return `选择 ${kind} 类型变量；导出成功写入 ${kind === "Int" ? "1" : "true"}，失败写入 ${kind === "Int" ? "0" : "false"}。树与搜索仅显示 ${kind} 变量。`;
  }
  if (opcPickTarget.value === "feedbackMessage") {
    return "选择 String 类型变量；成功时写入「OK: 文件名」，失败时写入错误摘要。树与搜索仅显示 String 变量。";
  }
  if (opcPickTarget.value === "feedbackFilePath") {
    return "选择 String 类型变量（可选）；成功时写入完整 PDF 路径，失败时写入空字符串。树与搜索仅显示 String 变量。";
  }
  if (parseRgTriggerPickTarget(opcPickTarget.value)) {
    return "选择已保存连接下的变量作为自动导出触发源；支持布尔、数值、字符串等类型。确定后写入 NodeId。";
  }
  return "选择变量并绑定。";
});

const electronShell = computed(() => typeof window !== "undefined" && Boolean(window.electronAPI?.runPdfExport));

const manualBusy = ref(false);
const manualHint = ref("");

const triggerLogUiMax = AUTO_TRIGGER_LOG_UI_MAX;
const triggerChartMaxSamples = AUTO_TRIGGER_CHART_MAX_SAMPLES;
const triggerLogExpanded = ref<Record<string, boolean>>({});

const autoStatus = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

type BindingChartUi = { show: boolean; samples: number[] };
const bindingChartUiMap = ref<Record<string, BindingChartUi>>({});

type BindingRuntime = {
  poll: OpcTriggerPollState;
  history: NumericSampleRing;
  chartEligible: boolean | null;
};
const bindingRuntime = new Map<string, BindingRuntime>();
let autoExportBusy = false;

function createBindingRuntime(): BindingRuntime {
  return {
    poll: createOpcTriggerPollState(),
    history: new NumericSampleRing(),
    chartEligible: null,
  };
}

function getBindingRuntime(id: string): BindingRuntime {
  let r = bindingRuntime.get(id);
  if (!r) {
    r = createBindingRuntime();
    bindingRuntime.set(id, r);
  }
  return r;
}

function syncBindingChartUi(id: string, rt: BindingRuntime): void {
  const show = rt.chartEligible === true;
  bindingChartUiMap.value = {
    ...bindingChartUiMap.value,
    [id]: { show, samples: show ? rt.history.toArray() : [] },
  };
}

function bindingChartUi(id: string): BindingChartUi | undefined {
  return bindingChartUiMap.value[id];
}

function recordBindingOpcSample(
  bindingId: string,
  rt: BindingRuntime,
  raw: unknown,
  dataType?: string,
): void {
  const eligible = isOpcTriggerChartEligible(dataType);
  if (rt.chartEligible === null) {
    rt.chartEligible = eligible;
  } else if (rt.chartEligible !== eligible) {
    rt.chartEligible = eligible;
    rt.history.clear();
  }
  if (!eligible) {
    syncBindingChartUi(bindingId, rt);
    return;
  }
  const n = coerceOpcTriggerNumericSample(raw, dataType);
  if (n != null) rt.history.push(n);
  syncBindingChartUi(bindingId, rt);
}

function pruneBindingRuntime(): void {
  const ids = new Set(prefs.value.auto.bindings.map((b) => b.id));
  for (const key of bindingRuntime.keys()) {
    if (!ids.has(key)) bindingRuntime.delete(key);
  }
}

watch(
  () => prefs.value.auto.bindings.map(bindingConfigKey).join("\n"),
  () => {
    pruneBindingRuntime();
    for (const b of prefs.value.auto.bindings) {
      const r = getBindingRuntime(b.id);
      r.poll = createOpcTriggerPollState();
      r.history.clear();
      r.chartEligible = null;
      syncBindingChartUi(b.id, r);
    }
  },
);

function findAutoTriggerBinding(id: string): AutoTriggerBinding | undefined {
  return prefs.value.auto.bindings.find((b) => b.id === id);
}

function bindingDisplayLabel(b: AutoTriggerBinding, index: number): string {
  const tpl = summaries.value.find((x) => x.id === b.templateId);
  const name = tpl?.name?.trim();
  return name ? `绑定 ${index + 1}（${name}）` : `绑定 ${index + 1}`;
}

function addAutoTriggerBinding(): void {
  const prev = prefs.value.auto.bindings;
  const serverId = prev.length ? prev[prev.length - 1].serverId : "";
  const templateId = prefs.value.templateId;
  prefs.value.auto.bindings = [
    ...prev,
    createAutoTriggerBinding({ serverId, templateId: templateId || null }),
  ];
}

function removeAutoTriggerBinding(id: string): void {
  prefs.value.auto.bindings = prefs.value.auto.bindings.filter((b) => b.id !== id);
  bindingRuntime.delete(id);
  const next = { ...bindingChartUiMap.value };
  delete next[id];
  bindingChartUiMap.value = next;
}

function recordBindingTriggerLog(
  binding: AutoTriggerBinding,
  entry: {
    event: string;
    fileName: string;
    filePath?: string;
    success: boolean;
    message?: string;
  },
): void {
  binding.triggerLog = appendTriggerLogEntry(binding.triggerLog, {
    at: new Date().toISOString(),
    ...entry,
  });
}

function clearBindingTriggerLog(bindingId: string): void {
  const b = findAutoTriggerBinding(bindingId);
  if (b) b.triggerLog = [];
}

function isTriggerLogExpanded(bindingId: string): boolean {
  return Boolean(triggerLogExpanded.value[bindingId]);
}

function toggleTriggerLogExpanded(bindingId: string): void {
  triggerLogExpanded.value = {
    ...triggerLogExpanded.value,
    [bindingId]: !triggerLogExpanded.value[bindingId],
  };
}

async function exportBindingTriggerHistory(binding: AutoTriggerBinding, index: number): Promise<void> {
  if (!binding.triggerLog.length) return;
  const label = bindingDisplayLabel(binding, index);
  const tpl = summaries.value.find((x) => x.id === binding.templateId);
  const content = buildTriggerHistoryLoggerText(
    {
      bindingLabel: label,
      bindingId: binding.id,
      templateName: tpl?.name,
      nodeId: binding.nodeId,
      serverLabel: opcServerLabel(binding.serverId),
      mode: binding.mode,
      compareValue: binding.compareValue,
    },
    binding.triggerLog,
  );
  const defaultPath = defaultTriggerHistoryLoggerFileName(label);
  const api = window.electronAPI;
  if (api?.saveTextFileDialog) {
    const res = await api.saveTextFileDialog({
      title: "导出触发 history logger",
      defaultPath,
      content,
    });
    if (res.canceled) return;
    if (res.ok && res.filePath) {
      autoStatus.value = `[记录] 已导出 ${res.filePath}`;
    } else if (!res.ok) {
      autoStatus.value = `[记录] 导出失败：${res.error || "未知错误"}`;
    }
    return;
  }
  downloadTextFile(content, defaultPath);
  autoStatus.value = `[记录] 已下载 ${defaultPath}`;
}

watch(
  prefs,
  (p) => saveReportGeneratorPrefs(JSON.parse(JSON.stringify(p)) as ReportGeneratorPrefs),
  { deep: true },
);

watch(
  () => prefs.value.autoExportDir,
  (d) => {
    const dir = typeof d === "string" && d.trim() ? d.trim() : null;
    saveReportExportPrefs({ watchDir: dir });
  },
);

const selectedTemplateName = computed(() => {
  const tid = prefs.value.templateId;
  if (!tid) return "模版名";
  return summaries.value.find((x) => x.id === tid)?.name || tid;
});

const autoFileNamePreview = computed(() =>
  previewAutoExportFileName(prefs.value, selectedTemplateName.value),
);

const canManualExport = computed(() => electronShell.value && Boolean(prefs.value.templateId));

function toggleAutoEnabled() {
  if (!electronShell.value) return;
  prefs.value.auto.enabled = !prefs.value.auto.enabled;
}

function toggleManualOpenAfter() {
  if (!electronShell.value) return;
  prefs.value.manualOpenAfter = !prefs.value.manualOpenAfter;
}

function toggleExportResultOpc() {
  prefs.value.exportResultOpc.enabled = !prefs.value.exportResultOpc.enabled;
}

async function notifyExportResultToPlc(payload: ExportResultWritePayload): Promise<void> {
  const fb = prefs.value.exportResultOpc;
  if (!isExportResultOpcFeedbackConfigured(fb)) return;
  try {
    const res = await writeExportResultToOpcua(fb, payload);
    if (!res.ok) {
      const hint = res.errors.join("；");
      showAppToast(`导出结果写回 OPC 失败\n${hint}`, { tone: "warn", durationMs: 10000 });
    }
  } catch {
    showAppToast("导出结果写回 OPC 失败", { tone: "warn", durationMs: 8000 });
  }
}

function setExportDirTab(source: AutoExportDirSource) {
  if (prefs.value.autoExportDirSource === source) return;
  prefs.value.autoExportDirSource = source;
}

function setFileNameTab(source: AutoFileNameSource) {
  if (prefs.value.autoFileNameSource === source) return;
  prefs.value.autoFileNameSource = source;
}

function ensureExportResultOpcServerSelected(): void {
  if (prefs.value.exportResultOpc.serverId.trim()) return;
  const first = opcServers.value[0]?.id?.trim();
  if (first) prefs.value.exportResultOpc.serverId = first;
}

function exportResultOpcStatusTypeFilter(): string {
  return prefs.value.exportResultOpc.statusKind === "int" ? "Int" : "Boolean";
}

function resolveRgOpcPickDataTypeFilter(target: RgOpcPickTarget | null): string {
  if (!target) return "";
  if (target === "exportDir" || target === "fileName" || isFeedbackStringPickTarget(target)) {
    return "String";
  }
  if (target === "feedbackStatus") return exportResultOpcStatusTypeFilter();
  return "";
}

async function openRgOpcPick(target: RgOpcPickTarget) {
  await loadOpcServers();
  if (isFeedbackPickTarget(target)) {
    ensureExportResultOpcServerSelected();
  }
  opcPickTarget.value = target;
  activeOpcDataTypeFilter.value = resolveRgOpcPickDataTypeFilter(target);
  await nextTick();
  opcPickOpen.value = true;
}

function resetRgOpcPickSession() {
  opcPickTarget.value = null;
  activeOpcDataTypeFilter.value = "";
}

watch(opcPickOpen, (open) => {
  if (!open) resetRgOpcPickSession();
});

async function onRgOpcPickConfirm(payload: { serverId: string; nodeId: string }) {
  const sid = payload.serverId.trim();
  const nid = payload.nodeId.trim();
  const target = opcPickTarget.value;
  if (!nid || !target) {
    resetRgOpcPickSession();
    return;
  }

  const triggerBindId = parseRgTriggerPickTarget(target);
  if (triggerBindId) {
    const b = findAutoTriggerBinding(triggerBindId);
    if (!b) {
      resetRgOpcPickSession();
      return;
    }
    if (sid) b.serverId = sid;
    b.nodeId = nid;
    getBindingRuntime(triggerBindId).poll = createOpcTriggerPollState();
    resetRgOpcPickSession();
    return;
  }

  if (target === "fileName") {
    if (!sid) {
      resetRgOpcPickSession();
      return;
    }
    const check = await readSavedOpcStringValue(sid, nid);
    if (!check.ok) {
      autoStatus.value = `[文件名] ${check.message || "所选节点不是 String 类型"}`;
      return;
    }
    prefs.value.autoFileNameOpcServerId = sid;
    prefs.value.autoFileNameOpcNodeId = nid;
    resetRgOpcPickSession();
    return;
  }

  if (target === "exportDir") {
    if (sid) prefs.value.autoExportDirOpcServerId = sid;
    prefs.value.autoExportDirOpcNodeId = nid;
    resetRgOpcPickSession();
    return;
  }

  if (target === "feedbackStatus") {
    if (!sid) {
      resetRgOpcPickSession();
      return;
    }
    const check = await readSavedOpcNodeValue(sid, nid);
    if (!check.ok) {
      autoStatus.value = `[导出反馈] ${check.message || "读取节点失败"}`;
      return;
    }
    const expectFilter = prefs.value.exportResultOpc.statusKind === "int" ? "Int" : "Boolean";
    const dt = check.dataType || "";
    if (dt && !opcDataTypeLabelMatchesFilter(dt, expectFilter)) {
      autoStatus.value = `[导出反馈] 需要 ${expectFilter} 类型变量，当前为 ${dt}`;
      return;
    }
    prefs.value.exportResultOpc.serverId = sid;
    prefs.value.exportResultOpc.statusNodeId = nid;
    resetRgOpcPickSession();
    return;
  }

  if (target === "feedbackMessage" || target === "feedbackFilePath") {
    if (!sid) {
      resetRgOpcPickSession();
      return;
    }
    const check = await readSavedOpcStringValue(sid, nid);
    if (!check.ok) {
      autoStatus.value = `[导出反馈] ${check.message || "所选节点不是 String 类型"}`;
      return;
    }
    prefs.value.exportResultOpc.serverId = sid;
    if (target === "feedbackMessage") {
      prefs.value.exportResultOpc.messageNodeId = nid;
    } else {
      prefs.value.exportResultOpc.filePathNodeId = nid;
    }
    resetRgOpcPickSession();
    return;
  }

  resetRgOpcPickSession();
}

function toggleFileNameSegment(id: AutoFileNameSegment) {
  const cur = prefs.value.autoFileNameSegments;
  if (cur.includes(id)) {
    if (cur.length <= 1) return;
    prefs.value.autoFileNameSegments = cur.filter((s) => s !== id);
  } else {
    prefs.value.autoFileNameSegments = [...cur, id];
  }
}

async function loadSummaries(): Promise<void> {
  try {
    summaries.value = await listTemplateSummaries();
  } catch {
    summaries.value = [];
  }
}

async function loadOpcServers(): Promise<void> {
  try {
    const pkg = (await apiFetch("/opcua/servers")) as { servers?: { id: string; name?: string }[] };
    opcServers.value = pkg.servers || [];
  } catch {
    opcServers.value = [];
  }
}

async function onManualExport(): Promise<void> {
  manualHint.value = "";
  const api = window.electronAPI;
  if (!api?.runPdfExport || !api.showSavePdfDialog) {
    manualHint.value = "当前环境不支持 PDF 导出。";
    return;
  }
  const tid = prefs.value.templateId;
  if (!tid) return;

  const tmeta = summaries.value.find((x) => x.id === tid);
  const suggestName = `${(tmeta?.name || "报表").replace(/[/\\?%*:|"<>]/g, "_")}_${formatExportTs()}.pdf`;

  const filePath = await api.showSavePdfDialog({
    title: "导出 PDF",
    defaultPath: suggestName,
  });
  if (!filePath) {
    manualHint.value = "已取消保存。";
    return;
  }

  manualBusy.value = true;
  manualHint.value = "正在检查数据源连接…";
  try {
    const preflight = await runTemplateExportPreflight(tid);
    if (!preflight.ok) {
      const proceed = window.confirm(
        `${preflight.summary}\n\n是否仍要继续导出？（PDF 中可能出现错误占位或导出失败）`,
      );
      if (!proceed) {
        manualHint.value = preflight.summary;
        return;
      }
      manualHint.value = "正在导出 PDF…";
    } else if (preflight.warnings.length) {
      manualHint.value = preflight.warnings.join(" ");
    } else {
      manualHint.value = "";
    }

    await api.runPdfExport({
      templateId: tid,
      filePath,
      openAfter: prefs.value.manualOpenAfter,
    });
    manualHint.value = `已保存：${filePath}`;
    void notifyExportResultToPlc({
      success: true,
      filePath,
      fileName: suggestName,
    });
  } catch (e) {
    const msg = humanizePdfExportError(e);
    manualHint.value = msg;
    void notifyExportResultToPlc({ success: false, message: msg });
  } finally {
    manualBusy.value = false;
  }
}

async function onPickAutoDir(): Promise<void> {
  const title =
    prefs.value.autoExportDirSource === "opcua" ? "选择保底导出目录" : "选择导出目录";
  const p = await window.electronAPI?.pickExportDirectory?.({ title });
  if (p) {
    prefs.value.autoExportDir = p;
    saveReportExportPrefs({ watchDir: p });
  }
}

type AutoPdfExportAttempt = {
  fileName: string;
  filePath: string;
  note?: string;
};

async function runAutoPdfExport(templateId: string): Promise<AutoPdfExportAttempt> {
  const api = window.electronAPI;
  if (!api?.runPdfExport || !api.pathJoin) {
    throw new Error("当前环境不支持自动导出 PDF");
  }

  const tid = templateId.trim();
  if (!tid) throw new Error("未配置导出模版");

  const resolved = await resolveAutoExportDir(prefs.value);
  const dir = resolved.dir.trim();
  if (!dir) throw new Error(resolved.note || "未配置导出目录");

  const tmeta = summaries.value.find((x) => x.id === tid);
  const built = await buildAutoExportFileName(prefs.value, tmeta?.name || tid);
  const filePath = await api.pathJoin(dir, built.base);

  await api.runPdfExport({
    templateId: tid,
    filePath,
    openAfter: false,
  });

  const notes = [resolved.note, built.note].filter(Boolean).join("；");
  return { fileName: built.base, filePath, note: notes || undefined };
}

async function pollAutoTriggerOnce(): Promise<void> {
  if (!electronShell.value || !prefs.value.auto.enabled || autoExportBusy) return;

  pruneBindingRuntime();

  const bindings = prefs.value.auto.bindings;
  const active = bindings.filter(isTriggerBindingActive);

  if (!bindings.length) {
    autoStatus.value = "[自动] 请点击「新建绑定」添加触发变量…";
    return;
  }
  if (!active.length) {
    const anyComplete = bindings.some(isTriggerBindingComplete);
    autoStatus.value = anyComplete
      ? "[自动] 已配置的绑定均未启用，请打开至少一条绑定的「启用」开关…"
      : "[自动] 请启用绑定并完成模版、连接与触发节点配置…";
    return;
  }

  const resolved = await resolveAutoExportDir(prefs.value);
  if (!resolved.dir.trim()) {
    autoStatus.value = `[自动] ${resolved.note || "请配置默认或 OPC 导出文件夹…"}`;
    return;
  }

  const statusParts: string[] = [];
  let anyListening = false;
  let exportedThisPoll = false;

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const label = bindingDisplayLabel(b, i);
    if (!isTriggerBindingActive(b)) continue;

    const srv = b.serverId.trim();
    const nodeId = b.nodeId.trim();
    const rt = getBindingRuntime(b.id);

    let raw: unknown;
    let dataType: string | undefined;
    try {
      const read = await readSavedOpcNodeValue(srv, nodeId);
      if (!read.ok) throw new Error(read.message || "读 OPC 失败");
      raw = read.value;
      dataType = read.dataType;
    } catch (e) {
      rt.poll = createOpcTriggerPollState();
      statusParts.push(`${label}：读取失败`);
      continue;
    }

    recordBindingOpcSample(b.id, rt, raw, dataType);

    const fire = evaluateAutoOpcTrigger(b.mode, raw, b.compareValue, rt.poll);

    if (fire) {
      const eventLabel = autoTriggerEventLabel(b.mode, b.compareValue);
      let fileName = "—";
      autoExportBusy = true;
      try {
        const result = await runAutoPdfExport(b.templateId!);
        fileName = result.fileName;
        recordBindingTriggerLog(b, {
          event: eventLabel,
          fileName: result.fileName,
          filePath: result.filePath,
          success: true,
          message: result.note,
        });
        void notifyExportResultToPlc({
          success: true,
          filePath: result.filePath,
          fileName: result.fileName,
          message: result.note,
        });
        exportedThisPoll = true;
        const noteSuffix = result.note ? `（${result.note}）` : "";
        autoStatus.value = `[自动·${label}] 已导出 ${result.filePath}${noteSuffix}`;
      } catch (e) {
        const msg = humanizePdfExportError(e);
        try {
          const tmeta = summaries.value.find((x) => x.id === b.templateId);
          const built = await buildAutoExportFileName(prefs.value, tmeta?.name || b.templateId || "");
          fileName = built.base;
        } catch {
          /* 文件名构建失败时保持 — */
        }
        recordBindingTriggerLog(b, {
          event: eventLabel,
          fileName,
          success: false,
          message: msg,
        });
        void notifyExportResultToPlc({ success: false, message: msg });
        autoStatus.value = `[自动·${label}] 导出失败：${msg.split("\n")[0]}`;
        showAppToast(`[自动导出·${label}] 失败\n${msg}`, { tone: "err", durationMs: 14000 });
      } finally {
        autoExportBusy = false;
      }
      continue;
    }

    anyListening = true;
  }

  if (exportedThisPoll) {
    return;
  }
  if (statusParts.length) {
    autoStatus.value = `[自动] ${statusParts.join("；")}`;
  } else if (anyListening) {
    autoStatus.value = `[自动] 监听 ${active.length} 条已启用绑定…`;
  } else {
    autoStatus.value = "[自动] 监听中…";
  }
}

function restartPollLoop(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!electronShell.value || !prefs.value.auto.enabled) return;

  void pollAutoTriggerOnce();
  pollTimer = setInterval(() => void pollAutoTriggerOnce(), AUTO_OPC_POLL_INTERVAL_MS);
}

onMounted(async () => {
  await Promise.all([loadSummaries(), loadOpcServers()]);
  restartPollLoop();
  window.addEventListener("report-editor-config-imported", onConfigImported);
  window.addEventListener("report-editor-opcua-servers-changed", onOpcServersChanged);
});

function onConfigImported() {
  void loadOpcServers();
}

function onOpcServersChanged() {
  void loadOpcServers();
}

watch(
  () => [prefs.value.auto.enabled, electronShell.value],
  () => restartPollLoop(),
);

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  window.removeEventListener("report-editor-config-imported", onConfigImported);
  window.removeEventListener("report-editor-opcua-servers-changed", onOpcServersChanged);
});
</script>

<style scoped>
.rg-page {
  max-width: 820px;
}
.rg-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 10px;
}
.rg-lead {
  color: #52525b;
  font-size: 14px;
  line-height: 1.55;
  margin-bottom: 16px;
}
.rg-banner {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.5;
}
.rg-banner--warn {
  background: #fef9c3;
  border: 1px solid #eab30855;
  color: #713f12;
}
.rg-card {
  border: 1px solid rgb(228 228 231);
  border-radius: 10px;
  padding: 14px 16px 18px;
  margin-bottom: 16px;
  background: rgb(250 250 252 / 0.95);
}
.rg-h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
  color: #27272a;
}
.rg-row {
  margin-bottom: 10px;
}
.rg-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 520px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #fff;
}
.rg-switch-label {
  font-size: 14px;
  font-weight: 600;
  color: #27272a;
}
.rg-switch {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: 1px solid #d4d4d8;
  background: #e4e4e7;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.rg-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(24 24 27 / 0.15);
  transition: transform 0.15s ease;
}
.rg-switch--on {
  background: #4f46e5;
  border-color: #4338ca;
}
.rg-switch--on::after {
  transform: translateX(20px);
}
.rg-switch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.rg-mini--switch {
  margin-top: -6px;
  margin-bottom: 10px;
}
.rg-mini--indent {
  margin-top: 6px;
  margin-bottom: 0;
}
.rg-mini--after-seg {
  margin-top: 0;
}
.rg-mini--warn {
  color: #b45309;
}
.rg-export-dir-block {
  margin-bottom: 18px;
}
.rg-export-dir-block > .rg-lbl {
  display: block;
  margin-bottom: 8px;
}
.rg-binding-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.rg-binding-block-head > .rg-lbl {
  margin-bottom: 0;
}
.btn--sm {
  padding: 6px 12px;
  font-size: 12px;
}
.btn--ghost {
  background: transparent;
  border-color: #d4d4d8;
  color: #71717a;
}
.btn--ghost:hover {
  border-color: #f87171;
  color: #b91c1c;
  background: #fef2f2;
}
.rg-binding-card {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e4e4e7;
  background: #fff;
}
.rg-binding-card--off {
  opacity: 0.72;
  background: #fafafa;
}
.rg-binding-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f4f4f5;
}
.rg-binding-card-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.rg-switch-row--compact {
  margin-bottom: 0;
  gap: 8px;
}
.rg-switch-row--compact .rg-switch-label {
  font-size: 12px;
  font-weight: 500;
}
.rg-switch--sm {
  width: 36px;
  height: 20px;
}
.rg-switch--sm::after {
  width: 14px;
  height: 14px;
  top: 2px;
  left: 2px;
}
.rg-switch--sm.rg-switch--on::after {
  transform: translateX(16px);
}
.rg-binding-card-title {
  font-size: 13px;
  font-weight: 600;
  color: #3f3f46;
}
.rg-trigger-log-block {
  margin-top: 4px;
}
.rg-trigger-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 0;
}
.rg-trigger-log-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 4px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.rg-trigger-log-toggle .rg-lbl--inline {
  margin-bottom: 0;
}
.rg-trigger-log-count {
  font-size: 12px;
  color: #71717a;
  font-weight: normal;
}
.rg-trigger-log-chevron {
  display: inline-block;
  font-size: 11px;
  color: #71717a;
  transition: transform 0.15s ease;
}
.rg-trigger-log-chevron--open {
  transform: rotate(90deg);
}
.rg-trigger-log-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rg-trigger-log-body {
  margin-top: 8px;
}
.rg-lbl--inline {
  display: inline;
}
.rg-trigger-log-wrap {
  max-height: 200px;
  overflow: auto;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fafafa;
}
.rg-trigger-log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.rg-trigger-log-table th,
.rg-trigger-log-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid #f4f4f5;
  vertical-align: top;
}
.rg-trigger-log-table th {
  position: sticky;
  top: 0;
  background: #f4f4f5;
  font-weight: 600;
  color: #52525b;
  z-index: 1;
}
.rg-trigger-log-table tbody tr:last-child td {
  border-bottom: none;
}
.rg-trigger-log-time {
  white-space: nowrap;
  color: #71717a;
}
.rg-trigger-log-file code {
  font-size: 11px;
  word-break: break-all;
}
.rg-trigger-log-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.rg-trigger-log-status--ok {
  background: #dcfce7;
  color: #166534;
}
.rg-trigger-log-status--fail {
  background: #fee2e2;
  color: #991b1b;
}
.rg-mini--bindings-hint {
  margin-top: 4px;
  margin-bottom: 0;
}
.rg-binding-chart .rg-lbl {
  display: block;
  margin-bottom: 6px;
}
.rg-tabs {
  display: inline-flex;
  gap: 0;
  padding: 3px;
  border-radius: 10px;
  border: 1px solid #e4e4e7;
  background: #f4f4f5;
  margin-bottom: 12px;
}
.rg-tab {
  margin: 0;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  color: #52525b;
  line-height: 1.2;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
}
.rg-tab--on {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.rg-tab-panel {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #e4e4e7;
  background: #fafafa;
}
.rg-row--in-panel {
  margin-bottom: 14px;
}
.rg-row--in-panel:last-child {
  margin-bottom: 0;
}
.rg-dir-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-top: 4px;
}
.rg-radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #3f3f46;
  cursor: pointer;
}
.rg-inline--wrap {
  flex-wrap: wrap;
  margin-top: 4px;
}
.rg-select--mt {
  margin-top: 8px;
}
.rg-row--compact {
  margin-top: -4px;
}
.rg-inp--sep {
  max-width: 72px;
}
.rg-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.rg-seg-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 14px;
}
.rg-seg-btn {
  margin: 0;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 1.2;
  color: #52525b;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease,
    box-shadow 0.12s ease;
}
.rg-seg-btn:hover {
  border-color: #a5b4fc;
  background: #f8fafc;
}
.rg-seg-btn--on {
  background: #eef2ff;
  border-color: #6366f1;
  color: #312e81;
  font-weight: 500;
  box-shadow: 0 1px 2px rgb(99 102 241 / 0.12);
}
.rg-seg-btn--on:hover {
  background: #e0e7ff;
}
.rg-auto-fields {
  transition: opacity 0.15s ease;
}
.rg-auto-fields--off {
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}
.rg-auto-fields--off :is(input, select, button) {
  cursor: not-allowed;
}
.rg-lbl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
  margin-bottom: 4px;
}
.rg-select,
.rg-inp {
  width: 100%;
  max-width: 520px;
  box-sizing: border-box;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid rgb(212 212 216);
  font-size: 13px;
  background: #fff;
}
.rg-inp--grow {
  flex: 1;
  min-width: 0;
}
.rg-inp--num {
  max-width: 140px;
}
.rg-inline {
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: 640px;
}
.rg-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-width: 520px;
}
@media (max-width: 640px) {
  .rg-split {
    grid-template-columns: 1fr;
  }
}
.rg-actions {
  margin-top: 12px;
}
.btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgb(212 212 216);
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.btn.primary {
  background: #4f46e5;
  border-color: #4338ca;
  color: #fff;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.rg-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #3f3f46;
  word-break: break-all;
}
.rg-mini {
  font-size: 12px;
  color: #71717a;
  margin: -4px 0 10px;
  line-height: 1.45;
}
code {
  font-size: 0.92em;
}
</style>
