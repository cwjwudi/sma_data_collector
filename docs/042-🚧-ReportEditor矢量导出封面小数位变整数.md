# ReportEditor：矢量导出 · 封面配置两位小数只显示整数

> 本文件为 **缺陷看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-27 · 现场装包 **0.3.144**（与 `frontend/package.json` / Portal Setup 一致）。  
> **范围**：导出档 **1「矢量版式」**（`layout-v2`）；封面绑定参数 / 单元格。  
> **关联**：[018](018-✅-ReportEditor多选共有小数位数.md) · [036](036-✅-ReportEditor矢量档与预览稳样式对照.md)。

---

# 🚧 进行中：现象与根因排查

## 现象

- 封面控件（参数或表单元格）属性配置了 **小数位数 = 2**。  
- 预览 / 档 2 可见 `12.30` 一类格式（待现场确认）。  
- **档 1 矢量导出** 只显示整数（如 `12`），无小数位。

## 代码根因（本机已核对 · 高置信）

Mini / Chromium 参数文案走 `resolveBoundParameterPreviewText` → **`applyDecimalPlacesToDisplayText(..., el.decimalPlaces)`**（`TemplateMiniPage.vue`）。

矢量 `pdf-lib-layout-v2-render.ts` 取数后直接：

```ts
const bound = cellText(values[ck]);
// zone / 正文 parameter·text：
text = bound;                    // 或 bound || el.text
// 未调用 applyDecimalPlacesToDisplayText
// 未读取 el.decimalPlaces
```

`cellText` 只取 `previewValues[key].text` 原始串。若上游 OPC/SQL 已是整数字符串 `"12"`，或虽有 `"12.3"` 但未按控件 `decimalPlaces` 再格式化，则 PDF 不会出现两位小数。

静态表单元格同样：`bound || grid text`，**无** `cell.decimalPlaces` 应用（Mini 用 `resolveStaticTableCellDisplayText` 会应用）。

相关已有单测：`parameter-null-display.test.ts` / `binding-preview-utils` 的小数位逻辑在 **预览工具函数**；**layout-v2 未接入**，故矢量路径无回归保护。

## 本机复现（逻辑级 · 已对照）

| 路径 | `decimalPlaces=2` + 预览 text=`"12.345"` |
|------|------------------------------------------|
| Mini | `applyDecimalPlacesToDisplayText` → `"12.35"` |
| layout-v2 现状 | 直接画 `"12.345"` 或上游已截成 `"12"` → **不保证两位** |

建议补失败单测（修复前应红）：封面 zone/正文 parameter，`previewValues` 给 `"12"`，`decimalPlaces: 2`，抽 PDF 文本须含 `12.00`。

## 建议修复方向

1. 在 layout-v2 的 zone / 正文 `parameter`、`text`（带绑定）、静态表 cell、必要时 SQL fill 标量路径，统一改为调用：  
   - `resolveBoundParameterPreviewText`（参数），或  
   - `applyDecimalPlacesToDisplayText(bound, el.decimalPlaces)`（已有 bound 时）。  
2. 与 Mini 同一套 `nullDisplayMode` + `decimalPlaces`（一并消掉 [043](043-🚧-ReportEditor矢量导出空值显示value.md)）。  
3. 单测：整数串补零、已有小数四舍五入、非数字/日期不改写（遵循 `applyDecimalPlacesToDisplayText` 现语义）。

## 需要补充的信息

| # | 请提供 |
|---|--------|
| 1 | 准确版本号；问题 PDF（档 1）+ 同戳档 2 |
| 2 | 控件类型：封面正文 parameter / zone 表单元格 / SQL 填充？ |
| 3 | 该控件 JSON：`decimalPlaces`、`bindingKind`、绑定 SQL/NodeId |
| 4 | 预览里显示的字符串原文（是否已是 `12.00`） |
| 5 | 上游实值：整数、浮点还是字符串？OPC 质量是否 Good |

---

# ⌛️ 未完成：接入小数位格式化并验收

- [ ] layout-v2 复用预览格式化  
- [ ] 单测锁 `12` + `decimalPlaces:2` → `12.00`  
- [ ] 封面冒烟模板含小数位参数，五档对照  
