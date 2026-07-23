# ReportEditor：五档批导收尾 ACCESS_VIOLATION（0xC0000005）

> **状态**：⌛️ 已登记，待查根因。  
> **登记日期**：2026-07-23  
> **现象码**：进程退出码 `-1073741819`（无符号 `3221225477` = Windows **`0xC0000005` / STATUS_ACCESS_VIOLATION**）  
> **关联代码**：`frontend/electron/main.cjs`（`runFiveTierExportBatch` 末尾 `app.quit()`）、PDF 导出窗 / `printToPDF` 生命周期  
> **关联**：导出档位见 [035](035-🚧-ReportEditor导出性能档位与同机降载.md)；残留 `report_backend` 导致安装误报见安装脚本 `installer.nsh` `customInit`。

---

# ⌛️ 未完成：现象与边界（已观察）

## 现象

- 五档批导（`REPORT_EDITOR_FIVE_TIER_EXPORT`）在日志打印 **「五档批导完成」**、PDF 与 `summary_*.json` **已落盘**之后，Electron 进程以 **`0xC0000005`** 退出。  
- PowerShell / `Start-Process` 看到的退出码常为 **`-1073741819`**。  
- **不影响当次导出结果验收**（`summary` 内各档 `ok: true` 仍可信）；属**收尾崩溃**，不是导出发失败。

## 复现线索（本机）

| 项 | 值 |
|----|-----|
| 典型命令 | 安装版 / `win-unpacked` + `REPORT_EDITOR_REUSE_BACKEND=1` + `REPORT_EDITOR_FIVE_TIER_EXPORT=id\|outDir` |
| 时间点 | 五档全部完成后 → `shell.openPath(outDir)` → `isQuitting=true` → `app.quit()` |
| 样本戳 | 竖/横冒烟 `smoke-*-2026-07-23T02-10-35`（10/10 ok，退出仍崩） |
| 副作用 | 主进程崩后若后端由 Electron 拉起或此前已起，**`report_backend.exe` 可能残留**（占 8000 / 锁安装目录） |

## 非目标（当前）

- 不把该码当成「导出失败」告警给现场用户（批导/结批成功路径以文件与 summary 为准）。  
- 根治前可接受「批导收尾噪音」；需避免残留后端误导安装器。

---

# ⌛️ 未完成：根因排查清单

| 假设 | 查法 |
|------|------|
| `app.quit()` 时导出窗 / `BrowserWindow` 未销毁完，Chromium 析构踩内存 | 批导结束先 `destroy` 导出窗、短延迟再 `quit`；对比是否仍 `0xC0000005` |
| `printToPDF` / GPU 进程与主进程竞态退出 | 关硬件加速试跑；看是否仅 Chromium 档（2–4）后必现 |
| `shell.openPath` 与退出竞态 | 去掉或延后打开目录再比 |
| 原生模块 / 字体 / updater 在退出路径崩溃 | 抓 WER minidump；核对 Electron 34 已知 AV |
| 仅五档批导路径，正常 UI 退出无此码 | 对照：设置里退出 / 普通结批后退出的 exit code |

**证据建议**：Windows 错误报告 LocalDumps、主进程日志最后 50 行、`Get-Process` 是否仍有 `report_backend`、Event Viewer 应用错误模块名（`electron.exe` / `node.dll` / `chrome_*.dll`）。

---

# ⌛️ 未完成：修复方向（根因确认后）

1. 批导收尾：有序关闭导出窗 → 可选 `setTimeout` → `app.exit(0)`（避免非 0 崩溃码污染脚本）。  
2. 若仍 AV：隔离是 GPU / 某 IPC / `openPath`。  
3. 退出时确保 `killPython` / 杀 `report_backend`（与安装前 `customInit` 互补）。  
4. 闭环后本文件改 `038-✅`，并在 `todo.md` / 发版说明记一笔。
