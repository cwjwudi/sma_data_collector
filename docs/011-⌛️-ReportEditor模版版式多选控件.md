# ReportEditor 模版 / 版式编辑器：多选控件

> 本文件为 **任务看板 / 实现计划**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **本轮仅写计划，未改代码。**  
> 相关：  
> - 模版：[`TemplateEditorWorkspace.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateEditorWorkspace.vue)、[`TemplateBodyCanvas.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateBodyCanvas.vue)  
> - 版式：[`LayoutPresetEditor.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/LayoutPresetEditor.vue)、[`LayoutPresetPaperCanvas.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/LayoutPresetPaperCanvas.vue)  
> - 渲染契约已有 `selectedIds`：[`layout-zone-render.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/layout-zone-render.ts)  
> - 单选查找：[`editor-selection.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/editor-selection.ts)（007 扩展页眉定位）

---

# ⌛️ 未完成：模版编辑器与版式编辑器支持多选控件

## 产品诉求（2026-07-13）

在**报表模版编辑**与**版式（页眉页脚）编辑**中，支持**一次选中多个控件**，便于批量移动、删除、复制等操作（具体批量能力见下方切片）。

## 现状（代码对照）

| 区域 | 选中模型 | 说明 |
|------|----------|------|
| 模版画布 | `selId: string \| null`（`v-model:selected-id`） | 点击即单选替换；属性面板绑 `sel` 单元素 |
| 版式画布 | `presetCanvasSelId` 同理 | 三带（页眉/正文/页脚）共用一个 id |
| 键盘 | Ctrl/Cmd+C/X/V、Delete 均依赖**单个** `sel` | 无 Shift/Cmd 加选 |
| DOM 导出渲染 | `RenderZoneOptions.selectedIds?: Set` | **已预留多选描边**，编辑画布 Vue 侧未接 |
| 健康跳转 focus | 设单个 `selId` | 多选落地后仍应兼容「主选中 + 集合」 |

模版页眉/页脚/装饰层目前多为只读预览选中（007）；多选范围需明确是否包含 zone 只读层。

## 目标体验（建议默认 · 待开工前确认）

### 选择交互

| 操作 | 行为（默认） |
|------|----------------|
| 单击控件 | 单选该控件（清空其余） |
| **Ctrl/Cmd + 单击** | 切换：已在集合则移除，否则加入 |
| **Shift + 单击** | 在「同层列表」内从锚点到目标做区间加选（模版：当前 sheet 的 body 页列表；版式：当前 zone 列表） |
| 空白处按下拖拽 | **框选（marquee）**：矩形与控件包围盒相交则选中；可选修饰键：无修饰=替换选中，Ctrl/Cmd=并入 |
| Esc / 点空白（非框选） | 清空多选 |
| 健康 `?focus=` | 设为单选该 id（集合仅含该 id） |

> Mac：Cmd；Windows/Linux：Ctrl。与系统多选惯例一致。

### 视觉

- 所有选中项显示选中描边（复用/扩展 `.sel` / `.selected`）。  
- **主选中（primary）**：多选时最后一个点中的（或属性面板当前编辑对象）可略强描边 / 手柄仅主选显示缩放柄（默认：**仅 primary 显示 resize 手柄**，避免多框手柄打架）。  
- 框选过程中显示半透明矩形。

### 批量操作（MVP 必做）

| 操作 | 多选行为 |
|------|----------|
| Delete / Backspace | 删除集合内全部（一次 undo） |
| 拖拽移动 | 整组平移同一 Δx/Δy（夹紧到内容区） |
| Ctrl/Cmd+C | 复制集合（剪贴板存数组） |
| Ctrl/Cmd+X | 剪切集合 |
| Ctrl/Cmd+V | 粘贴为新 id 组，并选中新组 |

### 批量操作（建议二期）

| 操作 | 说明 |
|------|------|
| 对齐 / 分布 | 左对齐、顶对齐、水平/垂直分布 |
| 统一字号/颜色/边框 | 属性面板「多选」态：只显示共有可批量字段 |
| 一键隐藏边框 | 已有「当前页非表格」；可扩展为「仅选中项」 |
| 跨 sheet 多选 | **默认不做**：选中仅限当前 sheet（模版）或当前版式三带内（版式允许跨 header/body/footer 需拍板） |

### 属性面板

- **单选**：现有 `TemplateElementProps` / `LayoutPresetElementProps`。  
- **多选**：右侧显示「已选 N 项」摘要；可编辑**交集字段**（如同时改 `showBorder`、颜色）；类型不一致的字段隐藏或禁用。  
- 默认：**不**在多选时打开表格单元格编辑 / 内联文本编辑（仅单选）。

## 数据模型建议

```ts
// 模版 / 版式共用思路
selectedIds: string[]          // 有序；末项 = primary
// 或
selectedIdSet: Set<string>
primaryId: string | null       // === selectedIds.at(-1)
```

兼容迁移：

- 保留 `selId` 计算属性 = `primaryId`，减少一次性改爆。  
- 画布 `defineModel` 逐步改为 `selectedIds`（数组）或增加并行 model。

剪贴板：扩展 [`editor-element-clipboard.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/editor-element-clipboard.ts) 支持多元素 payload（相对锚点坐标，粘贴时整体偏移）。

## 架构要点

```mermaid
flowchart LR
  Input[Click_Marquee_Keys]
  Sel[selectedIds_primary]
  Canvas[Body_or_Layout_Canvas]
  Props[Props_or_MultiSummary]
  Ops[Move_Delete_Clipboard]
  Input --> Sel
  Sel --> Canvas
  Sel --> Props
  Sel --> Ops
```

| 模块 | 改动 |
|------|------|
| `TemplateBodyCanvas` | 多选高亮；Ctrl/Cmd/Shift；marquee；拖拽整组 |
| `TemplateEditorWorkspace` | `selectedIds` 状态；del/copy/cut/paste/键盘；多选属性壳 |
| `LayoutPresetPaperCanvas` + Editor | 同上（三带） |
| `layout-zone-render` | 编辑预览若走 DOM 导出，接上已有 `selectedIds` |
| 纯函数 | `selection-set.ts`：toggle / range / marqueeHitTest / translateMany |

### 模版 zone 只读层（页眉等）

- **默认 MVP**：多选仅针对**可编辑画布控件**（body/cover/back 的 `TemplateElement`）；页眉 zone 仍单击定位（007），不参与框选批量删除。  
- 若产品要求页眉也可多选改绑：需版式编辑器侧完成，或明确「只读多选仅高亮」。

### 版式跨 zone

- **默认**：框选/加选可跨 header/body/footer（同一版式纸面）；删除/移动按各 zone 数组分别改。  
- 若易混：可改为「仅当前编辑带」——开工前确认。

## 测试计划（实现时先红后绿）

### A. 选择集合纯函数

| # | 用例 |
|---|------|
| A1 | toggle 加/减 |
| A2 | range 同列表区间 |
| A3 | marquee 与 AABB 相交 |
| A4 | primary = 末项；清空 |

### B. 模版画布（组件/集成）

| # | 用例 |
|---|------|
| B1 | Ctrl 点两个 → 双高亮 |
| B2 | 框选三个 → 集合长度 3 |
| B3 | Delete 一次去掉全部且可 undo |
| B4 | 拖拽组移动 Δ 一致 |
| B5 | focus 路由仍单选 |

### C. 版式画布

| # | 用例 |
|---|------|
| C1–C4 | 同 B，作用于 preset 三带 |

### D. 手工

| # | 步骤 |
|---|------|
| D1 | 模版正文多选移动/删除/复制粘贴 |
| D2 | 版式页眉+正文跨带（若启用） |
| D3 | 多选时属性面板不误改类型冲突字段 |
| D4 | 触控屏：至少单击单选不回归；框选可用鼠标优先 |

## 实现切片建议

1. **状态 + 高亮 + Ctrl 加选**（模版 + 版式）  
2. **框选 marquee**  
3. **组移动 / 组删除 / 多剪贴板**  
4. **多选属性摘要（可选同版或下一小版）**  
5. Shift 区间、对齐分布（二期）

## 开工前请确认（默认已选）

| 项 | 默认 |
|----|------|
| 加选键 | Ctrl/Cmd+点；Shift 区间；空白拖拽框选 |
| Resize 手柄 | 仅 primary |
| 模版 zone 页眉 | MVP **不参与**批量多选 |
| 版式跨带 | **允许**同一纸面跨 header/body/footer |
| 多选属性批量改 | MVP 可先只做摘要 + 删除/移动/复制；字段批改二期 |
| 触控多选 | MVP 不强制双指；鼠标/触控板优先 |

## 本轮范围

- ✅ 记录诉求与计划（本文档）  
- ⌛️ 确认默认项后开工
