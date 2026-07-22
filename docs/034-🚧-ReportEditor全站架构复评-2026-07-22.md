# ReportEditor：全站架构复评（相对 032）

> 本文件为 **任务看板 / 架构复评**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **复评日期**：2026-07-22 · 代码线 **0.3.118**（M1–M7 已落）。  
> **基线评估**：[032-🚧](032-🚧-ReportEditor全站架构评估与统一生命周期.md)（2026-07-20）。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [033-✅](033-✅-ReportEditor同机优先pdf-lib缺fontkit导致结批失败.md) · [031-✅](031-✅-ReportEditor历史报表分屏选路径后卡顿.md) · [003](003-⌛️-剩余任务与后续规划.md)。

---

# ✅ 已完成：复评结论（2026-07-22）

## 一句话裁决

| 维度 | 032 初评 | **034 复评** | 变化 |
|------|----------|-------------|------|
| 生命周期一致性 | **2** | **4** | `usePageLifecycle` + 契约 L1–L6/L9；主 keep-alive 页已迁 |
| 导出 / 同机 HMI | **2** | **3.5** | 默认同机优先 pdf-lib；fontkit/仿宋/ERR_FAILED 已修；硬验收见下 |
| 导出取数 / 分卷 | **3.5** | **4** | fill-cache；仍全量内存 |
| 主进程卫生 | **2.5** | **3.5** | 卷枚举/缩略图/写盘 async；端口探测等仍 sync |
| keep-alive 正确性 | **2** | **4** | AiTools 名一致；**TemplateManager Observer 已 teardown+restart（0.3.118）** |
| 可观测 / 审计 | **3** | **4** | `exportMode` / `engine` / `fontEmbedded` 可核验 |
| 表格正确性 / 空间 | **4** | **4** | 无显著回退；盲区仍属产品 |
| **综合** | **≈3.0** | **≈3.9** | M1–M7 已落；030 硬验收仍挂起；PDF 预览级交付见 M11 |

**核心问题已从「缺统一 pause / B 级尾项」转为**：同机优先版式（M11）、取数与隐藏窗解耦、030 硬验收解挂。

## 拍板补充（2026-07-22）

| 项 | 决定 |
|----|------|
| 030 **8k/≥4 份自动结批零闪**硬验收 | **临时挂起**（不阻塞架构平复代码刀） |
| 当前优先 | **M1–M7 ✅ 0.3.118**；下一刀 **M11**（预览级 PDF）+ 可选 M8–M10 |
| **PDF 交付标准** | **必须与预览一致**；**不接受** pdf-lib `draft-v1` 草稿作为交付（见 [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)） |
| 原策略 A「先零闪、草稿版式渐进」 | **版式侧已否决草稿交付**；同机零闪仍挂起，但不得再默认用草稿 PDF 交差 |

---

## 相对 032：已落地对照

| 032 项 | 状态 | 版本 |
|--------|------|------|
| P0-A～E 生命周期骨架 + L1–L4/L9 | ✅ | 0.3.112 |
| P1-A～E Observer/缩略图/写盘/取消/023 | ✅ | 0.3.113 |
| P2-B 旁路 printToPDF（选型→实现） | ✅ 代码 | 0.3.114～115 |
| fontkit / 默认字体 UI | ✅ | 0.3.116 |
| 仿宋随包 + ERR_FAILED 重建 | ✅ | 0.3.117 |
| **M1–M7** 架构平复（Observer/loadWatch/L7–L11/取消 UI） | ✅ | **0.3.118** |
| 030 硬验收（8k/≥4 份零闪） | ⏸ **临时挂起** | — |
| 契约 L12（手测） | ⌛️ | — |

---

## 路由 × keep-alive × 持续任务（复评表）

`MainLayout` include：`Dashboard` · `DataSourceConfig` · `TemplateManager` · `LayoutPresets` · `SignaturesLibrary` · `ReportGenerator` · `ReportHistory` · `AiTools` · `Settings`。

| 路由 | keep-alive | 持续任务 | lifecycle | 复评风险 |
|------|------------|----------|-----------|----------|
| Dashboard | 是 | FieldOps 1s | ✅ | 低 |
| DataSourceConfig | 是 | 页内探活；OPC 浏览 | ✅ pause；侧栏 A 另路 | 低（L7/L8/L14 ✅） |
| TemplateManager | 是 | 卡片 IntersectionObserver | ✅ teardown+restart | 低 |
| LayoutPresets / SignaturesLibrary | 是 | Observer | ✅ restart | 低 |
| ReportGenerator | 是 | 图表 1s | ✅ | 低 |
| ReportHistory | 是 | 分屏 5s 卷枚举 | ✅ page-focus | 低–中 |
| Settings / AiTools | 是 | — | 名一致 / 无页轮询 | 低 |
| PdfExport（壳外） | 否 | 心跳；预热池 | 独立窗 | 中（030 挂起） |

### A 级白名单（跨页不停）

| 任务 | 位置 |
|------|------|
| OPC 自动结批 | `report-auto-export-trigger-service.ts` |
| PLC 心跳 | `plc-heartbeat-service.ts` |
| PDF 预热窗 + 5min 保活 | `electron/main.cjs` |
| 侧栏连接探活（用户开启） | `MainLayout.vue` |
| 应用更新定时检查 | `appUpdateState.ts` |
| AI pending 轮询 | `AiPendingPromptDialog.vue` |

---

# ✅ 已完成：架构平复 M1–M7（0.3.118 · 2026-07-22）

| ID | 改什么 | 验收 | 状态 |
|----|--------|------|------|
| **M1** | TemplateManager 卡片 Observer：`tm-card-observer` pause=teardown / resume=restart | **L13** | ✅ |
| **M2** | Workbench `loadWatch`：`onDeactivated` 停 | **L14** | ✅ |
| **M3** | 页内探活 vs 侧栏探活互斥契约 | **L7** | ✅ |
| **M4** | OpcUaPanel `browsePollingAllowed` 门闩 | **L8** | ✅ |
| **M5** | `backgroundThrottling: false` 仅主窗+导出窗 | **L10** | ✅ |
| **M6** | A 级 dispose 清 timer/解绑可测 | **L11** | ✅ |
| **M7** | 手动/自动结批进行中「取消」接 `cancelPdfExport` | toast/按钮 | ✅ |

# 🚧 进行中：随后改动清单（需改代码）

> **原则**：沿用 032 A/B/C + `usePageLifecycle`；禁止新开「跳转组合」散看板。

## 下一刀（P1.5 · 同机友好，非 8k 硬验收）

| ID | 改什么 | 主要文件 | 做法 | 验收 |
|----|--------|----------|------|------|
| **M8** | 结批期降噪（可选 A 降载） | `MainLayout.vue`、导出 active 信号、可选 Dashboard | `pdfExportActiveCount>0`（或渲染侧导出中）时：**暂停侧栏探活 / Dashboard tick / AI pending**；**不停**自动结批与 PLC 心跳 | 结批中侧栏探活停；结批结束恢复；结批本身不停 |
| **M9** | 预热池可配（弱机） | `electron/main.cjs`、设置 prefs | 弱机可 `poolSize=0` 或同机优先不预热 Chromium；默认行为不变 | 配置生效；默认路径回归绿 |
| **M10** | 主进程冷路径去 sync | `electron/main.cjs` | 后端端口探测改 async `execFile`；备份读/日志写优先 `fs.promises`（用户触发路径可后做） | 热路径契约仍绿；启动不堵事件环 |

## 中长期（P2 · 不阻塞平复）

| ID | 改什么 | 说明 |
|----|--------|------|
| **M11** | **预览级 PDF 交付**（否决 draft 交差） | 用户 2026-07-22：不要 pdf-lib 草稿，要与预览一致。见 [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。路径候选：默认可切回版式优先（chromium）；或预览 DOM→PDF 且同机负载可接受。**不是**「把 draft-v1 修到凑合」 |
| **M12** | 取数与隐藏 Chromium 解耦 | 评估同机优先下取数是否可不出预热窗 |
| **M13** | 大表不全量内存 / 估高 E2E | 配合 002/023 |
| **M14** | 表格盲区 | 🧭 先产品拍板（合并格等） |

## ⏸ 临时挂起（不排进当前代码刀）

| ID | 项 | 说明 |
|----|----|------|
| **G1 / P0-V** | 030：生产 ≈8k / ≥4 份自动结批 **零闪可操作** | 用户 2026-07-22：**临时挂起**；M1–M7 已落，解挂前建议先关 **M11**（及按需 M8–M10）。细节见 [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。 |
| P0-V2 | 版式优先对照闪屏 | 随硬验收一并解挂 |

---

# ⌛️ 未完成：契约测清单（与改动清单对齐）

| ID | 断言 | 对应改动 | 状态 |
|----|------|----------|------|
| L1–L6、L9 | 见 `page-lifecycle-contracts.test.ts` | — | ✅ |
| L7 | 离开 datasource：页内探活停、侧栏可启、不同时双跑 | M3 | ✅ 0.3.118 |
| L8 | OpcUaPanel：父页 deactivated → 浏览轮询保持停 | M4 | ✅ 0.3.118 |
| L10 | `backgroundThrottling: false` 仅白名单 | M5 | ✅ 0.3.118 |
| L11 | dispose 自动结批 / PLC 心跳清理 | M6 | ✅ 0.3.118 |
| L12 | 手测：结批中切历史（B pause）+ 031 V | 手测 | ⌛️ |
| L13 | TemplateManager Observer 非 ensure-only | M1 | ✅ 0.3.118 |
| L14 | DatabaseWorkbench deactivated 停 loadWatch | M2 | ✅ 0.3.118 |

---

## 统一方法（沿用 032）

- A/B/C 分级与 `usePageLifecycle` 契约不变。  
- keep-alive 默认不进；进名单必须 lifecycle + L1。  
- 禁止再开「页面跳转排列组合」散看板。

## 与 032 / 003 / 030 的关系

- **032**：方法与 P0/P1 执行史原文仍有效。  
- **003**：推进序 = **M1–M7 ✅ →（可选 M8–M10）→ M11 预览级 PDF → 解挂 030 硬验收 → P2**。  
- **030**：8k 零闪硬验收标 ⏸；PDF 交付须与预览一致（否决 draft 交差）。  

