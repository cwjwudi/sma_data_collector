# ReportEditor 导出 PDF：整页纸张四周出现橙色边框

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 现象来源：用户反馈导出/预览中纸张带橙边；2026-07-13 截图确认。  
> 相关：PDF 导出链 `PdfExportView` → `TemplateExportPreviewStack` → `TemplateMiniPage` → `MiniPreviewChrome`。  
> **本轮订正现象与根因判断，未改代码。**  
>  
> **修订说明（2026-07-13）**：初版误写为「导出结果中，**表格附近**可见左侧 / 右侧 / 上侧橙色线，或带暖色的渐变边框感」。该句**已作废**。正确现象见下方「现场现象」——橙边在**整页纸张四周**，与表格无关。文件名已由 `…表格导出橙边框` 改为 `…导出纸张橙边框`。若编辑器仍打开旧路径，请关闭后打开本文件。

---

# ⌛️ 未完成：导出/预览整页纸张四周边框呈橙色（非表格装饰）

## 现场现象（2026-07-13 · 已用截图订正）

- **位置**：橙色线在**整张白纸（页面）的四周**——上、下、左、右外沿，贴着纸面与外侧深灰背景的交界。  
- **不是**表格附近的格线/裁切感；页内表格仍是正常灰/黑框，与橙边无关。  
- ~~（作废）导出结果中表格附近可见左/右/上侧橙色线或暖色渐变边框感。~~  
- 截图示例：报警数据报表第 1 页（含页眉表、SMA logo、标题与主表）；纸顶与纸底可见明显橙色细线，左右亦有同色描边。  
- 可能出现在**导出预览**或 **printToPDF** 成品；需与「仅编辑画布」区分。

## 导出链路（确认）

```text
Electron printToPDF（printBackground: true）
  → PdfExportView.vue
    → TemplateExportPreviewStack.vue
      → TemplateMiniPage.vue
        → MiniPreviewChrome.vue   ← 列表/缩略图用的页级装饰外壳
```

`TemplateBodyCanvas`（编辑画布）**不参与** PDF 光栅化。

## 根因判断（订正后 · 主因锁定）

**主因：`MiniPreviewChrome` 的页级装饰（outline / 强调边 / 渐变底）在导出与导出预览路径未被剥离，印在整页纸张外框上。**

与「表格」无关：迷你页对 table 强制 `border: none`，格线为锌灰，画不出整页四边橙框。

### 主因细节：`MiniPreviewChrome` + print 未清 chrome

`TemplateMiniPage` 始终包一层 `MiniPreviewChrome`（`show-tag=false`，角标关，但外壳样式仍在）。

封面变体（与「四边橙/琥珀」最吻合）：

```css
/* MiniPreviewChrome.vue */
.mpc--cover {
  background: linear-gradient(155deg, rgb(254 249 231) …);
  outline: 1px solid rgb(251 191 36 / 0.45); /* 琥珀 outline → 纸外四边 */
}
.mpc--cover :deep(.mpp-paper) {
  border-top-width: 3px;
  border-top-color: rgb(251 146 60); /* 顶边更亮的橙 */
}
```

另有通用纸框：

```css
.mpc :deep(.mpp-paper) {
  border: 1px solid #d4d4d8;
  box-shadow: 0 2px 8px …;
}
```

正文变体为**靛蓝**侧饰（非橙）；若截图像橙且四边均匀，优先核对该页是否走了 **`mpc--cover`（封面 sheet）**，或 outline 在打印时被渲成暖色。

`PdfExportView` 的 `@media print` **只**改了块级与 padding，**未清除** outline / 强调边色 / 渐变 / 阴影：

```css
.pdf-export-root .mpc,
.pdf-export-root .mpc-slot {
  display: block !important;
  padding: 0 !important;
}
```

`printBackground: true` → 上述装饰会进 PDF / 预览光栅。

| 页角色 | 上 | 左/右/下 | 与截图关系 |
|--------|----|----------|------------|
| 封面 `mpc--cover` | 3px 橙顶 + 琥珀 outline | outline 四边 | **高度吻合「整页四周橙边」** |
| 正文 `mpc--normal` | 细 outline | **左** 3px 靛蓝 | 偏蓝紫；若仍见橙需再查是否误用 cover 变体 |
| 末页 `mpc--back` | outline | 底紫强调 | 偏紫 |

### 已降级（对本截图不成立）

| 候选 | 原猜测 | 订正 |
|------|--------|------|
| 表格灰格线裁切缺底边 | 像「表的三边橙框」 | 橙边在**纸张外沿**，与表无关 → 不作本 bug 主因 |
| 单元格浅黄填充 | 暖色观感 | 不解释整页四周描边 |
| 编辑器选中 / SQL 截断黄条 | 琥珀提示 | 不在迷你导出 DOM |

## 建议核对（开工前可快速确认）

| # | 步骤 | 用途 |
|---|------|------|
| H1 | 该页在模版里是**封面 sheet** 还是正文？ | 封面 → 直接坐实 `mpc--cover` |
| H2 | 编辑器右侧「导出预览」是否已有同样四边橙线？ | 有 → 同链 chrome，不必先怪 printToPDF |
| H3 | 临时去掉 `MiniPreviewChrome` 或 print 里 `outline:none` + 中性 border 后橙边是否消失 | 验收主修复 |

## 拟改（确认后开工）

1. **导出 / 导出预览剥离列表装饰**（本 bug 唯一必要修复）  
   - `@media print` 与/或 `pdfExport` / `chrome="plain"` prop：  
     - `.mpc`：`outline: none`；背景透明（去掉封面奶油渐变）  
     - `.mpp-paper`：去掉 3px 橙顶 / 靛蓝左侧 / 紫底等角色强调边；可用均匀细灰边或无边；去掉 `box-shadow`  
   - 或导出路径根本不包 `MiniPreviewChrome`（模版管理缩略图仍用装饰版）。  
2. **验收**  
   - 封面 + 正文 + 末页：纸张四周**无橙/琥珀/角色色装饰边**。  
   - 缩略图列表仍可保留封面/正文色差（列表 UX 不变）。  
3. 表格底边裁切等属另案，不挂本看板。

## 本轮范围

- ✅ 初版排查候选  
- ✅ **订正**：现象=整页纸张四周橙边（截图）；主因锁定 `MiniPreviewChrome` 泄漏  
- ⌛️ 改 print/chrome 与单测（待开工）
