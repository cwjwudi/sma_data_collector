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

# ⌛️ 未完成：安装版回归

- 自启开/关 × 静默开/关 × 重启；重装后重开自启。  
- 确认 Run 值为 `"…\Report Editor AI.exe"[ --silent-start]` 且路径存在。  
- 跑一次五档批导后 Run **不被清掉**。  
- 通过后本文件改 `037-✅`，记入 `007_版本发布记录.md`。
