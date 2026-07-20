# ReportEditor：Windows 实际结批占满 CPU → 同机 mappView 白屏

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现**：2026-07-20 · 用户现场（Windows）。  
> **落地版本**：短期节制 **0.3.110**；分卷省资源 **0.3.111** · [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.111.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)  
> **相关**：性能墙钟/重复取数见 [docs/023-🚧](023-🚧-ReportEditor模拟结批性能回归分析.md)；整机单实例见 [docs/015-✅](015-✅-ReportEditor整机单实例与浏览器访问.md)。

---

# ✅ 已完成：登记现象与代码对照根因（2026-07-20）

## 现象与现场证据

Windows 实际结批 CPU≈100%，同机 mappView 白屏/刷新。

| 证据 | 结果 |
|------|------|
| 并行上限与启用绑定数 | **均为 4** |
| 并行改为 1 | **白屏消失**；CPU 仍可 100% |
| 硬件 | **i3-7100U**；**DB 同机**；**Hypervisor 再少一核** |

根因：多路隐藏 Chromium + `printToPDF` 抢核（并行=1 已证实）；单路仍满负荷 + 分卷重复全量 SQL 拉长争用窗口。

---

# ✅ 已完成：短期 CPU 节制（0.3.110）

| 项 | 做法 |
|----|------|
| 默认并行 | **1** |
| CPU 预算 | 逻辑核 ≤4 → 并行最多 **1** |
| Electron | 导出 `BelowNormal`；分卷 yield 80ms |
| UI | CPU 预算提示 |

---

# ✅ 已完成：分卷只取数一次 + 只渲染当前份（0.3.111）

| 项 | 做法 |
|----|------|
| 取数缓存 | `pdf-export-fill-cache.ts`：part0 `fullSqlFill` 后快照；part>0 复用，不再打全量 SQL；prewarm 清空 |
| 渲染 | `buildExportPreviewReports`：导出带 `reportPartIndex` 时只算该份 `computeExpandedBodyPreviewCards` |
| 接线 | `PdfExportView.boot`；`TemplateExportPreviewStack` |
| 单测 | cache U1–U3；reports U1；chrome U10–U11 |

**效果（相对 023）**：分卷场景累计 SQL 行数从约 `行数×份数` 降为约 **一行数（一次全量）**；每份不再重算其余 N−1 份 DOM 估高。

---

# ⌛️ 未完成：中期继续省 CPU

- [ ] 导出与编辑器预览进一步解耦 / 后台任务化  
- [ ] 可选：结批时降频 OPC 轮询、收缩预热窗  
- [ ] 架构：报表机与 mappView 分离  

## 验收

- [x] 并行=1 时 mappView 不再白屏（现场）  
- [x] 默认并行 1 + ≤4 核预算  
- [x] 导出 Below Normal + 分卷 yield  
- [x] 分卷后续份跳过 fullSqlFill；Stack 按 part 懒算  
- [ ] 现场装 0.3.111 后复核：多分卷结批时 `dataMs` 主要落在首份；HMI 更稳  

---

## 不做

- 不把 DATA_COLLECTOR 关批改成「降速」当作主修复  
- 本版不更换 `printToPDF` 引擎  
