# ReportEditor 导出 PDF：纸张外仍像「相框」

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：先记录 + 代码对照排查，**未开工改代码**。  
> **发现**：2026-07-14 · 用户现场。  
> **产品期望（修订）**：配置多大纸张，就导出多大纸张；去掉**白衬边 / 欠缩放**造成的「相框」感。  
> **政策（2026-07-14）**：**橙色 / 蓝紫色粗色边要保留**——见 [docs/021](021-⌛️-ReportEditor导出保留角色色粗边.md)；**不再**以「导出去掉角色色」为本条目标（009 的剥离政策已反转）。  
> **合批（2026-07-14）**：与 [021](021-⌛️-ReportEditor导出保留角色色粗边.md) **同一版本一起实施**（先 1:1 铺满，再恢复角色色，避免白衬+色边双框）；共用测试表见下方「合批测试用例」。  
> **背景**：0.3.67 曾剥离导出角色色（[docs/009-✅](009-✅-ReportEditor导出纸张橙边框.md)）；其后仍见外框感，本条专治**内容缩小留白**。  
> **排队**：与 021 合批优先于 020 / 022（除非用户改口）。  
> **排查**：2026-07-14 · 对照导出链源码（见下「排查记录」）。

---

# ⌛️ 未完成：导出 PDF 仍有纸张外「相框」感

## 现象（用户原话要点）

1. 历史版本已去掉橙色、蓝紫色、渐变等角色色。  
2. **仍然**能看到一层边框 / 像相框的东西。  
3. 期望：纸张规格 = PDF 页面规格，内容铺满纸面，不要外边再套一圈框。

## 导出链（对照）

`PdfExportView` → `TemplateExportPreviewStack`（`pdfExportOmitCaptions` → `plainChrome`）→ `TemplateMiniPage` → `MiniPreviewChrome plain` → Electron `printToPDF`。

相关文件：

| 文件 | 作用 |
|------|------|
| [`MiniPreviewChrome.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/MiniPreviewChrome.vue) | 列表装饰；`mpc--plain` 清 outline / 角色色边 / 纸阴影 |
| [`PdfExportView.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/PdfExportView.vue) | `@page { size: Wmm Hmm; margin: 0 }` + 打印 CSS 再清 `.mpc` / `.mpp-paper` 边框；**主动压矮** `pdfMiniMaxHeightPx` |
| [`TemplateExportPreviewStack.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateExportPreviewStack.vue) | 导出省略 caption 时传 `plain-chrome`；屏幕态 `.tep-card` 仍有 padding（打印 CSS 已清 0） |
| [`mini-preview-scale.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/mini-preview-scale.ts) | 等比缩放；**固定扣** `W_INSET=14` / `H_INSET=10`（本为列表 chrome 预留） |
| [`TemplateMiniPage.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateMiniPage.vue) | 纸面 `pageW×pageH`；`scaledSize` 高度 **+3px**；`transform-origin: top left` |
| [`electron/main.cjs`](../_Prj/SD_SMA_ReportEditor/frontend/electron/main.cjs) | `printToPDF({ marginsType: 1 /* none */, preferCSSPageSize: true, printBackground: true })` |

---

## 排查记录（2026-07-14 · 源码对照）

### 角色色粗边（政策已变 · 见 021）

0.3.67 起导出路径用 `plain` + 打印 CSS **清掉**了封面橙 / 正文靛蓝 / 末页紫。  
**2026-07-14 用户要求保留这些粗色边** → 恢复工作记在 [docs/021](021-⌛️-ReportEditor导出保留角色色粗边.md)；**本条 019 不负责去色，也不把「无角色色」当作验收。**

### 主因（高置信）：内容被故意缩小，@page 内留白像「衬边/相框」

导出为避免「单卡拆成两页 PDF（第二页近空白）」，`PdfExportView` 把迷你页 **max-height 压矮**：

```ts
// PdfExportView.vue
const slackPx = 28; /* TemplateMiniPage scaledSize +3 与取整；caption 已在 PDF 省略 */
return Math.max(200, heightPx - slackPx);
```

同时 `miniPreviewScale` **无论是否 plain**，都从可用宽高里再扣列表装饰预留：

```ts
// mini-preview-scale.ts
const sx = (maxWidthPx - 14) / contentW;
const sy = (maxHeightPx - 10) / contentH;
return Math.min(sx, sy, 1);
```

纸面再用 `transform: scale(s)` + `transform-origin: top left` 画在白底 `@page` 上。

**A4 竖向数值（96dpi CSS px）：**

| 量 | 值 |
|----|-----|
| 纸面 `pageW×pageH` | 794 × 1123 |
| `@page` | 210×297 mm（与预设一致） |
| `pdfMiniMaxHeightPx` | 1123 − 28 = **1095** |
| 再扣 inset 后 scale | ≈ **0.966**（缩小约 **3.4%**） |
| 缩放后内容约 | 768 × 1088（含 `+3` 高） |
| **右侧白边约** | **26 px** |
| **底部白边约** | **35 px** |

结论：PDF 页尺寸仍是配置纸张，但**绘制内容小于纸面**，右下侧（及因 top-left 对齐导致的右、下）留白，肉眼像「白相框 / 衬边」。这与「角色色已去、仍像相框」高度吻合。

注释写明压矮动机：防止 Chromium 把略超高的卡拆成两页。当前代价是**系统性欠缩放**。

### 次因 / 鉴别（需对照成品目视）

| # | 项 | 说明 | 与「相框」关系 |
|---|------|------|----------------|
| **A** | 控件 `showBorder` | 迷你页对 text/box/…：`showBorder!==false` 时画 `1px` 控件外框；旧稿缺字段 hydrate 仍默认 `true`（[docs/005](005-✅-ReportEditor控件默认无边框.md)） | 若线贴在**控件**四周而非整页纸缘 → 模版内容边框，不是纸张 chrome |
| **B′** | `scaledSize` **+3px** 高 | 防分数像素裁切；与 slack 叠加，加剧「为防裁切而多留空」 | 次级；主因仍是 slack+inset |
| **C** | 列表灰边 `.mpp-paper { border:1px #d4d4d8 }` | plain + 打印 CSS 已 `border:none !important` | **打印路径已清**；仅当未走 PdfExportView / 未开 omitCaptions 才复发 |
| **D** | `.tep-card` 屏幕 padding | 打印已 `padding:0` | **打印路径已清** |
| **E** | 角色色粗边 | 用户要**保留**（021） | **非本条清除对象** |
| **F** | 表格单元格线 | 表内 `border` 灰线属表格设计 | 勿与纸张外框混谈 |

### 鉴别问句（修前建议用户确认一眼）

成品上的「相框」更像：

1. **整页四周（尤其右、下）一圈白边 / 内容偏小不铺满** → 对齐本条主因（欠缩放）  
2. **某个文本块/色块自己的细线** → A（`showBorder`）  
3. **橙/蓝紫粗色边** → **要保留**（021），不是 019 要删的东西  

---

## 拟修复方向（与 021 合批 · 仍不改代码直至开工）

**建议同一发版（如 0.3.98）一次合入，顺序：**

1. **019 · 导出 1:1**：导出路径 `miniPreviewScale` 不扣列表 inset（或 `inset=0` 专用入口）；`pdfMiniMaxHeightPx` 取消 −28（至多 ≤3 取整）；导出取消无谓 `scaledSize +3`（列表缩略可保留）。  
2. **019 · 防拆页**：scale=1 后复测单卡两页空白；用打印 CSS / 卡片高度对齐 `@page`，禁止再靠缩小内容留 slack。  
3. **021 · 恢复角色色**：`omitCaptions` ≠ `plain`；打印 CSS 停止抹 `.mpc` outline / 角色色纸边；列表缩略与画布行为不变。  
4. **合批目视**：色边贴纸缘，内侧无系统性白衬。  
5. **不做**：多选/绑定；不把「无橙边」写回验收。

## 验收（开工后 · 与 021 共用）

- [ ] A4 等纸张：内容铺满，无系统性右/下白衬边  
- [ ] 无「内容页后多一页空白」回归  
- [ ] 封面橙 / 正文蓝紫 / 末页紫粗边可见（021）  
- [ ] 编辑画布无该装饰；列表缩略色差仍在  
- [ ] 控件 `showBorder` 仍可单独显隐  
- [ ] 下方合批测试用例全绿  

## 合批测试用例（019 + 021 · 开工时落地）

> 单元 / 契约测优先自动化；目视项打包或手测勾选。

### U · 单元 / 契约（Vitest）

| ID | 断言 | 落点建议 |
|----|------|----------|
| **U1** | 导出用缩放：`maxW/maxH` 等于纸面 CSS px 时 **scale === 1**（不扣 14/10） | 扩 `mini-preview-scale.ts` 或新增 `miniPreviewScaleForExport` + `.test.ts` |
| **U2** | 列表缩略仍扣 inset：`scale < 1` 当 max 仅略大于内容 | 同文件回归，避免列表格子撑破 |
| **U3** | A4 数值：`heightPx - 28` 路径不再作为导出 maxH（源码契约：`PdfExportView` 无 `slackPx = 28` 或等价注释保留但未减） | 读 `PdfExportView.vue` 契约测 |
| **U4** | 导出 `scaledSize` 高 **无 +3**（或仅非导出路径有 +3） | 读 `TemplateMiniPage.vue` / 导出 prop 契约 |
| **U5** | `pdfExportOmitCaptions === true` 时 **不**再强制 `:plain-chrome="true"`；plain 与 omit 解耦 | 改写现有 `pdf-export-plain-chrome.test.ts`（009 旧断言作废） |
| **U6** | 导出栈：仍省略 `tep-cap`；`plainChrome` 为 false 或未传 | `TemplateExportPreviewStack.vue` |
| **U7** | 打印 CSS：**不再**对 `.mpc` / 角色色 `.mpp-paper` 强制 `outline:none` + `border:none` 清角色边；**仍**清 `.tep-card` padding、防拆页相关规则保留 | `PdfExportView.vue` |
| **U8** | `MiniPreviewChrome` 仍保留 `mpc--plain` API（列表或其它调用方可用）；导出路径不依赖 plain 去色 | `MiniPreviewChrome.vue` |
| **U9** | `getPaperPageCssPx('A4','portrait')` 与 `@page` mm 注入字符串一致（210×297） | `paper.ts` + PdfExportView 契约 |

### V · 目视 / 打包验收（手测清单）

| ID | 步骤 | 期望 |
|----|------|------|
| **V1** | 导出仅封面的模版 PDF | 纸缘有**橙**粗边；内容铺满；无明显白衬 |
| **V2** | 导出含正文页 | 正文纸缘**蓝紫/靛蓝**粗边；铺满 |
| **V3** | 导出含末页 | 末页**紫**粗边；铺满 |
| **V4** | 多页正文模版 | 每页一卡；**无**尾随近空白页 |
| **V5** | 模版管理缩略图 | 封面/正文/末页色差**仍在** |
| **V6** | 编辑器画布 | **无** MiniPreviewChrome 橙/紫框 |
| **V7** | 横向 Letter / A4 landscape | 同上：铺满 + 角色边正确 |
| **V8** | 对比合入前 PDF | 白衬消失；角色边从无→有（相对 0.3.67+） |

### N · 负面 / 回归

| ID | 断言 |
|----|------|
| **N1** | 浏览器打开导出页（非 Electron）不崩溃；角色色策略仅影响桌面 printToPDF 成品 |
| **N2** | 非导出预览栈（若仍用 plain=false 的缩略）不受导出 inset=0 影响 |
| **N3** | 控件 `showBorder` 细线与角色粗边可区分；一键隐藏边框不去掉角色 chrome |

## 不做（本条登记）

- 登记/补测阶段不改产品代码（说「开工」后再实现）  
- 不在 [docs/009](009-✅-ReportEditor导出纸张橙边框.md) 上续写历史验收勾  
- 不把去掉橙/蓝紫粗边当作本条范围（见 021）  
