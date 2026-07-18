# ReportEditor：从签名库切到历史报表后缩略图停在「滚动到此加载预览」

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **状态**：✅ 已修复 · **0.3.109**（根因代码验证 2026-07-18）。  
> **发现**：2026-07-18 · Windows 包 **0.3.107** 手测（用户）。  
> **相关**：[`history-thumb-visibility.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/history-thumb-visibility.ts) · [`ReportHistoryPane.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-history/ReportHistoryPane.vue) · [`ReportHistory.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/ReportHistory.vue) · [`MainLayout.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/layouts/MainLayout.vue)。

---

# ✅ 已完成：keep-alive 重回历史报表后缩略图懒加载（0.3.109）

## 现象（已确认 · Win 0.3.107）

1. 先打开 **签名库**，再切换到 **历史报表**（缩略图模式）。  
2. 左右分屏卡片已在视口内，缩略图仍显示 **「滚动到此加载预览…」**。  
3. 截图：[FILES/029-历史报表缩略图懒加载占位.png](FILES/029-历史报表缩略图懒加载占位.png)。  
4. 触发条件是 keep-alive 重新激活 + 列表 refresh，不限签名库。

## 根因（CONFIRMED）

`onActivated` → `refresh` → `entries` 新数组 → `watch` 清空 `visibleCards` → `ensureCardObserver` 在 Observer 已存在时 **noop** → 视口内卡片不再收到 intersection → 永久占位。

## 修复（0.3.109）

1. 抽出 [`history-thumb-visibility.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/history-thumb-visibility.ts)：`nextThumbObserverAction` / `planAfterHistoryEntriesChanged` / `mergeIntersectingFilePaths`。  
2. `ReportHistoryPane`：`watch(entries)` 清空后 `resyncCardVisibility()`（disconnect + 重建 Observer）；`onActivated` 再 resync。  
3. 单测：T1–T7（见下）。

## 单测用例矩阵

| ID | 断言 | 文件 |
|----|------|------|
| T1 | `ensure` + 已有 observer → `noop` | `history-thumb-visibility.test.ts` |
| T2 | `restart` + 已有 observer → `restart` | 同上 |
| T3 | entries 变更计划 → 清空 + restart | 同上 |
| T4 | merge 去重/忽略空串 | 同上 |
| T5 | 模拟 `ensure_only_bug`：首屏不可渲染 | 同上 |
| T6 | 模拟 `restart_after_clear`：相交可渲染 | 同上 |
| T7 | 未相交仍不渲染（懒加载不回归） | 同上 |

## 验收

- [x] 单元：T1–T7  
- [ ] Win：签名库 → 历史报表，首屏自动出预览  
- [ ] 任意其它 keep-alive 页 → 历史报表  
- [ ] 本页换目录 / 翻页正常  
- [ ] 长列表滚动懒加载不回归  

## 不做

- 不取消懒加载；不改 `MainLayout` keep-alive 名单。  
