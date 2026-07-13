# ReportEditor 表格/PDF 导出出现橙色或渐变边框

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 现象来源：用户反馈——**表格导出**时左右上侧可见橙色线或渐变边框。  
> 相关：PDF 导出链 `PdfExportView` → `TemplateExportPreviewStack` → `TemplateMiniPage` → `MiniPreviewChrome`；表格系统总览见 [docs/002](002-🚧-表格系统评估与修复.md)。  
> **本轮仅记录排查结论，未改代码。**

---

# ⌛️ 未完成：导出 PDF 带上/左/右暖色（橙）线或渐变框

## 现场现象（2026-07-13）

- 导出（或结批 PDF）结果中，**表格附近**可见 **左侧 / 右侧 / 上侧** 橙色线，或带暖色的渐变边框感。  
- 需与「仅编辑器画布可见」区分：后者可能是 SQL 截断提示，**不会**进 PDF。

## 导出链路（确认）

```text
Electron printToPDF（printBackground: true）
  → PdfExportView.vue
    → TemplateExportPreviewStack.vue
      → TemplateMiniPage.vue
        → MiniPreviewChrome.vue   ← 列表/缩略图装饰外壳
```

`TemplateBodyCanvas`（编辑画布）**不参与** PDF 光栅化。

## 原因分析（代码对照 · 文档阶段）

代码里**没有**「给表格控件单独画橙色 L/R/T 边」的导出逻辑；表格外框在迷你页强制 `border: none`，格线为锌灰 `rgb(212 212 216)`。  
更可能是 **页级预览装饰泄漏进 PDF**，或 **灰格线三边可见 + 暖底** 被看成橙框。

### 候选 1（最可疑 · 导出路径）：`MiniPreviewChrome` 装饰未被 `@media print` 剥离

`TemplateMiniPage` 始终包一层 `MiniPreviewChrome`（`show-tag=false`，角标关闭，但外壳样式仍在）。

封面变体（暖奶油渐变 + 琥珀描边 + 纸顶橙粗线）：

```css
/* MiniPreviewChrome.vue */
.mpc--cover {
  background: linear-gradient(155deg, rgb(254 249 231) …);
  outline: 1px solid rgb(251 191 36 / 0.45); /* 琥珀，四边 */
}
.mpc--cover :deep(.mpp-paper) {
  border-top-width: 3px;
  border-top-color: rgb(251 146 60); /* 橙，上侧强调 */
}
```

正文变体（易被误认为「侧边装饰」）：

```css
.mpc--normal {
  background: linear-gradient(180deg, rgb(238 242 255) …);
  outline: 1px solid rgb(129 140 248 / 0.35); /* 靛蓝系 */
}
.mpc--normal :deep(.mpp-paper) {
  border-left-width: 3px;
  border-left-color: rgb(99 102 241); /* 左侧重色，非橙 */
}
```

`PdfExportView` 打印样式**只**改了块级与 padding，**未清除**渐变 / outline / 纸张强调边 / 阴影：

```css
.pdf-export-root .mpc,
.pdf-export-root .mpc-slot {
  display: block !important;
  padding: 0 !important;
}
```

Electron `printToPDF` 开启 `printBackground: true` → 上述背景与描边**会印进 PDF**。  
表格若贴近页边，页级 outline / 顶边橙线 / 暖渐变极易被描述成「围着表格的橙线或渐变边」。

| 页角色 | 上 | 左/右 | 观感 |
|--------|----|-------|------|
| 封面 `mpc--cover` | 3px 橙顶边 + 琥珀 outline | outline 四边 | **最像「橙/渐变框」** |
| 正文 `mpc--normal` | outline 细 | **左** 3px 靛蓝 + outline | 偏蓝紫，若用户说「橙」需核对是否封面或色偏 |
| 末页 `mpc--back` | outline | outline；**底** 紫强调 | 偏紫 |

### 候选 2（导出路径 · 次要）：表格灰格线 + 高度裁切 → 只剩上/左/右

`TemplateMiniPage` 单元格边为灰；末行才补底边。外层 `.mini-body-inner { overflow: hidden }`，SQL 续页切片又固定外框高度时，**底边常被裁掉**，只剩三边「框」。  
注释已承认过类似问题（`.mini-tpl-table-wrap` 的 `padding-bottom: 1px`）。  
灰线叠在暖奶油底或浅黄单元格色（如 `#fde68a`）上，打印后可看成暖色/琥珀色细线——**颜色本源仍是灰格线 + 底色，不是橙边框样式**。

### 候选 3（数据驱动）：单元格/列填充为浅黄琥珀

`TableCellFillPicker` 等提供 `#fde68a` 等暖色；会进导出背景。需对照具体模版 JSON。

### 可排除 / 易混淆

| 项 | 结论 |
|----|------|
| 表格 `showBorder` | 导出迷你页对 table **强制无外框**；属性面板表格也不开边框开关 |
| 编辑器选中描边 `.el-node.sel` | 靛蓝；仅 `TemplateBodyCanvas`，**不进 PDF** |
| SQL 截断/溢出提示行 | 琥珀黄边（`#713f12` / `rgb(234 179 8)`）；**仅编辑画布**，迷你页无对应 DOM |
| SQL 续页分隔 hint | 导出可有，但是**下方**灰虚线横幅，不是围表橙边 |

## 建议核对（开工前 / 手工）

| # | 步骤 | 用途 |
|---|------|------|
| H1 | 问题出在**封面页**还是**正文页** PDF？ | 封面 → 强指向候选 1 的 `mpc--cover` |
| H2 | 导出预览（编辑器右侧叠页）是否已有同样橙边？ | 有 → 同链 `MiniPreviewChrome`；仅最终 PDF 有 → 再查 print 与光栅 |
| H3 | 去掉封面后是否仍见「橙」？ | 若消失，锁定封面 chrome |
| H4 | 表是否贴页边 / 是否 SQL 续表切片？ | 贴边 + 缺底边 → 候选 1+2 叠加 |
| H5 | 单元格是否设了浅黄填充？ | 候选 3 |

## 拟改（确认后开工 · 建议）

1. **PDF / 导出预览剥离列表装饰**（优先）  
   - `@media print`（及可选 `pdfExport` prop）下：`.mpc` 背景透明、`outline: none`；`.mpp-paper` 恢复均匀 1px 中性边或无强调色，去掉 `box-shadow`。  
   - 或导出路径改用不带 chrome 的纸张根节点（列表缩略图仍用 `MiniPreviewChrome`）。  
2. **表格底边裁切**（若 H4 复现）  
   - 继续收紧切片外高 / overflow，保证末行 `border-bottom` 不被吃。  
3. **验收**  
   - 封面+正文+SQL 续表 PDF：无琥珀 outline、无 3px 橙顶装饰、无靛蓝 3px 侧饰；表格仅中性格线。  
   - 模版管理缩略图仍可保留封面/正文色差（列表 UX 不变）。

## 本轮范围

- ✅ 记录现象与根因候选（本文档）  
- ⌛️ 按核对表确认主因后改 print/chrome 与单测（待开工）
