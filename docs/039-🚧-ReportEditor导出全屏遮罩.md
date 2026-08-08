# 039 · ReportEditor 导出全屏遮罩（盖住同机 mappView 白屏）

> 现场兜底：结批/导出期间全屏显示「正在生成报表」遮罩，盖住同机 mappView 因抢占资源出现的白屏（观感像崩溃）。是 [035 同机降载](035-🚧-ReportEditor导出性能档位与同机降载.md) 的视觉兜底、[030 结批占满 CPU 白屏](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) 症状的体验补丁。
>
> 关联版本：0.3.143 / **0.3.144（039b）** / **039c（本轮增强）** · 发布记录见 [_Doc/007_版本发布记录.md](../_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)

---

# ✅ 已完成：并行「已完成」漏计 + ETA 失真（039g · 2026-08-09）

## 现象

导出做到约第 80 份时，「已完成」仍停在约 65；剩余时间长期偏大或不准。

## 根因

并行 worker 收尾会发 `skipPartSaved: true`。该标志经 `mergeExportOverlayProgress` **粘在** `exportOverlayLastProgress` 上；之后真实 `stage: saved` 读到合并残留的 `skipPartSaved`，不再调用 `noteExportOverlayPartSaved` → 完成数冻结。ETA 用「全样本均耗 × (total−completed)/路数」，完成数偏小且首份全量取数拉高均耗。

## 修复

- `EXPORT_OVERLAY_EPHEMERAL_KEYS`：合并前清掉上一拍的 `skipPartSaved` / `workerIdle` / `workerBusy`；计数只认本拍 `payload.skipPartSaved`
- `estimateExportOverlayEtaMs`：丢掉偏长的首样本、近窗均耗、在制折半，并与墙钟吞吐混合

## 验收

- 16 路并行导出：做到第 N 份时「已完成」≈ 已写盘份数（允许差在制路数，不应长期少十几）
- ETA 随完成推进下降，不再在首路 idle 后永久「预估中」或明显偏大

---

# ✅ 已完成：并行分路进度多列网格（039f · 2026-08-09）

16 路单列堆叠浪费横向空间。遮罩 `.workers` 改为 CSS grid：2–4 路两列、5–9 三列、≥10 四列；窄屏自动降列。

---

# ✅ 已完成：并行分卷时遮罩分路显示进度（039e · 2026-08-09）

## 问题

[035 分卷并行](035-🚧-ReportEditor导出性能档位与同机降载.md) 开启后，遮罩「第 x / 共 y 份」被多路 `partIndex` 后写覆盖，观感错乱。

## 改动

- 进度载荷增加 `workers[]`（每路 `workerSlot` / `partIndex` / `stage` / `busy`）与准确 `completedParts`
- 遮罩内联页：并行≥2 时中央显示「已完成…」+ 每路「并行 N：第 k 份 · 阶段」；串行仍单行
- 关联主进程：`exportOverlayWorkerLanes` / `upsertExportOverlayWorkerLane`

## 验收

- **任一导出档位**（不仅不妥协），只要「分卷并行数」生效≥2：遮罩分行数 = 并发路数，各路份号独立；侧栏/toast 同步分路文案
- Esc 关掉再经侧栏重开：仍能续看多路进度（`export-overlay-reshow` 推最后一次 enriched payload）

---

# ✅ 已完成：并行心跳冲掉 totalReports 导致分路闪没（039e 补丁 · 2026-08-09）

## 现象

四路并行时标题仍显示「4 路并行导出中」，但「已完成 / 各路第几份」只闪一下，随后长期停在「预估中…」。

## 根因

渲染心跳把 `totalReports: undefined` 合并进进度对象（`{...prev,...payload}` 会覆盖），总份数变 0 → 分路 UI 条件失败、ETA 因 `total<=0` 不算。

## 修复

- `mergeExportOverlayProgress`：跳过 null/undefined；已得知总份数后禁止被 0 冲掉
- 心跳仅在有限正数时带 `totalReports`
- 遮罩页 `stickyTotal` 兜底

---

# ✅ 已完成：遮罩右下角 CPU / 内存曲线（039d · 2026-08-09）

## 目标

结批全屏遮罩右下角实时显示：
- **CPU 逻辑核占用**曲线（整机合计%，近约 60 秒）
- **内存用量**曲线（物理内存已用 / 总量）

便于现场观察导出机负载；与进度 ETA 并存，不挡中央进度区。

## 实现

- `electron/host-resource-sample.cjs`：`os.cpus()` 差分算 CPU%、`totalmem/freemem` 算内存
- 遮罩显示期间主进程约 1Hz 推送 `export-overlay-metrics`；preload `onMetrics`
- 遮罩内联页 canvas 折线（无第三方图表库）

## 关于「不妥协」档 CPU 仍不高

档 4 会把导出渲染/后端提到 **HIGHEST**，但 PDF 路径仍多为**单流水线**（取数 → 渲染 → printToPDF/写盘），且仍有 `yieldMs=40` 让出事件循环；强机上常见「墙钟在跑、整机 CPU% 不高」。曲线用于观测，不代表档位未生效。

## 验收

- 单测：`host-resource-sample.test.ts` + overlay contracts 含 metrics
- 手测：模拟结批遮罩右下角曲线随时间滚动；关遮罩后停采样

---

# ✅ 已完成：强关后可由侧栏显式重开（051b · 2026-08-09）

用户 Esc / × / 120s 超时关掉遮罩后，进度更新**仍不自动重弹**（保 HMI）；结批未结束时，侧栏进度条 / toast「打开全屏进度」/ 导航「生成报表」经 IPC `export-overlay-reshow` 可显式拉回，并保留第 x/共 y 份进度。详见 [051](051-✅-ReportEditor结批离开后侧栏重开.md)。

---

# ✅ 已完成：导出期全屏遮罩窗 + 安全阀 + 现场开关（0.3.143）

## 目标

导出/结批未完成时，在主显示器最前台盖一张全屏遮罩（标题「正在生成报表」+ 结批文案 + 进度条 + 第 x/共 y 份），把 mappView 抢占 CPU 时的白屏挡住；完成即隐藏。工业 HMI 敏感——必须保证任何时候能看回现场画面。

## 现场确认的行为（用户拍板 · 首轮）

| 项 | 决策 |
| --- | --- |
| 触发范围 | **只要有导出就弹**（含前台手动导出），可用快捷键强关 |
| 遮罩范围 | **主显示器全屏、不透明**（彻底盖住白屏） |
| 硬超时 | **120 秒**自动隐藏（防遮罩卡死长时间锁住 HMI） |
| 手动关闭 | **Esc / 右上角 ×** 随时可关（保障能看报警） |
| 默认 | **默认开启**（现场开箱即用），设置页可关 |

## 实现（0.3.143）

- **遮罩窗（主进程独立 BrowserWindow）**：`electron/main.cjs`
  - `showExportOverlay()`：主显示器定位，无边框、`skipTaskbar`、`setAlwaysOnTop(true,'screen-saver')`。
  - **自身不白屏**：内容是**内联静态 HTML + CSS 动画**（不加载 SPA）。
  - **开合**：`beginExportOverlaySession()` / `endExportOverlaySession()` 导出计数 0→1 弹、归 0 收。
  - **安全阀**：`EXPORT_OVERLAY_MAX_MS = 120000`；Esc / × 强关。
  - **不弹场景**：`fiveTierExportSpec`（五档批导）直接跳过。
- **桥**：`electron/overlay-preload.cjs`（`onProgress` / `dismiss`）。
- **配置**：`launch.cjs` `exportOverlayEnabled` 默认开；设置页「启动」区开关。

## 验收

- 单测：`launch-settings.test.ts` + `export-overlay-contracts.test.ts`。

---

# ✅ 已完成：设置页开关遮罩误报「登录项同步失败」乱码（039b）

## 现象 / 根因 / 修复

见历史：仅当 patch 含 `openAtLogin` / `silentStart` 时才同步登录项；Windows `reg` 输出按 GBK 解码，「找不到」视为幂等成功。

---

# ✅ 已完成：039c 遮罩增强（任务栏 / 配置 / 按份超时 / ETA / 阶段 / 反馈包）

## 现场反馈（用户实测截图）

- 遮罩可用，但 **未挡住 Windows 任务栏 / macOS Dock**（半屏菜单栏仍可见）。
- 进度目前只有「第 x / 共 y 份」，缺阶段与剩余时间。
- 设置页只有总开关，无法配置显示屏范围与触发范围。

## 用户拍板（本轮）

| 项 | 决策 |
| --- | --- |
| Q1 · 120s | **按份续期（方案 A）**：每份报表**开始**时重新计 120s；不是整次导出共用一个 120s |
| Q2 · 多屏 | 工控机单屏，**暂不强制副屏**；但设置里仍提供「主屏 / 副屏 / 全部」便于日后配置 |
| Q3 · 触发 | 「只要导出就弹」现场 OK；设置增加可配置：**全部导出** / **仅自动结批** |
| 盖栏 | 必须盖住任务栏 / Dock（用显示器 `bounds` 铺满，避免 `setFullScreen` 留出系统栏） |
| ETA | 按实际已完成份数**实时预测**剩余时间 |
| 进度文案 | 明确：第几份、进度%、当前阶段（加载 / 取数 / 渲染 / 写盘） |
| 反馈包 | 遮罩页可一键导出问题反馈包（对接 048） |

## 实现要点

- **盖任务栏/Dock**：遮罩窗用 `display.bounds`（非 `workArea`），**不**调用 `setFullScreen`；`setAlwaysOnTop(...,'screen-saver')` + `setVisibleOnAllWorkspaces`；show 后再钉一次 bounds。
- **按份 120s**：`noteExportOverlayPartStart` 在新 `partIndex` 时 `armExportOverlayTimeout()`。
- **配置**（`launch-settings.json`）：
  - `exportOverlayEnabled`：总开关
  - `exportOverlayDisplay`：`primary` \| `secondary` \| `all`
  - `exportOverlayTrigger`：`always` \| `autoOnly`
- **触发**：`runPdfExport({ exportSource: 'auto' \| 'manual' })`；`autoOnly` 时手动导出不弹。
- **阶段**：渲染页心跳带 `stage`（load/fetch/render）；主进程写盘前推 `write`。
- **ETA**：已完成份均时 × 剩余份 + 当前份剩余估时；首份完成前显示「预估中…」；遮罩每秒刷新文案。
- **反馈包**：遮罩按钮 → IPC → 主进程调后端 `/settings/support-pack/*` → 另存为 zip。

## 验收

- 契约测：`export-overlay-contracts.test.ts` + `launch-settings.test.ts` 相关项全绿。
- ⌛️ 真机：Windows 任务栏 / macOS Dock 被盖住；阶段与 ETA 可读；遮罩页反馈包可保存。
