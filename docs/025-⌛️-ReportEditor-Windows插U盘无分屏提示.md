# ReportEditor：Windows 插入 U 盘后历史报表分屏无「可移动存储」提示

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：⌛️ 仅登记；**未开工改代码**。  
> **发现**：2026-07-15 · 用户反馈（0.3.100 分屏拷移落地后）。  
> **相关**：[docs/022-✅](022-✅-ReportEditor历史报表复制到U盘.md) · Q13 · [`removable-volumes.cjs`](../_Prj/SD_SMA_ReportEditor/frontend/electron/removable-volumes.cjs) · [`ReportHistory.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/ReportHistory.vue)。

---

# ⌛️ 未完成：Windows 插 U 盘后顶栏不出现「确认打开到右侧」

## 现象（用户原话）

Windows 下插入外部 U 盘后，**没有弹出 / 提示**可把该卷用到历史报表分屏**右侧**（即顶栏「检测到可移动存储… / 确认打开到右侧」未出现或未感知到插盘）。

## 产品预期（022 · Q13，已拍板）

| 步骤 | 行为 |
|------|------|
| 1 | 分屏开启时轮询可移动卷（约 3s） |
| 2 | 检测到新卷 → 顶栏提示（**不自动切右侧**） |
| 3 | 用户点「确认打开到右侧」→ 右侧 cwd = 该卷根 |
| 4 | 「忽略」后本会话不再提示该路径 |

因此本条不是「应自动打开右侧」，而是 **Win 上检测/提示链路未生效或不可见**。

## 现状实现（便于排查）

- 主进程：`list-removable-volumes` → Win 用 PowerShell `[System.IO.DriveInfo]::GetDrives()`，仅 `DriveType == Removable` 且 `IsReady`。  
- 渲染：仅 **`split === true`** 时 `setInterval(pollRemovable, 3000)`；候选卷若已是右侧根、或已被「忽略」，则不提示。  
- 兜底：仍可用顶栏「选右侧路径…」手选盘符。

## 可能原因（待现场核实 · PLAUSIBLE）

1. **未进分屏**：单栏模式不轮询 → 无提示。  
2. **系统把 U 盘标成 Fixed**：常见于部分 USB 硬盘/部分闪存驱动；`DRIVE_REMOVABLE` 过滤会漏掉 → 列表空。  
3. **PowerShell 调用失败被吞**：`listRemovableVolumesWin` `catch` 后返回 `[]`，界面无错误。  
4. **提示条不明显 / 已忽略**：曾点忽略写入 `dismissedRemovablePaths`；或右侧已手选到同盘。  
5. **IPC/旧壳**：未带 `listRemovableVolumes` 的旧安装包。

## 建议复现清单（现场）

- [ ] 0.3.100+ 桌面版；历史报表 → **打开分屏** → 再插 U 盘，等 ≥3s  
- [ ] 资源管理器能否看到盘符；盘符属性「可移动」还是「本地磁盘」  
- [ ] DevTools / 临时日志：`listRemovableVolumes` 返回的 `volumes`  
- [ ] 手选「选右侧路径…」能否打开该盘（区分「检测失败」vs「拷移失败」）

## 修复方向（开工后 · 草案）

1. Win：除 `Removable` 外，可选纳入「新增盘符相对启动时快照的差集」或 `GetDriveType` + 白名单；或读 `Win32_DiskDrive` InterfaceType=USB（仍走确认框，避免误开系统盘）。  
2. PowerShell 失败时返回 `{ ok:false, error }` 并在顶栏黄条提示，勿静默空列表。  
3. 分屏首次进入时立即 poll 一次（已有）；插盘后可缩短首轮间隔或订阅变化（进阶）。  
4. 文案/位置：提示条更醒目；说明「未检测到时可手选路径」。  
5. 单测：对 Win 枚举函数注入假输出做解析测；真机插拔为手测。

## 验收（草案）

- [ ] Win 插真 U 盘（Removable）+ 分屏 → ≤数秒出现确认条；确认后右侧为该盘  
- [ ] Fixed 型外置盘：要么也能进提示，要么顶栏说明「请手选路径」且手选可用  
- [ ] 忽略后本会话不再刷同一盘；拔出后提示消失  
- [ ] mac 行为不回退  

## 不做（本条登记）

- 不自动打开右侧（仍须确认，Q13）  
- 本条登记阶段不改产品代码  
- 不强求 100% 区分闪存 vs 移动硬盘  

## 与 022 关系

022 已交付拷/移与确认打开骨架；本条专跟 **Windows 检测/提示未达预期** 的现场缺口。
