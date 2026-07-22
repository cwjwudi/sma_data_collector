# ReportEditor：导出性能 5 档 + 同机降载 + 后台释放

> 本文件为 **任务看板 / 开工计划**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-22 · 代码线 **0.3.122**（五档默认预览稳；layout-v2 支持 bodyCards 续页）。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [034](034-🚧-ReportEditor全站架构复评-2026-07-22.md) · [003](003-⌛️-剩余任务与后续规划.md) · Plan [`0.3.122`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.122.md)。

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

# 📋 待做：导出页背景色需可编辑（2026-07-22）

**现象**（当前版本 Chromium 导出 / 预览栈，见冒烟封面截图）：纸面正文区带固定浅灰底 **`#f9f9fb`**（`rgb(249 249 251)`），Logo 等白底图会衬出灰底块；用户无法在模板/版式里改掉。  
**现状落点**（硬编码，非模板字段）：

- `TemplateMiniPage.vue` / `LayoutPresetMiniPage.vue`：`.mini-body { background: rgb(249 249 251); }`
- 眉/脚带另有 `rgb(239 239 246 / 0.52)` 等预览色，导出 plain 时仍可能残留正文灰底

**需求**：页背景色（至少正文区，是否含眉脚另定）改为**可编辑**——模板或版式快照可配置，预览与档 2/3/4（及必要时档 1）一致；默认可仍为白或现灰，但必须能改成纯白/`transparent`/自定义色。  
**状态**：⌛️ 仅记档，尚未实现。

---

# 手测（应用内）

| ID | 场景 | 状态 |
|----|------|------|
| **H1** | 新装/清 prefs：默认 **预览稳** | ⌛️ |
| **H2** | 档 0：仅内容草稿 | ⌛️ |
| **H3** | 档 1：矢量版式有坐标/表格框（抽模版） | ✅ 复验：中文可读 + 封面图表格/Logo（批导 `11-02-02`） |
| **H4** | 档 2/3/4：PDF≈预览 | ⌛️ |
| **H5** | 结批中侧栏探活停；后台再拆预热窗 | ⌛️ |
| **H6** | 后台结批：自动结批仍触发；mappView 对比档 1 vs 2 | ⌛️ |
| **H7** | 同机 99%：默认档 2；仍断则试档 1 | ⌛️ |

## 明确不做（本看板强制外）

- 8k / ≥4 份零闪硬验收 E2E（030 ⏸）  
- layout-v2 像素级对齐 printToPDF（渐进增强）  
