# ReportEditor：开机自启与静默无页面启动失效

> **状态**：🚧 根因已定位；**代码修复已落地（0.3.138）**，待安装版手测重启闭环。  
> **登记日期**：2026-07-23  
> **关联代码**：`frontend/electron/launch.cjs`、`frontend/electron/main.cjs`、`LaunchSettingsSection.vue`。  
> **关联**：整机单实例与托盘见 [015](015-✅-ReportEditor整机单实例与浏览器访问.md)。

---

# ✅ 已完成：根因排查（2026-07-23 本机）

## 结论

**开机自启「改完重启失效」主因：HKCU Run 登录项路径无效，且含空格路径未加引号，Windows 登录时拉不起进程。**  
详见 git 历史；证据：死链 `...\Report Editor AI\Report Editor AI.exe`、无引号、偏好 json 缺失。

---

# ✅ 已完成：代码修复（0.3.138）

| 项 | 处理 |
|----|------|
| A 引号 | `formatQuotedLaunchCommand` + `reg add` 覆盖写入带引号 Run 值；写后读回校验 |
| B 死链 | `syncLoginItemOnReady`：有偏好且自启开 → 用**当前** `process.execPath` 重写 |
| C 偏好缺失 | 无 json 且默认关时：若 Run 仍有本 app 项 → 恢复 json 并校正路径；**勿**用 defaults 清项 |
| D 批导旁路 | `fiveTierExportSpec` 时 `applyLoginItem` / `syncLoginItemOnReady` 均 `skip` |
| UI | 保存后展示 `loginCommand` 或 `loginError` |
| 测 | `launch-settings.test.ts`（引号/命令组装） |

**本机已临时校正**：Run 改为  
`"…\ReportEditorAI\Report Editor AI.exe" --silent-start`，并补写 `launch-settings.json`（自启+静默）。完整闭环仍需装 **0.3.138** 后开关切换与重启验收。

---

# ✅ 已完成：根因二——重复自启项致开机弹窗（037b）

## 结论

**「静默开关已开、重启后仍显示页面」的主因：升级后 HKCU\Run 里同时存在两份指向本 app 的自启项，开机被拉起两个实例，第二个触发 `second-instance` → `showMainWindowFromTray()` 无条件弹出主窗口——即便两者都是静默自启。**

## 为何会有两份

- **0.3.138 前**：`setLoginItemSettings(opts)` 未传 `name`，Windows 上 Electron 用**默认值名**（app 名，如 `Report Editor AI`）写入 Run。
- **0.3.138 起**：改用固定值名 `com.brteam.sd_sma.report_editor_ai`（`LOGIN_ITEM_NAME`），但 `syncWindowsRunKey` 只覆盖/删除**这一个**值名，**没清掉旧值名那份**。
- 结果：老用户升级后两份并存（旧值名可能无引号/无 `--silent-start`/死链）。开机 Windows 依次拉起 → 抢单实例锁失败的那个走 `second-instance` → 主窗口被强制 show。

证据链：`git show 0510893^:…/launch.cjs` 显示旧 `opts` 无 `name`；`main.cjs` 旧 `second-instance` 无条件 `showMainWindowFromTray()`。

## 代码修复（本轮）

| 项 | 处理 | 位置 |
|----|------|------|
| A 清重复项 | 新增 `removeLegacyRunDuplicates(exe)`：枚举 Run，删除**值名≠`LOGIN_ITEM_NAME`**但数据含本 exe 文件名的历史项；开/关自启都执行 | `launch.cjs` |
| B second-instance 守卫 | 第二实例命令行含 `--silent-start` 时**不弹窗**（仅确保托盘）；正常双击（无该参）仍照常 show | `main.cjs` |
| C 偏好丢失兼容 | `syncLoginItemOnReady` 无偏好文件时，用 `findAppRunEntryData` 也认旧值名的 Run 项 → 归一化重写为本值名 | `launch.cjs` |
| 观测 | IPC 返回 `loginRemovedLegacy`；启动日志 `Removed legacy autostart entries: …`；设置页保存提示「已清理旧的重复自启项」 | `main.cjs`/`.vue` |
| 测 | `parseRunKeyOutput`（含空格值名解析）+ 非 Windows 空操作守卫，纳入 `launch-settings.test.ts` | 测试 |

---

# ⌛️ 未完成：安装版回归（含 037b）

- 自启开/关 × 静默开/关 × **重启电脑**；重装后重开自启。  
- 确认 Run **只剩一份** `com.brteam.sd_sma.report_editor_ai = "…\Report Editor AI.exe"[ --silent-start]` 且路径存在；旧值名（如 `Report Editor AI`）已被清除。  
- 开机自启 + 静默：重启后**只应托盘驻留、不弹页面**。  
- 跑一次五档批导后 Run **不被清掉**。  
- 通过后本文件改 `037-✅`，记入 `007_版本发布记录.md`（下一可用版本号，注意 0.3.140 已被 035 占用）。
