# ReportEditor：开机自启与静默无页面启动失效

> **状态**：⌛️ 已登记，待复现与根因定位。  
> **登记日期**：2026-07-23  
> **关联代码**：`frontend/electron/launch.cjs`（`launch-settings.json` / `setLoginItemSettings` / `--silent-start`）、`frontend/electron/main.cjs`（`silentStartSession`）、设置页启动偏好 UI、配置导入导出中的 `openAtLogin` / `silentStart`。  
> **关联**：整机单实例与托盘见 [015](015-✅-ReportEditor整机单实例与浏览器访问.md)。

---

# ⌛️ 未完成：现象与复现边界（用户反馈）

## 现象

- 在设置里调整 **开机自启动** 和/或 **静默无页面启动** 后，**重启机器（或重启应用后的登录项生效路径）会失效**。  
- 具体失效形态待确认（多选可并存）：
  - 开机后未拉起进程；
  - 开机有进程但主窗仍弹出（静默未生效）；
  - 设置 UI 勾选状态与 `launch-settings.json` / 系统登录项不一致；
  - 仅「改完立刻生效」看起来对，重启后回退。

## 复现步骤（待补全）

1. 安装版（非 `electron .` 开发态；`applyLoginItem` 在未打包时**故意不写**登录项）。  
2. 设置 → 打开「开机自启」和/或「静默启动」→ 保存。  
3. 完全退出应用 → **重启 Windows**（或注销再登录）。  
4. 观察：是否自启、是否无主窗仅托盘、设置页勾选是否仍在。

## 验收（修复后）

- 勾选自启：登录后进程起来；取消后不再进登录项。  
- 勾选自启+静默：登录后无主窗（托盘可点出）；`argv` 含 `--silent-start` 或等价会话标志。  
- 仅静默、不自启：手动双击亦静默（与现 `shouldSilentStartThisSession` 注释语义一致），且重启后偏好不丢。  
- 改偏好后立刻读回 UI / `launch-settings.json` / `getLoginItemSettings()` 三者一致。

---

# ⌛️ 未完成：根因排查清单

优先核对（不限于）：

| 线索 | 说明 |
|------|------|
| `!app.isPackaged` | 开发态不写登录项，易误判「设置了但重启无效」 |
| `setLoginItemSettings` 失败仅 `console.warn` | UI 可能显示成功、系统未登记 |
| 安装路径 / 快捷方式变更 | 重装、改目录后登录项仍指旧 `execPath` |
| NSIS 卸载/升级 | 是否清掉登录项或覆盖 `userData` |
| `openAsHidden` + `args` | Windows 对 hidden / 自定义 argv 支持因 Electron 版本而异 |
| 配置导入导出 | `config-bundle-client` 写回偏好是否漏调 `applyLoginItem` |
| 单实例 / 第二实例 | 015：第二实例 argv（含 `--silent-start`）被忽略是否影响观感 |

证据建议落盘：`%APPDATA%\sd-sma-report-editor-ai\launch-settings.json`、任务管理器启动命令行、设置页截图、Electron 主进程日志。

---

# ⌛️ 未完成：修复与回归

- 修复后补契约/行为测（能 mock 的部分）+ Windows 安装版手测清单（自启开/关 × 静默开/关 × 重启）。  
- 发版说明写入 `_Doc/007_版本发布记录.md`；本文件子任务改 ✅，文件名改 `037-✅-…`。
