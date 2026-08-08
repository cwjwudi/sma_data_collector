# ReportEditor：导出性能 5 档 + 同机降载 + 后台释放

> 本文件为 **任务看板 / 开工计划**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-22 · 代码线 **0.3.145**（**5 档**；档 3/4 进程优先级重分配：折中 BN / 不妥协 HIGHEST）。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [034](034-🚧-ReportEditor全站架构复评-2026-07-22.md) · [036](036-✅-ReportEditor矢量档与预览稳样式对照.md)（档 1↔2 样式完整对照） · [003](003-⌛️-剩余任务与后续规划.md) · Plan [`0.3.122`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.122.md)（五档；取代 0.3.120 四档草案）。

---

# ✅ 已完成：选 16 只见 3 路且两路假死「取数中」（052b · 2026-08-09）

## 现象

不妥协设 16，遮罩却「3 路并行」；并行 2/3 长期「取数中」，只剩第 1 路往前跑。

## 根因

1. **路数**：Chromium 内存安全帽（约 15GB 物理内存 → **3**），与「不妥协」关掉的 CPU 预算是两回事。  
2. **假死**：其它路经 IPC `invoke` 拉整包 8 万行 fill-cache，Electron structured-clone 极慢，心跳一直停在 `fetch`（文案像在取数）。

## 改动

- preload 写/读临时 JSON，主进程 IPC 只传 `path`  
- 等待缓存阶段心跳改为 `hydrate`（「同步取数缓存」）  
- 生成页标明「CPU/设置生效」与「Chromium 约 N 路」

## 验收

- 15GB 机 Chromium：遮罩约 3 路，但各路应轮流推进，不应两路永久卡「取数中」  
- UI 明示 Chromium 帽，勿误以为设置 16 未生效

---

# ✅ 已完成：首次模拟结批 Chromium 多路闪退（052 · 2026-08-09）

## 现象

安装版首次点「模拟结批」（不妥协 + 分卷并行 16 + Chromium + 8 万条分卷）进程直接退出，几乎无审计。

## 根因

CPU 预算关闭后按设置冷启最多 16 个导出窗，叠加大 fill-cache IPC 克隆与并发 `printToPDF`，Windows 上易 OOM / 渲染进程被杀导致整进程闪退。

## 改动

- `chromium-export-parallel-cap.cjs`：Chromium 分卷并发按物理内存封顶（约 2–6）；pdf-lib 仍可用满设置
- 总份数 ready 后**懒建**额外窗（错峰），不再与首份 SQL 并行预建 N−1 窗
- `printToPDF` 全进程最多 2 路同时执行；fill-cache hydrate IPC 串行
- `render-process-gone` / `child-process-gone` 写入 `%APPDATA%/.../logs/process-gone.log`

## 验收

- Win 干净安装：a044 + 不妥协 + 并行 16 + Chromium → 不闪退；日志可出现「内存帽 … → concurrency=N」
- 闪退若再现：查 `process-gone.log`

---

# ✅ 已完成：模拟结批分卷并行（2026-08-09）

## 问题

档 4「不妥协」`maxParallelHint=2` 只抬高 OPC 多绑定 job 槽与主进程 `pdfExportMaxParallel`，**同一次模拟结批的多分卷**仍在 `handlePdfExportRun` 里单窗串行，观感像「不妥协没并行」。

## 改动

- 主进程：part 0 仍串行拿 `totalReports`；其余分卷按 `min(pdfExportMaxParallel, remaining)` 多窗池并发；额外槽位 `acquirePdfExportSlot`，避免与 OPC 抢爆；`=1` 时保持串行 + `yieldMs`
- UI：模拟结批卡片「分卷并行数」（绑定 `prefs.auto.maxParallelExports`，与 OPC 共用）
- 契约：`part-parallel-export-contracts.test.ts`

## 验收

- 选不妥协、并行≥2，80 份分卷时主进程日志出现 `PDF 分卷并行`
- 并行=1 时行为与改前一致

---

# ✅ 已完成：16 路并行取数挤爆后端 20s 超时（support-pack · 2026-08-09）

## 现象

`support-pack-0.3.146-…`：不妥协 + 16 路 + 8 万条分卷，约 28s 失败：
`请求超时（20 秒）。请确认后端已启动…`（`templates.ts` 默认超时）。

## 根因

1. 多 `BrowserWindow` 各自一份 JS 堆，fill-cache 不共享 → N 路各打全量 SQL（审计见 sqlQueries≈并行路数）
2. N 路同时 `getTemplate` 挤后端，20s 客户端超时误杀

## 改动

- 主进程 `pdf-export-fill-cache-*` bridge：首份 publish，其它路 wait/hydrate 后跳过 fullSqlFill
- 导出窗 `getTemplate` 超时 20s→120s
- `signalReady` 前必须已 publish bridge

## 验收

- 16 路 80 份：审计 sqlQueries 应接近 1（非 ≈16）；不再因模版 20s 超时中止

---

# ✅ 已完成：并行开导即建路，ready 后派活（2026-08-09）

## 问题

并行路数在点导出前已知，但旧逻辑等**第 0 份整份 PDF 写完**才开多窗，观感像「先串行一份再并行」。

## 改动

- 开导即按 `pdfExportMaxParallel` 建 N 路遮罩；额外窗并行预建
- 第 0 份取数/绘制 `pdf-export-ready`（`onReady`）一到即得知总份数，其余路立刻派活
- 第 0 份继续 printToPDF/写盘，与其余路重叠；总份数仍依赖首份取数结果（数据驱动分卷，无法开导前预知）

## 验收

- 并行≥2：遮罩一出现即 N 路（其它路可短暂「等待总份数」），不必等第一份 PDF 落盘才分栏
- 主进程日志含 `ready 后即派活`

---

# ✅ 已完成：「不妥协」不再套用 CPU 并行预算（2026-08-09）

## 问题

16 逻辑核机器上 `cpuBudget = floor(16/4) = 4`，用户设分卷并行 16 时遮罩仍只开 4 路。

## 改动

- 档「不妥协」（`coexistPause=max`）：`ignoreCpuBudget`，实际并行 = min(设置, 硬顶 16)
- 其它档仍 `min(设置, CPU 预算)`，保同机 HMI
- UI 显示「生效 N 路」；不妥协时提示已关预算封顶

## 验收

- 不妥协 + 设 16：遮罩出现最多 16 路（受剩余分卷数限制）
- 预览稳 + 设 16（16 核机）：仍生效 4 路，并提示预算

---

# ✅ 已完成：并行遮罩分路显示「第几份」（2026-08-09）

## 问题

分卷并行后，遮罩共用一个 `partIndex`，多路互相覆盖，出现「第几份」乱跳。

## 改动

- 主进程维护 `exportOverlayWorkerLanes`；`sendProgress` / 心跳带 `workerSlot` + `parallelWorkers`
- 遮罩：并行≥2 时汇总「已完成 x / 共 y」，并分行显示「并行 N：第 k / 共 y 份 · 阶段」
- `completedParts` 按已保存 part 集合计数（禁止 `max(partIndex+1)` 虚高）

## 验收

- **任一档位**并行≥2：遮罩/toast 出现与并发路数一致的分行；每路份号独立推进，不再互相覆盖（不限「不妥协」）
- 并行=1：仍为单行「第 x / 共 y 份」

---

# ✅ 已完成：模拟结批卡片内露出五档选择（2026-08-09）

## 问题

五档选择原先藏在「OPC UA 自动结批 → 高级设置」折叠区，做**模拟结批**时看不见，虽底层已按 `exportPerfTier` 生效。

## 改动

- 「模拟结批」卡片内、开始按钮上方：直接展示五档分段按钮 + 当前档摘要  
- 与 OPC 自动结批仍共用同一 `exportPerfTier`；自动侧高级设置改为提示「见上方模拟结批」  
- 结批进行中禁用切换（避免中途换档误解）

## 验收

- 打开生成报表 → 不展开 OPC 高级设置也能看到并切换档位  
- 选档后点模拟结批，进度/审计仍带对应引擎与模式文案  

---

# ✅ 已完成：产品拍板（2026-07-22）

## 一句话目标

在 **PDF≈预览（可交付）** 的前提下，用 **5 档**调节导出抢核程度；档 0–1 走 pdf-lib（最省机 / 矢量版式），档 2–4 走 chromium 预览级并按程度降载；后台额外释放预热窗与次要轮询。

## 已锁定

| 项 | 决定 |
|----|------|
| UI | **5 档分段按钮**（0.3.123+；曾用步进滑条） |
| 默认 | **档 2「预览稳」**（`exportPerfTier=2`） |
| 档 0 | pdf-lib **仅内容**（`draft-v1`） |
| 档 1 | pdf-lib **矢量版式**（`layout-v2`，必做） |
| 档 2 | chromium 预览级 · **最终妥协**（默认） |
| 档 3 | chromium · 质量与功能折中 |
| 档 4 | chromium · **不妥协** |
| 后台 | 可多放资源（预热窗/探活/Dashboard/AI）；**不停**自动结批与 PLC 心跳 |
| 030 8k 零闪硬验收 | 仍 **⏸ 挂起** |

## 五档定义

| 档 | 名 | engine | fidelity | 预热 | 并行 hint | coexistPause | 渲染优先级 | yield | PDF |
|----|----|--------|----------|------|-----------|--------------|------------|-------|-----|
| 0 | 仅内容 | pdf-lib | draft-v1 | 0 | 1 | full | LOW | 200 | 草稿 |
| 1 | 矢量版式 | pdf-lib | layout-v2 | 0 | 1 | full | LOW | 200 | 坐标版式 |
| 2 | **预览稳（默认）** | chromium | printToPDF | **1**（0.3.140） | 1 | full | LOW | 200 | 预览级 |
| 3 | 功能折中 | chromium | printToPDF | 1 | 1 | **basic** | **BelowNormal** | 80 | 预览级 |
| 4 | 不妥协 | chromium | printToPDF | 2 | 2 | **max** | **HIGHEST** | 40 | 预览级 |

旧四档迁移：`0→0`，`1→2`，`2→3`，`3→4`（`exportPerfTierScale=5`）。

---

# ✅ 已完成：档 3/4 进程优先级重分配（0.3.145 · 2026-07-29）

## 拍板

- 档 4「不妥协」面向**强机 / 测试机**，不按弱核同机 HMI 留余地 → 渲染与后端 **PRIORITY_HIGHEST**，主进程**不**再降 BelowNormal。  
- 档 3「功能折中」从与默认相同的 IDLE 改为 **BelowNormal**（`coexistPause=basic`）。  
- 档 0–2 仍 `full` → 渲染 LOW，保同机。

| coexistPause | 档 | 渲染 | 后端 | 主进程结批降载 | 侧栏探活暂停 |
|--------------|----|------|------|----------------|--------------|
| full | 0–2 | LOW | BelowNormal | 是 | 是 |
| basic | 3 | BelowNormal | BelowNormal | 是 | 否 |
| max | 4 | **HIGHEST** | **HIGHEST** | **否** | 否 |

## 验收

- 单测 `export-perf-tier` / contracts / `export-coexist-busy`  
- 任务管理器：档 4 导出期渲染进程应为「高」/最高；档 3 为「低于正常」；档 2 为「低」

---

# ✅ 已完成：后三档变慢诊断 + 默认档去冷启动（0.3.140 · 2026-07-23）

## 背景

测试反馈「后面三种（档 2/3/4 chromium `printToPDF`）导出速度相当慢，和最初没做五档时有区别」。对照五档引入前基线（commit `1cec6a8^`，0.3.119 无档位）逐项核对。

## 根因（最初 vs 现在）

「最初」chromium 导出基线：**常驻 1 预热窗**（`targetPoolSize=min(2,maxParallel=1)=1`，开机预热 + 每次导出后重热 + keep-alive）→ 每次导出走热 hash 切换，无整页冷启动；分卷 `PDF_EXPORT_PART_YIELD_MS=80`；导出期 `BelowNormal`（当时已有）。

五档后后三档差异：

| 档 | 预热窗 | yield | 并行 | 相对最初 |
|----|-------|-------|------|---------|
| 2 预览稳（默认） | **0 → 每次冷启动 SPA（Win ~1~3s）** | 200ms（原 80 的 2.5×） | 1 | 明显更慢 |
| 3 功能折中 | 1（热窗） | 80ms | 1 | ≈ 最初基线 |
| 4 不妥协 | 2（热窗） | 40ms | 2 | 比最初更快 |

- **主因**：默认档 2 `prewarmPoolSize=0` 关掉预热 → 每次导出整页冷启动（Vue 启动 + 依赖解析 + 字体加载，Windows ~1~3s），是当初为「同机 mappView 不被饿死」的取舍代价。
- **次因**：0.3.137 新增 `installPrintTableGridOverlays`（canvas 整表格线位图）在每次 chromium 渲染 `signalReady` 前跑（`getBoundingClientRect` 回流 + dpr=3 `toDataURL` PNG 编码 + `img.decode`），三档统一新增净开销（前两档 pdf-lib 不受影响）。

## 处理（本次拍板：只做「默认档保留 1 预热窗」）

- `export-perf-tier.ts`：档 2 `prewarmPoolSize` **0 → 1**（去冷启动，热 hash 切换提速）；同机让核仍靠 `yield=200` + `BelowNormal`，共存性不变。
- `main.cjs` 五档批导：`pdfExportPrewarmPoolSize = t.tier>=4 ? 2 : t.tier>=2 ? 1 : 0`（档 2 同步保留 1 预热窗）。
- 单测 `export-perf-tier.test.ts` T2 断言档 2 预热 = 1。

## 未采纳（留档）

- 降 canvas 叠层开销（dpr3→2 / 按需 / 换编码）——三档统一提速项。
- 默认档 2→3。
- ~~档 4「不妥协」解除 BelowNormal~~ → **已于 0.3.145 升为 HIGHEST + 主进程不降**。

## 验收

`npm run test -- export-perf-tier` 绿；后续 Windows 装包重跑五档批导，对比档 2 首份 `readyMs`（应去掉 ~1~3s 冷启动）。

---

# ✅ 已修复：降载只降主进程，矢量档仍饿死 mappView（0.3.142 · 2026-07-23）

## 现象（现场）

i3-7100U（2 核 4 线程）+ 给 AR 做 Hypervisor 占 1 核 → Windows 侧仅剩约 1 物理核。即使用**矢量档（档 1，pdf-lib）**导出，CPU 仍冲 100%、同机 mappView 卡死。

## 根因（真正的 bug，非取舍）

`beginPdfExportLowPriority()` 用 `os.setPriority(0, BELOW_NORMAL)`，**`0`=当前进程=Electron 主进程**。但导出真正吃 CPU 的是两个**独立 OS 进程**：

1. **导出渲染进程**（隐藏 `pdfWin` renderer）：矢量档在此跑 pdf-lib 画版式 + fontkit 字体 subset + base64/PNG，是纯 CPU 同步计算，占满一个核；chromium 档则是 HTML 排版 + printToPDF。
2. **Python 后端 `report_backend.exe`**：取数（OPC/SQL）。

这两个进程**全程 NORMAL 优先级，降载一个都没碰到** → 主进程降载形同虚设，渲染进程照样和 mappView 抢那唯一的 Windows 核 → 饿死。矢量档虽整体轻，但渲染进程照样满核，故一样卡。

## 处理（L2：降真正的进程 + 按档 IDLE）

- 新增 `applyExportProcessCoexistPriority` / `restoreExportProcessCoexistPriority`：
  - **渲染进程**（`pdfWin.webContents.getOSProcessId()`）：`coexistPause='full'`（档 0–3）降 **IDLE/Low**（mappView 一忙即完全让路）；`basic`（档 4）降 **BelowNormal**。
  - **后端**（`pythonProcess.pid`）：`full` 档降 **BelowNormal**（取数以 IO 为主，不用 IDLE 以免拖慢）。
  - 施加点：acquire 后 + 每份 `renderPart` 开头 + 导航/033 重建窗后（pid 会变）；`finally` 恢复 NORMAL。
- `coexistPause` 由档位 `profile.coexistPause` 经 opts 透传（ReportGenerator / auto-export / AiPending / 五档批导），主进程缺省按最强 `full`。
- 契约测：main.cjs 用 `getOSProcessId` + `PRIORITY_LOW` + `pythonProcess.pid`；调用点透传 `coexistPause`。

## 说明与运维建议

- 优先级**不降低 CPU% 数字**，但让高优先级 mappView 随时抢到核、不再饿死——这才是同机共存的关键。
- 现场弱 CPU（1 Windows 核）建议：**默认矢量档（档 1）**（pdf-lib 远轻于 chromium printToPDF）；导出尽量安排在 HMI 不忙时。
- 若 L2 现场仍不足，再评估 **L3：CPU 亲和性**给 mappView 预留核（改动大、超线程共享收益有限，暂缓）。

## 验收

`npm run test -- export-perf-tier` 绿（含新契约）；现场 Windows 装包后，导出期用任务管理器看 `Report Editor AI`（渲染进程）优先级应为「低」、`report_backend.exe`「低于正常」，且导出期间 mappView 操作不卡顿。

---

# ✅ 代码进度（0.3.122+）

- [x] 五档模型 + 迁移 + 契约  
- [x] UI 滑条 max=4；默认预览稳 → 0.3.123 改为分段按钮  
- [x] 档 1 `layout-v2`：坐标文本/表格线 + **bodyCards 续页**（与预览分卡对齐）  
- [x] 后台：拆空闲预热窗 + BelowNormal + 次要轮询暂停  
- [x] 手测 H1–H5（本机）；H6/H7 现场同机 ⌛️  
- [x] macOS arm64 DMG 至 **0.3.132** + `latest.json` SHA（Portal 未挂载时可仅本地）  
- [x] 正文底色 `bodyBackgroundCss`（0.3.132）

---

# 🐛 缺陷记录：layout-v2 对照导出不可用（2026-07-22）

**现象**（五档批导「冒烟测试报表」档 1）：无有效文字内容、无封面/封尾图、表格版式不对，中文呈乱码/`?`。  
**根因**：

1. **坐标原点错误**：正文/眉脚控件相对各带原点（`contentLeft/Top`、眉带 `ml/mt`、脚带底边），实现按页左上绝对坐标画 → 内容错位或落在不可见区。  
2. **图片未实现**：`image` / `signature` 的 `imageSrc` data URL 被跳过。  
3. **表格列数 bug**：误读 `grid.cols`（`ensureTableGrid` 返回二维数组无此字段）→ 列数恒为 1；静态格未回落 `tableCells[].text`；列宽未用 `tableColWidthsPx`。  
4. **眉带 zone 表未画**：封面眉栏多张 `table` 被跳过 → 只剩空框。  
5. **乱码主因**：`NotoSansSC-Regular.otf`（OTTO/CFF）经 `@pdf-lib/fontkit` **subset** 后字形错映为 `!"#$%…`；朱雀仿宋 **TTF** subset 正常。  
6. **窄框不画字**：眉栏 ~18px 高时字号 > 盒高，`drawWrappedInBox` 的 `cy < floorY` 直接丢弃整段（封面「批次报告」等）。

**处理**：重写 `pdf-lib-layout-v2-render.ts`（带原点、图、正文/zone 表、封面封尾、字号压进盒高）；`pdf-lib-export-render` / 导出页优先嵌 TTF；单测 + 五档复验档 1（`11-04-52`：中文/表/图齐全）。

---

# 🐛 缺陷记录：不妥协档页眉表底边框被截断（2026-07-22）

**现象**（档 2/3/4 Chromium `print-to-pdf`，封面页眉叠表）：最下一行**底横线缺失**，竖线悬空。  
**根因**：眉带 `.mini-band-inner` / zone 表外壳 `overflow:hidden`，再叠加 `padding:2px` 与 `.mini-tpl-table-wrap{padding-bottom:1px}`；贴底表（bottom≈82、band≈83px）底边框落在裁剪边上。  
**处理**：zone 表改为 `padding:0` + `overflow:visible`；zone wrap 取消底垫；`@media print` 下眉带 `overflow:visible`；冒烟封面 `headerBandMm` 22→24。

---

# 🐛 缺陷记录：矢量档表格水平/垂直对齐失效（2026-07-22）

**现象**（档 1 layout-v2）：属性「水平/垂直位置」左/中/右、上/中/下在矢量导出中不生效（单元格总是贴左贴顶）；预览侧单元格曾写死 `text-align:center`。  
**根因**：`drawWrappedInBox` 未读 `alignX/alignY`；`normalizeAlignAxis` 不识别 `"start"`（改默认居中时会丢「左」）。  
**处理**：layout-v2 按对齐偏移画字；画布/迷你页/zone 表读 `alignX/alignY`；新建表默认居中；修正 `normalizeAlignAxis`。

**批导目录**：`export-five-tiers` 完成后只保留最近 **5** 批（`summary_*` / `tier*_*` 同戳为一批），不堆全历史。

---

# 🐛 缺陷记录：矢量档 SQL 填充表无数据行（2026-07-22）

**现象**（档 1 layout-v2）：正文横表/纵表仅见表头或左列标签，数值格全空（Chromium 档正常）。  
**根因**：layout-v2 误读 `{ ok, columns, rows }`，而绑定预览实际为 `values[tblfill:id].tableSqlFill.dataRows`（`string[][]`）；纵表亦未走 `formatSqlFillTableCellPreview` 转置。  
**处理**：改读 `dataRows`，单元格统一经 `formatSqlFillTableCellPreview`（含横/纵）。

---

# 🐛 缺陷记录：仅内容档 SQL 填充表无数据行（2026-07-22）

**现象**（档 0 `draft-v1`）：流式导出只见 `[table id]`，无 SQL 行（参数标量有值）。  
**根因**：同档 1——误读 `{ ok, rows }`；`grid.rows/cols` 不存在导致静态回落 0 行。  
**处理**：`pdf-lib-export-render` 改读 `dataRows` + `formatSqlFillTableCellPreview`。

---

# ✅ 已修复：仅内容档大字号文字重叠（2026-07-22）

**现象**（档 0 `draft-v1`，冒烟竖/横 `tier0`）：封面「数据记录报表」与「作者：B&R」等文字明显叠压；pdf.js 测相邻基线 dy≈5pt，而标题 `fontSize=45`（glyph h≈45）。

**根因**：
1. 流式排版行高写死 ~12–13pt，未随控件 `fontSize` 增长；封面版式大标题（45pt）基线间距远小于字号。  
2. 含 `\n` 的作者块未按硬换行处理，折行逻辑对 CJK/空白也不稳健。

**处理**（`pdf-lib-export-render.ts`）：
- 仅内容字号 **cap≤14**（草稿可读，不跟版式特大号）  
- 行高 `max(1.4×size, size+3)`；段落后再留 `0.25–0.3×size`  
- 显式 `\n` 硬换行；超宽无空格段按字符切分  
- 单测：封面 45pt 标题 + 多行作者 + 正文，断言相邻基线无叠压

**验收**：`npm run test -- pdf-lib-export-render`；冒烟模版重导档 0 目视无叠字。

**复验（2026-07-22 · 模版微调后）**：封面标题 45→28、作者块去前导 `\n`、正文标题 16、全模版无外框；五档  
`Desktop\report-editor-five-tier-exports\smoke-{portrait,landscape}-2026-07-22T11-34-32` 共 10/10 `ok`；档 0 pdf.js **badOverlap=0**（字号 cap≤14，相邻基线间距正常）。

---

# 🐛 缺陷记录：矢量档 SQL 参数未居中（2026-07-22）

**现象**（档 1 layout-v2）：正文 SQL 参数（温度/压力等）有值但贴左；Chromium 预览/导出看起来居中。  
**根因**：迷你页 `.mini-tpl-param` 与外层 flex **写死** `center`，忽略控件 `alignX`；模板参数多为默认 `alignX=start`，矢量档按真实字段左对齐 → 与预览不一致。  
**处理**：迷你页/画布按 `alignX/alignY` 对齐；新建参数默认 `alignX=center`；冒烟模板正文参数改为居中。

---

# ✅ 已做：导出页背景色可编辑（**0.3.132**）

**原现象**：纸面正文区固定浅灰 **`rgb(249 249 251)`**，白底 Logo 衬出灰块，无法改。  

**处理**：
- `LayoutSnapshot` / `LayoutPreset` 新增 `bodyBackgroundCss`（缺省仍为历史浅灰；支持 `#ffffff` / `transparent` / 自定义）
- 版式编辑器 + 模版编辑器「当前页正文底色」色板
- Mini / 画布 / Chromium 导出 / layout-v2 共用 `resolveBodyBackgroundCss`
- 眉/脚带半透明灰仍为预览示意色（本期不改）

**验收**：单测 `layout-model-body-bg` + layout-v2 白/红/transparent；装包 `0.3.132` 五档 `retest-0.3.132-white-10-42-15`：  
正文区改 `#ffffff` 后档 1/2 中心抽样 **exact_gray249=0**、exact_white≈87–92%（对照 0.3.131 同区 gray249≈1660）✅。冒烟模版已恢复默认（无字段=历史灰）。

---

# 手测（应用内）

| ID | 场景 | 状态 |
|----|------|------|
| **H1** | 新装/清 prefs：默认 **预览稳** | ✅ 代码默认 `DEFAULT_EXPORT_PERF_TIER=2`；本机 `client_prefs_mirror` `exportPerfTier=2` / `chromium`；单测 T1/T3 |
| **H2** | 档 0：仅内容草稿 | ✅ `retest-0.3.132-white-10-42-15`：`draft-v1`、1 页、~25KB、文案含 `fidelity=draft-v1` |
| **H3** | 档 1：矢量版式有坐标/表格框（抽模版） | ✅ 复验：中文可读 + 封面图表格/Logo；角色色边 `retest-0.3.131-10-24-32` |
| **H4** | 档 2/3/4：PDF≈预览 | ✅ 同批三档均为 chromium / 3 页 / 体积相同；锚点 `批次报告`/`temp`/`2/3` 齐全（`14-42-19`） |
| **H5** | 结批中侧栏探活停；后台再拆预热窗 | ✅ 单测 `export-coexist-busy` + `app-background-idle`；`MainLayout` 在 `uiSecondaryTasksPaused` 停探活；档 0–2 `prewarmPoolSize=0` → `destroyWarmPdfExportWindows`；导出期 `BelowNormal`（安装批导日志可见 setPriority 调用） |
| **H6** | 后台结批：自动结批仍触发；mappView 对比档 1 vs 2 | ⌛️ 代码：`report-auto-export-trigger-service` 结批路径仍走且仅 `beginExportCoexistSession` 降载、不停自动结批定时器；**mappView 同机对比需现场** |
| **H7** | 同机 99%：默认档 2；仍断则试档 1 | ⌛️ **现场**（030 环境；本机无 HMI 硬验收） |

## 明确不做（本看板强制外）

- 8k / ≥4 份零闪硬验收 E2E（030 ⏸）  
- layout-v2 像素级对齐 printToPDF（渐进增强；**可交付观感差**见 [036](036-✅-ReportEditor矢量档与预览稳样式对照.md)）  

## 本看板剩余

仅 **H6 / H7 现场同机**（可与 030 解挂后一并做）。代码与本机五档验收已齐；非现场阻塞项。

---

# ⌛️ 未完成（已拆板）：矢量跨份复用加速

> **2026-08-04**：现场弱核实测矢量 · 配方 · 5 万 · `maxRows=1000` → **13～17 分钟**；根因是每份重复 subset/嵌图/切 hash/base64，非取数。  
> **需求看板**：[045-🚧](045-🚧-ReportEditor矢量导出跨份复用加速.md)（R1a/R2 已落地；R3/R4/R5 待做）。  
> 本板不重复展开；进 6 分钟冲刺以 045 验收为准。

---

# ✅ 已完成：无外框冒烟模版（竖/横）+ Windows 五档复验（2026-07-22）

## 目标

- 全部既有模版控件 `showBorder=false`（去掉外框线；表格内格线仍由渲染层决定）。  
- 用本机 Docker MariaDB（`:3306`）重建冒烟：封面/封尾图、SQL 表、页眉页脚；**竖版 + 横版**各一份。  
- 对两份模版各跑五档批导，核对 `ok: true`。

## 代码 / 脚本

| 项 | 说明 |
|----|------|
| `ai_demo_template_ops.create_binding_smoke_template` | 增 `orientation`；参数/表默认无外框；落盘前 `_strip_all_show_borders` |
| `ai_tools` | 冒烟工具 schema 透传 `orientation` |
| `backend/scripts/setup_smoke_templates_noborder.py` | 批量去边框 + 建竖/横冒烟（`ensure_schema`） |

## Windows 本机模版 ID（live data）

| 名称 | ID | 方向 |
|------|-----|------|
| 冒烟测试报表·竖版 | `fbbf8a05-ae98-4e12-9f86-a77eed4a67d3` | portrait |
| 冒烟测试报表·横版 | `45ee4134-24c1-4cab-9e02-170650ffd4df` | landscape |

> 旧 macOS 冒烟 `336a5e28-…` 在本机不存在；036 历史对照仍可引用旧 ID，新复验用上表。

## 五档批导证据

| 目录 | 戳记 | 结果 |
|------|------|------|
| `Desktop\report-editor-five-tier-exports\smoke-portrait` | `2026-07-22T14-59-36` | 档 0–4 全部 `ok: true` |
| `Desktop\report-editor-five-tier-exports\smoke-landscape` | `2026-07-22T14-59-18` | 档 0–4 全部 `ok: true` |

体积量级：档 0 ≈35KB；档 1 ≈344KB；档 2–4 竖≈419KB / 横≈394KB（Chromium）。Electron 结束后偶发退出码 `3221225477`，PDF/summary 已落盘。

## 已知缺口（不挡本条 ✅）

- OPC 批号写入若仍指现场节点，可能 `BadUserAccessDenied`；五档批导 `allowBindingIssues` 仍可出 PDF。  
- 表格单元格网格线 ≠ 控件外框；若还要「无格线」需另开需求。  

