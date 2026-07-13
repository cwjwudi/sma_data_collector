# ReportEditor 控件默认无边框

> 产品计划：[`009_版本Plan/0.3.61.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.61.md)。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **0.3.61 已实现**（2026-07-13）：新建默认隐藏 + 一键隐藏；表格不碰；旧稿缺字段兼容显示。

---

# ✅ 已完成：新建控件默认「边框 → 隐藏」（`showBorder=false`）

## 纠正说明（2026-07-13）

指属性面板「边框 → 显示/隐藏」（预览/PDF 外框），**不是**设置页表单 CSS。

## 实现摘要

| 项 | 做法 |
|----|------|
| 模版新建 | `defaultElement` 非表格 `showBorder: false`；表格保持 `true` |
| 版式新建 | `defaultLayoutZoneElement` 同上 |
| 加载兼容 | `hydrate*`：`normalizeShowBorder(raw, true)`（缺字段 → true） |
| 一键隐藏 | `hideShowBordersInElements`；模版/版式工具栏「一键隐藏边框」；跳过 table |
| 测试 | `show-border-default.test.ts`（矩阵 A/B/C/E，13 passed） |

## 强制同步

模版（`model.ts` + `TemplateEditorWorkspace`）与版式（`layout-zone-element.ts` + `LayoutPresetEditor`）已同版修改。

## 表格

**完全不碰**（默认 / 面板 / 一键均跳过）。

## 验收

- [x] 单测 A/B/C/E 绿  
- [ ] 手工 D/F（发版后目视：新建图片默认隐藏；一键跳过表格；旧稿缺字段仍显示）

---

# ✅ 已完成：一键将当前页非表格控件边框设为隐藏

- 模版：当前 sheet + 当前正文页（`bodyElementsRef`）  
- 版式：页眉 + 正文 + 页脚三带  
- 纳入现有 debounce undo 历史  

---

# ✅ 已完成：实现、测试与发版 0.3.61

- 代码 + 单测 + bump **0.3.61**；打包见发布记录。
