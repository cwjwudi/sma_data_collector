# ReportEditor 多选：拖一角组缩放

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **落地版本**：**0.3.99** · [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.99.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)  
> **发现 / 澄清**：2026-07-14 · 拖一角，全部选中项一起缩放。  
> **推翻**：011 B1「缩放柄仅改 primary」——多选时拖 primary 柄 → 全集 AABB 组缩放。

---

# ✅ 已完成：多选拖一个角，选中项一起缩放

## 落地摘要（0.3.99）

| 项 | 变更 |
|----|------|
| 纯函数 | [`selection-group-resize.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/selection-group-resize.ts)：AABB 锚点缩放、Shift 锁比、min 尺寸、table `horizontalOnly` |
| 模版 | `TemplateBodyCanvas`：多选不折叠；组缩放写全集；组拖移 `clampPositionOnly` |
| 版式 | `LayoutPresetPaperCanvas`：同 zone 内组缩放（跨 zone 坐标不一致，仅同带） |
| 单测 | `selection-group-resize.test.ts` 7 项 |

## 验收

- [x] ≥2 选中：拖 primary 一角 → AABB 比例变换  
- [x] Shift 锁比；单选路径保留  
- [x] 表格高度不跟 `sy`；宽跟水平缩放  
- [x] 模版与版式（同 zone）一致  
- [x] 组拖移贴边不砍 w/h  

## 不做（保持）

- 不做独立组包围盒八向柄 UI  
- 不在右侧面板做 W/H 数字批改  
- 不回改 011 已完成章节正文  
