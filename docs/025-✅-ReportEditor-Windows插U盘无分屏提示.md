# ReportEditor：Windows 插入 U 盘后历史报表分屏无「可移动存储」提示

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：✅ 已修复（**0.3.102**）。  
> **发现**：2026-07-15 · 用户反馈；2026-07-17 现场确认：分屏开启后再插 U 盘仍无提示。  
> **相关**：[docs/022-✅](022-✅-ReportEditor历史报表复制到U盘.md) · Q13 · [`removable-volumes.cjs`](../_Prj/SD_SMA_ReportEditor/frontend/electron/removable-volumes.cjs) · [`ReportHistory.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/ReportHistory.vue)。

---

# ✅ 已完成：Windows 分屏插 U 盘可提示确认打开到右侧（→ 0.3.102）

## 现象（已确认）

Windows 下**已打开分屏**再插入 U 盘，顶栏仍不出现「检测到可移动存储 / 确认打开到右侧」。

## 根因

1. 旧实现仅用 PowerShell `DriveType == Removable`；不少 U 盘/外置盘被标成 **Fixed** → 列表空。  
2. `-Command` 拼脚本易失败且 `catch` 静默返回 `[]`。  
3. 无「新盘符」差集兜底；开启分屏时未重置基线。

## 修复（0.3.102）

1. **EncodedCommand** 跑 PowerShell：`.NET Removable` + `Get-Disk BusType=USB` 分区盘符。  
2. **新盘符差集**：开启分屏时 `resetBaseline`，之后出现的非系统盘就绪盘符也进入提示（覆盖 Fixed 型 U 盘）。  
3. 检测失败时顶栏提示错误，仍可用「选右侧路径…」。  
4. 轮询约 2.5s；路径归一化避免 `E:` / `E:\` 误匹配。  
5. 单测：`removable-volumes.test.ts`（解析行）。

## 验收

- [x] 单元：Win 行解析  
- [ ] 现场 Win：分屏 → 插 U 盘 → ≤数秒出现确认条 → 确认后右侧为该盘（请用 0.3.102 包复测）  
- [x] 不自动打开右侧（仍须确认）  

## 与 022 / 027

022 骨架保留；本条修 Win 检测。审计见 [docs/027-⌛️](027-⌛️-ReportEditor历史报表拷移与U盘审计.md)。
