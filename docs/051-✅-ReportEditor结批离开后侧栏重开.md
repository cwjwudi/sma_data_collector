# 051 · ReportEditor 结批离开后可从侧栏重新打开

> 模拟结批 / OPC 自动结批进行中时，离开「生成报表」页后仍能从侧栏与进度条回到该页。

---

# ✅ 已完成：进度全局态 + 侧栏入口 + toast「打开全屏进度」

## 目标

用户在结批进行中切到其它页面后，不必在导航里盲找：侧栏底部显示结批进度入口，「生成报表」带角标；右下角进度条可点「打开全屏进度」或点正文回到生成页并**重新拉起 039 全屏遮罩**；点 × 仅收起 toast，侧栏仍可恢复。

## 实现

- `frontend/src/lib/report-export-progress-state.ts`：会话态（busy / minimized）、`publish` / `end` / `tryMinimize` / `restore`、注册跳转 `/generate`、`reshowExportOverlayIfBusy`
- `AppToastStack`：次要按钮「打开全屏进度」、正文可点、× 时收起结批 toast
- `SidebarExportProgressBar` + `MainLayout`：侧栏结批条 +「生成报表」导出角标；点导航「生成报表」亦拉回遮罩
- 手动结批 `ReportGenerator.vue`、自动结批 `report-auto-export-trigger-service.ts` 改走 `publishBatchExportProgress`

## 验收

- 单测：`report-export-progress-state.test.ts` · `export-overlay-contracts.test.ts`（reshow IPC）
- 手测：开始模拟结批 → Esc/× 关掉全屏遮罩 → 侧栏点进度条 / toast「打开全屏进度」→ **全屏「正在生成报表」重新出现**，且进度份数续上

## 关联

- 进度 toast 原实现见 034 M7 取消导出
- 全屏遮罩见 [039](039-🚧-ReportEditor导出全屏遮罩.md)

---

# ✅ 已完成：重新打开拉回全屏导出遮罩（051b · 2026-08-09）

## 问题

侧栏/toast「重新打开」只 `router.push('/generate')`，未恢复 Esc/× 关掉的 039 全屏遮罩；用户预期是回到「正在生成报表」全屏界面。

## 改动

- 主进程：`exportOverlaySuppressed`；强关时保留 `exportOverlayLastProgress`；新增 `reshowExportOverlay` + IPC `export-overlay-reshow`
- preload / `electronAPI.reshowExportOverlay`
- 前端：打开生成页 / 侧栏恢复时调用 `reshowExportOverlayIfBusy`；按钮文案改为「打开全屏进度」

## 验收

- Esc 关遮罩后点侧栏 → 全屏遮罩重现且显示当前第 x/共 y 份
- 导出结束后点侧栏不应再弹遮罩
