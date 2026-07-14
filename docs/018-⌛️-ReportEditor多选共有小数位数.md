# ReportEditor 多选：共有属性与绑定批改扩展

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：先记录，未开工改代码。  
> **发现 / 拍板**：2026-07-14 · 用户现场。  
> **背景（已完成、不复开）**：多选 B1–B3 见历史 [docs/011-✅](011-✅-ReportEditor模版版式多选控件.md)；本条**推翻 B3「绑定整类永不批改」**，另开新范围。

---

# ⌛️ 未完成：多选尽量展示共有项；已有绑定可统一改

## 产品诉求（用户原话要点 · 2026-07-14）

1. **很多字段都可以显示**——不必只限 B3 那一小撮「外观」。  
2. 选中项里**如果已经有绑定**，也要能在多选面板里**统一修改**（改 NodeId / 绑定方式 / 显示格式等）。  
3. 理由：现场大量控件的绑定动作是**重复劳动**，逐个点开单选太慢。

## 相对 B3 的政策变更

| 项 | B3（0.3.76） | 本条（新） |
|----|--------------|------------|
| 面板范围 | 仅「共有外观」八字段 | **能交集的尽量都出**（外观 + 显示格式 + 绑定） |
| 绑定目标 | 永不批改，必须单选 | **允许批改**：写回全集为同一值；混合态可统一覆盖 |
| 小数位 / 空值 | 未进批改 | **必须进** |

## 现状锚点

| 侧 | 入口 |
|----|------|
| 多选已有 | [`selection-batch-props.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/selection-batch-props.ts) → [`MultiElementBatchProps.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/MultiElementBatchProps.vue) |
| 单选对照 | `TemplateElementProps` / `LayoutPresetElementProps` / `ParameterBindingFields` |

## 拟展示分组（交集规则不变：每一项都支持才显示）

### A. 已有 · 外观（保持）

`showBorder` · `bgColor` · `color` · `fontSize` · `fontFamily` · `textAutoWrap` · `alignX` · `alignY`

### B. 显示格式（优先补）

| 字段 | 说明 |
|------|------|
| `decimalPlaces` | 小数位数（REAL） |
| `nullDisplayMode` | 空值：空白 / 「空值」 / 默认文字 |
| `dateFormat` | 仅全为 date 时 |

### C. 绑定（新开 · 重复劳动主战场）

| 字段 | 说明 |
|------|------|
| `bindingKind` | 无 / OPC UA /（parameter 等还可 SQL·Mongo，按类型交集） |
| `opcuaNodeId` | OPC 节点；混合显示「混合」，提交后全集同值 |
| （按能力）`sqlText` / 可视化 SQL 摘要 | 仅当选中项类型均支持 SQL 绑定时 |
| （按能力）`mongoQuery` 关键字段 | 仅当均支持 Mongo 时 |

**交互约定（拟）：**

1. 选中 ≥2 且类型能绑定时，面板出现「绑定」区（不必要求当前已全部非 none——**无绑定的也可一并设成同一绑定**，覆盖「批量挂同一点」场景）。  
2. 已有绑定但值不一致 → 「混合」；用户选定/粘贴新值 → **全部写为该值**（与外观混合态一致）。  
3. 改 `bindingKind` 时：可提示将清空不兼容字段（如切到 none 清 NodeId）；细则开工时定。  
4. **OPC 点选**：多选时允许一次点选 NodeId 写回全集（复用现有 picker，写 applyBatch）。  

### D. 仍建议不批（或二期）

| 类别 | 原因 |
|------|------|
| 几何 `x/y/w/h` | 已有对齐/组拖；批改易踩脚 |
| `zIndex` | 误改层序 |
| 图片源/旋转/配文、签名库、图表类型、页码模式 | 类型专有且少「批量同值」刚需；可二期按同类型再开 |
| **表格**（整表/单元格/SQL 填充） | 结构复杂；本条默认不做，另开看板 |
| 任意密码/密文 | 无此字段；保持不进聊天/批改 |

### E. 文案 `text`

- **空值回退文案**：可随 `nullDisplayMode=fallbackText` 批改（与单选一致）。  
- **普通标题文字**：默认可批（用户要「很多都可以显示」）；混合态 + 统一覆盖。若怕误伤，开工前可再确认是否默认折叠。

## 拟修复切片（建议版本）

1. **P0**：`decimalPlaces` + `nullDisplayMode` + 面板文案从「共有外观」改为「共有属性」（或分「外观 / 绑定」两区）。  
2. **P1**：`bindingKind` + `opcuaNodeId`（含混合、一次 picker 写全集）；opc-only 类型（text/box）先落地。  
3. **P2**：parameter 的 SQL/Mongo；`dateFormat`；文案 `text`。  
4. 单测扩 `selection-batch-props` + 组件测；模版/版式对称。  
5. 发版说明：明确「多选可统一改绑定，写回覆盖混合值」。

## 验收

- [ ] 多选可绑类型：可见绑定方式 +（OPC 时）节点 ID；混合可统一改  
- [ ] 一次改 NodeId → 全集相同；undo 可还原（现有 debounce 栈）  
- [ ] 小数位 / 空值显示可批  
- [ ] 含 table 等不支持类型 → 绑定区整区隐藏（交集）  
- [ ] 既有外观八字段不回归  
- [ ] 无密码/密文进入批改 UI  

## 不做（本条登记）

- 本轮不改代码（仅看板收口诉求）  
- 不回改 [docs/011](011-✅-ReportEditor模版版式多选控件.md) 已完成叙述  
- 不做表格多选批绑定（另开）  
