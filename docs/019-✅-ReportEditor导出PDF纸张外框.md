# ReportEditor 导出 PDF：纸张外仍像「相框」/ 表格空间右偏

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **落地版本**：**0.3.98**（与 [021-✅](021-✅-ReportEditor导出保留角色色粗边.md) 合批）· [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.98.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)  
> **发现**：2026-07-14 · 用户现场。  
> **政策**：角色色粗边保留见 021；本条专治欠缩放白衬边。  
> **别名（现场说法）**：PDF 导出时「表格空间向右偏移」——与整页内容欠缩放、右下白衬边同一根因（非表格控件单独 `x` 错位）。

---

# ✅ 已完成：导出 PDF 1:1 铺满纸面（去白衬边）

## 现象（现场）

| 说法 | 实际观感 |
|------|----------|
| 「纸张外像相框」 | 成品四周或右下有白衬边，纸面未 1:1 铺满 `@page` |
| 「表格空间向右偏移」 | 整页内容（含表格）相对纸面偏小；`transform-origin` 左上时白边主要落在右/下，观感像版心右移留白 |

与控件自带 `showBorder`、角色色粗边（021）无关；后者见 [009-✅](009-✅-ReportEditor导出纸张橙边框.md) / [021-✅](021-✅-ReportEditor导出保留角色色粗边.md)。

## 根因（已找到并已修）

导出链叠了两处**系统性欠缩放**：

1. `PdfExportView` 为防拆页主动 `height − 28`（slack），`maxHeight` 小于纸面 CSS px → scale &lt; 1。  
2. `miniPreviewScale` 默认仍扣列表 chrome inset（`W=14` / `H=10`）→ 再缩约 1–2%。  

合计内容约缩 **3%+**，右下白边像相框；表格随整页一起偏小，并非表格布局单独右移。

## 落地摘要（0.3.98）

| 项 | 变更 |
|----|------|
| `miniPreviewScaleForExport` | `chromeInset: false` |
| `TemplateMiniPage` `exactPageFit` | 导出不扣 inset；wrap 高不加 +3 |
| `PdfExportView` | `pdfMiniMaxHeightPx = heightPx`（取消 slack 28） |
| 防拆页 | 仍靠打印 CSS `tep-card` break / padding:0 |

## 合批测试（自动化）

| ID | 覆盖 | 文件 |
|----|------|------|
| U1 | 导出 max=纸面时 scale === 1 | `mini-preview-scale.test.ts` |
| U2 | 列表仍扣 inset、scale &lt; 1 | 同上 |
| U3 | 无 slack 28 | `pdf-export-chrome.test.ts` |
| U4 | `exactPageFit` 不加 +3 | 同上 |
| U5–U8 | omit captions + exactPageFit；`plain-chrome=false` 保留角色色粗边（021）；打印 CSS 清卡片 padding/标签 | 同上 |
| U9 | A4 CSS px 与 `@page` mm 一致 | 同上 |
| V | 目视：导出 PDF 铺满、无右下大白边 | 发版手测（0.3.98） |

**缺口（已知）**：无「整页 HTML→PDF 像素 diff」E2E；回归靠 U1–U9 契约 + 手测。对欠缩放根因足够；若再现「仅表格内列错位」需另开看板（当前代码未发现独立表格 x 偏移根因）。

## 不做（保持）

- 不把去掉角色色当作本条范围  

---

## 复核（2026-07-20）

| 项 | 结论 |
|----|------|
| 是否仍记在文档 | 本看板；现场「表格空间向右偏移」已写入别名 |
| 根因是否找到 | **是**（slack 28 + chrome inset 欠缩放） |
| 当前代码是否仍含修复 | **是**（`0.3.109` 线仍保留 `miniPreviewScaleForExport` / `exactPageFit` / `pdfMiniMaxHeightPx = heightPx`） |
| 单测是否仍绿 | **是**（本机 2026-07-20：`mini-preview-scale` + `pdf-export-chrome` 共 **8** 项通过） |
| 测试是否够 | **契约足够**（U1–U9）；无 PDF 像素 E2E，属可接受缺口 |
| 是否已打入安装包 | 修复自 **0.3.98** 起进版本线。本机 Mac 产出最新含修复的包为 **0.3.106** DMG；**0.3.108** 曾补 win32 SHA；当前 `latest.json` 指向 **0.3.109** 但 **mac/win SHA 皆空**（尚未打 0.3.109 安装包）。要用含 019 修复的包：≥0.3.98 且有实际产物的版本（如 0.3.106 Mac / 已补 SHA 的 0.3.108 Win） |
