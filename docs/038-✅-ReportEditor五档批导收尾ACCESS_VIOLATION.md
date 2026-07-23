# ReportEditor：五档批导收尾 ACCESS_VIOLATION（0xC0000005）

> **状态**：✅ 收尾退出码已闭环（2026-07-23 · **0.3.139**）。  
> **登记日期**：2026-07-23  
> **现象码**：`-1073741819` = Windows **`0xC0000005` / STATUS_ACCESS_VIOLATION**  
> **关联代码**：`frontend/electron/main.cjs` → `finishFiveTierExportAndExit`  
> **关联**：[035](035-🚧-ReportEditor导出性能档位与同机降载.md)；安装前杀后端见 `installer.nsh` `customInit`。

---

# ✅ 已完成：现象

- 五档 PDF/`summary` 写完后，原 `app.quit()` / 裸 `process.exit` 仍会在 Chromium 析构钩子里 AV，**把退出码盖成 `0xC0000005`**。  
- 导出结果本身仍是成功的。

---

# ✅ 已完成：根因与修复（0.3.139）

| 尝试 | 结果 |
|------|------|
| 先 destroy 预热/主窗再 `process.exit(0)` | 仍 AV，且常在 exit 日志前崩 |
| 仅 `process.exit(0)` | 日志有 exit(0)，**退出码仍被 AV 盖成 -1073741819** |
| **卸掉 `before-quit`/`will-quit`/`quit`/`window-all-closed` 后 `app.exit(code)`** | **EXIT_CODE=0**（本机 `smoke-038-exitcode-d`） |

实现：`finishFiveTierExportAndExit` —— 写 `outDir/.five-tier-exit` → 卸 quit 钩子 → `app.exit(code)`；批导成功路径不再 `shell.openPath`（避免与退出竞态，目录由调用方打开）。  
契约测：`export-perf-tier-contracts` 含 038 断言。

**验收**：`npx electron` / 安装版五档批导后 `EXIT_CODE=0`，且 `.five-tier-exit` 内容为 `0`；summary 各档 `ok: true`。
