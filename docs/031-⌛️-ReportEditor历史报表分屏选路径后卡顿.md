# ReportEditor：历史报表分屏选路径后整机卡顿

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现**：2026-07-20 · 用户反馈。  
> **流程**：先登记现象 + 代码对照根因 + 解决方案与测试用例；**本轮未改代码**。  
> **相关**：[022](022-✅-ReportEditor历史报表复制到U盘.md) 分屏骨架 · [025](025-✅-ReportEditor-Windows插U盘无分屏提示.md) 加重 PowerShell 枚举 · [027](027-✅-ReportEditor历史报表拷移与U盘审计.md) · [029](029-✅-ReportEditor历史报表缩略图懒加载不触发.md) 缩略图 Observer。

---

# ✅ 已完成：登记反馈与根因排查（2026-07-20）

## 现象（用户原话）

在**历史报表**点**分屏**，再**选路径**以后，**整个软件都很卡**，特别是**拖动窗口**。

## 调用链（简）

```text
toggleSplit(true)
  → startRemovablePoll()  // setInterval 2500ms
  → pollRemovable → IPC list-removable-volumes
      → removable-volumes.cjs：execFileSync(PowerShell / diskutil)  【阻塞主进程】

onPickRightRoot → pickExportDirectory → refresh(right) → scanExportEntries
  →（若缩略图模式）可见卡片批量 getExportPdfThumbnail / readFileSync
```

关键位置：

| 点 | 路径 / 符号 |
|----|-------------|
| 分屏轮询 | `ReportHistory.vue` · `startRemovablePoll` / `pollRemovable`（**2.5s**） |
| 同步子进程 | `removable-volumes.cjs` · `runPowerShellEncoded` → `execFileSync`；mac `diskutil info` |
| IPC | `main.cjs` · `list-removable-volumes` |
| 选路径 | `onPickRightRoot` → `scanExportEntries`（单层，非持续） |
| 缩略图 | `PdfExportThumb.vue` / `get-export-pdf-thumbnail`（无并发上限） |
| keep-alive | `MainLayout` 缓存 `ReportHistory`；**仅 `onUnmounted` 停表，无 `onDeactivated`** |

## 根因结论（按置信度）

| # | 结论 | 置信度 |
|---|------|--------|
| **1 主因** | 分屏开启后每 **2.5s** 在 Electron **主进程**用 **`execFileSync`** 跑 PowerShell（Win，025 后更重）/`diskutil`（mac）枚举可移动卷，**阻塞主进程事件循环** → 拖窗口/全局 UI 发僵 | **高** |
| **2 放大器** | 选路径后右侧有内容 + 缩略图模式：多卡同时缩略图 IPC / `readFileSync` 再占主进程 | **中高**（thumbs/大 PDF/U 盘时） |
| **3 放大器** | keep-alive：**离开历史页轮询仍跑**（无 `onDeactivated` → `stopRemovablePoll`）→ 「整个软件」持续卡 | **中高** |
| **非主因** | `fs.watch` 递归扫盘、Vue deep watch | **低**（无 / 不存在） |

> 「选路径以后更卡」：分屏已开轮询；选路径后右侧扫描 +（常切）缩略图风暴叠加；U 盘路径上 PowerShell/`stat` 更慢，拖窗体感最差。

---

# ⌛️ 未完成：解决方案（设计，未开工）

## A. 短期（优先落地）

1. **轮询改异步**：`execFile` / `spawn`（或 utilityProcess），IPC **禁止**同步等子进程；上一轮未完成则跳过（in-flight guard）。  
2. **生命周期（2026-07-20 拍板）**：`onDeactivated` / 退出分屏 / **最小化** → `stopRemovablePoll`；`onActivated` 且仍分屏再启。**不**停 OPC 自动结批（应用级）。  
3. **降频**：间隔 2.5s → **5–10s**；Win 结果短缓存。  
4. **缩略图**：全局并发上限（如 2–3）+ 失败勿整文件 `readFileSync` 堵主进程（默认可放 P1）。  
5. **现场缓解（不改代码）**：分屏用**列表**模式；离开历史页前先「退出分屏」。

## B. 中期

1. Win：设备到达通知 / 事件替代忙轮询；仅窗口 focus 且分屏可见时探测。  
2. 扫盘与缩略图迁出主进程轻量调度。  
3. 与 029 Observer restart 兼容：restart 保留，加载必须排队。

## 验收（落地后）

- [ ] 分屏 + 选路径后拖动窗口流畅（主进程无周期性秒级阻塞）  
- [ ] 离开历史页后不再轮询  
- [ ] 插 U 盘提示（025）仍可用  
- [ ] 029 缩略图懒加载不回归  

---

# ⌛️ 未完成：测试用例（设计）

| ID | 类型 | 场景 | 期望 |
|----|------|------|------|
| **U1** | 单测 | 可移动卷枚举契约：不得在轮询路径使用 sync `execFileSync`（或标记 async API） | 绿 |
| **U2** | 单测 | `onDeactivated` 停表；`onActivated`+split 再启；无双重 `setInterval` | 绿 |
| **U3** | 单测 | 缩略图队列并发 ≤ N | 绿 |
| **U4** | 单测 | `scanExportEntries` 仍单层不递归（022 回归） | 绿 |
| **U5** | 单测 | 029：entries 变更仍 clear+restart Observer | 绿 |
| **V1** | 手测 Win | 仅分屏、不选路径 → 拖窗 10s | 应流畅；若已卡 → 确认轮询主因 |
| **V2** | 手测 Win | 分屏 → 选本地路径（列表）→ 拖窗 | 接近 V1 |
| **V3** | 手测 Win | 分屏 → 选 U 盘 → 切到其它页再拖窗 | **离开后不得持续卡** |
| **V4** | 手测 | 缩略图 + 每页 50/100 PDF → 选路径后 | 允许短暂加载，不应持续卡死 |
| **V5** | 手测 | 签名库→历史（029）缩略图仍自动出 | 029 不回归 |
| **N1** | 负向 | 拔 U 盘 / 枚举失败 | UI 可提示，主进程不长时间堵 |
| **N2** | 负向 | 超大 PDF / 无系统缩略图 | 降级，不整文件堵死 |
| **N3** | 负向 | 快速开关分屏 / 连点选路径 | 无多重 interval |

自动化优先：**U1–U5**；V 系列现场 Win 验收。

---

## 不做（本轮）

- 不改 `removable-volumes.cjs` / `ReportHistory.vue`（先文档拍板）  
- 不削弱 025「插 U 盘能提示」的产品能力（只改实现方式）  
