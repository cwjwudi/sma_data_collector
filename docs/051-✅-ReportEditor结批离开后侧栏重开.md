# 051 · ReportEditor 结批离开后可从侧栏重新打开

> 模拟结批 / OPC 自动结批进行中时，离开「生成报表」页后仍能从侧栏与进度条回到该页。

---

# ✅ 已完成：进度全局态 + 侧栏入口 + toast「打开页面」

## 目标

用户在结批进行中切到其它页面后，不必在导航里盲找：侧栏底部显示结批进度入口，「生成报表」带角标；右下角进度条可点「打开页面」或点正文回到生成页；点 × 仅收起 toast，侧栏仍可恢复。

## 实现

- `frontend/src/lib/report-export-progress-state.ts`：会话态（busy / minimized）、`publish` / `end` / `tryMinimize` / `restore`、注册跳转 `/generate`
- `AppToastStack`：次要按钮「打开页面」、正文可点、× 时收起结批 toast
- `SidebarExportProgressBar` + `MainLayout`：侧栏结批条 +「生成报表」导出角标
- 手动结批 `ReportGenerator.vue`、自动结批 `report-auto-export-trigger-service.ts` 改走 `publishBatchExportProgress`

## 验收

- 单测：`report-export-progress-state.test.ts`
- 手测：开始模拟结批 → 切到仪表盘 → 侧栏见进度条 / 角标 → 点击回到生成报表；toast × 后侧栏仍可恢复进度条

## 关联

- 进度 toast 原实现见 034 M7 取消导出
- 全屏遮罩见 [039](039-🚧-ReportEditor导出全屏遮罩.md)（独立，不替代本入口）
