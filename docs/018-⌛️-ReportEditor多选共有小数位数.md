# ReportEditor 多选：共有外观漏「小数位数」

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：先记录，未开工改代码。  
> **发现**：2026-07-14 · 用户现场。  
> **背景（已完成、不复开）**：多选 B1–B3 见历史 [docs/011-✅](011-✅-ReportEditor模版版式多选控件.md)；本条为新缺口，不在 011 续写。

---

# ⌛️ 未完成：多选共有外观未显示 `decimalPlaces`

## 现象

多选若干控件后，右侧「共有外观」可改边框、色、字号、对齐等，但**没有「小数位数（REAL）」**。  
用户判断：小数位数也是多控件可共享的共同属性，应在交集满足时显示并可批改。

## 根因（对照代码）

| 点 | 说明 |
|----|------|
| 批改清单 | [`selection-batch-props.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/selection-batch-props.ts) 的 `FIELD_ORDER` 仅 `showBorder` / `bgColor` / `color` / `fontSize` / `fontFamily` / `textAutoWrap` / `alignX`·`alignY` |
| 模型已有 | 控件级 `el.decimalPlaces`；单选在绑定为 opcua/sql/mongo 时由 [`ParameterBindingFields.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/ParameterBindingFields.vue) 展示 |
| 历史边界 | B3 曾把「绑定」整类划出永不批改；`decimalPlaces` 被连带排除，但它是**显示格式**而非绑定目标本身 |
| 表格路径 | 单元格 / SQL 填充的 `decimalPlaces` 属表格专项——**本条只谈控件级** |

## 拟修复（待拍板后开工）

1. `selection-batch-props` 增加 `decimalPlaces`：交集规则对齐单选（会展示小数位的类型，如 text / box / date / parameter）。  
2. `MultiElementBatchProps`：数字输入；混合时 placeholder「混合」；留空=不强制。  
3. 单测：两 text 可见；含 table/image 时按交集隐藏；混合写回。  
4. **不做**：表格单元格 / SQL 填充小数位批改；不放开绑定 NodeId/SQL 批改。

## 验收

- [ ] 多选 ≥2 且类型均支持时，共有外观出现「小数位数」  
- [ ] 值不一致 →「混合」→ 提交后全集统一  
- [ ] 含不支持类型 → 整项隐藏（交集）  
- [ ] 单选面板与既有共有外观字段不回归  

## 不做（本条登记）

- 本轮不改代码（仅看板）  
- 不回改 [docs/011](011-✅-ReportEditor模版版式多选控件.md) 已完成叙述  
