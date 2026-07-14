# ReportEditor 导出 PDF：纸张外仍像「相框」

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：先记录 + 代码对照排查，未开工改代码。  
> **发现**：2026-07-14 · 用户现场。  
> **产品期望**：配置多大纸张，就导出多大纸张；成品四周不要再有像相框一样的外框/衬边。  
> **背景（已完成、不复开）**：封面橙 / 正文蓝紫 / 末页紫角色色装饰边已于 **0.3.67** 剥离，见历史 [docs/009-✅](009-✅-ReportEditor导出纸张橙边框.md)。本条是**其后仍残留的外框感**，另开新看板。

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
| [`PdfExportView.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/PdfExportView.vue) | `@page { size: Wmm Hmm; margin: 0 }` + 打印 CSS 再清 `.mpc` / `.mpp-paper` 边框 |
| [`TemplateExportPreviewStack.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateExportPreviewStack.vue) | 导出省略 caption 时传 `plain-chrome`；屏幕态 `.tep-card` 仍有 padding（打印 CSS 已清 0） |
| [`electron/main.cjs`](../_Prj/SD_SMA_ReportEditor/frontend/electron/main.cjs) | `printToPDF({ marginsType: 1, preferCSSPageSize: true, printBackground: true })` |
| [`TemplateMiniPage.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateMiniPage.vue) | 纸面 `pageW×pageH`；`scaledSize` 高度 **+3px**（防缩放裁切） |

## 排查结论（嫌疑，待目视验收后定点）

| # | 嫌疑 | 说明 | 与「相框」关系 |
|---|------|------|----------------|
| A | **控件 `showBorder` 外框** | 属性「边框 → 显示」会在预览/PDF 画 `1px` 控件外框；旧稿缺字段仍默认显示（见 [docs/005](005-✅-ReportEditor控件默认无边框.md)） | 若用户看到的是控件四周细线，可能是模版内容边框，不是纸张 chrome |
| B | **纸面与 `@page` 尺寸微差** | CSS 纸盒用 96dpi px；`@page` 用 mm；`scaledSize` 另 **+3px** 高度 | 可能留下细白边或裁切，看起来像衬边/相框 |
| C | **列表灰边残留路径** | `.mpc :deep(.mpp-paper){ border:1px solid #d4d4d8 }` 依赖 `plain` + 打印 CSS 双清 | 若某条导出路径未开 `plainChrome` / 非 print 截图，会留下灰框 |
| D | **`tep-card` 屏幕 padding** | 非打印有 `padding: 10px 12px`；打印已 `padding:0` | 仅当打印样式未生效时会像相框垫 |
| E | **角色色（009）** | 0.3.67 已处理 | **本条不视为主因**；若仍见橙/蓝紫则属回归，另记 |

**当前最需用户确认**：成品上的「相框」是  
1）整页纸四周一条线 / 一圈白边，还是  
2）某个控件（文本块/色块）自己的「边框」属性？

## 拟修复方向（待确认现象后开工）

1. 对照导出 PDF 与纸张 mm：测量 PDF 页尺寸是否精确等于配置 `paperKind`+`orientation`。  
2. 若为 **B**：导出路径取消 `+3` 高度、核对 scale=1 时纸盒与 `@page` 对齐，必要时导出强制 1:1 不缩放。  
3. 若为 **A**：引导用「一键隐藏边框」或默认规则；不与纸张 chrome 混谈。  
4. 若为 **C/D**：审计所有结批/手动导出入口是否均 `pdfExportOmitCaptions` + print CSS。  
5. **不做**：回退 0.3.67 角色色逻辑；不在本条改多选小数位。

## 验收

- [ ] 配置 A4/自定义等纸张 → PDF 页尺寸一致（允许打印引擎亚像素误差，肉眼无「套框」）  
- [ ] 封面 / 正文 / 末页均无额外外框衬边  
- [ ] 角色色装饰不回归（009）  
- [ ] 控件「边框」属性仍可按设计单独显示/隐藏（与纸张 chrome 分离）  

## 不做（本条登记）

- 本轮不改代码（仅看板 + 排查记录）  
- 不在 [docs/009](009-✅-ReportEditor导出纸张橙边框.md) 上续写  
