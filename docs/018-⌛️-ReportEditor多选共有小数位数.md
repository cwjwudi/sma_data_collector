# ReportEditor 多选：共有属性漏显（小数位 / 空值显示等）

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：先记录，未开工改代码。  
> **发现**：2026-07-14 · 用户现场（先报小数位）+ 同日对照单选面板补全审计。  
> **背景（已完成、不复开）**：多选 B1–B3 见历史 [docs/011-✅](011-✅-ReportEditor模版版式多选控件.md)；本条为新缺口，不在 011 续写。

---

# ⌛️ 未完成：多选「共有」漏显审计（相对单选）

## 现象

多选后右侧「共有外观」只有 B3 首批字段；用户发现 **小数位数** 也是共同属性却不显示。  
同日对照单选属性 / `ParameterBindingFields`，把**同类漏显**一并列出。

## 对照基准

| 侧 | 入口 |
|----|------|
| 多选已有 | [`selection-batch-props.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/selection-batch-props.ts) `FIELD_ORDER` → [`MultiElementBatchProps.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/MultiElementBatchProps.vue) |
| 单选外观 | [`TemplateElementProps.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateElementProps.vue) / [`LayoutPresetElementProps.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/LayoutPresetElementProps.vue) |
| 单选绑定显示格式 | [`ParameterBindingFields.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/ParameterBindingFields.vue)（text / box / parameter；绑定为 opcua/sql/mongo 时） |

## 已在多选批改（B3 · 无缺口）

| 字段 | 说明 |
|------|------|
| `showBorder` | 预览/导出外框 |
| `bgColor` | 填充色（非 table） |
| `color` | 文字/描边色（模版 text/date/box；版式仅 box） |
| `fontSize` / `fontFamily` | 字号 / 字体 |
| `textAutoWrap` | 换行（text/box/date） |
| `alignX` / `alignY` | 对齐（非 image） |

## 漏显：建议纳入「共有」（与小数位同类）

| 字段 | 单选位置 | 适用类型（交集） | 为何算共同属性 |
|------|----------|------------------|----------------|
| **`decimalPlaces`** | ParameterBindingFields「小数位数（REAL）」 | text / box / parameter（有绑定面板的类型） | 显示格式，非绑定目标；多选改位数合理 |
| **`nullDisplayMode`** | 同上「空值显示」三段（空白 / 「空值」/ 默认文字） | 同上 | 与小数位同区；多选统一空值策略合理 |

> 二者当前都因 B3「绑定整类不批」被连带排除；**不等于**要把 NodeId / SQL 放进批改。

## 可选共有（同类型多选时才有交集）

| 字段 | 单选位置 | 说明 |
|------|----------|------|
| **`dateFormat`** | date 控件「日期时间格式」 | 仅当选中项**全是 date** 时共有；B3 曾刻意不做，但与「多选同类型批外观」不冲突 |

## 刻意不批（保持单选 / 非共有外观）

| 类别 | 字段示例 | 原因 |
|------|----------|------|
| 几何 | `x` `y` `w` `h` | B3：对齐/组拖另有入口 |
| 叠放 | `zIndex` | B3：避免误改层序 |
| 绑定目标 | `bindingKind` / `opcuaNodeId` / `sql*` / `mongoQuery` | 禁止空口改连接目标；须单选 |
| 内容文案 | `text`（除空值回退语义外） | 多选改同一段字风险高 |
| 图片专项 | `imageSrc` / `imageRotationDeg` / `imageCaptionPosition` | 非跨类型共有 |
| 签名 / 图表 / 页码 | `signerLabel` / `chartKind` / `pageNumberMode` 等 | 类型专有 |
| 表格一切 | 行列、单元格、`tableSqlFill`、格级 `decimalPlaces` | B3 禁止；本条不碰 |

## 拟修复（待拍板后开工）

1. **优先**：`decimalPlaces` + `nullDisplayMode` 进 `FIELD_ORDER`；`supportsBatchField` 对齐「单选会渲染 ParameterBindingFields 的类型」。  
2. UI：小数位数字框（留空=不强制 + 混合）；空值显示三段（混合无按下态）。  
3. **可选**：全为 date 时显示 `dateFormat` 预设/自定义。  
4. 单测：I/M 风格覆盖上述字段；含 table/image 时交集隐藏。  
5. **不做**：绑定目标、几何、表格格级小数位。

## 验收

- [ ] 多选 text/box/parameter（或会出绑定显示格式的类型）：可见小数位数 + 空值显示  
- [ ] 混合态与写回正确  
- [ ] 含不支持类型 → 整项隐藏  
- [ ] （若做）多选 date → 可见日期格式  
- [ ] 既有 B3 八字段与单选不回归  

## 不做（本条登记）

- 本轮不改代码（仅看板 + 审计）  
- 不回改 [docs/011](011-✅-ReportEditor模版版式多选控件.md) 已完成叙述  
