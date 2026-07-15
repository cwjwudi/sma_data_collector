# ReportEditor 导出 PDF：纸张外仍像「相框」

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **落地版本**：**0.3.98**（与 [021-✅](021-✅-ReportEditor导出保留角色色粗边.md) 合批）· [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.98.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)  
> **发现**：2026-07-14 · 用户现场。  
> **政策**：角色色粗边保留见 021；本条专治欠缩放白衬边。

---

# ✅ 已完成：导出 PDF 1:1 铺满纸面（去白衬边）

## 根因（已修）

导出为防拆页主动 `height − 28`，且 `miniPreviewScale` 仍扣列表 inset → 内容约缩 3%+，右下白边像相框。

## 落地摘要（0.3.98）

| 项 | 变更 |
|----|------|
| `miniPreviewScaleForExport` | `chromeInset: false` |
| `TemplateMiniPage` `exactPageFit` | 导出不扣 inset；wrap 高不加 +3 |
| `PdfExportView` | `pdfMiniMaxHeightPx = heightPx`（取消 slack 28） |
| 防拆页 | 仍靠打印 CSS `tep-card` break / padding:0 |

## 合批测试（自动化已绿）

- [x] U1–U4、U9（scale / slack / +3 / 纸张 mm）  
- [x] 与 021 共用 U5–U8、目视 V 表见发版手测  

## 不做（保持）

- 不把去掉角色色当作本条范围  
