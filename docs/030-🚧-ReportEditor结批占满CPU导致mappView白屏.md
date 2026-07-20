# ReportEditor：Windows 实际结批占满 CPU → 同机 mappView 白屏

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现**：2026-07-20 · 用户现场（Windows）。  
> **流程**：先登记现象 + 代码对照根因 + 可执行方案；**本轮未改代码**。  
> **相关**：性能墙钟/重复取数见 [docs/023-🚧](023-🚧-ReportEditor模拟结批性能回归分析.md)；整机单实例见 [docs/015-✅](015-✅-ReportEditor整机单实例与浏览器访问.md)（**不**解决与 mappView 的 CPU 共存）。

---

# ✅ 已完成：登记现象与代码对照根因（2026-07-20）

## 现象（用户原话）

Windows 上跑当前软件时，**实际结批**会把 CPU 打到约 **100%**，同机 **mappView 浏览器**出现**白屏 / 刷新**（HMI 卡死感）。

## 链路（实际结批 → 吃 CPU）

```text
OPC 结批边沿（约 1s 轮询）
  → pumpExportQueue（并行 ≤ maxParallelExports，默认 4）
    → Electron 隐藏 BrowserWindow（backgroundThrottling: false）
      → #/pdf-export → 全量 SQL 填充 + 大表 DOM 排版
      → webContents.printToPDF → 写盘
      →（若拆多份）每份再取数 / 再 printToPDF
```

关键实现：

| 点 | 位置 | 行为 |
|----|------|------|
| 默认并行 4 | `frontend/electron/main.cjs` `PDF_EXPORT_DEFAULT_MAX_PARALLEL`；`auto-export-status-codes.ts` `AUTO_EXPORT_MAX_PARALLEL_DEFAULT` | 多绑定可同时开多个隐藏导出窗 |
| 导出窗不节流 | `createPdfExportWindow`：`backgroundThrottling: false` | 隐藏窗仍可满核布局/`printToPDF`（注释：避免后台变慢） |
| 主窗亦不节流 | `main.cjs` 主窗口 webPreferences | 保证 OPC 轮询；结批高峰仍占事件循环 |
| 禁止挂起 | `powerSaveBlocker.start('prevent-app-suspension')` | 省电不会掐导出，争用窗口更长 |
| 分卷重复取数 | 023 + `PdfExportView` / `fullSqlFill` | `query_rows_total ≈ 行数 × 份数`，墙钟与 CPU 窗口都被拉长 |
| 采集器关批 | `DATA_COLLECTOR/.../data_storage.py` `_mark_current_batch_closed` | 强制 flush，**有 sleep/等待，非自旋忙等**；最多加重 mysqld/IO，不太像主因 |

## 根因结论（代码侧已可确认的主因）

| 优先级 | 结论 | 置信度 |
|--------|------|--------|
| **主因** | ReportEditor **Electron 结批导出**：隐藏 Chromium 关闭后台节流 + 大表 DOM + `printToPDF`，默认最多 **4 路并行**，与同机 **mappView（亦为浏览器）** 抢 CPU → HMI 白屏/刷新 | **高**（机制与症状直接对应；缺任务管理器进程名作最终钉死） |
| **放大器** | 拆多份时 **每份重复全量 SQL**（023）+ 预览栈可能重算全部分卷卡片 → 争用窗口变长；同机 MariaDB/Python 序列化可叠加 | **高**（墙钟）/ **中**（是否单独顶满 CPU） |
| **非主因** | DATA_COLLECTOR 关批 flush **忙等占满 CPU** | **低**（循环有等待，非自旋） |
| **非解法** | 015 单实例 | 只防双开桌面进程，**不**限制与 mappView 共存时的 CPU |

> **「确认」口径**：代码已确认「结批导出**会主动满负荷用 Chromium**」；现场用任务管理器验证占满的是 `Report Editor` / Electron 子进程后，即可视为根因闭环。若占满的是 `mysqld`/`python`，则主矛盾切到重复全量 SQL / 序列化（仍属结批链路，缓解手段不同）。

## 与 023 的关系

- 023 解释：**为什么结批又慢又重**（重复取数）。  
- 本条解释：**为什么同机 mappView 会白屏**（CPU 争抢，尤其 Chromium/`printToPDF` + 并行）。  
- 两者叠加：慢 → 争用时间长；并行/`printToPDF` → 瞬时 CPU 尖峰。

---

# ⌛️ 未完成：现场证据钉死（最小实验）

请在复现时填下表（可直接改本文）：

| 证据 | 结果（待填） |
|------|----------------|
| 任务管理器：接近 100% 的进程名（Report Editor / Electron / GPU / python / mysqld / mappView） | |
| 当时「同时并行导出上限」与启用绑定数 | |
| 模版是否开启超上限拆多份；约多少行、多少 PDF 份 | |
| 结批反馈/审计：`dataMs` / `readyMs` / `printMs`（若有） | |
| **并行改为 1** 后白屏是否消失或明显减轻 | |
| 工控机逻辑核数；MariaDB 是否同机 | |

**最小 A/B**：只把并行上限改为 **1** 再结一批。  
- 白屏消失或明显减轻 → 证实并行/多窗 Chromium 争抢。  
- 仍白屏且 Electron 仍 100% → 单路 `printToPDF`/大表 DOM 已够顶满，需降优先级或拆导出链路。  
- CPU 在 mysqld/python → 优先做 023 分页/快照取数。

---

# ⌛️ 未完成：解决方案（现场立刻 + 代码后续）

## A. 现场立刻（不改代码）

1. **生成报表 → 高级设置：同时并行导出上限 = 1**（多绑定同时触发时最有效）。  
2. 结批高峰尽量只跑一路绑定；PLC 触发能错开则错开。  
3. 任务管理器：结批时把 **Report Editor** 设为「低于正常」，mappView/HMI 浏览器「高于正常」（验证用）。  
4. 同机不要再开 Chrome 访问 ReportEditor `:8000`（015 允许网页版，但会多一套前端）。  
5. 大表临时评估：关拆多份或降低每份行数（**改输出形态，需业务同意**）。  
6. 确认桌面只开一个 ReportEditor；关掉多余预览/编辑页。

## B. 短期代码（建议下一版，未开工）

| 项 | 做法 |
|----|------|
| 工控共存模式 | 默认并行 **1**，或设置项强制同机 HMI 场景并行=1 |
| 导出优先级 | Windows 导出相关进程 `Below Normal` / 降低优先级 |
| 让出 CPU | `printToPDF` 前后分片/`setImmediate`；评估导出窗有限 `backgroundThrottling` |
| 分卷取数 | 首份全量后内存切片，禁止每份再打全量 SQL（对齐 023） |
| 预览栈 | 只算当前 `reportPartIndex`，勿先算全部 `allPreviewReports` |

## C. 中期 / 产品级

- 导出与编辑器预览解耦（快照 → 游标分页 → 轻量打印）。  
- 大报表后台任务化 + CPU/并发预算。  
- 结批时降频 OPC 轮询、收缩预热窗。  
- **架构**：报表机与 mappView 工控机分离（最稳，成本最高）。

## 验收（落地后）

- [ ] 同机结批时 mappView 不再白屏/刷新（或 CPU 峰值可控、HMI 可操作）。  
- [ ] 并行=1（或共存模式）为默认/可一键切换。  
- [ ] 任务管理器：结批高峰 Electron 不再长期钉死全部逻辑核（或优先级低于 HMI）。  
- [ ] 单测/契约：并行 clamp、共存模式默认值；（可选）导出优先级开关。

---

## 不做（本轮）

- 不在本轮改 `main.cjs` / 导出并行默认值（需产品拍板是否影响吞吐）。  
- 不把 DATA_COLLECTOR 关批改成「降速」当作主修复（非主因）。  
