# ReportEditor 导出 PDF：整页纸张四周出现橙色边框

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 现象来源：用户反馈导出/预览中纸张带橙边；2026-07-13 截图确认。  
> 相关：PDF 导出链 `PdfExportView` → `TemplateExportPreviewStack` → `TemplateMiniPage` → `MiniPreviewChrome`。  
>  
> **修订说明（2026-07-13）**：初版误写为「导出结果中，**表格附近**可见左侧 / 右侧 / 上侧橙色线」。该句**已作废**。正确现象是橙边在**整页纸张四周**。  
> **修复版本：0.3.67**。

---

# ✅ 已完成：导出 PDF 剥离 MiniPreviewChrome 角色色纸边

## 用户确认（2026-07-13）

| # | 确认 |
|---|------|
| 1 | **封面**纸张外框为**橙色**；**正文**为**蓝紫色**——**两种都不要** |
| 2 | **编辑器画布**里看不到该外框 |
| 3 | **主要出现在导出的 PDF**（结批/导出成品）里 |

## 根因

`TemplateMiniPage` 始终包 `MiniPreviewChrome`（模版列表用的角色色装饰）。PDF 路径 `printBackground: true` 把封面橙 outline / 正文靛蓝左边 / 末页紫底印进成品；编辑画布不走该链，故编辑器无此边。

## 修复（0.3.67）

1. `MiniPreviewChrome` 增加 `plain` → `mpc--plain`（透明底、无 outline、纸无角色色边与阴影）。  
2. `pdfExportOmitCaptions` 时 `TemplateExportPreviewStack` → `plainChrome`。  
3. `PdfExportView` `@media print` 双保险清除 `.mpc` / `.mpp-paper` 装饰。  
4. 模版管理缩略图仍用装饰版（不传 plain）。  
5. 契约单测：`pdf-export-plain-chrome.test.ts`。

## 验收

- [x] 封面 / 正文 / 末页导出 PDF 无橙 / 蓝紫角色色外框  
- [x] 编辑器画布行为不变  
- [x] 缩略图列表可保留色差  
