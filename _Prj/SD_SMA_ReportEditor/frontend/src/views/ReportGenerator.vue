<template>
  <div class="rg-page">
    <h2 class="rg-title">生成报表</h2>
    <p class="rg-lead">
      {{ RG_UI.manual }}与 OPC UA {{ RG_UI.opcAuto }}所得 PDF，与模版编辑器中<strong>导出预览</strong>栈一致（同一套控件缩放与 OPC/SQL 绑定填充）。请在<strong>Electron 桌面版</strong>中使用完整能力。
    </p>

    <div v-if="!electronShell" class="rg-banner rg-banner--warn">
      当前运行在浏览器壳：无法弹出系统保存对话框与后台渲染 PDF。请使用 <code>npm run electron:dev</code> 或安装版客户端。
    </div>

    <section class="rg-card">
      <h3 class="rg-h3">{{ RG_UI.manual }}</h3>
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
        <span class="rg-switch-label" id="rg-manual-open-lbl">{{ RG_UI.manual }}完成后打开保存文件夹（桌面壳）</span>
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
          {{ manualBusy ? `${RG_UI.manual}中…` : `${RG_UI.manual}（按模版类型保存）` }}
        </button>
        <button
          v-if="showManualCancel"
          type="button"
          class="btn"
          @click="onCancelManualExport"
        >
          取消
        </button>
      </div>
      <p v-if="manualHint" class="rg-hint">{{ manualHint }}</p>
    </section>

    <section class="rg-card">
      <h3 class="rg-h3">PLC 心跳（软件可用信号）</h3>
      <div class="rg-switch-row">
        <span class="rg-switch-label" id="rg-hb-lbl">启用心跳写入</span>
        <button
          type="button"
          class="rg-switch"
          :class="{ 'rg-switch--on': heartbeatCfg.enabled }"
          role="switch"
          aria-labelledby="rg-hb-lbl"
          :aria-checked="heartbeatCfg.enabled"
          @click="heartbeatCfg.enabled = !heartbeatCfg.enabled"
        />
      </div>
      <p class="rg-mini rg-mini--switch">
        软件运行期间按固定周期向 OPC UA 变量写入信号；PLC 侧看门狗检测到信号超时不变化，即可判定报表软件离线并报警。
      </p>

      <div class="rg-auto-fields" :class="{ 'rg-auto-fields--off': !heartbeatCfg.enabled }">
        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-hb-srv">已保存连接</label>
          <select id="rg-hb-srv" v-model="heartbeatCfg.serverId" class="rg-select">
            <option value="">请选择…</option>
            <option v-for="s in opcServers" :key="s.id" :value="s.id">{{ s.name || s.id }}</option>
          </select>
        </div>
        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-hb-mode">信号方式</label>
          <select id="rg-hb-mode" v-model="heartbeatCfg.mode" class="rg-select">
            <option value="constant_one">常写 1（PLC 收到后清零，推荐）</option>
            <option value="toggle">Bool 翻转（true/false 交替）</option>
            <option value="counter">计数累加（1→32000 循环，Int 变量）</option>
          </select>
        </div>
        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-hb-interval">写入周期（毫秒）</label>
          <input
            id="rg-hb-interval"
            v-model.number="heartbeatCfg.intervalMs"
            type="number"
            min="100"
            max="3600000"
            step="100"
            class="rg-inp rg-inp--num"
          />
        </div>
        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-hb-node">心跳变量 NodeId</label>
          <div class="rg-inline rg-inline--bind">
            <input
              id="rg-hb-node"
              v-model.trim="heartbeatCfg.nodeId"
              type="text"
              class="rg-inp rg-inp--grow rg-mono"
              :title="heartbeatCfg.nodeId || undefined"
              placeholder="可手工填写 NodeId，或从地址空间选择…"
            />
            <button type="button" class="btn btn--nowrap" @click="openRgOpcPick('heartbeat')">
              从地址空间选择…
            </button>
            <button
              v-if="heartbeatCfg.nodeId"
              type="button"
              class="btn btn--sm btn--ghost btn--nowrap"
              @click="clearHeartbeatBinding"
            >
              清除
            </button>
          </div>
          <p v-if="heartbeatBindingHint" class="rg-mini rg-mini--indent rg-bound-hint">已绑定：{{ heartbeatBindingHint }}</p>
          <p class="rg-mini rg-mini--indent">
            「常写 1」：软件每周期写 1，PLC 程序收到后清零，PLC 侧检测到 1 长时间不出现即判定软件离线（默认 200 毫秒，绑定 Bool 或 Int 变量均可）。
            「Bool 翻转」绑定 Boolean 变量；「计数累加」绑定 Int 变量。仅软件（含最小化）运行时发送心跳，退出后停止。
          </p>
        </div>
        <p v-if="heartbeatStatusLine" class="rg-mini rg-mini--indent" :class="{ 'rg-mini--warn': plcHeartbeatLastOk === false }">
          {{ heartbeatStatusLine }}
        </p>
      </div>
    </section>

    <section class="rg-card">
      <h3 class="rg-h3">{{ RG_UI.opcAuto }}</h3>
      <div class="rg-switch-row">
        <span class="rg-switch-label" id="rg-auto-enabled-lbl">启用 {{ RG_UI.opcAuto }}</span>
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
      <p v-if="!electronShell" class="rg-mini rg-mini--switch">{{ RG_UI.opcAuto }}仅在 Electron 桌面版可用。</p>
      <p class="rg-mini rg-mini--switch">
        多路触发视为<strong>同一批次</strong>：保存目录、文件名/批次号 OPC
        <strong>全局共用</strong>（不在绑定卡片内单独配置）。每条绑定只配触发条件、报表模版与本路 PLC 反馈。
      </p>

      <div class="rg-auto-fields" :class="{ 'rg-auto-fields--off': !prefs.auto.enabled }">
        <div class="rg-row rg-row--in-panel">
          <label class="rg-lbl" for="rg-auto-default-opc">默认 OPC 连接</label>
          <select
            id="rg-auto-default-opc"
            v-model="prefs.auto.defaultOpcServerId"
            class="rg-select"
            @change="onDefaultOpcServerChange"
          >
            <option value="">请选择…</option>
            <option v-for="s in opcServers" :key="s.id" :value="s.id">{{ s.name || s.id }}</option>
          </select>
          <p class="rg-mini rg-mini--indent">
            新建绑定与本路写回默认使用此连接；单条绑定可在展开后「改用其它连接」。
          </p>
        </div>

        <div class="rg-export-dir-block">
          <button
            type="button"
            class="rg-trigger-log-toggle rg-advanced-toggle"
            :aria-expanded="advancedAutoExpanded"
            @click="advancedAutoExpanded = !advancedAutoExpanded"
          >
            <span
              class="rg-trigger-log-chevron"
              :class="{ 'rg-trigger-log-chevron--open': advancedAutoExpanded }"
              aria-hidden="true"
              >▸</span
            >
            <span class="rg-lbl rg-lbl--inline">高级设置</span>
            <span class="rg-mini rg-advanced-hint">导出性能 · 并行上限 · 保存目录 · 文件名</span>
          </button>
          <div v-show="advancedAutoExpanded" class="rg-advanced-body">
            <div class="rg-row rg-row--in-panel rg-row--perf-tier">
              <span class="rg-lbl" id="rg-export-perf-lbl">导出性能（设备能力 · 手动与自动共用）</span>
              <div
                id="rg-export-perf-tier"
                class="rg-tabs rg-tabs--perf"
                role="tablist"
                aria-labelledby="rg-export-perf-lbl"
              >
                <button
                  v-for="p in exportPerfProfiles"
                  :key="p.tier"
                  type="button"
                  role="tab"
                  class="rg-tab"
                  :class="{ 'rg-tab--on': prefs.exportPerfTier === p.tier }"
                  :aria-selected="prefs.exportPerfTier === p.tier"
                  @click="selectExportPerfTier(p.tier)"
                >
                  {{ p.label }}{{ p.isDefault ? '（默认）' : '' }}
                </button>
              </div>
              <p class="rg-mini rg-mini--indent">
                {{ exportPerfProfile.summary }}
                <template v-if="exportPerfProfile.pdfQuality === 'draft'">
                  <strong> 当前为仅内容草稿，非预览级交付。</strong>
                </template>
                <template v-else-if="exportPerfProfile.pdfQuality === 'layout'">
                  <strong> 当前为 pdf-lib 矢量版式（无 printToPDF），非像素级预览。</strong>
                </template>
                生效：引擎 {{ exportPerfProfile.engine }} · 预热
                {{ exportPerfProfile.prewarmPoolSize }} · yield {{ exportPerfProfile.yieldMs }}ms · 优先级
                {{
                  exportPerfProfile.coexistPause === 'max'
                    ? '拉满'
                    : exportPerfProfile.coexistPause === 'basic'
                      ? '折中'
                      : '全开让核'
                }}。
              </p>
            </div>

            <div class="rg-row rg-row--in-panel">
              <label class="rg-lbl" for="rg-auto-max-parallel">同时并行导出上限</label>
              <div class="rg-inline">
                <input
                  id="rg-auto-max-parallel"
                  v-model.number="prefs.auto.maxParallelExports"
                  type="number"
                  min="1"
                  max="16"
                  class="rg-inp rg-inp--sep"
                  @change="onMaxParallelChange"
                />
                <span class="rg-mini">路（1–16）</span>
              </div>
              <p class="rg-mini rg-mini--indent">
                实际并行 = min(本设置, 已启用绑定数, 本机 CPU 预算)。超出上限的触发会排队（状态码 3），有空槽再开跑。
              </p>
              <p class="rg-mini rg-mini--indent">{{ exportCpuBudgetHintText }}</p>
            </div>

            <div class="rg-export-dir-block rg-export-dir-block--nested">
              <span class="rg-lbl">{{ RG_UI.opcAuto }}保存文件夹（全部绑定共用）</span>
              <p class="rg-mini rg-mini--indent">
                批次模版落盘为「根目录\批号\」；非批次模版写入其模版内配置的目标文件夹，不使用此目录。
              </p>
              <div class="rg-tabs" role="tablist" :aria-label="`${RG_UI.opcAuto}保存文件夹来源`">
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
                    <label class="rg-lbl" for="rg-auto-dir">保存目录</label>
                    <div class="rg-inline">
                      <input
                        id="rg-auto-dir"
                        v-model="prefs.autoExportDir"
                        type="text"
                        readonly
                        class="rg-inp rg-inp--grow"
                        placeholder="未选择（点击下方按钮）"
                      />
                      <button type="button" class="btn" :disabled="!electronShell" @click="onPickAutoDir">
                        选择文件夹…
                      </button>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div class="rg-row rg-row--in-panel">
                    <label class="rg-lbl" for="rg-auto-dir-fallback">导出根目录</label>
                    <div class="rg-inline">
                      <input
                        id="rg-auto-dir-fallback"
                        v-model="prefs.autoExportDir"
                        type="text"
                        readonly
                        class="rg-inp rg-inp--grow"
                        placeholder="未选择（点击下方按钮）"
                      />
                      <button type="button" class="btn" :disabled="!electronShell" @click="onPickAutoDir">
                        选择文件夹…
                      </button>
                    </div>
                    <p class="rg-mini rg-mini--indent">
                      批次报表按「根目录\批号\」落盘；批号取结批文件名或下方目录 OPC 变量，均无有效值时导出失败（不再回落根目录）。
                    </p>
                  </div>
                  <div class="rg-row rg-row--in-panel">
                    <label class="rg-lbl" for="rg-dir-opc-var">OPC 目录变量（String）</label>
                    <div class="rg-inline rg-inline--bind">
                      <input
                        id="rg-dir-opc-var"
                        :value="prefs.autoExportDirOpcNodeId"
                        type="text"
                        readonly
                        class="rg-inp rg-inp--grow rg-mono"
                        placeholder="未绑定"
                      />
                      <button type="button" class="btn" @click="openRgOpcPick('exportDir')">
                        打开 OPC UA 绑定树
                      </button>
                      <button
                        v-if="prefs.autoExportDirOpcNodeId"
                        type="button"
                        class="btn btn--sm btn--ghost btn--nowrap"
                        @click="clearAutoExportDirOpcBinding"
                      >
                        清除
                      </button>
                    </div>
                    <p v-if="exportDirOpcServerLabel" class="rg-mini rg-mini--indent">
                      连接：{{ exportDirOpcServerLabel }}
                    </p>
                    <p class="rg-mini rg-mini--indent">
                      展开地址空间时仅显示 String 类型变量；文件夹节点可继续展开浏览。
                    </p>
                  </div>
                </template>
              </div>
            </div>

            <div class="rg-export-dir-block rg-export-dir-block--nested">
              <span class="rg-lbl">{{ RG_UI.opcAuto }}文件名（全部绑定共用）</span>
              <p class="rg-mini rg-mini--indent">批次号与文件名片段规则全局共用，不按绑定拆分。</p>

              <div class="rg-tab-panel" role="group" :aria-label="`${RG_UI.opcAuto}文件名片段`">
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
                  <p class="rg-mini rg-mini--indent rg-mini--after-seg">
                    点击按钮切换片段（至少保留一项）；勾选「OPC UA变量」后会按片段顺序拼接下方绑定值。
                  </p>
                </div>

                <div class="rg-row rg-row--in-panel">
                  <label class="rg-lbl" for="rg-fn-opc-var">OPC UA变量（String）</label>
                  <div class="rg-inline rg-inline--bind">
                    <input
                      id="rg-fn-opc-var"
                      :value="prefs.autoFileNameOpcNodeId"
                      type="text"
                      readonly
                      class="rg-inp rg-inp--grow rg-mono"
                      placeholder="未绑定"
                    />
                    <button type="button" class="btn" @click="openRgOpcPick('fileName')">
                      打开 OPC UA 绑定树
                    </button>
                    <button
                      v-if="prefs.autoFileNameOpcNodeId"
                      type="button"
                      class="btn btn--sm btn--ghost btn--nowrap"
                      @click="clearAutoFileNameOpcBinding"
                    >
                      清除
                    </button>
                  </div>
                  <p v-if="fileNameOpcServerLabel" class="rg-mini rg-mini--indent">
                    连接：{{ fileNameOpcServerLabel }}
                  </p>
                  <p class="rg-mini rg-mini--indent">
                    绑定树仅显示 String 类型变量；未勾选「OPC UA变量」时只保存绑定，不参与文件名。
                  </p>
                </div>

                <div class="rg-row rg-row--in-panel rg-row--compact">
                  <label class="rg-lbl" for="rg-fn-sep">片段连接符</label>
                  <input
                    id="rg-fn-sep"
                    v-model="prefs.autoFileNameSeparator"
                    type="text"
                    class="rg-inp rg-inp--sep"
                    maxlength="8"
                    spellcheck="false"
                  />
                </div>
                <p class="rg-mini rg-mini--indent">
                  预览（示意）：<code>{{ autoFileNamePreview }}</code>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="rg-export-dir-block">
          <div class="rg-binding-block-head">
            <span class="rg-lbl">保存触发变量绑定</span>
            <button type="button" class="btn btn--sm" @click="addAutoTriggerBinding">+ 新建绑定</button>
          </div>
          <p class="rg-mini rg-mini--indent">
            常规只需配模版、触发节点与条件；目录/文件名见「高级设置」。点卡片标题展开编辑。
          </p>
          <p v-if="!prefs.auto.bindings.length" class="rg-mini rg-mini--indent">
            暂无绑定。点击「新建绑定」添加 OPC 变量，并为每条绑定单独选择要 {{ RG_UI.opcAuto }} 的报表模版。
          </p>
          <div
            v-for="(binding, bi) in prefs.auto.bindings"
            :key="binding.id"
            :id="`rg-bind-card-${binding.id}`"
            class="rg-binding-card"
            :class="{
              'rg-binding-card--off': !binding.enabled,
              'rg-binding-card--collapsed': isBindingCardExpanded(binding.id),
            }"
          >
            <div class="rg-binding-card-head">
              <button
                type="button"
                class="rg-binding-card-summary"
                :aria-expanded="isBindingCardExpanded(binding.id)"
                @click="toggleBindingCardExpanded(binding.id)"
              >
                <span
                  class="rg-trigger-log-chevron"
                  :class="{ 'rg-trigger-log-chevron--open': isBindingCardExpanded(binding.id) }"
                  aria-hidden="true"
                  >▸</span
                >
                <span class="rg-binding-card-title">绑定 {{ bi + 1 }}</span>
                <span class="rg-binding-card-meta">{{ bindingSummaryMeta(binding) }}</span>
              </button>
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
                    @click.stop="binding.enabled = !binding.enabled"
                  />
                </div>
                <button
                  type="button"
                  class="btn btn--sm btn--ghost"
                  title="删除此绑定"
                  @click.stop="removeAutoTriggerBinding(binding.id)"
                >
                  删除
                </button>
              </div>
            </div>
            <p
              v-if="!isBindingCardExpanded(binding.id) && prefs.auto.enabled && binding.enabled"
              class="rg-binding-live-status rg-binding-live-status--summary"
            >
              {{ bindingLiveStatusText(binding.id) }}
            </p>

            <div v-show="isBindingCardExpanded(binding.id)" class="rg-binding-card-body">
              <div class="rg-row rg-row--in-panel">
                <label class="rg-lbl" :for="`rg-bind-tpl-${binding.id}`">报表模版</label>
                <select :id="`rg-bind-tpl-${binding.id}`" v-model="binding.templateId" class="rg-select">
                  <option :value="null">请选择…</option>
                  <option v-for="row in templateRows" :key="row.item.id" :value="row.item.id">
                    {{ templateSelectLabel(row.seq, row.item.name) }}
                  </option>
                </select>
              </div>
              <div class="rg-row rg-row--in-panel">
                <span class="rg-lbl">OPC 连接</span>
                <p class="rg-mini rg-mini--indent rg-conn-line">
                  {{ opcServerLabel(effectiveBindingServerId(binding)) || "未选择（请先设默认连接）" }}
                  <button
                    type="button"
                    class="btn btn--sm btn--ghost"
                    @click="toggleServerOverrideExpanded(binding.id)"
                  >
                    {{ isServerOverrideExpanded(binding.id) ? "收起" : "改用其它连接" }}
                  </button>
                </p>
                <select
                  v-if="isServerOverrideExpanded(binding.id)"
                  :id="`rg-bind-srv-${binding.id}`"
                  v-model="binding.serverId"
                  class="rg-select"
                >
                  <option value="">使用默认连接</option>
                  <option v-for="s in opcServers" :key="s.id" :value="s.id">{{ s.name || s.id }}</option>
                </select>
              </div>
              <div class="rg-row rg-row--in-panel">
                <label class="rg-lbl" :for="`rg-bind-node-${binding.id}`">触发节点 NodeId</label>
                <div class="rg-inline rg-inline--bind">
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
                  <button
                    v-if="binding.nodeId"
                    type="button"
                    class="btn btn--sm btn--ghost btn--nowrap"
                    @click="clearAutoTriggerNodeBinding(binding.id)"
                  >
                    清除
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

              <div class="rg-row rg-row--in-panel rg-binding-monitor">
                <button
                  type="button"
                  class="rg-trigger-log-toggle"
                  :aria-expanded="isBindingMonitorExpanded(binding.id)"
                  @click="toggleBindingMonitorExpanded(binding.id)"
                >
                  <span
                    class="rg-trigger-log-chevron"
                    :class="{ 'rg-trigger-log-chevron--open': isBindingMonitorExpanded(binding.id) }"
                    aria-hidden="true"
                    >▸</span
                  >
                  <span class="rg-lbl rg-lbl--inline">监控</span>
                  <span class="rg-mini rg-advanced-hint">本路状态 · 曲线</span>
                </button>
                <div v-show="isBindingMonitorExpanded(binding.id)" class="rg-binding-monitor-body">
                  <div v-if="prefs.auto.enabled && binding.enabled" class="rg-row rg-row--in-panel">
                    <span class="rg-lbl">本路状态</span>
                    <p class="rg-binding-live-status">
                      {{ bindingLiveStatusText(binding.id) }}
                    </p>
                  </div>
                  <div
                    v-if="prefs.auto.enabled && binding.enabled && bindingChartUi(binding.id)?.show"
                    class="rg-row rg-row--in-panel rg-binding-chart"
                  >
                    <span class="rg-lbl">近期数值</span>
                    <AutoTriggerValueSparkline :samples="bindingChartUi(binding.id)?.samples ?? []" />
                    <p class="rg-mini rg-mini--indent">
                      启用 {{ RG_UI.opcAuto }}后每秒采样；保留最近 {{ triggerChartMaxSamples }} 个点（约
                      {{ triggerChartMaxSamples }} 秒）。String 类型变量不显示曲线。
                    </p>
                  </div>
                  <div
                    v-if="prefs.auto.enabled && binding.enabled"
                    class="rg-row rg-row--in-panel rg-binding-chart"
                  >
                    <span class="rg-lbl">状态折线（INT）</span>
                    <AutoTriggerValueSparkline :samples="bindingStatusChartSamples(binding.id)" />
                    <p class="rg-mini rg-mini--indent">
                      纵轴为写回 PLC 的状态码：0失败 1成功 2监听 3排队 4预检 5取数 6渲染 7保存 8写回。
                    </p>
                  </div>
                  <p
                    v-if="!(prefs.auto.enabled && binding.enabled)"
                    class="rg-mini rg-mini--indent"
                  >
                    启用自动结批与本绑定后显示状态与曲线。
                  </p>
                </div>
              </div>

              <div class="rg-row rg-row--in-panel rg-binding-feedback">
                <div class="rg-binding-feedback-head">
                  <button
                    type="button"
                    class="rg-trigger-log-toggle"
                    :aria-expanded="isBindingFeedbackExpanded(binding.id)"
                    @click="toggleBindingFeedbackExpanded(binding.id)"
                  >
                    <span
                      class="rg-trigger-log-chevron"
                      :class="{ 'rg-trigger-log-chevron--open': isBindingFeedbackExpanded(binding.id) }"
                      aria-hidden="true"
                      >▸</span
                    >
                    <span class="rg-lbl rg-lbl--inline">本绑定结批结果写回 PLC</span>
                  </button>
                </div>
                <div v-show="isBindingFeedbackExpanded(binding.id)" class="rg-binding-feedback-body">
                  <p class="rg-mini rg-mini--indent">
                    本路独立状态/信息/路径节点；未单独选连接时沿用触发连接（或页级默认连接）。
                  </p>
                  <div class="rg-switch-row rg-switch-row--compact">
                    <span class="rg-switch-label" :id="`rg-bind-fb-en-${binding.id}`">启用本路写回</span>
                    <button
                      type="button"
                      class="rg-switch rg-switch--sm"
                      :class="{ 'rg-switch--on': ensureBindingFeedback(binding).enabled }"
                      role="switch"
                      :aria-labelledby="`rg-bind-fb-en-${binding.id}`"
                      :aria-checked="ensureBindingFeedback(binding).enabled"
                      @click="
                        ensureBindingFeedback(binding).enabled = !ensureBindingFeedback(binding).enabled
                      "
                    />
                  </div>
                  <p class="rg-mini rg-mini--indent">
                    写回连接：{{
                      opcServerLabel(
                        ensureBindingFeedback(binding).serverId || effectiveBindingServerId(binding),
                      ) || "同触发/默认连接"
                    }}
                  </p>
                  <div class="rg-row rg-row--in-panel">
                    <label class="rg-lbl" :for="`rg-bind-fb-status-${binding.id}`">状态 INT NodeId</label>
                    <div class="rg-inline rg-inline--bind">
                      <input
                        :id="`rg-bind-fb-status-${binding.id}`"
                        v-model.trim="ensureBindingFeedback(binding).statusNodeId"
                        type="text"
                        class="rg-inp rg-inp--grow rg-mono"
                        placeholder="ns=…;s=…（INT）"
                      />
                      <button
                        type="button"
                        class="btn btn--nowrap"
                        @click="openBindingFeedbackPick(binding.id, 'status')"
                      >
                        从地址空间选择…
                      </button>
                    </div>
                    <p class="rg-mini rg-mini--indent">自动结批固定写 INT 阶段码（见监控区说明）。</p>
                  </div>
                  <div class="rg-row rg-row--in-panel">
                    <label class="rg-lbl" :for="`rg-bind-fb-msg-${binding.id}`">信息 WSTRING（可选）</label>
                    <div class="rg-inline rg-inline--bind">
                      <input
                        :id="`rg-bind-fb-msg-${binding.id}`"
                        v-model.trim="ensureBindingFeedback(binding).messageNodeId"
                        type="text"
                        class="rg-inp rg-inp--grow rg-mono"
                        placeholder="可选"
                      />
                      <button
                        type="button"
                        class="btn btn--nowrap"
                        @click="openBindingFeedbackPick(binding.id, 'message')"
                      >
                        从地址空间选择…
                      </button>
                    </div>
                  </div>
                  <div class="rg-row rg-row--in-panel">
                    <label class="rg-lbl" :for="`rg-bind-fb-path-${binding.id}`">路径 WSTRING（可选）</label>
                    <div class="rg-inline rg-inline--bind">
                      <input
                        :id="`rg-bind-fb-path-${binding.id}`"
                        v-model.trim="ensureBindingFeedback(binding).filePathNodeId"
                        type="text"
                        class="rg-inp rg-inp--grow rg-mono"
                        placeholder="可选；成功时写本路 PDF 路径"
                      />
                      <button
                        type="button"
                        class="btn btn--nowrap"
                        @click="openBindingFeedbackPick(binding.id, 'path')"
                      >
                        从地址空间选择…
                      </button>
                    </div>
                  </div>
                  <div class="rg-row rg-row--in-panel">
                    <button type="button" class="btn btn--sm" @click="testBindingFeedbackWrite(binding)">
                      测试写回本路
                    </button>
                  </div>
                </div>
              </div>

              <div class="rg-row rg-row--in-panel rg-trigger-log-block">
                <div class="rg-trigger-log-head">
                  <button
                    type="button"
                    class="rg-trigger-log-toggle"
                    :aria-expanded="isTriggerLogExpanded(binding.id)"
                    @click="toggleTriggerLogExpanded(binding.id)"
                  >
                    <span
                      class="rg-trigger-log-chevron"
                      :class="{ 'rg-trigger-log-chevron--open': isTriggerLogExpanded(binding.id) }"
                      aria-hidden="true"
                      >▸</span
                    >
                    <span class="rg-lbl rg-lbl--inline">触发记录</span>
                    <span class="rg-trigger-log-count">（{{ binding.triggerLog.length }}）</span>
                  </button>
                  <div v-if="binding.triggerLog.length" class="rg-trigger-log-actions">
                    <button type="button" class="btn btn--sm" @click="exportBindingTriggerHistory(binding, bi)">
                      导出触发记录
                    </button>
                    <button
                      type="button"
                      class="btn btn--sm btn--ghost"
                      @click="clearBindingTriggerLog(binding.id)"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div v-show="isTriggerLogExpanded(binding.id)" class="rg-trigger-log-body">
                  <p v-if="!binding.triggerLog.length" class="rg-mini rg-mini--indent">
                    尚无触发记录；条件满足并尝试 {{ RG_UI.opcAuto }} 后会写入。
                  </p>
                  <template v-else>
                    <p v-if="binding.triggerLog.length > triggerLogUiMax" class="rg-mini rg-mini--indent">
                      仅显示最近 {{ triggerLogUiMax }} 条，共 {{ binding.triggerLog.length }} 条；完整记录可点「导出触发记录」。
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
                                :class="
                                  row.success ? 'rg-trigger-log-status--ok' : 'rg-trigger-log-status--fail'
                                "
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
          </div>
          <p class="rg-mini rg-mini--indent rg-mini--bindings-hint">
            在「数据源 → OPC UA」中保存连接；启用 {{ RG_UI.opcAuto }} 后<strong>在任意页面</strong>均会每秒检测触发变量，条件满足即生成对应 PDF，无冷却等待。
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
      :close-on-confirm="opcPickCloseOnConfirm"
      :title="opcPickTitle"
      :lead="opcPickLead"
      :initial-server-id="opcPickInitialServerId"
      :initial-node-id="opcPickInitialNodeId"
      :external-servers="opcServers"
      @confirm="onRgOpcPickConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import { listTemplateSummaries, type TemplateSummary } from "@/api/templates";
import { apiFetch } from "@/api/client.js";
import {
  defaultBindingExportResultOpcFeedback,
  loadReportGeneratorPrefs,
  resolveEffectiveOpcServerIdForBinding,
  saveReportGeneratorPrefs,
  type AutoExportDirSource,
  type ExportResultOpcFeedback,
  type ReportGeneratorPrefs,
} from "@/lib/report-generator-prefs";
import { pickPreferredOpcServerId } from "@/lib/report-template/binding-preview-utils";
import {
  autoExportStatusLabel,
  clampAutoExportMaxParallel,
} from "@/lib/auto-export-status-codes";
import { exportCpuBudgetHint, resolveAutoExportMaxParallel } from "@/lib/export-cpu-budget";
import { loadReportExportPrefs, saveReportExportPrefs } from "@/lib/report-export-prefs";
import { templateSelectLabel, templateSelectRows } from "@/lib/template-display-order";
import { createOpcTriggerPollState, type OpcTriggerPollState } from "@/lib/auto-opc-trigger";
import { resolveReportOutputTarget } from "@/lib/resolve-report-output-dir";
import { normalizeReportKind } from "@/lib/report-template/model";
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
  AUTO_TRIGGER_LOG_UI_MAX,
  buildTriggerHistoryLoggerText,
  defaultTriggerHistoryLoggerFileName,
  downloadTextFile,
  formatTriggerLogTime,
  triggerLogUiSlice,
} from "@/lib/auto-trigger-log";
import {
  bindingConfigKey,
  createAutoTriggerBinding,
  isTriggerBindingActive,
  parseRgTriggerPickTarget,
  rgTriggerPickTarget,
  type AutoTriggerBinding,
} from "@/lib/auto-trigger-bindings";
import OpcUaNodePickerModal from "@/features/datasource/opcua/OpcUaNodePickerModal.vue";
import {
  AUTO_FILE_NAME_SEGMENT_OPTIONS,
  formatExportTs,
  previewAutoExportFileName,
  type AutoFileNameSegment,
} from "@/lib/auto-export-filename";
import { humanizePdfExportError } from "@/lib/pdfExportErrors";
import {
  buildExportCancelToastAction,
  requestCancelPdfExport,
  shouldShowExportCancelControl,
} from "@/lib/pdf-export-cancel-ui";
import {
  exportFailureAuditDetail,
  parseExportFailureDiagnostics,
} from "@/lib/bindingPreviewErrors";
import { runTemplateExportPreflight } from "@/lib/templateExportPreflight";
import { dismissAppToast, showAppToast } from "@/composables/useAppToast";
import { auditLog } from "@/lib/auditLog";
import {
  testWriteExportResultToOpcua,
} from "@/lib/exportResultOpcFeedback";
import {
  formatExportStatsLine,
  formatExportTimingsLine,
  getReportAutoExportBindingRuntime,
  notifyReportAutoExportSettingsChanged,
  reportAutoExportStatus,
  resetReportAutoExportBindingRuntime,
} from "@/lib/report-auto-export-trigger-service";
import { notifyPlcHeartbeatSettingsChanged, plcHeartbeatState } from "@/lib/plc-heartbeat-service";
import { usePageLifecycle } from "@/composables/usePageLifecycle";
import {
  clearPdfExportFillCacheAfterFailure,
  isPdfExportCancelledError,
  newPdfExportJobId,
} from "@/lib/pdf-export-job";
import {
  listExportPerfProfiles,
  normalizeExportPerfTier,
  resolveExportPerfProfile,
  type ExportPerfTier,
} from "@/lib/export-perf-tier";
import {
  beginExportCoexistSession,
  endExportCoexistSession,
} from "@/lib/export-coexist-busy";

defineOptions({ name: "ReportGenerator" });

const { register: registerPageTask } = usePageLifecycle("ReportGenerator");

const exportPerfProfiles = listExportPerfProfiles();

/** 「生成报表」页用户可见固定用语（勿单独显示「结批」二字；PLC 信息节点标签见 exportResultOpcFeedback） */
const RG_UI = {
  manual: "模拟结批",
  opcAuto: "OPC UA 自动结批",
  feedback: "结批结果反馈",
} as const;

const RG_STATUS_OPC_AUTO = `[${RG_UI.opcAuto}]`;
const RG_STATUS_FEEDBACK = `[${RG_UI.feedback}]`;

/** 036：模拟结批默认目录（已配置保存目录时直接用，免每次弹选夹） */
const DEFAULT_MANUAL_EXPORT_DIR = "/Users/dp/Desktop/report-editor-exports";

const prefs = ref<ReportGeneratorPrefs>(loadReportGeneratorPrefs());
const exportPerfProfile = computed(() => resolveExportPerfProfile(prefs.value.exportPerfTier));
const exportWatchDir = loadReportExportPrefs().watchDir;
if (!prefs.value.autoExportDir) {
  prefs.value.autoExportDir = exportWatchDir || DEFAULT_MANUAL_EXPORT_DIR;
}
const summaries = ref<TemplateSummary[]>([]);
const templateRows = computed(() => templateSelectRows(summaries.value));
const opcServers = ref<{ id: string; name?: string }[]>([]);
type RgOpcPickTarget =
  | "exportDir"
  | "fileName"
  | "heartbeat"
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

const advancedAutoExpanded = ref(false);
const bindingCardExpanded = ref<Record<string, boolean>>({});
const bindingMonitorExpanded = ref<Record<string, boolean>>({});
const serverOverrideExpanded = ref<Record<string, boolean>>({});

function clearAutoExportDirOpcBinding(): void {
  prefs.value.autoExportDirOpcServerId = "";
  prefs.value.autoExportDirOpcNodeId = "";
  autoStatus.value = `${RG_STATUS_OPC_AUTO} 已清除保存目录 OPC 变量绑定`;
}

function clearAutoFileNameOpcBinding(): void {
  prefs.value.autoFileNameOpcServerId = "";
  prefs.value.autoFileNameOpcNodeId = "";
  autoStatus.value = `${RG_STATUS_OPC_AUTO} 已清除文件名 OPC 变量绑定`;
}

function clearAutoTriggerNodeBinding(bindingId: string): void {
  const binding = findAutoTriggerBinding(bindingId);
  if (!binding) return;
  binding.nodeId = "";
  const runtime = getBindingRuntime(bindingId);
  runtime.poll = createOpcTriggerPollState();
  runtime.history.clear();
  runtime.chartEligible = null;
  syncBindingChartUi(bindingId, runtime);
  autoStatus.value = `${RG_STATUS_OPC_AUTO} 已清除触发节点绑定`;
}

function parseBindingFeedbackPick(
  target: string | null,
): { bindingId: string; field: "status" | "message" | "path" } | null {
  if (!target?.startsWith("bindFb:")) return null;
  const rest = target.slice("bindFb:".length);
  const idx = rest.lastIndexOf(":");
  if (idx <= 0) return null;
  const bindingId = rest.slice(0, idx).trim();
  const field = rest.slice(idx + 1).trim();
  if (!bindingId) return null;
  if (field !== "status" && field !== "message" && field !== "path") return null;
  return { bindingId, field };
}

const opcPickCloseOnConfirm = computed(
  () => !parseBindingFeedbackPick(opcPickTarget.value),
);



const opcPickModalKey = computed(() => {
  const t = opcPickTarget.value;
  if (t === "exportDir") return "pick-exportDir";
  if (t === "fileName") return "pick-fileName";
  const bid = parseRgTriggerPickTarget(t);
  if (bid) return `pick-trigger-${bid}`;
  const bf = parseBindingFeedbackPick(t);
  if (bf) return `pick-bindFb-${bf.bindingId}-${bf.field}`;
  return "pick-idle";
});

const opcPickHideSearch = computed(() => {
  const t = opcPickTarget.value;
  if (parseBindingFeedbackPick(t)) return false;
  return (
    t === "exportDir" ||
    t === "fileName" ||
    Boolean(parseRgTriggerPickTarget(t))
  );
});

const opcPickTitle = computed(() => {
  if (parseRgTriggerPickTarget(opcPickTarget.value)) return "选择 OPC UA 触发变量";
  const bf = parseBindingFeedbackPick(opcPickTarget.value);
  if (bf?.field === "status") return "绑定本路 INT 状态变量";
  if (bf?.field === "message") return "绑定本路信息 WSTRING";
  if (bf?.field === "path") return "绑定本路路径 WSTRING";
  if (opcPickTarget.value === "fileName") return "绑定 OPC UA String 变量（文件名片段）";
  if (opcPickTarget.value === "exportDir") return "绑定 OPC UA String 变量（目录）";
  return "绑定 OPC UA 变量";
});

const opcPickInitialServerId = computed(() => {
  const fallback = () => String(prefs.value.auto.defaultOpcServerId || "").trim();
  if (opcPickTarget.value === "exportDir") {
    return prefs.value.autoExportDirOpcServerId.trim() || fallback();
  }
  if (opcPickTarget.value === "fileName") {
    return prefs.value.autoFileNameOpcServerId.trim() || fallback();
  }
  const bf = parseBindingFeedbackPick(opcPickTarget.value);
  if (bf) {
    const b = prefs.value.auto.bindings.find((x) => x.id === bf.bindingId);
    if (!b) return fallback();
    return (
      ensureBindingFeedback(b).serverId.trim() ||
      resolveEffectiveOpcServerIdForBinding(prefs.value, b) ||
      fallback()
    );
  }
  const bindId = parseRgTriggerPickTarget(opcPickTarget.value);
  if (bindId) {
    const b = prefs.value.auto.bindings.find((x) => x.id === bindId);
    return (b ? resolveEffectiveOpcServerIdForBinding(prefs.value, b) : "") || fallback();
  }
  if (opcPickTarget.value === "heartbeat") {
    return String(heartbeatCfg.value.serverId || "").trim() || fallback();
  }
  return fallback();
});

const opcPickInitialNodeId = computed(() => {
  const t = opcPickTarget.value;
  if (!t) return "";
  if (t === "exportDir") return String(prefs.value.autoExportDirOpcNodeId || "").trim();
  if (t === "fileName") return String(prefs.value.autoFileNameOpcNodeId || "").trim();
  if (t === "heartbeat") return String(heartbeatCfg.value.nodeId || "").trim();
  const bf = parseBindingFeedbackPick(t);
  if (bf) {
    const b = prefs.value.auto.bindings.find((x) => x.id === bf.bindingId);
    if (!b) return "";
    const fb = ensureBindingFeedback(b);
    if (bf.field === "status") return String(fb.statusNodeId || "").trim();
    if (bf.field === "message") return String(fb.messageNodeId || "").trim();
    if (bf.field === "path") return String(fb.filePathNodeId || "").trim();
    return "";
  }
  const bindId = parseRgTriggerPickTarget(t);
  if (bindId) {
    const b = prefs.value.auto.bindings.find((x) => x.id === bindId);
    return String(b?.nodeId || "").trim();
  }
  return "";
});

const opcPickLead = computed(() => {
  if (opcPickTarget.value === "exportDir") {
    return `选择已保存的 OPC UA 连接，在地址空间中展开并点击 String 变量作为 ${RG_UI.opcAuto} 保存目录；非 String 变量在展开时不会显示。确定后写入 NodeId，仍可手工修改。`;
  }
  if (opcPickTarget.value === "fileName") {
    return `选择 String 类型变量作为 ${RG_UI.opcAuto} 文件名片段（不含 .pdf）；绑定树仅显示 String。是否参与拼接由面板中的「OPC UA变量」片段控制。`;
  }
  const bf = parseBindingFeedbackPick(opcPickTarget.value);
  if (bf?.field === "status") {
    return "选择 Int 类型变量作为本绑定结批状态码（0失败 1成功 2监听 3排队 4预检 5取数 6渲染 7保存 8写回）。";
  }
  if (bf?.field === "message") {
    return "选择 String/WSTRING 变量写入本路阶段/结果摘要。";
  }
  if (bf?.field === "path") {
    return "选择 String/WSTRING 变量；成功时写入本路 PDF 路径（文件仍在全局共用目录）。";
  }
  if (parseRgTriggerPickTarget(opcPickTarget.value)) {
    return `选择已保存连接下的变量作为 ${RG_UI.opcAuto} 触发源；支持布尔、数值、字符串等类型。确定后写入 NodeId。`;
  }
  return "选择变量并绑定。";
});

const electronShell = computed(() => typeof window !== "undefined" && Boolean(window.electronAPI?.runPdfExport));

const manualBusy = ref(false);
/** 034 M7：进行中模拟结批的 jobId，供取消按钮 / toast 操作 */
const manualExportJobId = ref("");
const showManualCancel = computed(() =>
  shouldShowExportCancelControl(manualBusy.value, manualExportJobId.value),
);

function onCancelManualExport(): void {
  requestCancelPdfExport(manualExportJobId.value);
}
const manualHint = ref("");

const triggerLogUiMax = AUTO_TRIGGER_LOG_UI_MAX;
const triggerChartMaxSamples = AUTO_TRIGGER_CHART_MAX_SAMPLES;
const triggerLogExpanded = ref<Record<string, boolean>>({});

const autoStatus = reportAutoExportStatus;

type BindingChartUi = { show: boolean; samples: number[] };
const bindingChartUiMap = ref<Record<string, BindingChartUi>>({});
const bindingFeedbackExpanded = ref<Record<string, boolean>>({});
const bindingStatusSamplesMap = ref<Record<string, number[]>>({});

type BindingRuntime = {
  poll: OpcTriggerPollState;
  history: NumericSampleRing;
  chartEligible: boolean | null;
  statusHistory?: NumericSampleRing;
  lastStatusCode?: number;
  lastStatusText?: string;
};

function getBindingRuntime(id: string): BindingRuntime {
  return getReportAutoExportBindingRuntime(id);
}

function syncBindingChartUi(id: string, rt: BindingRuntime): void {
  const show = rt.chartEligible === true;
  bindingChartUiMap.value = {
    ...bindingChartUiMap.value,
    [id]: { show, samples: show ? rt.history.toArray() : [] },
  };
  bindingStatusSamplesMap.value = {
    ...bindingStatusSamplesMap.value,
    [id]: rt.statusHistory ? rt.statusHistory.toArray() : [],
  };
}

function bindingChartUi(id: string): BindingChartUi | undefined {
  return bindingChartUiMap.value[id];
}

function bindingStatusChartSamples(id: string): number[] {
  return bindingStatusSamplesMap.value[id] || [];
}

function bindingLiveStatusText(id: string): string {
  const rt = getBindingRuntime(id);
  const code = rt.lastStatusCode ?? 2;
  const text = rt.lastStatusText || autoExportStatusLabel(code);
  return `${text}（${code}）`;
}

function effectiveBindingServerId(binding: AutoTriggerBinding): string {
  return resolveEffectiveOpcServerIdForBinding(prefs.value, binding);
}

function shortNodeLabel(nodeId: string): string {
  const raw = nodeId.trim();
  if (!raw) return "";
  const parts = raw.split(/[./\\]/);
  const last = parts[parts.length - 1] || raw;
  return last.length > 36 ? `${last.slice(0, 34)}…` : last;
}

function bindingSummaryMeta(binding: AutoTriggerBinding): string {
  const tpl = summaries.value.find((x) => x.id === binding.templateId);
  const tplName = tpl?.name?.trim() || "未选模版";
  const node = shortNodeLabel(binding.nodeId) || "未选节点";
  return `${tplName} · ${node}`;
}

function isBindingCardExpanded(bindingId: string): boolean {
  return Boolean(bindingCardExpanded.value[bindingId]);
}

function toggleBindingCardExpanded(bindingId: string): void {
  bindingCardExpanded.value = {
    ...bindingCardExpanded.value,
    [bindingId]: !bindingCardExpanded.value[bindingId],
  };
}

function isBindingMonitorExpanded(bindingId: string): boolean {
  return Boolean(bindingMonitorExpanded.value[bindingId]);
}

function toggleBindingMonitorExpanded(bindingId: string): void {
  bindingMonitorExpanded.value = {
    ...bindingMonitorExpanded.value,
    [bindingId]: !bindingMonitorExpanded.value[bindingId],
  };
}

function isServerOverrideExpanded(bindingId: string): boolean {
  return Boolean(serverOverrideExpanded.value[bindingId]);
}

function toggleServerOverrideExpanded(bindingId: string): void {
  serverOverrideExpanded.value = {
    ...serverOverrideExpanded.value,
    [bindingId]: !serverOverrideExpanded.value[bindingId],
  };
}

function onDefaultOpcServerChange(): void {
  notifyReportAutoExportSettingsChanged();
}

async function ensureDefaultOpcServerId(): Promise<void> {
  const current = String(prefs.value.auto.defaultOpcServerId || "").trim();
  if (current && opcServers.value.some((s) => s.id === current)) return;
  let appPrefs: Record<string, unknown> = {};
  try {
    appPrefs = (await apiFetch("/settings/app_preferences")) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  const picked = pickPreferredOpcServerId(appPrefs, opcServers.value);
  if (picked) prefs.value.auto.defaultOpcServerId = picked;
}

function ensureBindingFeedback(binding: AutoTriggerBinding): ExportResultOpcFeedback {
  if (!binding.exportResultOpc) {
    binding.exportResultOpc = defaultBindingExportResultOpcFeedback();
  }
  binding.exportResultOpc.statusKind = "int";
  return binding.exportResultOpc;
}

function isBindingFeedbackExpanded(bindingId: string): boolean {
  return Boolean(bindingFeedbackExpanded.value[bindingId]);
}

function toggleBindingFeedbackExpanded(bindingId: string): void {
  bindingFeedbackExpanded.value = {
    ...bindingFeedbackExpanded.value,
    [bindingId]: !bindingFeedbackExpanded.value[bindingId],
  };
}

const exportCpuBudgetHintText = computed(() => exportCpuBudgetHint());

function onMaxParallelChange(): void {
  prefs.value.auto.maxParallelExports = clampAutoExportMaxParallel(prefs.value.auto.maxParallelExports);
  const effective = resolveAutoExportMaxParallel(prefs.value.auto.maxParallelExports);
  if (effective < prefs.value.auto.maxParallelExports) {
    /* 弱 CPU / Hypervisor：保存仍可写高值，运行时按预算封顶；提示用户 */
    autoStatus.value = `并行设置 ${prefs.value.auto.maxParallelExports}，本机 CPU 预算生效为 ${effective}`;
  }
  notifyReportAutoExportSettingsChanged();
  void applyExportPerfProfileToMain();
}

function selectExportPerfTier(next: ExportPerfTier): void {
  prefs.value.exportPerfTier = next;
  onExportPerfTierChange();
}

function onExportPerfTierChange(): void {
  const tier = normalizeExportPerfTier(prefs.value.exportPerfTier) as ExportPerfTier;
  prefs.value.exportPerfTier = tier;
  const profile = resolveExportPerfProfile(tier);
  prefs.value.pdfExportEngine = profile.engine;
  prefs.value.auto.maxParallelExports = clampAutoExportMaxParallel(profile.maxParallelHint);
  notifyReportAutoExportSettingsChanged();
  void applyExportPerfProfileToMain();
}

async function applyExportPerfProfileToMain(): Promise<void> {
  const profile = resolveExportPerfProfile(prefs.value.exportPerfTier);
  const api = window.electronAPI;
  try {
    await api?.setPdfExportPerfProfile?.({
      prewarmPoolSize: profile.prewarmPoolSize,
      yieldMs: profile.yieldMs,
      maxParallel: resolveAutoExportMaxParallel(prefs.value.auto.maxParallelExports),
    });
  } catch {
    /* 非 Electron 忽略 */
  }
}

function openBindingFeedbackPick(bindingId: string, field: "status" | "message" | "path"): void {
  openRgOpcPick(`bindFb:${bindingId}:${field}`);
}

async function testBindingFeedbackWrite(binding: AutoTriggerBinding): Promise<void> {
  const fb = ensureBindingFeedback(binding);
  const res = await testWriteExportResultToOpcua(fb);
  if (res.ok) {
    autoStatus.value = `${RG_STATUS_FEEDBACK} 绑定「${bindingDisplayLabel(binding, prefs.value.auto.bindings.indexOf(binding))}」测试写回成功`;
    showAppToast(`本路写回测试成功：${res.written.join("、")}`, { tone: "ok", durationMs: 6000 });
  } else {
    autoStatus.value = `${RG_STATUS_FEEDBACK} 测试写回失败：${res.errors.join("；")}`;
    showAppToast(`本路写回测试失败\n${res.errors.join("\n")}`, { tone: "err", durationMs: 10000 });
  }
}

/**
 * OPC 采样由应用级 report-auto-export-trigger-service 每秒写入共享 runtime，
 * 本页需定时把共享 runtime 的最新曲线同步到 UI，否则进入本页后折线图不刷新。
 */
let chartRefreshTimer: number | null = null;

function refreshAllBindingCharts(): void {
  for (const b of prefs.value.auto.bindings) {
    syncBindingChartUi(b.id, getBindingRuntime(b.id));
  }
}

function startChartRefresh(): void {
  if (chartRefreshTimer != null) return;
  refreshAllBindingCharts();
  chartRefreshTimer = window.setInterval(refreshAllBindingCharts, 1000);
}

function stopChartRefresh(): void {
  if (chartRefreshTimer != null) {
    window.clearInterval(chartRefreshTimer);
    chartRefreshTimer = null;
  }
}

/** B 级金样：离页停图表 tick；自动结批服务为 A 级不在此注册（032 L9） */
registerPageTask({
  id: "chart-refresh",
  scope: "page",
  pause: stopChartRefresh,
  resume: startChartRefresh,
});

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
  for (const key of Object.keys(bindingChartUiMap.value)) {
    if (!ids.has(key)) {
      const next = { ...bindingChartUiMap.value };
      delete next[key];
      bindingChartUiMap.value = next;
    }
  }
  for (const key of Object.keys(bindingStatusSamplesMap.value)) {
    if (!ids.has(key)) {
      const next = { ...bindingStatusSamplesMap.value };
      delete next[key];
      bindingStatusSamplesMap.value = next;
    }
  }
}

watch(
  () => prefs.value.auto.bindings.map(bindingConfigKey).join("\n"),
  () => {
    resetReportAutoExportBindingRuntime();
    notifyReportAutoExportSettingsChanged();
    pruneBindingRuntime();
    for (const b of prefs.value.auto.bindings) {
      const r = getBindingRuntime(b.id);
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
  const defaultId = String(prefs.value.auto.defaultOpcServerId || "").trim();
  const serverId =
    defaultId || (prev.length ? String(prev[prev.length - 1].serverId || "").trim() : "");
  const templateId = prefs.value.templateId;
  const exportResultOpc = defaultBindingExportResultOpcFeedback();
  if (serverId) exportResultOpc.serverId = serverId;
  const binding = createAutoTriggerBinding({
    serverId,
    templateId: templateId || null,
    exportResultOpc,
  });
  prefs.value.auto.bindings = [...prev, binding];
  bindingCardExpanded.value = { ...bindingCardExpanded.value, [binding.id]: true };
  void nextTick(() => {
    document.getElementById(`rg-bind-card-${binding.id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
}

function removeAutoTriggerBinding(id: string): void {
  prefs.value.auto.bindings = prefs.value.auto.bindings.filter((b) => b.id !== id);
  const next = { ...bindingChartUiMap.value };
  delete next[id];
  bindingChartUiMap.value = next;
  const statusNext = { ...bindingStatusSamplesMap.value };
  delete statusNext[id];
  bindingStatusSamplesMap.value = statusNext;
  const fbNext = { ...bindingFeedbackExpanded.value };
  delete fbNext[id];
  bindingFeedbackExpanded.value = fbNext;
  const cardNext = { ...bindingCardExpanded.value };
  delete cardNext[id];
  bindingCardExpanded.value = cardNext;
  const monNext = { ...bindingMonitorExpanded.value };
  delete monNext[id];
  bindingMonitorExpanded.value = monNext;
  const ovNext = { ...serverOverrideExpanded.value };
  delete ovNext[id];
  serverOverrideExpanded.value = ovNext;
  const logNext = { ...triggerLogExpanded.value };
  delete logNext[id];
  triggerLogExpanded.value = logNext;
  notifyReportAutoExportSettingsChanged();
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
      title: "导出触发记录",
      defaultPath,
      content,
    });
    if (res.canceled) return;
    if (res.ok && res.filePath) {
      autoStatus.value = `[记录] 已保存 ${res.filePath}`;
    } else if (!res.ok) {
      autoStatus.value = `[记录] 保存失败：${res.error || "未知错误"}`;
    }
    return;
  }
  downloadTextFile(content, defaultPath);
  autoStatus.value = `[记录] 已下载 ${defaultPath}`;
}

watch(
  () => prefs.value.autoExportDir,
  () => {
    notifyReportAutoExportSettingsChanged();
  },
);

watch(
  prefs,
  (p) => saveReportGeneratorPrefs(JSON.parse(JSON.stringify(p)) as ReportGeneratorPrefs),
  { deep: true },
);

/** PLC 心跳配置：绑定或参数变化后重启心跳定时器（须在保存 watcher 之后声明，保证先落盘再重读） */
const heartbeatCfg = computed(() => prefs.value.heartbeat);

const heartbeatBindingHint = computed(() => {
  const hb = heartbeatCfg.value;
  const nid = hb.nodeId.trim();
  if (!nid) return "";
  const label = hb.nodeLabel.trim();
  return label && label !== nid ? `${label}（${nid}）` : nid;
});

const heartbeatStatusLine = computed(() => plcHeartbeatState.status.value);
const plcHeartbeatLastOk = computed(() => plcHeartbeatState.lastOk.value);

watch(
  () =>
    [
      heartbeatCfg.value.enabled,
      heartbeatCfg.value.serverId,
      heartbeatCfg.value.nodeId,
      heartbeatCfg.value.intervalMs,
      heartbeatCfg.value.mode,
    ].join("\u0000"),
  () => {
    notifyPlcHeartbeatSettingsChanged();
  },
);

function clearHeartbeatBinding(): void {
  heartbeatCfg.value.nodeId = "";
  heartbeatCfg.value.nodeLabel = "";
}

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

function normalizeSavedPdfPaths(
  exportRes: { filePath?: string; filePaths?: string[] } | null | undefined,
  fallbackPath: string,
): string[] {
  const paths = Array.isArray(exportRes?.filePaths)
    ? exportRes.filePaths.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (paths.length) return paths;
  const single = String(exportRes?.filePath || fallbackPath || "").trim();
  return single ? [single] : [];
}

function isReportSplitPreflightBlocker(text: string): boolean {
  return /分报表|数据库填充表|超出最大数量/.test(text);
}

function toggleAutoEnabled() {
  if (!electronShell.value) return;
  prefs.value.auto.enabled = !prefs.value.auto.enabled;
  notifyReportAutoExportSettingsChanged();
}

function toggleManualOpenAfter() {
  if (!electronShell.value) return;
  prefs.value.manualOpenAfter = !prefs.value.manualOpenAfter;
}



function setExportDirTab(source: AutoExportDirSource) {
  if (prefs.value.autoExportDirSource === source) return;
  prefs.value.autoExportDirSource = source;
}


function resolveRgOpcPickDataTypeFilter(target: RgOpcPickTarget | null): string {
  if (!target) return "";
  if (target === "exportDir" || target === "fileName") {
    return "String";
  }
  const bf = parseBindingFeedbackPick(target);
  if (bf?.field === "status") return "Int";
  if (bf?.field === "message" || bf?.field === "path") return "String";
  if (target === "heartbeat") {
    const m = heartbeatCfg.value.mode;
    if (m === "counter") return "Int";
    if (m === "toggle") return "Boolean";
    return ""; // 常写 1：Bool / Int 均可，不筛类型
  }
  return "";
}

async function openRgOpcPick(target: RgOpcPickTarget) {
  await loadOpcServers();
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

type RgOpcPickConfirmPayload = {
  serverId: string;
  nodeId: string;
  nodeLabel?: string;
};

function finishRgOpcPickSuccess() {
  opcPickOpen.value = false;
}

async function onRgOpcPickConfirm(payload: RgOpcPickConfirmPayload) {
  const sid = payload.serverId.trim();
  const nid = payload.nodeId.trim();
  const nodeLabel = (payload.nodeLabel || "").trim();
  const target = opcPickTarget.value;
  if (!nid || !target) {
    finishRgOpcPickSuccess();
    return;
  }

  const triggerBindId = parseRgTriggerPickTarget(target);
  if (triggerBindId) {
    const b = findAutoTriggerBinding(triggerBindId);
    if (!b) {
      finishRgOpcPickSuccess();
      return;
    }
    if (sid) b.serverId = sid;
    b.nodeId = nid;
    getBindingRuntime(triggerBindId).poll = createOpcTriggerPollState();
    finishRgOpcPickSuccess();
    return;
  }

  const bindFb = parseBindingFeedbackPick(target);
  if (bindFb) {
    const b = findAutoTriggerBinding(bindFb.bindingId);
    if (!b || !sid) {
      finishRgOpcPickSuccess();
      return;
    }
    const fb = ensureBindingFeedback(b);
    if (bindFb.field === "status") {
      const check = await readSavedOpcNodeValue(sid, nid);
      if (!check.ok) {
        autoStatus.value = `${RG_STATUS_FEEDBACK} ${check.message || "读取节点失败"}`;
        return;
      }
      const dt = check.dataType || "";
      if (dt && !opcDataTypeLabelMatchesFilter(dt, "Int")) {
        autoStatus.value = `${RG_STATUS_FEEDBACK} 本路状态需要 Int，当前为 ${dt}`;
        return;
      }
      fb.serverId = sid;
      fb.statusNodeId = nid;
      fb.statusNodeLabel = nodeLabel;
      fb.statusKind = "int";
      autoStatus.value = `${RG_STATUS_FEEDBACK} 已绑定本路 INT 状态`;
      finishRgOpcPickSuccess();
      return;
    }
    const check = await readSavedOpcStringValue(sid, nid);
    if (!check.ok) {
      autoStatus.value = `${RG_STATUS_FEEDBACK} ${check.message || "所选节点不是 String 类型"}`;
      return;
    }
    fb.serverId = sid;
    if (bindFb.field === "message") {
      fb.messageNodeId = nid;
      fb.messageNodeLabel = nodeLabel;
      autoStatus.value = `${RG_STATUS_FEEDBACK} 已绑定本路信息节点`;
    } else {
      fb.filePathNodeId = nid;
      fb.filePathNodeLabel = nodeLabel;
      autoStatus.value = `${RG_STATUS_FEEDBACK} 已绑定本路路径节点`;
    }
    finishRgOpcPickSuccess();
    return;
  }

  if (target === "fileName") {
    if (!sid) {
      finishRgOpcPickSuccess();
      return;
    }
    const check = await readSavedOpcStringValue(sid, nid);
    if (!check.ok) {
      autoStatus.value = `[文件名] ${check.message || "所选节点不是 String 类型"}`;
      return;
    }
    prefs.value.autoFileNameOpcServerId = sid;
    prefs.value.autoFileNameOpcNodeId = nid;
    finishRgOpcPickSuccess();
    return;
  }

  if (target === "exportDir") {
    if (sid) prefs.value.autoExportDirOpcServerId = sid;
    prefs.value.autoExportDirOpcNodeId = nid;
    finishRgOpcPickSuccess();
    return;
  }


  if (target === "heartbeat") {
    const hb = heartbeatCfg.value;
    if (sid) hb.serverId = sid;
    hb.nodeId = nid;
    hb.nodeLabel = nodeLabel;
    finishRgOpcPickSuccess();
    return;
  }

  finishRgOpcPickSuccess();
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
  await ensureDefaultOpcServerId();
}

async function onManualExport(): Promise<void> {
  manualHint.value = "";
  const api = window.electronAPI;
  if (!api?.runPdfExport || !api.pickExportDirectory || !api.pathJoin) {
    manualHint.value = `当前环境不支持${RG_UI.manual}。`;
    return;
  }
  const tid = prefs.value.templateId;
  if (!tid) return;

  const tmeta = summaries.value.find((x) => x.id === tid);
  const reportKind = normalizeReportKind(tmeta?.reportKind);
  const suggestName = `${(tmeta?.name || "报表").replace(/[/\\?%*:|"<>]/g, "_")}_${formatExportTs()}.pdf`;

  // 046 Q4A：手动导出与自动结批同规则——batch → 根目录/批号/（无批号禁止导出）；nonBatch → 模版指定绝对路径
  if (reportKind === "batch" && !String(prefs.value.autoExportDir || "").trim()) {
    const picked =
      (await api.pickExportDirectory({
        title: `选择${RG_UI.manual}导出根目录`,
        defaultPath: DEFAULT_MANUAL_EXPORT_DIR,
      })) || "";
    if (!picked) {
      manualHint.value = "已取消保存。";
      return;
    }
    prefs.value.autoExportDir = picked;
  }
  const target = await resolveReportOutputTarget({
    reportKind,
    nonBatchOutputDir: tmeta?.nonBatchOutputDir,
    prefs: prefs.value,
  });
  if (!target.ok) {
    manualHint.value = target.error;
    showAppToast(`[${RG_UI.manual}] ${target.error}`, { tone: "err", durationMs: 12000 });
    void auditLog({
      action: "export.manual_pdf",
      result: "fail",
      summary: target.error,
      object_type: "template",
      object_id: tid,
      detail: { context: "manual", reportKind, error: target.error },
    });
    return;
  }
  const exportDir = target.dir;
  const filePath = await api.pathJoin(exportDir, suggestName);

  manualBusy.value = true;
  manualExportJobId.value = "";
  manualHint.value = "正在检查数据源连接…";
  const startedAtMs = Date.now();
  const progressToastId = "batch-progress-manual";
  const exportProfile = resolveExportPerfProfile(prefs.value.exportPerfTier);
  beginExportCoexistSession(exportProfile.coexistPause);
  const stage = (text: string): void => {
    showAppToast(`[${RG_UI.manual}]\n${text}`, {
      id: progressToastId,
      tone: "info",
      durationMs: 0,
      spinner: true,
      action: buildExportCancelToastAction(manualExportJobId.value, () => {
        requestCancelPdfExport(manualExportJobId.value);
      }),
    });
  };
  let offProgress: (() => void) | undefined;
  try {
    stage("正在检查数据源连接…");
    const preflightStartMs = Date.now();
    const preflight = await runTemplateExportPreflight(tid);
    const preflightMs = Date.now() - preflightStartMs;
    if (!preflight.ok) {
      dismissAppToast(progressToastId);
      if (preflight.blockers.some(isReportSplitPreflightBlocker)) {
        manualHint.value = preflight.summary;
        showAppToast(preflight.summary, { tone: "err", durationMs: 12000 });
        return;
      }
      const proceed = window.confirm(
        `${preflight.summary}\n\n是否仍要继续${RG_UI.manual}？（PDF 中可能出现错误占位或生成失败）`,
      );
      if (!proceed) {
        manualHint.value = preflight.summary;
        return;
      }
      manualHint.value = `正在${RG_UI.manual}…`;
    } else if (preflight.warnings.length) {
      manualHint.value = preflight.warnings.join(" ");
    } else {
      manualHint.value = "";
    }

    const exportJobId = newPdfExportJobId("manual");
    manualExportJobId.value = exportJobId;
    stage("正在取数并渲染报表…");
    offProgress = api.onPdfExportProgress?.((p) => {
      if (p.jobId && p.jobId !== exportJobId) return;
      if (p.templateId && p.templateId !== tid) return;
      const total = Number(p.totalReports) || 0;
      const idx = (Number(p.partIndex) || 0) + 1;
      if (p.phase === "render") {
        stage(total > 1 ? `正在取数并渲染第 ${idx}/${total} 份报表…` : "正在取数并渲染报表…");
      } else if (p.phase === "saved") {
        stage(total > 1 ? `已保存第 ${idx}/${total} 份 PDF…` : "PDF 已保存，正在收尾…");
      }
    });
    const exportRes = await api.runPdfExport({
      templateId: tid,
      filePath,
      openAfter: false,
      jobId: exportJobId,
      engine: exportProfile.engine,
      layoutFidelity: exportProfile.layoutFidelity,
      yieldMs: exportProfile.yieldMs,
      coexistPause: exportProfile.coexistPause,
    });
    offProgress?.();
    offProgress = undefined;
    const savedPaths = normalizeSavedPdfPaths(exportRes, filePath);
    manualHint.value =
      savedPaths.length > 1 ? `已保存到文件夹：${exportDir}（共 ${savedPaths.length} 份 PDF）` : `已保存到文件夹：${exportDir}`;
    if (prefs.value.manualOpenAfter) {
      void api.shellOpenPath?.(exportDir);
    }
    const totalMs = Date.now() - startedAtMs;
    const statsLine = formatExportStatsLine(exportRes.stats);
    const exportTimings = { preflightMs, ...(exportRes.timings || {}) };
    const timingsLine = formatExportTimingsLine(exportTimings);
    const modeLabel = exportRes.exportMode === "fidelity" ? "版式优先" : "同机优先";
    const engineHint = exportRes.engine ? `；${modeLabel}/${exportRes.engine}` : "";
    void auditLog({
      action: "export.manual_pdf",
      result: "ok",
      summary: `${suggestName}（耗时 ${(totalMs / 1000).toFixed(1)} 秒${statsLine ? `；${statsLine}` : ""}${timingsLine ? `；${timingsLine}` : ""}${engineHint}）`,
      object_type: "template",
      object_id: tid,
      detail: {
        filePath: savedPaths[0],
        filePaths: savedPaths,
        totalReports: exportRes.totalReports,
        durationMs: totalMs,
        renderMs: exportRes.durationMs,
        stats: exportRes.stats,
        timings: exportTimings,
        engine: exportRes.engine,
        exportMode: exportRes.exportMode,
        engineMeta: exportRes.engineMeta,
        reportKind,
        outputDir: exportDir,
        batchNo: target.batchNo,
      },
    });
    const doneLines = [
      `[${RG_UI.manual}]`,
      savedPaths.length > 1 ? `结批完成：已保存 ${savedPaths.length} 个 PDF` : `结批完成：已保存 ${suggestName}`,
      `耗时 ${(totalMs / 1000).toFixed(1)} 秒${statsLine ? ` · ${statsLine}` : ""}`,
    ];
    if (timingsLine) doneLines.push(timingsLine);
    showAppToast(doneLines.join("\n"), { id: progressToastId, tone: "ok", durationMs: 10000 });
  } catch (e) {
    clearPdfExportFillCacheAfterFailure(e);
    const parsed = parseExportFailureDiagnostics(e);
    const msg = humanizePdfExportError(parsed.message || e);
    const cancelled = isPdfExportCancelledError(e) || isPdfExportCancelledError(msg);
    manualHint.value = cancelled ? "已取消导出。" : msg;
    showAppToast(
      cancelled ? `[${RG_UI.manual}] 已取消` : `[${RG_UI.manual}] 失败\n${msg}`,
      { id: progressToastId, tone: cancelled ? "warn" : "err", durationMs: cancelled ? 6000 : 14000 },
    );
    if (!cancelled) {
      void auditLog({
        action: "export.manual_pdf",
        result: "fail",
        summary: msg.split("\n").slice(0, 8).join("；"),
        object_type: "template",
        object_id: tid,
        detail: exportFailureAuditDetail({
          errorMessage: msg,
          diagnostics: parsed.diagnostics,
          extra: { durationMs: Date.now() - startedAtMs, context: "manual", reportKind, outputDir: exportDir },
        }),
      });
    }
  } finally {
    offProgress?.();
    manualBusy.value = false;
    manualExportJobId.value = "";
    endExportCoexistSession();
  }
}

async function onPickAutoDir(): Promise<void> {
  const title =
    prefs.value.autoExportDirSource === "opcua"
      ? `选择${RG_UI.opcAuto}导出根目录`
      : `选择${RG_UI.opcAuto}保存目录`;
  const p = await window.electronAPI?.pickExportDirectory?.({ title });
  if (p) {
    prefs.value.autoExportDir = p;
    saveReportExportPrefs({ watchDir: p });
  }
}

onMounted(() => {
  for (const b of prefs.value.auto.bindings) {
    syncBindingChartUi(b.id, getBindingRuntime(b.id));
  }
  window.addEventListener("report-editor-config-imported", onConfigImported);
  window.addEventListener("report-editor-opcua-servers-changed", onOpcServersChanged);
  window.addEventListener("report-generator-prefs-updated", onExternalPrefsUpdated);
  void applyExportPerfProfileToMain();
});

/** keep-alive：每次进入刷新模版/连接列表，保证下拉项与其它页新增内容同步；图表 tick 由 lifecycle resume */
onActivated(async () => {
  await Promise.all([loadSummaries(), loadOpcServers()]);
});

function onConfigImported() {
  prefs.value = loadReportGeneratorPrefs();
  void loadSummaries();
  void loadOpcServers();
  notifyReportAutoExportSettingsChanged();
}

function onExternalPrefsUpdated() {
  prefs.value = loadReportGeneratorPrefs();
  void loadSummaries();
  notifyReportAutoExportSettingsChanged();
}

function onOpcServersChanged() {
  void loadOpcServers();
}

onUnmounted(() => {
  window.removeEventListener("report-editor-config-imported", onConfigImported);
  window.removeEventListener("report-editor-opcua-servers-changed", onOpcServersChanged);
  window.removeEventListener("report-generator-prefs-updated", onExternalPrefsUpdated);
});
</script>

<style scoped>
.rg-page {
  width: 100%;
  max-width: none;
  box-sizing: border-box;
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
  width: 100%;
  max-width: none;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #fff;
  box-sizing: border-box;
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
.rg-advanced-toggle {
  width: 100%;
  margin-bottom: 4px;
}
.rg-advanced-hint {
  margin: 0 0 0 4px;
  font-weight: normal;
  color: #a1a1aa;
}
.rg-tabs--perf {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  max-width: 640px;
  margin-top: 6px;
  margin-bottom: 8px;
}
.rg-tabs--perf .rg-tab {
  flex: 1 1 auto;
  padding: 8px 10px;
  font-size: 12px;
  white-space: nowrap;
}
.rg-advanced-body {
  margin-top: 8px;
  padding-top: 4px;
}
.rg-export-dir-block--nested {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e4e4e7;
}
.rg-binding-card {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e4e4e7;
  background: #fff;
}
.rg-binding-card--off {
  opacity: 0.72;
  background: #fafafa;
}
.rg-binding-card--collapsed {
  padding-bottom: 8px;
}
.rg-binding-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}
.rg-binding-card--expanded .rg-binding-card-head {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f4f4f5;
}
.rg-binding-card-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  margin: 0;
  padding: 2px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.rg-binding-card-meta {
  font-size: 12px;
  font-weight: 400;
  color: #71717a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rg-binding-card-body {
  margin-top: 4px;
}
.rg-binding-live-status--summary {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #52525b;
}
.rg-conn-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
}
.rg-binding-monitor-body {
  margin-top: 6px;
  padding-left: 4px;
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
.rg-binding-live-status {
  margin: 0;
  padding: 6px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent, #2563eb) 10%, #f4f4f5);
  font-size: 13px;
  font-weight: 600;
  color: #18181b;
}
.rg-binding-feedback {
  border-top: 1px dashed #e4e4e7;
  padding-top: 8px;
}
.rg-binding-feedback-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rg-binding-feedback-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  max-width: none;
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
  width: auto;
  max-width: 140px;
}
.rg-inline {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  max-width: none;
}
.rg-inline--bind {
  width: 100%;
  max-width: none;
  flex-wrap: wrap;
}
.rg-inline--bind .rg-inp--grow {
  flex: 1 1 12rem;
  min-width: 8rem;
  max-width: none;
  width: auto;
}
.btn--nowrap {
  flex: 0 0 auto;
  white-space: nowrap;
}
.rg-bound-hint {
  margin-top: 6px;
  color: #4338ca;
  word-break: break-all;
}
.rg-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  max-width: none;
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
