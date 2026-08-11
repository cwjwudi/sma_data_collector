# ReportEditor：历史报表分屏选路径后整机卡顿

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现**：2026-07-20 · 用户反馈。  
> **落地版本**：**0.3.112**（032 P0-C）· [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.112.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)。  
> **相关**：[032](032-🚧-ReportEditor全站架构评估与统一生命周期.md) · [022](022-✅-ReportEditor历史报表复制到U盘.md) · [025](025-✅-ReportEditor-Windows插U盘无分屏提示.md) · [029](029-✅-ReportEditor历史报表缩略图懒加载不触发.md)。

---

# ✅ 已完成：登记反馈与根因排查（2026-07-20）

## 现象（用户原话）

在**历史报表**点**分屏**，再**选路径**以后，**整个软件都很卡**，特别是**拖动窗口**。

## 根因结论

| # | 结论 | 置信度 |
|---|------|--------|
| **1 主因** | 分屏开启后每 **2.5s** 在 Electron **主进程**用 **`execFileSync`** 跑 PowerShell/`diskutil`，阻塞事件循环 | **高** |
| **2 放大器** | 选路径后缩略图 IPC / `readFileSync` | **中高**（→ 032 P1） |
| **3 放大器** | keep-alive 离开历史页轮询仍跑 | **中高** |

---

# ✅ 已完成：短期止血（0.3.112）

1. **轮询改异步**：`removable-volumes.cjs` 使用 `execFile` promisify；IPC `await listRemovableVolumesDetailed()`；in-flight 合并 + 400ms 短缓存。  
2. **生命周期**：`usePageLifecycle('ReportHistory')` 注册 `removable-volume-poll`（`page-focus`）→ 离页 / 退出分屏 / **最小化** 停表；仍分屏且页可见再启。**不停** OPC 自动结批。  
3. **降频**：间隔 **5s**。  
4. 契约：L3/L4；U1 源码门禁绿。

## 验收

- [x] 轮询路径无 sync 子进程（L4）  
- [x] deactivated / page-focus 停表（L3）  
- [ ] 手测 V1–V3（Win 现场）  
- [ ] 插 U 盘提示（025）回归  
- [ ] 029 缩略图不回归  

缩略图全局并发上限 → **032 P1-B**。

---

# ⌛️ 未完成：中期 / 手测

| ID | 类型 | 场景 | 期望 | 状态 |
|----|------|------|------|------|
| **U3** | 单测 | 缩略图队列并发 ≤ N | 绿 | ⌛️ P1 |
| **V1–V5** | 手测 | 分屏拖窗 / 离页 / U 盘 / 缩略图 | 拖窗流畅；离页不卡 | ⌛️ |
| **N1–N3** | 负向 | 拔盘 / 超大 PDF / 连点分屏 | 主进程不堵死 | ⌛️ |

---

## 不做（已并入 032）

- 不再单独开「跳转组合」散修；缩略图并发与 Observer 全员迁移走 032 P1。
