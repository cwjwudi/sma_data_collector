# ReportEditor：导出性能 5 档 + 同机降载 + 后台释放

> 本文件为 **任务看板 / 开工计划**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-22 · 代码线 **0.3.122**（五档默认预览稳；layout-v2 支持 bodyCards 续页）。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [034](034-🚧-ReportEditor全站架构复评-2026-07-22.md) · [036](036-🚧-ReportEditor矢量档与预览稳样式对照.md)（档 1↔2 样式完整对照） · [003](003-⌛️-剩余任务与后续规划.md) · Plan [`0.3.122`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.122.md)。

---

# ✅ 已完成：产品拍板（2026-07-22）

## 一句话目标

在 **PDF≈预览（可交付）** 的前提下，用 **5 档步进滑条** 调节导出抢核程度；档 0–1 走 pdf-lib（最省机 / 矢量版式），档 2–4 走 chromium 预览级并按程度降载；后台额外释放预热窗与次要轮询。

## 已锁定

| 项 | 决定 |
|----|------|
| UI | 步进滑条（离散 **5** 档） |
| 默认 | **档 2「预览稳」**（`exportPerfTier=2`） |
| 档 0 | pdf-lib **仅内容**（`draft-v1`） |
| 档 1 | pdf-lib **矢量版式**（`layout-v2`，必做） |
| 档 2 | chromium 预览级 · **最终妥协**（默认） |
| 档 3 | chromium · 质量与功能折中 |
| 档 4 | chromium · **不妥协** |
| 后台 | 可多放资源（预热窗/探活/Dashboard/AI）；**不停**自动结批与 PLC 心跳 |
| 030 8k 零闪硬验收 | 仍 **⏸ 挂起** |

## 五档定义

| 档 | 名 | engine | fidelity | 预热 | 并行 hint | 降载 | yield | PDF |
|----|----|--------|----------|------|-----------|------|-------|-----|
| 0 | 仅内容 | pdf-lib | draft-v1 | 0 | 1 | full | 200 | 草稿 |
| 1 | 矢量版式 | pdf-lib | layout-v2 | 0 | 1 | full | 200 | 坐标版式 |
| 2 | **预览稳（默认）** | chromium | printToPDF | 0 | 1 | full | 200 | 预览级 |
| 3 | 功能折中 | chromium | printToPDF | 1 | 1 | full | 80 | 预览级 |
| 4 | 不妥协 | chromium | printToPDF | 2 | 2 | basic | 40 | 预览级 |

旧四档迁移：`0→0`，`1→2`，`2→3`，`3→4`（`exportPerfTierScale=5`）。

---

# ✅ 代码进度（0.3.122+）

- [x] 五档模型 + 迁移 + 契约  
- [x] UI 滑条 max=4；默认预览稳 → 0.3.123 改为分段按钮  
- [x] 档 1 `layout-v2`：坐标文本/表格线 + **bodyCards 续页**（与预览分卡对齐）  
- [x] 后台：拆空闲预热窗 + BelowNormal + 次要轮询暂停  
- [ ] 手测 H1–H7（含档 1 版式抽检、后台结批 mappView）  
- [x] macOS arm64 DMG 0.3.122 / 0.3.123 + `latest.json` SHA（Portal 未挂载，Win 包另打）  

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

**验收**：单测 `layout-model-body-bg` + layout-v2 白/红/transparent；装包手测 ⌛️。

---

# 手测（应用内）

| ID | 场景 | 状态 |
|----|------|------|
| **H1** | 新装/清 prefs：默认 **预览稳** | ⌛️ |
| **H2** | 档 0：仅内容草稿 | ⌛️ |
| **H3** | 档 1：矢量版式有坐标/表格框（抽模版） | ✅ 复验：中文可读 + 封面图表格/Logo；**0.3.131** 角色色边 `retest-0.3.131-10-24-32` |
| **H4** | 档 2/3/4：PDF≈预览 | ⌛️ |
| **H5** | 结批中侧栏探活停；后台再拆预热窗 | ⌛️ |
| **H6** | 后台结批：自动结批仍触发；mappView 对比档 1 vs 2 | ⌛️ |
| **H7** | 同机 99%：默认档 2；仍断则试档 1 | ⌛️ |

## 明确不做（本看板强制外）

- 8k / ≥4 份零闪硬验收 E2E（030 ⏸）  
- layout-v2 像素级对齐 printToPDF（渐进增强；**可交付观感差**见 [036](036-🚧-ReportEditor矢量档与预览稳样式对照.md)）  
