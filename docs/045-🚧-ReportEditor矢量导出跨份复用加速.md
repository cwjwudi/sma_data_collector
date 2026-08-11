# ReportEditor：矢量导出跨份复用加速

> 本文件为 **需求 / 待做看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-08-04。  
> **范围**：导出档 **1「矢量版式」**（`pdf-lib` / `layout-v2`）多分卷路径。  
> **关联**：[035](035-🚧-ReportEditor导出性能档位与同机降载.md) · [023](023-🚧-ReportEditor模拟结批性能回归分析.md) · [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

---

# ✅ 已完成：现状评估与现场基线登记

## 现状是否合理

**合理，作为正确性优先的第一版。**

| 已做对的 | 说明 |
|---|---|
| 旁路 `printToPDF` | 同机抢核比 chromium 档轻 |
| fill-cache（0.3.111） | 全量 SQL 只打一次，后续内存切片 |
| 只算当前份 bodyCards | 避免 N 份 DOM 估高 |
| LOW + yield | 保 HMI 可抢核（与墙钟互斥） |

| 已知代价（非 bug） | 说明 |
|---|---|
| **每份从零建 PDF** | `PDFDocument.create` + fontkit `subset` + 封面图 `embedPng` + `save` |
| **每份改 hash 重跑导出页** | 同窗热切，但仍走完整 boot→画→回传 |
| 份数 = `ceil(行数/maxRows)` | `maxRows=1000` → 5 万条 **50 份**，固定开销被乘大 |

结论：架构分层清楚，性能债集中在「跨份不复用固定资产」；应用跨份复用优化，而不是推翻矢量路径。

## 现场基线（口述 · 2026-08-04）

| 项 | 值 |
|---|---|
| 硬件 | Win10 · i3-7100U · Hypervisor≈1 物理核 · 16GB |
| 同机 | DB + HMI（mappView）同跑 |
| 模板 | 批次配方报表（读库） |
| 档位 | 矢量版式 |
| 数据 | 50000 条 · `maxRows=1000`（50 份） |
| **实测墙钟** | **约 13～17 分钟** |
| 期望 | 压回 **6 分钟以内**（需本条优化 + 可能减份数/让核策略） |

---

# ✅ 已完成：R1a 字体字节 / R2 图片字节跨份缓存（2026-08-08）

## 实现

| 项 | 位置 | 说明 |
|----|------|------|
| R1a 字体字节缓存 | `pdf-lib-export-render.ts` | `loadBundledFontBytes` 按 `fontId` 缓存解码字节；IPC 兜底命中也写缓存。随包字体是静态资源，**内容寻址不会串模版**，无需绑 job 生命周期 |
| R1a 字体 IPC 缓存 | `PdfExportView.vue` | `getBundledCjkFontCached`：预热窗进程内首份取一次，后续份不再走 **MB 级 base64 IPC** |
| R2 图片字节缓存 | `pdf-lib-layout-v2-render.ts` | `embedDataUrlImage` 前按完整 dataURL 缓存解码字节（上限 24 条防膨胀）；每份仍须 `embedPng`（PDFImage 绑定单个 PDFDocument），省的是 base64 解码 |

## 测试证据

- 「045 R1: bundled font bytes cross-part cache」：首份传 base64 嵌入后，第二份**不传 base64 且 fetch 被禁**仍嵌入成功（缓存命中）。  
- 「045 R2: data-url image bytes cached across parts」：同一 dataURL 连渲三份，缓存条目数不增长。  

---

# ✅ 已完成：R4 临时文件回传（去掉巨型 base64 IPC）（2026-08-09）

## 问题

`preload.notifyPdfExportReady` 用 `JSON.parse(JSON.stringify(payload))` 剥 Vue Proxy——**不能传二进制**；旧路径只能 `doc.save` → chunked `btoa` → 巨型 base64 字符串经 JSON IPC，每份固定 CPU/内存/IPC 成本被份数放大。

## 实现（对标 fill-cache：主进程写 temp）

| 位置 | 变更 |
| ---- | ---- |
| `electron/main.cjs` | `pdf-export-write-temp-part`：structured-clone 收 `Uint8Array`/`Buffer`，写入 `temp/sd-sma-pdf-part-*.pdf`；路径白名单校验；按 `jobId` 跟踪；取消/失败 `clearPdfExportTempPartsForJob`；>1h 孤儿扫尾 |
| `electron/preload.cjs` | `writePdfExportTempPart({ bytes, jobId })` → invoke（**禁止** JSON 序列化 bytes） |
| `PdfExportView.vue` | 矢量路径改 `renderPdfLibExportPart`（字节）→ 写 temp → `signalReady({ pdfTempPath })`，不再塞 `pdfBase64` |
| `main.renderPartOnWindow` | 优先 `pdfTempPath` 读盘；兼容旧 `pdfBase64`；hash 带 `jobId` |
| `vite-env.d.ts` | 类型声明 |

`renderPdfLibExportPartBase64` 保留作工具/兼容，导出热路径不再调用。

## 测试证据

- `part-parallel-export-contracts.test.ts`：「045 R4：矢量 PDF 临时文件回传…」契约锁 main/preload/PdfExportView。  
- 相关套件（R1/R2/契约）复跑：**3 文件 / 37 用例全绿**（2026-08-09）。

## 未覆盖（仍见下方 ⌛️）

- fontkit `subset` 每份仍跑（R1b）  
- 每份 hash 切页/boot（R3）  
- 现场弱核 5 万条墙钟复测（验收仍 ⌛️）

---

# ⌛️ 未完成：R1b 预裁字体 / R3 同窗连渲 / R5 让核 / 现场复测

## 目标

在保持 layout-v2 版式与「首份全量取数、后续切片」语义不变的前提下，继续摊薄每份固定开销，使上述现场场景墙钟明显下降（冲刺 **&lt;6 分钟**；验收以同机复测为准）。

## 拟改项（按收益预期）

| ID | 项 | 做法要点 | 预期 | 状态 |
|----|----|----------|------|------|
| **R1** | 字体跨份复用 | ✅ R1a：字体**字节**（IPC/fetch/解码）跨份缓存；⌛️ R1b：subset 复用需预裁「报表常用字」TTF（缺字风险），或全量嵌入换体积 | 高 | 部分 ✅ |
| **R2** | 图片跨份复用 | ✅ 解码字节按 dataURL 缓存；`embedPng` 仍每份一次 | 高 | ✅ |
| **R3** | 同窗连渲 | 取数一次后，同一渲染进程内连续 `renderPart(0..N-1)`，减少每份 hash 切页/boot | 高 | ⌛️ |
| **R4** | 去掉巨型 base64 IPC | ✅ PDF 字节改主进程临时文件；ready 只带路径字符串 | 中 | ✅ |
| **R5** |（可选）自适应让核 | HMI 空闲时缩短 yield / 略提渲染优先级；忙时保持 full IDLE——与 030 零闪目标权衡，**需产品拍板** | 视现场 | ⌛️ |

**不做（本条）**：改回默认 chromium；用 draft-v1 交差；假设「只优化 SQL」即可进 6 分钟。

## R3 评估结论（仍有效）

现架构每份靠 `route.fullPath` hash 切换触发 `boot()`；连渲需把「份循环」下沉进导出视图单次 boot 内，同时保住心跳/取消/「第 x/共 y」进度与 fill-cache 语义——中型重构，建议现场复测 R1a/R2/R4 收益后再开专项。

## 配置侧对照（非本条必做，可并行试）

- `maxRows` 1000→2000/2500 可减半份数，常能先掉到 ~8–11 分钟，但单份 2000 更易闪 HMI（见 030 口述）。  
- 本条代码优化与减份数可叠加；硬进 6 分钟还可能需要 Windows 多核或结批期少让核。

## 验收

- [ ] 同机复测：配方报表 · 矢量 · 5 万条 · 记录 `maxRows`、总耗时、首份 `dataMs`、各份 `pdfLibMs` 中位数（含 R4 后对比）。  
- [ ] 目标：**总墙钟 &lt; 6 分钟**（若仅代码复用未达标，在看板写清缺口与是否依赖 R3/R5/加核）。  
- [ ] 版式：抽查封面图、眉脚、表框、中文不回归（对照 036）。  
- [ ] 取数：仍仅首份全量 SQL；后续份 `sqlQueries≈0`。  
- [x] 单测：字体/图片缓存命中；R4 临时路径契约。  
- [ ] 单测：连渲份数与行切片一致（待 R3）。

## 风险

- 跨份缓存生命周期必须绑在同一次导出 job；取消/失败要清空，避免串模版。  
- 预裁字体需覆盖现场字符集，缺字比 subset 失败更隐蔽。  
- R3 连渲时心跳/取消/进度「第 x/共 y」仍要可用。  
- R5 与 030「HMI 必须可操作」冲突时，不得静默改默认让核策略。  
- R4 临时文件：路径须在 `app.getPath('temp')` 且前缀 `sd-sma-pdf-part-`；job 结束/取消扫尾，另有 >1h 孤儿清理。
