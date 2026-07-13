# ReportEditor 控件默认无边框

> 产品计划：[`009_版本Plan/0.3.61.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.61.md)（原拟 0.3.60；0.3.60 改挂 AI 探活生效）。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **本轮仅文档**：确认范围与规则后再改 CSS / 发版。

---

# ⌛️ 未完成：统一交互控件默认无边框

## 目标

报表编辑器 AI 版中，**交互控件的默认态不再画实线边框**（更轻、少「框框感」），与渐变主区/浅色面板更协调。

## 判定规则（先看这条）

| 类型 | 是否改掉默认灰边 |
|------|------------------|
| 可输入/可点的表单控件、次要按钮、未选中 Tab | **要改** |
| 布局分区容器、对话框外壳、表格网格、画布选中框 | **不改** |
| 错误/警告描边、`:focus-visible` 焦点环 | **不改**（状态/无障碍） |
| 选中态 Tab / Primary 按钮 | 默认无灰边；辨识靠**底色/字色**（Primary 默认：无边 + 实心底） |

典型默认灰边色：`#d1d5db`、`#d4d4d8`、`rgb(212 212 216)` 等挂在 input/button 上的 `border: 1px solid …`。

---

## 要改：控件清单（按实现优先级）

### P0 · 共用 CSS（一次覆盖设置页 + 数据源大半）

| 文件 | 选择器 | 控件 |
|------|--------|------|
| `frontend/src/features/settings/settings-sections.css` | `.settings-input` | 文本 / 数字 / 日期输入 |
| 同上 | `.settings-select` | 下拉 |
| 同上 | `.settings-btn`（含 `--muted` / `--file` / `--block`） | 次要按钮 |
| 同上 | `.settings-btn--primary` / `--danger` | 主按钮 / 危险按钮（去灰边，靠底色或字色） |
| `frontend/src/features/datasource/connection-form-pane.css` | `.conn-form-pane .input`、`select.input` | DB/OPC 连接表单输入与下拉 |
| `frontend/src/features/datasource/datasource-ui.css` | `.ds-scope .btn`（含 `.sm` `.xs` `.ghost` `.danger`） | 工作台按钮 |
| 同上 | `.ds-scope .seg-tabs button`、`.btn.seg`（**未选中**） | 分段控件 |
| 同上 | `.ds-scope .opc-browse-search-inp` | OPC 浏览搜索框 |
| `frontend/src/features/datasource/connection-tabs.css` | `.tabs-conn .tab`、`.tab-new`（**未选中**） | 连接 Tab / 「新建」Tab |

> 设置页各 Section（AI、审计、数据路径、服务地址、证书、导入导出等）只要用了 `.settings-*`，**随 P0 一并生效**，不必逐组件改类名。

### P1 · 高频主流程页（局部 scoped 样式）

| 页面 / 组件 | 类名（要去默认边） | 控件说明 |
|-------------|-------------------|----------|
| `DataSourceConfig.vue` | `.tabs-top button` | DB / OPC 顶栏 Tab（未选中） |
| `QueryEditor.vue` | `.ta` | SQL 编辑 textarea |
| `ObjectTree.vue` | `.ot-filter` | 架构过滤输入 |
| `QuickQueryPanel.vue` | `.qq-card-btn` | 快捷查询按钮 |
| `SmartPivotPanel.vue` | `.sp-select`、`.sp-input`、`.sp-input-dt` | 透视筛选控件 |
| `VisualQueryBuilder.vue` | `.input` | JOIN 等字段输入 |
| `AiDrawer.vue` | `.ai-drawer__input`、`.ai-drawer__btn--muted`、`.ai-drawer__btn--primary` | AI 输入框与按钮 |
| `AiPendingPromptDialog.vue` | `.ai-pending-input`、`.ai-pending-btn` | pending 弹框内表单 |
| `ReportGenerator.vue` | `.rg-inp`、`.rg-select`、`.btn`、`.btn--ghost`、`.rg-seg-btn`（未选中） | 生成报表筛选项 / 按钮 / 导出模式分段 |
| `TemplateManager.vue` | `.b`、`.tm-pager-inp`、`.micro-preset`、`.tm-dup-inp`、`.lnk`、`.btn-rename`、`.skel-retry`、`.tpl-name-input` | 模版管理按钮、分页、复制/重命名输入 |
| `ReportHistory.vue` | 筛选用 input / 按钮类 | 历史报表筛选 |

### P2 · 模版 / 版式编辑器内

| 页面 / 组件 | 类名（要去默认边） | 控件说明 |
|-------------|-------------------|----------|
| `TemplateEditorWorkspace.vue` | `.inp`、`.b`、`.btn`、`.btn-mini`、`.bar-name-inp`、`.preset-ddl`、`.sheet-tab`（未选中） | 顶栏、属性侧、分页 Tab |
| `TemplateElementProps.vue` / `LayoutPresetElementProps.vue` | `.lpep-dim-stepper` 外框 | 尺寸步进器外壳（内部 `.lpep-dim-val` 已无边可保持） |
| `SuggestCombobox.vue` | `.scb-inp`、`.scb-toggle` | 建议下拉组合 |
| `TemplateTableSqlVisualPanel.vue` 等 | `.tbl-sql-text-inp` 等 SQL/绑定输入 | 表格 SQL 可视化面板 |
| `ScalarSqlQueryBuilder.vue` 等 | 同类 `.inp` / 按钮 | 标量 SQL 构建 |
| `TemplateBodyCanvas.vue` | `.cv-table-cell-edit`、`.cv-table-cell-ddl` | **单元格内嵌**编辑控件（不是画布选中框） |
| `NewTemplateWizardDialog.vue` | `.nt-input`、`.nt-tab`（未选中） | 新建模版向导 |
| `OpcUaNodePickerModal.vue` | `.opc-pick-select`、`.opc-pick-search-inp`、`.opc-pick-btn` | OPC 节点选择弹层内控件 |
| `LayoutPresets.vue` / `LayoutPresetEditor.vue` | `.lp-dup-inp`、筛选控件 | 版式库筛选 / 复制 |

### P3 · 其它页面与对话框扫尾

| 页面 / 组件 | 类名（要去默认边） | 控件说明 |
|-------------|-------------------|----------|
| `AppUpdateSection.vue` / `LayoutCloudSyncSection.vue` | `.update-input`、`.settings-btn--secondary` | 更新/云同步局部重复灰边 |
| `AppConfirmDialog.vue` | `.app-confirm-btn` | 确认框按钮（**外框** `.app-confirm` 不改） |
| `SetupWizard.vue` / `WizardDatabaseSimple.vue` | `.inp`、`.btn`、`.wiz-steps li` | 向导输入、按钮、步骤 pill |
| `DashboardAssetHealth.vue` / `DashboardConnectionHealth.vue` | `.dash-asset-refresh`、`.dash-health-detail-btn`、`.dash-asset-ignore` | 仪表盘操作按钮 |
| `SignaturesLibrary.vue` | `.name-inp`、工具栏按钮 | 签名库 |

实现扫尾时再 grep：`#d1d5db`、`#d4d4d8`、`border: 1px solid` 挂在 input/button 上的残留。

### 边界控件（要改外观，但规则单独定）

| 控件 | 位置 | 说明 |
|------|------|------|
| `.rg-switch` | `ReportGenerator.vue` | 开关轨道现用灰边勾勒；去边后靠底色/阴影区分开/关 |
| `.ds-lock-track` / `.ds-lock-thumb` | `DatasourceLockToggle.vue` | 滑动锁；不是普通按钮，去边后须仍能辨认锁定态 |
| `.lpep-dim-stepper`、`.scb-inp`+`.scb-toggle` | 属性面板 / SuggestCombobox | 组合控件：去掉默认灰边，但保持「一整块」一体感 |

---

## 不改：明确排除

| 类别 | 典型选择器 / 位置 | 原因 |
|------|-------------------|------|
| 区块 / 面板容器 | `.settings-section`、`.conn-form-pane`、`.ds-side-pane`、`.rg-card`、`.rg-tab-panel`、`.card`、`.tbl-panel`、`.dash-card`、`.qq-card` | 布局分区，不是表单控件 |
| 对话框外壳 | `.app-confirm`、`.ai-pending-dialog`、`.tm-dup-modal`、`.nt-wizard`、`.opc-pick-*-modal` 外框 | 结构边界 |
| 画布选中 / 缩放柄 | `TemplateBodyCanvas` / `LayoutPresetPaperCanvas` 选中框、`.hz` resize、元素 runtime border | 编辑语义 |
| 表格网格线 | `.audit-table`、`.rg-trigger-log-table`、模版表格网格、DataGrid 单元格线 | 数据阅读结构 |
| 空态 / 示意图 | `.conn-placeholder` dashed、`.er-diagram`、`.row3-ph` | 非交互控件 |
| 警告 / 错误 / 信息条 | `.demo-conn-hint`、`.rg-banner--warn`、`*--warn`、`.msg-retry`、红/黄校验边 | 状态反馈依赖描边 |
| 焦点环 | `:focus-visible` outline、`.settings-input:focus` 的 box-shadow 等价物 | 无障碍必须保留 |
| 选中态强调 | `.tabs-conn .tab.on`、`.seg-tabs button.on`、`.ot-row.active` | 选中语义可保留有色边或底色 |
| 徽章 / 指示灯 | `.kind-pill`、`.sev--*`、`.conn-led` | 非输入控件 |
| 已无边 | `.settings-switch`、`.rg-tab`、`.lpep-dim-val` 等 | 保持即可 |

> 若产品希望「面板容器也无边框」，另开 H1，**不在本条默认范围**。

---

## 视觉规则（拟）

1. **默认态**：`border: none`（或 `1px solid transparent` 稳住尺寸，避免 focus 时跳动）。
2. **悬停（可选）**：浅底或极淡边，不强制恢复粗灰框。
3. **焦点**：`:focus-visible` 用 outline / 等价环；**禁止**只靠默认灰边表达可聚焦。
4. **选中 / 激活**（`.tab.on`、`.btn.primary`）：底色/字色区分；若留边仅限选中态。
5. **禁用**：降透明度即可。
6. **危险按钮**（`.btn.danger`）：优先无边 + 字色/浅红底；实现时二选一写死一种。

## 实现策略（确认后开工）

1. 抽全局控件 token（`style.css` 或新建 `controls.css`）：`--ctrl-border`、`--ctrl-focus-ring`。
2. **先改 P0 四个共用 CSS**，再按 P1→P3 扫局部。
3. 契约测试：断言 P0 中默认 `.input` / `.settings-input` / `.btn` 不含实线 `#d1d5db`/`#d4d4d8` border。
4. bump **0.3.61**，目视数据源 + 设置 + AI 抽屉 + 生成报表。

## 验收

1. P0/P1 清单中的 input/button/未选中 Tab：**静置无可见灰边**。
2. 选中 Tab / Primary 仍可辨；键盘焦点环清晰。
3. 「不改」表中的容器、画布、表格、错误条外观与今日一致（或仅随全局 token 微调，不得误删网格/选中框）。
4. 契约测试绿；Mac 目视抽查。

## 待你拍板（写进实现前）

- [ ] 面板容器（`.conn-form-pane` / `.settings-section`）是否也去边？**文档默认：不去。**
- [ ] Primary 按钮是否完全无边只靠底色？**文档默认：无边 + 实心底。**
- [ ] 滑动锁 / 开关轨道（边界控件）是否本版一并改？**文档默认：本版改，规则见「边界控件」。**

---

# ⌛️ 未完成：实现、测试与发版 0.3.61

- 按上表 P0→P3 改 CSS；契约测试；bump、Mac 包、`latest.json` / `007` / `todo.md`；看板收尾 ✅。
