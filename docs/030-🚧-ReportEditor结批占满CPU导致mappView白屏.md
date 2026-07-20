# ReportEditor：Windows 实际结批占满 CPU → 同机 mappView 白屏

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现**：2026-07-20 · 用户现场（Windows）。  
> **落地版本（短期节制）**：**0.3.110** · [Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.110.md) · [007](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)  
> **相关**：性能墙钟/重复取数见 [docs/023-🚧](023-🚧-ReportEditor模拟结批性能回归分析.md)；整机单实例见 [docs/015-✅](015-✅-ReportEditor整机单实例与浏览器访问.md)（**不**解决与 mappView 的 CPU 共存）。

---

# ✅ 已完成：登记现象与代码对照根因（2026-07-20）

## 现象（用户原话）

Windows 上跑当前软件时，**实际结批**会把 CPU 打到约 **100%**，同机 **mappView 浏览器**出现**白屏 / 刷新**（HMI 卡死感）。

## 现场证据（2026-07-20 用户确认）

| 证据 | 结果 |
|------|------|
| 任务管理器：接近 100% 的进程名 | （未填；行为已足够定性） |
| 当时「同时并行导出上限」与启用绑定数 | **均为 4** |
| 模版是否开启超上限拆多份；约多少行、多少 PDF 份 | （未填） |
| 结批反馈/审计：`dataMs` / `readyMs` / `printMs` | （未填） |
| **并行改为 1** 后白屏是否消失或明显减轻 | **白屏消失/明显减轻**；CPU **仍可到 100%**，但 HMI 可共存 |
| 工控机逻辑核数；MariaDB 是否同机 | **Intel i3-7100U**（物理 2C/4T）；**数据库同机**；另用 **Hypervisor，Windows 再少一核** → 有效逻辑核更紧（常见约 2–3） |

### 证据解读

1. 并行 **4→1**：白屏消失 → 证实多路隐藏 Chromium 是 HMI 饿死主因。  
2. 并行=1 时 CPU 仍 100% → 单路 `printToPDF`/大表 DOM 在 i3-7100U（再扣 Hypervisor）上仍会打满；需要**降优先级 + 分卷让出 + 后续减重复取数**，不能只靠并行=1。  
3. 同机 MariaDB + Hypervisor 少核 → CPU/IO 预算极紧，默认并行必须按逻辑核封顶。

## 链路（实际结批 → 吃 CPU）

```text
OPC 结批边沿（约 1s 轮询）
  → pumpExportQueue（并行 ≤ resolve(设置, CPU预算)）
    → Electron 隐藏 BrowserWindow（backgroundThrottling: false）
      → #/pdf-export → 全量 SQL 填充 + 大表 DOM 排版
      → webContents.printToPDF → 写盘
      →（若拆多份）yield → 再取数 / 再 printToPDF
```

## 根因结论（已闭环）

| 优先级 | 结论 | 置信度 |
|--------|------|--------|
| **主因** | 多路并行（现场 4）隐藏 Chromium 不节流 + `printToPDF`，与同机 mappView 抢核 → 白屏 | **已证实**（并行=1 白屏消失） |
| **放大器** | 单路仍满负荷；同机 DB；**Hypervisor 再少一核**；分卷重复全量 SQL（023） | **高** |
| **非主因** | DATA_COLLECTOR 关批自旋忙等 | **低** |

---

# ✅ 已完成：短期 CPU 节制落地（0.3.110）

针对 **i3-7100U + Hypervisor 少一核 + 同机 DB/mappView**：

| 项 | 做法 |
|----|------|
| 默认并行 | `AUTO_EXPORT_MAX_PARALLEL_DEFAULT` / Electron 默认 → **1** |
| CPU 预算封顶 | `export-cpu-budget.ts`：逻辑核 ≤4 → 并行最多 **1**；≤8 → 2；更强 → floor(cores/4)。已保存的「4」在运行时被封顶 |
| Electron | `resolvePdfExportMaxParallel`；导出期间 `os.setPriority(BelowNormal)`；分卷间隙 `yield` 80ms |
| UI | 生成报表高级设置展示 CPU 预算提示 |
| 单测 | `export-cpu-budget.test.ts` U1–U4；并行默认相关断言已改 |

**说明**：并行=1 后 CPU 仍可能到 100%（单路排版/打印固有），但进程优先级低于 HMI，且不再开 4 个导出窗，mappView 不应再白屏。

---

# ⌛️ 未完成：中期继续省 CPU（对齐 023）

- [ ] 分卷：首份全量后内存切片，禁止每份再打全量 SQL  
- [ ] `TemplateExportPreviewStack` 只算当前 `reportPartIndex`  
- [ ] 导出与编辑器预览解耦 / 后台任务化  
- [ ] 可选：结批时降频 OPC 轮询、收缩预热窗  
- [ ] 架构：报表机与 mappView 分离（最稳）

## 验收

- [x] 并行=1 时 mappView 不再白屏（现场已确认）  
- [x] 默认并行 1 + ≤4 核预算封顶 1（含 Hypervisor 少核）  
- [x] 导出期间进程 Below Normal + 分卷 yield  
- [ ] 现场装 0.3.110 后复核：并行设置误留 4 时实际仍为 1；HMI 稳定  
- [ ] （可选）任务管理器确认 Report Editor 优先级「低于正常」

---

## 不做

- 不把 DATA_COLLECTOR 关批改成「降速」当作主修复  
- 本版不改 `printToPDF` 引擎本身（中期项）  
