# ReportEditor：导出性能 4 档 + 同机降载

> 本文件为 **任务看板 / 开工计划**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-22 · 基线代码 **0.3.119** · 目标发版 **0.3.120**。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [034](034-🚧-ReportEditor全站架构复评-2026-07-22.md) · [003](003-⌛️-剩余任务与后续规划.md) · Plan [`0.3.120`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.120.md)。

---

# ✅ 已完成：产品拍板（2026-07-22）

## 一句话目标

在 **PDF≈预览（可交付）** 的前提下，按设备能力用 **4 档步进滑条** 调节导出抢核程度，减轻同机 **mappView** 掉线/闪白；引擎（pdf-lib / printToPDF）只是档位里的 knob，不是产品目的。

## 已锁定

| 项 | 决定 |
|----|------|
| UI | 步进滑条（离散 4 档），**替代**「同机优先 / 版式优先」双 Tab |
| 档位数 | **4** |
| 默认 | **档 2「均衡」**（`exportPerfTier=2`） |
| 档 0 | pdf-lib **草稿**（救急/最省机；须标明非预览级） |
| 档 1–3 | chromium / printToPDF **预览级**；差异在预热/并行/降载/yield |
| 030 8k 零闪硬验收 | 仍 **⏸ 挂起**；本看板先交「可调档位 + 降载」 |

## 四档定义

| 档 | `exportPerfTier` | 对外名 | engine | 预热池 | 并行 hint | 结批降载 | yield | PDF |
|----|------------------|--------|--------|--------|-----------|----------|-------|-----|
| 0 | `0` | 最省机 | pdf-lib | 0 | 1 | 全开 | 长 | 草稿 |
| 1 | `1` | 同机稳 | chromium | 0 | 1 | 全开 | 长 | 预览级 |
| 2 | `2` | **均衡（默认）** | chromium | 1 | 1 | 全开 | 中 | 预览级 |
| 3 | `3` | 最快出图 | chromium | ≥2 | 预算内可>1 | 仅基础 | 短 | 预览级 |

结批降载「全开」= 导出中暂停侧栏探活 / Dashboard 1s / AI pending；**不停**自动结批与 PLC 心跳。

---

# 🚧 进行中：阶段与进度

| 阶段 | 名称 | 内容 | 进度 | 预估版本 |
|------|------|------|------|----------|
| **A** | 模型 + 单测 + 文档 | `export-perf-tier` knobs；T1–T3/T5/T7；本看板与 Plan | ✅ **本提交完成** | 0.3.120 内 |
| **B** | prefs 接线 + 迁移 | `exportPerfTier` 入 `reportGeneratorPrefsV1`；旧 engine→tier；导出读 profile | ⌛️ 待开工 | 0.3.120 |
| **C** | UI 滑条 | `ReportGenerator` 替换双 Tab；档说明文案 | ⌛️ | 0.3.120 |
| **D** | 运行时降载 | M8 按 `coexistPause`；main 预热池/yield/并行 hint | ⌛️ | 0.3.120 |
| **E** | 契约 T6/T8 + 手测 H1–H6 | CI 契约绿；应用内手测勾选 | ⌛️ | 0.3.120 |
| **F** | 发版收尾 | bump、007、装包说明；解挂 030 硬验收 **不在本看板强制** | ⌛️ | 0.3.120 |

### 进度勾选（随提交更新）

- [x] 拍板：4 档、默认均衡  
- [x] 看板 035 + Plan 0.3.120 + 003/034/030/todo 索引  
- [x] 阶段 A：`export-perf-tier.ts` + 自动化测 T1–T5 辅助 / T7（见下「测试用例」）  
- [ ] 阶段 B：prefs + 迁移落库  
- [ ] 阶段 C：UI 滑条  
- [ ] 阶段 D：main/渲染降载接线  
- [ ] 阶段 E：T6/T8 契约由 skip→绿；手测 H1–H6  
- [ ] 阶段 F：发版 0.3.120  

---

# ⌛️ 未完成：开工计划（建议顺序）

> **原则**：先可测模型，再 prefs，再 UI，最后 main 降载；禁止先改 UI 无映射表。

| 日序 | 步骤 | 产出 | 退出标准 |
|------|------|------|----------|
| D0 | 本文档 + 阶段 A 模块/单测 | `export-perf-tier.*` CI 绿 | T1–T3、T7 绿；迁移纯函数测绿 |
| D1 | 阶段 B | prefs 含 `exportPerfTier`；load 默认 2；旧 chromium→2、pdf-lib→0 | T4、T5 绿 |
| D2 | 阶段 C | 滑条 UI；去掉双 Tab | 手测 H1；T8 契约绿 |
| D3 | 阶段 D | 导出/自动结批/`main` 读 profile；M8 降载 | T6 契约绿；H4/H5 |
| D4 | 阶段 E | 手测 H2/H3/H6 记录；修文案 | 034/035 手测勾选 |
| D5 | 阶段 F | bump 0.3.120 + 007 notes | 推送 origin |

**负责人**：本仓库 Agent/开发共用本看板勾选；现场 mappView 手测需工控机。

---

# 测试用例（完整矩阵）

## 自动化（CI · vitest）

| ID | 阶段 | 断言 | 状态 | 文件 |
|----|------|------|------|------|
| **T1** | A | `normalizeExportPerfTier`：`undefined`/非法 → **2**；0–3 原样 | ✅ 阶段 A | `export-perf-tier.test.ts` |
| **T2** | A | 四档 knobs 冻结（engine/pool/parallel/yield/coexist/pdfQuality） | ✅ 阶段 A | 同上 |
| **T3** | A | `resolveExportPerfProfile(2)`：默认档、chromium、预览级、`isDefault` | ✅ 阶段 A | 同上 |
| **T4** | B | 新装 prefs 无 key → tier=2；读写 round-trip | ⌛️ | `report-generator-prefs.test.ts` |
| **T5** | A/B | 迁移：`pdf-lib`→0；`chromium`→2；已有 tier 不覆盖 | ✅ 纯函数 A；prefs 接线 B | `export-perf-tier.test.ts` + prefs |
| **T6** | D/E | 手动/自动结批 engine 来自 `resolveExportPerfProfile` | ⌛️（先 `it.todo`） | 契约测 |
| **T7** | A | `shouldPauseCoexistTasks`：导出中+full→true；basic/未导出→false | ✅ 阶段 A | `export-perf-tier.test.ts` |
| **T8** | C/E | UI 有 `exportPerfTier` 步进控件；无同机/版式双 Tab | ⌛️（先 `it.todo`） | 契约测 |

## 手测（应用内）

| ID | 阶段 | 场景 | 状态 |
|----|------|------|------|
| **H1** | C | 新装/清 prefs：滑条默认 **均衡** | ⌛️ |
| **H2** | E | 档 0：草稿观感 + UI 草稿提示 | ⌛️ |
| **H3** | E | 档 1/2/3：PDF≈预览（抽样模版） | ⌛️ |
| **H4** | D/E | 档 1 vs 2：预热有无可区分 | ⌛️ |
| **H5** | D/E | 档 0–2 导出中侧栏探活停，结束后恢复 | ⌛️ |
| **H6** | E | 同机 mappView：档 2 抽测；闪则改档 1 对比 | ⌛️ |

## 明确不做（本看板）

- 8k / ≥4 份零闪硬验收 E2E（030 ⏸）  
- Playwright 拖滑条 E2E  
- pdf-lib 坐标布局 layout-v2（仅当档 1 仍掉线再单独立项）  

---

# 实现要点（给开工用）

| 模块 | 路径 | 阶段 |
|------|------|------|
| 档位模型 | `frontend/src/lib/export-perf-tier.ts` | A |
| prefs | `report-generator-prefs.ts` 增加 `exportPerfTier` | B |
| UI | `views/ReportGenerator.vue` 高级设置 | C |
| 自动结批 | `report-auto-export-trigger-service.ts` | D |
| 主进程 | `electron/main.cjs` 预热/yield | D |
| 降载 | `MainLayout.vue` + 导出 active 信号 | D |

Knobs 解析：`resolveExportPerfProfile(tier)` →  
`{ engine, prewarmPoolSize, maxParallelHint, yieldMs, coexistPause, pdfQuality, label, summary }`。

旧迁移：

- 无 `exportPerfTier` 且 `pdfExportEngine=pdf-lib` → `0`  
- 无 `exportPerfTier` 且 `chromium` → **`2`**  
- 已有 `exportPerfTier` → 规范化后保留  

---

## 与 030 / 034 关系

- **030**：根因仍是同机 Chromium 争用；本看板用「档位 + 降载」逼近可操作，不替代硬验收解挂。  
- **034**：M8/M9 收进本看板阶段 D；M11「默认 chromium」被 **默认均衡档（仍为 chromium 预览级）** 吸收，产品叙事改为性能档位。  
