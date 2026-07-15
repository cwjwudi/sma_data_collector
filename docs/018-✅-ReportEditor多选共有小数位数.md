# ReportEditor 多选：共有属性与绑定批改扩展

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **落地版本**：**0.3.97** · [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.97.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)  
> **发现 / 拍板**：2026-07-14 · 用户现场。  
> **背景（已完成、不复开）**：多选 B1–B3 见历史 [docs/011-✅](011-✅-ReportEditor模版版式多选控件.md)；本条**推翻 B3「绑定整类永不批改」**。  
> **下一项**：导出纸张已于 **0.3.98** 合批完成，见 [docs/019-✅](019-✅-ReportEditor导出PDF纸张外框.md) · [docs/021-✅](021-✅-ReportEditor导出保留角色色粗边.md)。

---

# ✅ 已完成：多选尽量展示共有项；需要时才统一改绑定

## 产品诉求（用户原话要点 · 2026-07-14）

1. **很多字段都可以显示**——不必只限 B3 那一小撮「外观」。  
2. 选中项里**如果已经有绑定**，多选面板也要能看到，并在**需要时**统一修改（改 NodeId / 绑定方式 / 显示格式等）。  
3. 理由：现场大量控件的绑定动作是**重复劳动**，逐个点开单选太慢。  
4. **纠正（同日）**：不是「一多选就把已有绑定强制改成同一个值」。各控件原有绑定必须保持，直到用户**主动**提交批改。

## 硬性交互（必须遵守）

| 规则 | 说明 |
|------|------|
| **只读展示，默认不写** | 多选 / 切换选区 / 打开共有面板 → **不得**改写任何选中项字段 |
| **值不一致 →「混合」** | 绑定方式、NodeId、小数位等不一致时显示混合态，**各控件仍保留各自原值** |
| **仅用户操作才写回** | 点选分段、失焦提交、点选 OPC 节点并确认等**明确操作**后，才把该字段写成同一新值 |
| **可统一 ≠ 会统一** | 「允许统一改」是能力；「一选中就统一」是禁止行为 |

## 拍板（Q1–Q6 · 2026-07-14）

| # | 问题 | 结论 |
|---|------|------|
| **Q1** | 首版范围 | **C**：一次做到 P0+P1+P2（显示格式 + OPC 绑定 + SQL/Mongo + `dateFormat` + 文案 `text`） |
| **Q2** | 普通「文字」 | **B**：可批；混合不写，用户确认后才统一 |
| **Q3** | 改 `bindingKind` 副作用 | **A**：只改绑定方式；旧 NodeId/SQL 等**保留**（再开回 OPC 仍在） |
| **Q4** | 混合类型绑定区 | **B**：类型不完全一致（如 text + parameter）→ **整区隐藏绑定**，提示「请选同类型」；不靠残缺交集硬显 |
| **Q5** | 模版 vs 版式 | **是**：同一套规则 |
| **Q6** | 与 019 优先级 | **先 018**，导出相框后做 |

## 落地摘要（0.3.97）

| 侧 | 变更 |
|----|------|
| 逻辑 | [`selection-batch-props.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/selection-batch-props.ts) 扩展字段与交集；`canShowBindingSection` / Q3 不清空 |
| UI | [`MultiElementBatchProps.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/MultiElementBatchProps.vue)「共有属性」四区：外观 / 文案 / 显示格式 / 绑定；OPC picker 确认写全集 |
| 挂载 | 模版 `TemplateEditorWorkspace` · 版式 `LayoutPresetEditor`（既有挂载点） |
| 单测 | `selection-batch-props.test.ts` 14 项 |
| Mongo | `bindingKind=mongo` 可批；Mongo 查询详项仍单选 |

## 验收

- [x] 多选已有不同绑定时：面板显示混合，**各控件绑定值未变**  
- [x] 同类型可绑：可见绑定方式 + OPC 节点；用户确认后才统一改  
- [x] 改 bindingKind 为「无」后 NodeId 仍在（再开 OPC 可恢复）  
- [x] text + parameter 等多类型混选：绑定区隐藏并提示  
- [x] 小数位 / 空值 / dateFormat / text 可批（混合不自动写）  
- [x] 模版与版式行为一致  
- [x] 既有外观八字段不回归  
- [x] 无密码/密文进入批改 UI  

## 不做（本条登记 · 保持）

- 不回改 [docs/011](011-✅-ReportEditor模版版式多选控件.md) 已完成叙述  
- 不做表格多选批绑定（另开）  
- Mongo 详项批改（另开按需）  
- 几何 / zIndex / 图片源等（本条 D 表）  
