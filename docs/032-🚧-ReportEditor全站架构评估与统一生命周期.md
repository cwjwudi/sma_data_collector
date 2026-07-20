# ReportEditor：全站架构评估 · 统一页面生命周期 · 表格/导出债总览

> 本文件为 **任务看板 / 架构裁决**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现 / 评估**：2026-07-20 · 用户要求：不再逐页排列组合打补丁，统一审查跳转与更新，并覆盖表格空间、剩余计划、整体代码评估。  
> **流程**：本轮交付评估 + 统一方法 + 分阶段修复计划；**不在本轮改业务代码**（除文档）。  
> **关联**：跳转/卡顿 [031](031-✅-ReportEditor历史报表分屏选路径后卡顿.md) · 结批 CPU [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · 缩略图 [029](029-✅-ReportEditor历史报表缩略图懒加载不触发.md) · 表格 [002](002-🚧-表格系统评估与修复.md) · 索引 [003](003-⌛️-剩余任务与后续规划.md)。  
> **落地进度**：P0 代码已入 **0.3.112**；P1/P2 与手测矩阵仍开。

---

# ✅ 已完成：全站审计结论与统一方法（2026-07-20）

## 一句话裁决

| 维度 | 分数 (1–5) | 裁决 |
|------|------------|------|
| 表格正确性（版式/切页/行内断行） | **4** | 002 主干已还清；盲区是产品能力非崩溃 |
| 「表格空间」偏移/欠缩放 | **4** | [019](019-✅-ReportEditor导出PDF纸张外框.md) 已关；非布局漂移 |
| 导出取数/分卷 | **3.5** | 0.3.111 去二次曲线；仍全量内存 + DOM `printToPDF` |
| PDF/资源引擎 | **2** | 同机弱 CPU + HMI 本质冲突未解 |
| 页面跳转 / keep-alive 生命周期 | **2** | **系统性缺 `onDeactivated` pause**；逐页修会无穷组合 |
| Electron 主进程调度 | **2.5** | 导出已节制；`execFileSync`/`readFileSync` 热路径仍堵 |
| **综合** | **≈ 3.0** | 正确性偏强，**可运营/同机共存/生命周期**偏弱 |

**核心问题不是「某个页面组合没测到」**，而是：**缺少统一的「页可见任务 / 应用级任务」分层**，keep-alive 只清 `onUnmounted`，离开页后定时器与主进程同步 IPC 仍跑。

---

## 路由 × keep-alive × 持续任务（审计表）

`MainLayout` include：`Dashboard` · `DataSourceConfig` · `TemplateManager` · `LayoutPresets` · `SignaturesLibrary` · `ReportGenerator` · `ReportHistory` · `AiTools` · `Settings`。

| 路由 name | keep-alive | 持续任务 | activated / deactivated | 风险 |
|-----------|------------|----------|-------------------------|------|
| Dashboard | 是 | FieldOps 1s tick | 有 activated；**无 deactivated 停表** | 中 |
| DataSourceConfig | 是 | 页内探活；OPC 浏览轮询 | **0.3.112** lifecycle pause | 中（侧栏探活另路） |
| TemplateManager | 是 | IntersectionObserver | activated + deactivated（弱） | 低–中 |
| LayoutPresets | 是 | Observer ensure-only | 无 deactivated；**029 同类风险** | 中 |
| SignaturesLibrary | 是 | Observer ensure-only | 无 deactivated；029 触发页 | 中 |
| ReportGenerator | 是 | 页内图表 1s | **0.3.112** lifecycle（L9 金样） | 低（页内） |
| ReportHistory | 是 | 分屏 5s → **async 枚举** | **0.3.112** page-focus | 低–中（缩略图 P1） |
| Settings | 是 | 无页级轮询 | — | 低 |
| AiTools | 是 | — | **0.3.112** name=`AiTools` | 低 |
| TemplateEditor / LayoutPresetEditor / AuditLog | 否 | 离开即毁 | 合理 | 低 |
| PdfExport（壳外） | 否 | 导出心跳；预热窗 | 独立窗 | 中（030） |

**应用级（必须跨页存活，须显式白名单）**：OPC 自动结批 1s、PLC 心跳、PDF 预热窗、`backgroundThrottling: false`（主窗/预热窗）。

---

## 跨页面共性 Top 5（必须体系化修）

1. **keep-alive 缺统一 pause** — 只停 `onUnmounted`；历史/数据源/Dashboard/版式签名均中招。  
2. **主进程 sync 进热路径** — `execFileSync`（可移动卷）、缩略图 `readFileSync`。  
3. **探活双通道** — 离开 `/datasource` 后侧栏恢复探活，页内 timer 因 keep-alive 不停。  
4. **Observer ensure-only** — 029 只修了历史；Layout/签名仍有「重回不回调」风险。  
5. **永不节流 + 多定时器叠加** — 结批必要例外未与「页级任务」隔离管理。

---

## 统一方法（严谨，禁止再逐页打补丁）

### 任务分级

| 级别 | 含义 | 离开页 | 最小化/失焦 | 示例 |
|------|------|--------|-------------|------|
| **A 应用级** | 跨页业务必须可用 | **不停** | **不停** | OPC **自动结批**、PLC 心跳、PDF 预热渲染、（用户开启时）**侧栏连接探活** |
| **B 页可见** | 只服务当前页 UI | **必须 pause** | 见下表分项 | 历史分屏 U 盘轮询、数据源**页内**探活、OPC **浏览树**轮询、生成页图表 UI tick |
| **C 一次性** | 可取消 | cancel in-flight | — | 扫目录、单次缩略图 |

> **硬约束（2026-07-20 用户拍板）**：不能因为「不在某页 / 最小化 / 在别的页」导致结批失败。A 级与页面路由解耦；B 级停的是页内辅助，不是整页业务能力作废。

### 产品拍板（生命周期 · 2026-07-20）

| # | 结论 |
|---|------|
| 1 | **结批 / 心跳**：任意页面 + 最小化都必须继续 → **A 级** |
| 2 | **历史分屏 U 盘轮询**：离开历史页或退出分屏 → **停**；回到历史且仍分屏 → **再启** |
| 3 | **数据源 OPC 浏览轮询**：离开数据源页 → **停**；侧栏探活若用户开着 → **可继续（A）**；页内探活离开页 → **停** |
| Q4′ | **最小化时**：历史分屏 U 盘轮询 → **停**（结批仍跑）→ 选 **A** |
| Q3 | keep-alive **现有名单可保留**；缓存 ≠ 乱跑任务；用 lifecycle 管 B 级（等价原确认清单 Q3=A） |

### `usePageLifecycle`（契约）

所有 **进入 keep-alive 的页面**必须：

1. `defineOptions({ name })` **与** MainLayout `include` **完全一致**（CI 校验）。  
2. 用 `usePageLifecycle(pageId)` **注册**所有 B 级任务的 `pause`/`resume`；**禁止**把 A 级任务注册成 B 级。  
3. `onActivated` → resume B；`onDeactivated` + `onUnmounted` → pause B；历史分屏另在 **visibility/minimize** 时 pause（Q4′=A）。  
4. **金样**：`ReportGenerator` 图表 timer = B 级；同页背后的自动结批服务 = A 级（已在应用壳，不随 deactivated 停）。

### 主进程硬规则

- 轮询 / 缩略图热路径：**禁止** `execFileSync` / 大文件 `readFileSync`。  
- IPC handler 必须 async + in-flight 跳过/缓存。  
- `backgroundThrottling: false` **仅白名单窗口**（主窗结批理由 + PDF 预热）；CI 扫描新增违规。

### keep-alive 准入

- **默认不进** keep-alive。  
- 要进：必须登记 lifecycle 表 + 契约测 L1/L2 通过。  
- 修 `AiTools` ↔ `AiToolsPage` 名不一致。

---

## 「表格空间」与导出（对照用户历史问题）

| 问题 | 状态 | 架构层是否还开着 |
|------|------|------------------|
| PDF 欠缩放 / 表格右偏感 | ✅ 019 / 0.3.98 | **已关** |
| 行内超页裁字 | ✅ 0.3.108 | 导出已关；画布上界是产品决策 |
| SQL 高度正文/版式漂移 | ✅ 0.3.106 | 行为对齐；双系 height API 维护债 |
| 分卷重复全量 SQL | ✅ 缓 0.3.111 | **取数重复已关**；全量内存仍开 |
| 结批抢核白屏 | 🚧 030 | 症状缓解；引擎未换 |
| 分屏拖窗卡顿 | ✅ 031 / 0.3.112 | async + page-focus；缩略图并发仍 P1 |

表格盲区（合并格等）仍属 🧭 产品决策，见 002。

---

# ⌛️ 未完成：分阶段修复计划（执行顺序固定）

> **原则**：先落地「统一生命周期骨架 + 契约测」，再迁现有页面；禁止再开「只修某一跳转组合」的散看板（031/029 类症状并入本计划里程碑）。

## ✅ P0 — 骨架 + 止血（0.3.112）

| ID | 目标 | 手段 | 验收 |
|----|------|------|------|
| P0-A ✅ | 统一生命周期 | `usePageLifecycle` + 注册表 | 单测绿 |
| P0-B ✅ | keep-alive 名一致 | AiTools name；L1 | L1 绿 |
| P0-C ✅ | 031 止血 | async 卷枚举；page-focus 停表；5s；in-flight | L3/L4 绿；V 手测 ⌛️ |
| P0-D ✅ | 数据源探活互斥 | 页内探活 + OPC 浏览 pause；侧栏另路 | 源码接线；L7/L8 加强 ⌛️ |
| P0-E ✅ | 契约测底线 | L1–L4、L9 入库 | CI 必跑 |

## P1 — 全量迁移 B 级任务 + 主进程卫生

| ID | 目标 | 手段 | 验收 |
|----|------|------|------|
| P1-A | Dashboard / Layout / 签名 Observer | 全员接入 lifecycle；Observer 对齐 029 restart | 切页无泄漏；签名→历史缩略图仍出 |
| P1-B | 缩略图并发上限 | 全局队列 ≤2–3；失败勿堵主进程 | 031 U3/V4 |
| P1-C | 导出写盘异步 | `fs.promises.writeFile` | 多分卷时 UI 不周期性僵 |
| P1-D | 导出 Abort + 清 cache | AbortController；失败清 fill-cache | 取消无僵尸窗 |
| P1-E | 023 口径/现场阈值 | 真实样本；文档去掉「每份完整 SQL」过时描述 | 累计查询行≈结果行 |

## P2 — 引擎与产品能力（中长期）

| ID | 目标 | 手段 | 验收 |
|----|------|------|------|
| P2-A | 导出与预览解耦 / 分机 | 专用渲染进程或报表机 | 同机 mappView 帧稳（030） |
| P2-B | 旁路/更换 printToPDF | 另定 SLA | 弱 CPU 墙钟达标 |
| P2-C | 表格盲区 | 合并格等（🧭 先拍板） | 产品清单 |
| P2-D | 估高 measureText + PDF E2E | — | 切页边缘无错字 |

---

# ⌛️ 未完成：自动化契约测清单（生命周期）

| ID | 断言 |
|----|------|
| L1 ✅ | keep-alive `include[]` ⊆ 存在同名 `defineOptions.name` |
| L2 ✅ | B 级 interval 页须 lifecycle / onDeactivated（底线三页） |
| L3 ✅ | ReportHistory：page-focus 注册 removable poll |
| L4 ✅ | 可移动卷轮询路径无 `execFileSync` |
| L5 | 缩略图 IPC 并发 ≤ N |
| L6 | 029 history-thumb T1–T7；Layout/签名 restart 策略 |
| L7 | 离开 datasource：页内探活停、侧栏可启、不同时双跑 |
| L8 | OpcUaPanel：父页 deactivated → 清浏览轮询 |
| L9 ✅ | ReportGenerator：chart-refresh 注册为 B 级（金样） |
| L10 | `backgroundThrottling: false` 仅白名单 |
| L11 | dispose 自动结批 / PLC 心跳清理干净 |
| L12 | 手测矩阵：031 V + 结批中切历史（B 级应已 pause） |

---

## 不做（本轮）

- 不逐页散修而不建 lifecycle。  
- 不在本轮换 PDF 引擎。  
- 不默认开工合并单元格（需产品拍板）。  

## 与 003 的关系

003 的「建议推进顺序」应以本看板 **P0 → P1 → P2** 为准；031/030 剩余项并入上表里程碑，不再单独开「跳转组合」类看板。  
