# ReportEditor 导出 PDF：纸张外仍像「相框」

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：先记录 + 代码对照排查，**未开工改代码**。  
> **发现**：2026-07-14 · 用户现场。  
> **产品期望**：配置多大纸张，就导出多大纸张；成品四周不要再有像相框一样的外框/衬边。  
> **背景（已完成、不复开）**：封面橙 / 正文蓝紫 / 末页紫角色色装饰边已于 **0.3.67** 剥离，见历史 [docs/009-✅](009-✅-ReportEditor导出纸张橙边框.md)。本条是**其后仍残留的外框感**，另开新看板。  
> **排队**：018 多选共有属性已于 **0.3.97** 完成，本条可开工。  
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

### 已排除：角色色「真边框」（009）

导出路径已双保险：

1. `pdfExportOmitCaptions` → `plainChrome` → `.mpc--plain`：`padding:0`、`outline:none`、`.mpp-paper { border/box-shadow: none }`  
2. `PdfExportView` `@media print` 再清 `.mpc` / `.mpp-paper` / `.tep-card` 的 border / outline / shadow / padding  

Electron `marginsType: 1` = **无页边距**；`@page { margin: 0 }`。  
→ **不是** 0.3.67 前那种橙/蓝紫描边回归；若仍见彩色粗边才另开回归单。

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
| **E** | 角色色（009） | 0.3.67 已处理 | **排除为主因** |
| **F** | 表格单元格线 | 表内 `border` 灰线属表格设计 | 勿与纸张外框混谈 |

### 鉴别问句（修前建议用户确认一眼）

成品上的「相框」更像：

1. **整页四周（尤其右、下）一圈白边 / 内容偏小不铺满** → 对齐主因（欠缩放）  
2. **某个文本块/色块自己的细线** → A（`showBorder`）  
3. **橙/蓝紫粗色边** → 009 回归（当前代码路径不应出现）

---

## 拟修复方向（待确认后开工 · 仍不改代码）

1. **导出专用 scale=1**：`plainChrome` / `pdfExportOmitCaptions` 时 `miniPreviewScale` **不扣** 14/10 inset；`pdfMiniMaxHeightPx` 改为 `heightPx`（或仅留 ≤3 的取整余量，取消 −28）。  
2. **防拆页**：在 scale=1 下复测「单卡两页空白」；若复发，改用打印 CSS / 固定卡片高度 = `@page` 内容盒，而不是靠缩小内容留 slack。  
3. **取消或仅列表保留** `scaledSize +3`：导出路径不要无故加高。  
4. 若确认为 **A**：引导「一键隐藏边框」；与纸张 chrome 分案，不在本条混修。  
5. **不做**：回退 0.3.67；不在本条改多选/绑定。

## 验收（开工后）

- [ ] 配置 A4/自定义等纸张 → PDF 页尺寸一致，且**内容铺满纸面**（肉眼无系统性白衬边）  
- [ ] 封面 / 正文 / 末页均无额外外框衬边；无「内容页后多一页空白」回归  
- [ ] 角色色装饰不回归（009）  
- [ ] 控件「边框」属性仍可按设计单独显示/隐藏（与纸张 chrome 分离）  

## 不做（本条登记）

- 本轮**仅**看板 + 排查记录，不改产品代码  
- 不在 [docs/009](009-✅-ReportEditor导出纸张橙边框.md) 上续写  
