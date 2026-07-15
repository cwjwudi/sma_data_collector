# ReportEditor 导出 PDF：保留封面橙 / 正文蓝紫粗色边

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **落地版本**：**0.3.98**（与 [019-✅](019-✅-ReportEditor导出PDF纸张外框.md) 合批）· [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.98.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)  
> **澄清**：2026-07-14 · 用户要求保留橙/蓝紫粗色边（反转 009 导出剥离政策）。

---

# ✅ 已完成：导出成品恢复角色色粗边

## 落地摘要（0.3.98）

| 项 | 变更 |
|----|------|
| omit ≠ plain | `pdfExportOmitCaptions` 仍省略标题；`plainChrome=false` |
| 打印 CSS | 不再 `outline/border: none` 抹角色边；仍清标签与纸阴影/圆角 |
| 列表 / 画布 | 缩略保留色差；编辑画布不加 chrome |

## 验收

- [x] 契约测 U5–U8（`pdf-export-chrome.test.ts`）  
- [ ] 目视 V1–V3 / V5–V6（打包后手测勾选）  

## 不做（保持）

- 不删 009 历史记录  
- 不单独发「只恢复色边、不修白衬」版本（已与 019 同版）  
