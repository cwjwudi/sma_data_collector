# ReportEditor：全站架构复评（相对 032）

> 本文件为 **任务看板 / 架构复评**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **复评日期**：2026-07-22 · 代码线 **0.3.117**。  
> **基线评估**：[032-🚧](032-🚧-ReportEditor全站架构评估与统一生命周期.md)（2026-07-20）。  
> **本轮**：只交付复评结论 + 刷新后的分阶段计划；**不改业务代码**（除文档索引）。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [033-✅](033-✅-ReportEditor同机优先pdf-lib缺fontkit导致结批失败.md) · [031-✅](031-✅-ReportEditor历史报表分屏选路径后卡顿.md) · [003](003-⌛️-剩余任务与后续规划.md)。

---

# ✅ 已完成：复评结论（2026-07-22）

## 一句话裁决

| 维度 | 032 初评 | **034 复评** | 变化 |
|------|----------|-------------|------|
| 生命周期一致性 | **2** | **4** | `usePageLifecycle` + 契约 L1–L6/L9；主 keep-alive 页已迁 |
| 导出 / 同机 HMI | **2** | **3.5** | 默认同机优先 pdf-lib；fontkit/仿宋/ERR_FAILED 已修；**硬验收仍开** |
| 导出取数 / 分卷 | **3.5** | **4** | fill-cache；仍全量内存 |
| 主进程卫生 | **2.5** | **3.5** | 卷枚举/缩略图/写盘 async；端口探测等仍 sync |
| keep-alive 正确性 | **2** | **3.5** | AiTools 名一致；**TemplateManager Observer 仍 ensure-only** |
| 可观测 / 审计 | **3** | **4** | `exportMode` / `engine` / `fontEmbedded` 可核验 |
| 表格正确性 / 空间 | **4** | **4** | 无显著回退；盲区仍属产品 |
| **综合** | **≈3.0** | **≈3.7** | 骨架已立；现场零闪与尾项未关 |

**核心问题已从「缺统一 pause」转为**：

1. **现场硬验收未关**（030：同机优先自动结批零闪可操作）。  
2. **B 级尾项**：TemplateManager Observer、Workbench `loadWatch` 离页不停。  
3. **同机优先路径仍经隐藏窗取数** → 残余 HMI 争用风险；版式 draft-v1。  
4. **契约尾项** L7/L8/L10/L11 与手测矩阵未自动化。

---

## 相对 032：已落地对照

| 032 项 | 状态 | 版本 |
|--------|------|------|
| P0-A～E 生命周期骨架 + L1–L4/L9 | ✅ | 0.3.112 |
| P1-A～E Observer/缩略图/写盘/取消/023 | ✅ | 0.3.113 |
| P2-B 旁路 printToPDF（选型→实现） | ✅ 代码 | 0.3.114～115 |
| fontkit / 默认字体 UI | ✅ | 0.3.116 |
| 仿宋随包 + ERR_FAILED 重建 | ✅ | 0.3.117 |
| 030 硬验收（8k/≥4 份零闪） | ⌛️ 现场 | — |
| 契约 L7/L8/L10/L11/L12 | ⌛️ | — |

---

## 路由 × keep-alive × 持续任务（复评表）

`MainLayout` include 不变：`Dashboard` · `DataSourceConfig` · `TemplateManager` · `LayoutPresets` · `SignaturesLibrary` · `ReportGenerator` · `ReportHistory` · `AiTools` · `Settings`。

| 路由 | keep-alive | 持续任务 | lifecycle | 复评风险 |
|------|------------|----------|-----------|----------|
| Dashboard | 是 | FieldOps 1s | ✅ `usePageLifecycle('Dashboard')` | 低 |
| DataSourceConfig | 是 | 页内探活；OPC 浏览 | ✅ pause；侧栏 A 级另路 | 中（L7/L8；Workbench） |
| TemplateManager | 是 | 卡片 IntersectionObserver | ❌ 仍 **ensure-only**；deactivated 只持久化缓存 | **中** |
| LayoutPresets | 是 | Observer | ✅ restart（P1-A） | 低 |
| SignaturesLibrary | 是 | Observer | ✅ restart（P1-A） | 低 |
| ReportGenerator | 是 | 图表 1s | ✅ chart-refresh B 级 | 低 |
| ReportHistory | 是 | 分屏 5s 卷枚举 | ✅ page-focus；async | 低–中（V 手测） |
| Settings | 是 | 无页轮询 | — | 低 |
| AiTools | 是 | — | name=`AiTools` ✅ | 低 |
| TemplateEditor 等 | 否 | 绑定 live poll | 离开即毁 | 低 |
| PdfExport（壳外） | 否 | 心跳；预热池 | 独立窗；ERR_FAILED 可重建 | 中（030） |

### A 级白名单（跨页不停 · 复评确认）

| 任务 | 位置 |
|------|------|
| OPC 自动结批 | `report-auto-export-trigger-service.ts` |
| PLC 心跳 | `plc-heartbeat-service.ts` |
| PDF 预热窗 + 5min 保活 | `electron/main.cjs` |
| 侧栏连接探活（用户开启） | `MainLayout.vue` |
| 应用更新定时检查 | `appUpdateState.ts` |

---

## 新发现缺口（032 未单列或未关）

| ID | 缺口 | 证据 | 建议级 |
|----|------|------|--------|
| **G1** | 030 硬验收未关 | 看板验收框仍空；需装 ≥0.3.117 | **P0 现场** |
| **G2** | TemplateManager Observer ensure-only | `ensureCardObserver` + `onActivated` 只 ensure；无 restart | **P1** |
| **G3** | DatabaseWorkbench `loadWatch` 离页不停 | `onDeactivated` 只 `persistWorkbenchSession`，`stopLoadWatch` 仅 `onUnmounted` | **P1** |
| **G4** | 契约 L7/L8/L10/L11 + 取消钮 UI + V 手测 | `page-lifecycle-contracts.test.ts` 未含 L7+ | **P1** |
| **G5** | 同机优先仍经隐藏窗取数 | `PdfExportView` + 预热窗；pdf-lib 只旁路 printToPDF | **P2** |
| **G6** | pdf-lib 版式 draft-v1；表格盲区；全量内存 | 030/002 | **P2 / 🧭** |

### 主进程 sync 残留（非导出热路径为主）

| 位置 | 用途 | 判断 |
|------|------|------|
| `main.cjs` 端口/进程探测 `execFileSync` | 启动杀僵后端 | 冷路径；可逐步 async |
| `dialog-pick-config-json` `readFileSync` | 用户选备份 | 用户触发；可接受 |
| 缩略图 / 写盘 / 可移动卷 | — | ✅ 已 promises / 队列 |

---

## 统一方法（沿用 032，不重开体系）

- **A/B/C 分级**与 `usePageLifecycle` 契约不变。  
- **禁止**再开「页面跳转排列组合」散看板；新症状并入本复评里程碑或 032/030。  
- keep-alive **默认不进**；进名单必须 lifecycle + L1。

---

# ⌛️ 未完成：复评后执行序（固定）

## P0 — 现场闭环（不改架构，关验收）

| ID | 目标 | 验收 |
|----|------|------|
| P0-V1 | 装 **0.3.117** Win；同机优先自动结批 | 8k/≥4 份：**零闪、可操作**；审计 `printToPDFSkipped` + `fontEmbedded` |
| P0-V2 | （可选）版式优先对照 | 预期更易闪 → 证明同机优先必要 |

## P1 — 尾项卫生（下一刀代码）

| ID | 目标 | 手段 |
|----|------|------|
| P1-T1 | TemplateManager Observer | 对齐 029 `restart` + lifecycle 注册 |
| P1-T2 | Workbench loadWatch | `onDeactivated` → `stopLoadWatch`；activated 按需再启 |
| P1-T3 | 契约 L7/L8/L10（+L11 抽样） | 源码/行为门禁入库 |
| P1-T4 | 导出取消 UI 可见性 | 结批进行中可点取消（P1-D 尾） |

## P2 — 中长期（不变）

| ID | 目标 |
|----|------|
| P2-B′ | pdf-lib 版式渐进对齐；评估取数是否可脱离隐藏 Chromium |
| P2-C | 表格盲区（🧭 先拍板） |
| P2-D | 大表不全量进内存 / 估高 E2E |

---

# ⌛️ 未完成：契约测刷新

| ID | 断言 | 状态 |
|----|------|------|
| L1–L6、L9 | 见 032 / `page-lifecycle-contracts.test.ts` | ✅ |
| L7 | 离开 datasource：页内探活停、侧栏可启、不同时双跑 | ⌛️ |
| L8 | OpcUaPanel：父页 deactivated → 清浏览轮询 | ⌛️ |
| L10 | `backgroundThrottling: false` 仅白名单 | ⌛️ |
| L11 | dispose 自动结批 / PLC 心跳清理 | ⌛️ |
| L12 | 手测：结批中切历史（B 应 pause）+ 031 V | ⌛️ |
| L13（新） | TemplateManager Observer 非 ensure-only | ⌛️ |
| L14（新） | DatabaseWorkbench deactivated 停 loadWatch | ⌛️ |

---

## 不做（本复评轮）

- 不改业务代码（仅文档 + 索引）。  
- 不重开一套与 032 冲突的生命周期体系。  
- 不把缓解包（yield/绑核）单独写成达标。  

## 与 032 / 003 的关系

- **032**：P0/P1 执行史与方法原文仍有效；头部应链到本复评。  
- **003**：推进顺序以本复评 **P0-V → P1-T → P2** 为准。  
