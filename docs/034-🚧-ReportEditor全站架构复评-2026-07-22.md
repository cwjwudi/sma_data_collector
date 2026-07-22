# ReportEditor：全站架构复评（相对 032）

> 本文件为 **任务看板 / 架构复评**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **复评日期**：2026-07-22 · 代码线 **0.3.133**（M1–M7 / M10 / M11 ✅；**035 五档** + layout-v2 + 正文底色；本机 H1–H5 ✅）。  
> **基线评估**：[032-🚧](032-🚧-ReportEditor全站架构评估与统一生命周期.md)（2026-07-20）。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [035-🚧](035-🚧-ReportEditor导出性能档位与同机降载.md) · [036-✅](036-✅-ReportEditor矢量档与预览稳样式对照.md) · [033-✅](033-✅-ReportEditor同机优先pdf-lib缺fontkit导致结批失败.md) · [031-✅](031-✅-ReportEditor历史报表分屏选路径后卡顿.md) · [003](003-⌛️-剩余任务与后续规划.md)。

---

# ✅ 已完成：复评结论（2026-07-22）

## 一句话裁决

| 维度 | 032 初评 | **034 复评** | 变化 |
|------|----------|-------------|------|
| 生命周期一致性 | **2** | **4** | `usePageLifecycle` + 契约 L1–L6/L9；主 keep-alive 页已迁 |
| 导出 / 同机 HMI | **2** | **4** | **默认档 2「预览稳」**（chromium）；档 0/1 为 pdf-lib 救急/矢量；030 零闪仍挂起 |
| 导出取数 / 分卷 | **3.5** | **4** | fill-cache；仍全量内存 |
| 主进程卫生 | **2.5** | **4** | 卷枚举/缩略图/写盘 + **端口探测 / 备份读 / 日志写 async（M10 · 0.3.133）** |
| keep-alive 正确性 | **2** | **4** | AiTools 名一致；**TemplateManager Observer 已 teardown+restart（0.3.118）** |
| 可观测 / 审计 | **3** | **4** | `exportMode` / `engine` / `fontEmbedded` / 五档可核验 |
| 表格正确性 / 空间 | **4** | **4** | 无显著回退；盲区仍属产品 |
| **综合** | **≈3.0** | **≈4.3** | M1–M7+M10+M11+**035 五档（M8/M9）**；本机 H1–H5 ✅；030 零闪 / H6–H7 现场仍挂 |

**核心问题已从「缺统一 pause / 草稿默认交付 / 无性能档」转为**：现场同机（035 H6/H7 + 030 解挂）、手测 L12，以及中长期 M12–M14。

## 拍板补充（2026-07-22）

| 项 | 决定 |
|----|------|
| 030 **8k/≥4 份自动结批零闪**硬验收 | **临时挂起** |
| 当前优先 | **M1–M7 / M10 / M11 / 035（M8/M9）✅**；下一刀现场 **035 H6/H7** + **L12** |
| **PDF 交付标准** | **必须与预览一致**；交付用档 2–4（chromium）；**不接受**档 0 `draft-v1` 作交付；档 1 矢量见 [036](036-✅-ReportEditor矢量档与预览稳样式对照.md) |
| 原策略 A「先零闪、草稿版式渐进」 | **已否决**；默认预览稳；档 0 仅救急 |

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
| M1–M7 **行为测补全**（gate/cancel-ui/KeepAlive 探针） | ✅ | **0.3.119** |
| **M11** 预览级 PDF 默认（chromium；一次性迁移） | ✅ | **0.3.119** |
| **035 / M8–M9** 导出性能 **五档**（默认预览稳）+ 结批降载/预热按档 | ✅ 本机 | **0.3.121～0.3.132**（H6/H7 现场 ⌛️） |
| **036** 矢量档 ↔ 预览稳样式 | ✅ 主路径 | **0.3.126～0.3.131** |
| **M10** 主进程冷路径去 sync | ✅ | **0.3.133** |
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
| 侧栏连接探活（用户开启） | `MainLayout.vue`（结批 `coexistPause=full` 时暂停，见 035 H5） |
| 应用更新定时检查 | `appUpdateState.ts` |
| AI pending 轮询 | `AiPendingPromptDialog.vue`（结批 full 降载时跳过） |

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

# ✅ 已完成：M11 预览级 PDF 默认（0.3.119）

| 项 | 做法 |
|----|------|
| 默认引擎 | `pdfExportEngine=chromium`（版式优先 / `exportMode=fidelity`） |
| 旧配置迁移 | `pdfExportPreviewDefaultMigratedV1`：一次性把旧默认 pdf-lib → chromium |
| UI | 「版式优先」置前为默认；「同机优先（草稿）」标明不可作现场交付 |
| 主进程 | 缺省/未知 → chromium；仅显式 `pdf-lib` 走草稿 |

# ✅ 已完成：导出性能五档（收编 M8/M9 · 见 035 · 至 0.3.132）

> **主看板**：[035-🚧](035-🚧-ReportEditor导出性能档位与同机降载.md)。  
> **拍板（已落地）**：**5** 档分段切换；默认 **档 2「预览稳」**；替代同机/版式双 Tab。  
> （历史：0.3.120 曾短暂为 4 档「默认均衡」，0.3.121 起改为五档。）

| 原 ID | 归入 035 | 说明 | 状态 |
|-------|----------|------|------|
| **M8** | 结批降载 | `coexistPause` full/basic；探活/AI pending 暂停 | ✅ 本机 H5 |
| **M9** | 预热按档 | `prewarmPoolSize` 0/1/2；档 0–2 拆空闲预热窗 | ✅ 本机 H5 |
| **M11 叙事** | 默认档 2 | chromium 预览级；产品名为性能档位 | ✅ |

档位：0 仅内容 · 1 矢量版式 · **2 预览稳（默认）** · 3 功能折中 · 4 不妥协。样式对照见 [036-✅](036-✅-ReportEditor矢量档与预览稳样式对照.md)。

# ✅ 已完成：M10 主进程冷路径去 sync（0.3.133）

| 项 | 做法 |
|----|------|
| 端口探测 | `commandForPid` / `backendListenerPid` → `promisify(execFile)`；`stopStaleBundledBackendIfUnhealthy` 全 await |
| 备份 / 日志 IPC | `dialog-pick-config-json` / `dialog-save-text` / 启动快照 / 删导出文件 → `fs.promises` |
| 五档批导收尾 | `pruneFiveTierExportHistory` + summary 写盘 → async |
| 契约 | `page-lifecycle-contracts` **M10**（无 `execFileSync`；备份/日志 IPC 用 promises） |

# 🚧 进行中：随后改动清单

> **原则**：沿用 032 A/B/C + `usePageLifecycle`；禁止新开「跳转组合」散看板。

## 下一刀

| ID | 改什么 | 说明 |
|----|--------|------|
| **035 H6/H7** | 现场同机 | mappView / 高负载；与 030 解挂一并做（非本机阻塞） |
| **L12** | 手测 | 结批中切历史（B pause）+ 031 V |

## （原 P1.5 表 · 已迁移）

| ID | 改什么 | 主要文件 | 做法 | 验收 |
|----|--------|----------|------|------|
| **M8** | → 035 | 见 035 | 结批降载 | ✅ 035 H5 |
| **M9** | → 035 | 见 035 | 预热按档 | ✅ 035 H5 |
| **M10** | 主进程冷路径去 sync | `electron/main.cjs` | 后端端口探测改 async `execFile`；备份读/日志写优先 `fs.promises` | ✅ 0.3.133（契约 M10） |

## 中长期（P2）

| ID | 改什么 | 说明 |
|----|--------|------|
| **M11** | **预览级 PDF 交付** | ✅ **0.3.119**（默认版式优先；草稿 opt-in） |
| **M12** | 取数与隐藏 Chromium 解耦 | 评估同机优先下取数是否可不出预热窗 |
| **M13** | 大表不全量内存 / 估高 E2E | 配合 002/023 |
| **M14** | 表格盲区 | 🧭 先产品拍板（合并格等） |

## ⏸ 临时挂起（不排进当前代码刀）

| ID | 项 | 说明 |
|----|----|------|
| **G1 / P0-V** | 030：生产 ≈8k / ≥4 份自动结批 **零闪可操作** | 用户 2026-07-22：**临时挂起**；M11 + 035 五档（M8/M9）已落；解挂时用默认档 2，仍断试档 1（035 H7）。细节见 [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。 |
| P0-V2 | 预览稳档对照闪屏 | 随硬验收一并解挂 |

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
| L13 | TemplateManager Observer 非 ensure-only | M1 | ✅ 0.3.118；行为探针 ✅ 0.3.119 |
| L14 | DatabaseWorkbench deactivated 停 loadWatch | M2 | ✅ 0.3.118；activate 策略单测 ✅ 0.3.119 |

---

# 🖥 手测清单（应用内）

> CI 已覆盖契约 + 行为单测；五档本机项见 **035 H1–H5 ✅**；下列为架构复评残留手测。

## A. 导出性能五档（M11 + 035 · 本机已齐）

1. ~~默认预览稳~~ → ✅ 035 H1（`exportPerfTier=2`）。  
2. ~~档 0 仅内容草稿~~ → ✅ 035 H2。  
3. ~~档 1 矢量 / 档 2–4 预览级~~ → ✅ 035 H3/H4；样式见 036。  
4. ~~结批降载 / 拆预热~~ → ✅ 035 H5。  
5. **现场**：自动结批 + mappView（035 H6）；高负载试档 2→1（035 H7）。

## B. 生命周期 / 取消（M1–M7 · 抽测）

6. **模版管理**：进入列表滚到懒渲染区 → 切到其他页再回 → 首屏卡片应能继续懒渲染（无「永远空白」）。  
7. **数据源**：空连接列表监视中离开页 → 后台不应持续刷连接；再回来且仍空未确认时可恢复监视。  
8. **OPC 浏览轮询**：开启浏览轮询 → 离开数据源页 → 轮询停；回页后按开关恢复。  
9. **取消导出**：手动结批进行中点「取消」（按钮或 toast）→ 不再写盘完成；toast 提示已取消。自动结批进度 toast 同理（有 jobId 后出现取消）。  
10. **L12**：结批进行中切到历史报表分屏 → 页面可操作；结批本身不停（B pause 不影响 A 级结批）。

## C. 回归风险（预览稳默认后 · 现场）

11. 同机有 mappView 时：用档 2 导出 1～2 份，**观察是否闪屏**（预期可能闪；记现象，硬验收仍挂起）。  
12. 审计/状态行：成功导出应出现档位 / `chromium` 或 `pdf-lib` / `layoutFidelity`（交付档非 draft-v1）。

---

## 统一方法（沿用 032）

- A/B/C 分级与 `usePageLifecycle` 契约不变。  
- keep-alive 默认不进；进名单必须 lifecycle + L1。  
- 禁止再开「页面跳转排列组合」散看板。

## 与 032 / 003 / 030 / 035 的关系

- **032**：方法与 P0/P1 执行史原文仍有效。  
- **003**：推进序 = **M1–M7 ✅ → M11 ✅ → [035](035-🚧-ReportEditor导出性能档位与同机降载.md) 五档 ✅（本机）→ M10 ✅ → 解挂 030 / H6–H7 → P2**。  
- **030**：8k 零闪硬验收标 ⏸；同机降载与档位见 035。  
- **035**：导出性能 **五档**（默认预览稳）主看板；本机 H1–H5 ✅；H6/H7 现场。  
- **036**：矢量 ↔ 预览稳样式对照 ✅。  




