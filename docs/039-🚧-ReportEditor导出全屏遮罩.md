# 039 · ReportEditor 导出全屏遮罩（盖住同机 mappView 白屏）

> 现场兜底：结批/导出期间在**主显示器全屏**显示「正在生成报表」遮罩，盖住同机 mappView 因抢占资源出现的白屏（观感像崩溃）。是 [035 同机降载](035-🚧-ReportEditor导出性能档位与同机降载.md) 的视觉兜底、[030 结批占满 CPU 白屏](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) 症状的体验补丁。
>
> 关联版本：0.3.143 · 发布记录见 [_Doc/007_版本发布记录.md](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)

---

# ✅ 已完成：导出期全屏遮罩窗 + 安全阀 + 现场开关（0.3.143）

## 目标

导出/结批未完成时，在主显示器最前台盖一张全屏遮罩（标题「正在生成报表」+ 结批文案 + 进度条 + 第 x/共 y 份），把 mappView 抢占 CPU 时的白屏挡住；完成即隐藏。工业 HMI 敏感——必须保证任何时候能看回现场画面。

## 现场确认的行为（用户拍板）

| 项 | 决策 |
| --- | --- |
| 触发范围 | **只要有导出就弹**（含前台手动导出），可用快捷键强关 |
| 遮罩范围 | **主显示器全屏、不透明**（彻底盖住白屏） |
| 硬超时 | **120 秒**自动隐藏（防遮罩卡死长时间锁住 HMI） |
| 手动关闭 | **Esc / 右上角 ×** 随时可关（保障能看报警） |
| 默认 | **默认开启**（现场开箱即用），设置页可关 |

## 实现

- **遮罩窗（主进程独立 BrowserWindow）**：`electron/main.cjs`
  - `showExportOverlay()`：`screen.getPrimaryDisplay()` 定位主显示器，全屏、无边框、`skipTaskbar`、`setAlwaysOnTop(true,'screen-saver')` 盖住 mappView（另一应用）。
  - **自身不白屏**：035 只降**导出渲染进程 + 后端**，遮罩窗是另一个渲染进程、保持 NORMAL 优先级；内容是**内联静态 HTML + CSS 动画**（`buildExportOverlayHtml`，不加载 SPA），画一帧后靠合成器动画，几乎不吃 CPU。
  - **开合**：`beginExportOverlaySession()` / `endExportOverlaySession()` 用导出计数 0→1 弹、归 0 收，插在 `handlePdfExportRun` 的 `registerPdfExportJob` 后与 `finally`（与 `unregisterPdfExportJob` 对称，支持并行导出）。
  - **进度**：`sendProgress` 同步 `pushExportOverlayProgress({phase,partIndex,totalReports})`，页面显示「第 x/共 y 份」。
  - **安全阀**：`EXPORT_OVERLAY_MAX_MS = 120000` 硬超时 → `hideExportOverlay('timeout')`；`before-input-event` 捕获 Esc 兜底；`ipcMain.on('export-overlay-dismiss')` 处理页面内 Esc / × 强关（强关后本会话不再自动重弹）。
  - **不弹场景**：`fiveTierExportSpec`（五档批导，无人值守自动退出）直接跳过。
- **桥**：新增 `electron/overlay-preload.cjs`，仅暴露 `exportOverlay.onProgress` / `exportOverlay.dismiss`（`contextIsolation`），随 `electron/**/*.cjs` 打包。
- **配置**：`electron/launch.cjs` `DEFAULTS.exportOverlayEnabled=true`、`normalizeSettings` 缺字段视为开；经既有 `launch-settings-get/set` IPC 透传（handler 已 spread 归一化设置，无需改动）。
- **UI**：`features/settings/LaunchSettingsSection.vue`「启动」区加「导出时全屏遮罩」开关；`vite-env.d.ts` 补 `exportOverlayEnabled` 类型。

## 验收

- 单测：`src/lib/launch-settings.test.ts`（默认开 / 缺字段视为开 / 显式关保留）+ `src/lib/export-overlay-contracts.test.ts`（主进程开合、主显示器全屏、`screen-saver` 置顶、120s 超时、Esc/dismiss、preload 桥、UI/类型透出）——本轮 4 文件 21 项全绿。
- 编辑器 TS 诊断：改动文件无报错。

## 后续 / 风险

- ⌛️ 真机验证：现场 i3-7100U + mappView 同屏，观察遮罩是否稳定秒开、结批期间不闪不漏白屏、超时/ Esc 均可靠退出。
- 多显示器仅盖主显示器（用户选择）；若现场 HMI 在副屏需回来调整为按 HMI 所在屏或全屏覆盖。
- 前台手动导出也会整屏遮住 Report Editor 自身（用户选择「只要导出就弹」）；如觉打扰可在设置页关闭，或后续改为仅「主窗后台」时弹。
