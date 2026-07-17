# ReportEditor：历史报表可移动盘与拷移记入操作审计

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **状态**：✅ 已实现 · **0.3.107**。  
> **发现**：2026-07-17 · 用户补充（承接 022 拷移 / 025 Win 插盘提示）。  
> **相关**：[docs/022-✅](022-✅-ReportEditor历史报表复制到U盘.md) · [docs/025-✅](025-✅-ReportEditor-Windows插U盘无分屏提示.md) · [docs/013-✅](013-✅-ReportEditor模版版式编辑审计.md) · [`history-audit.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/history-audit.ts) · [`ReportHistory.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/ReportHistory.vue)。

---

# ✅ 已完成：插 U 盘（确认打开）与左⇄右 复制/移动 写入操作审计（0.3.107）

## 已拍板（默认全 A）

| # | 结论 |
|---|------|
| **Q1** | **A**：仅确认打开 / 忽略记审计（不记轮询检测到） |
| **Q2** | **A**：手选右侧路径也记「选择右侧目录」 |
| **Q3** | **A**：每批拷移一条汇总（含 failed 摘要前几条） |
| **Q4** | **A**：全文记本机路径 |
| **Q5** | 与 025 独立：拷移审计不依赖检测；确认打开依赖 025 提示条 |

## 落地

| action | 中文标签 |
|--------|----------|
| `history.removable_open` | 历史报表：打开可移动存储到右侧 |
| `history.removable_dismiss` | 历史报表：忽略可移动存储提示 |
| `history.select_right_root` | 历史报表：选择右侧目录 |
| `history.copy` / `history.move` | 历史报表：复制/移动到对侧目录 |

- 摘要构建：`history-audit.ts`；写入：`auditLog`（失败不挡主流程）  
- 单测：`history-audit.test.ts`、`auditLabels` 覆盖新键  

## 验收

- [x] 单元：摘要与标签  
- [ ] 手测：确认打开 / 忽略 / 选右侧路径 / 左⇄右复制移动 → 设置→操作审计可见中文  
- [x] 写审计失败不阻断拷移（沿用 `auditLog` 静默）  

## 不做

- 不做文件哈希/病毒扫描类审计  
- 不在轮询每次空跑时写审计  
- 不做拔出中断专用事件（本版）  
