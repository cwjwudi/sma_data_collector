# ReportEditor：一键隐藏边框应覆盖整份模版（不依赖当前页）

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-08-08。  
> **闭环日期**：2026-08-08（本机 TDD）。  
> **范围**：模版编辑器工具栏「一键隐藏边框」的作用域（整模版）。  
> **关联**：[005](005-✅-ReportEditor控件默认无边框.md) · [040](040-✅-ReportEditor矢量导出页眉一键隐藏仍有边框.md)。

---

# ✅ 已完成：产品口径登记（2026-08-08）

点一次「一键隐藏边框」→ **整份模版**（封面 + 全部正文分页 + 封底的眉脚/正文/zone），不依赖当前选中页；表格跳过；一次 undo。

---

# ✅ 已完成：实现与单测（2026-08-08）

| 位置 | 变更 |
|------|------|
| `show-border.ts` | 新增 `hideBordersOnEntireTemplate`；保留 `hideBordersOnTemplateSheet` 供局部/测试 |
| `TemplateEditorWorkspace.vue` | 按钮改走整模版；hint「已隐藏整份模版 N 个…」 |
| `show-border-default.test.ts` | **G7**：多 sheet + 双正文页一次清干净，table 跳过、幂等 |

版式库三带一键本期未改（口径如此）。

## 验收证据

- vitest：`show-border-default.test.ts` 等与 049 相关用例绿。  
- **本机 mac 手测通过**（2026-08-08）：用户确认「一键隐藏边框」整模版生效。
