# ReportEditor：批次报表 vs 非批次报表导出

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-08-07。  
> **拍板日期**：2026-08-08（Q1–Q9 现场确认）。  
> **实现日期**：2026-08-08（本机 TDD 闭环）。  
> **补强日期**：2026-08-09（历史多根 UX + 自动结批失败审计补 `reportKind`/`outputDir`；非批次手测证据入库）。  
> **范围**：报表生成落盘路径与模版/触发绑定配置。  
> **关联**：历史子文件夹 [010](010-✅-ReportEditor历史报表子文件夹穿透.md) · U 盘拷移 [022](022-✅-ReportEditor历史报表复制到U盘.md) · [027](027-✅-ReportEditor历史报表拷移与U盘审计.md)。

---

# ✅ 已完成：产品口径登记

## 区分两种报表生成

| 类型 | 与批号关系 | 落盘规则 |
|------|------------|----------|
| **批次报表** | 跟批号走（**现网默认行为**） | 在大文件夹下建以**批次号命名**的子文件夹，本批次全部报表文件放该子文件夹内 |
| **非批次报表** | **与批号无关** | 在模版上**单独指定目标文件夹**（本机绝对路径）；触发生成后，文件直接写入该指定文件夹（不再按批号建子目录） |

---

# ✅ 已完成：Q1–Q9 产品拍板（2026-08-08）

| # | 结论 | 口径 |
|---|------|------|
| **Q1** | **A** | 「批次 / 非批次」类型**只挂模版**；模版定了就全局按这种落盘（绑定不覆盖、不另挂类型） |
| **Q2** | **A** | 非批次「目标文件夹」**只允许本机绝对路径**（如 `D:\Reports\Daily`）；相对路径/非法路径 → **显式失败**，禁止 silently 落到批号目录 |
| **Q3** | **A** | 非批次产出**进历史报表 + 写审计**（与批次一样能看、能拷 U 盘） |
| **Q4** | **A** | 手动「导出 PDF」**也按类型走**（批次建批号目录 / 非批次去模版指定目录） |
| **Q5** | **A** | 手动导出且类型=批次、但当前无批号 → **报错，禁止导出**（不弹窗填批号、不回落全局根） |
| **Q6** | **A** | 非批次文件名规则与现网批次相同（模版名 + 时间戳等），**只是目录不同**；本期不单独配文件名模板 |
| **Q7** | **B** | 历史支持**多根**：全局导出根 + 各模版 `nonBatchOutputDir` 聚合扫描（兑现 Q3「能看、能拷」） |
| **Q8** | **B** | 非批次目标目录不存在时 → **创建该目录（及父目录）**；创建失败/非目录/非绝对路径仍显式失败 |
| **Q9** | **C** | 批次批号：文件名 OPC **或** 目录 OPC **任一有值**即可建 `全局根/<批号>/`；**都没有**才失败（取消静默回落全局根） |

---

# ✅ 已完成：模型 / 调度 / UI / 历史多根实现（2026-08-08，本机 TDD）

## 数据模型

| 位置 | 变更 |
| --- | --- |
| `frontend/src/lib/report-template/model.ts` | `ReportTemplate` 增 `reportKind?: "batch"\|"nonBatch"`、`nonBatchOutputDir?: string`；`normalizeReportKind`；`migrateReportTemplate` 缺省补 `batch`/`""`；新建模版默认 `batch` |
| `backend/schemas/report_template.py` | 同名字段（Literal 缺省 `batch`），声明在 `updatedAt` 之后、大数组之前（落盘 JSON 头部，供 head 快扫）；`ReportTemplateSummary` 同步；`parse_report_template` 容错 |
| `backend/modules/template_store.py` | `_summary_from_raw` / `_fast_summary_from_head` 提取新字段（sidecar 与头部快扫均带类型与目录） |
| `frontend/src/api/templates.ts` | `TemplateSummary` 增可选 `reportKind` / `nonBatchOutputDir`（旧后端缺省视为 batch） |

## 导出调度（自动结批 + 手动共用）

- **新模块** `frontend/src/lib/resolve-report-output-dir.ts`：`resolveReportOutputTarget()`
  - `batch`：根目录必填；批号候选 = 结批文件名 OPC → 保存目录 OPC（沿用 `resolveAutoBatchOpcBinding` 同一优先级），首个有效值 → `根/<批号>/`；**均无效 → 显式失败**（Q5A/Q9C，不再回落根目录）。
  - `nonBatch`：模版绝对路径（盘符/UNC/POSIX 校验）；缺失/相对路径 → 显式失败（Q2A）；目录创建由写盘端 `main.cjs` 既有 `mkdir recursive` 完成（Q8B，零改动）。
- **替换删除** `resolve-auto-export-dir.ts`（旧「opcua-fallback 静默回落」语义整体废除）。
- `report-auto-export-trigger-service.ts`：`runAutoPdfExport` 按模版类型解析目录；轮询门禁改为「仅当根缺失且所有启用绑定均为批次」才拦截（非批次不依赖根目录）；成功审计 detail 增 `reportKind` / `outputDir` / `batchNo`。
- `ReportGenerator.vue` 手动导出（模拟结批）：与自动同一解析——批次缺根先弹选根目录，无有效批号报错禁止导出并写失败审计；非批次直落模版目录；按钮文案改「模拟结批（按模版类型保存）」；「保底目录」文案改「导出根目录」并注明无批号失败。

## 模版编辑器 UI

- `TemplateEditorWorkspace.vue`：纸张/方向旁增「报表类型」下拉（批次/非批次）；非批次露出「目标文件夹」输入 + 目录选择按钮；**保存时校验**绝对路径，非法阻止保存（Q2A）。

## 历史报表多根（Q7B）

- **新模块** `frontend/src/lib/report-history-roots.ts`：`buildHistoryRootOptions()` 聚合全局导出根 + 各非批次模版目录（大小写/分隔符归一去重）。
- `ReportHistory.vue`：左侧「浏览目录」下拉切换根；浏览非批次目录**不回写**全局 `watchDir`；分屏/单屏、复制/移动、U 盘拷移沿用现网（`sourceRoot` 取当前左根）。

## 测试证据

- 新增 `resolve-report-output-dir.test.ts`（批号优先级/回落/双失败/根缺失/非批次绝对路径与相对路径拒绝/批号段清洗）+ `report-history-roots.test.ts`（聚合/去重/无根）。
- 前端相关 vitest（2026-08-09 复跑）：`resolve-report-output-dir` + `report-history-roots` **2 文件 / 32 用例全绿**。
- 后端 schema 自检：旧 JSON 缺字段 → `batch`；新字段位于落盘 JSON 头部（`['schemaVersion','id','name','updatedAt','reportKind','nonBatchOutputDir','elements']`）。

---

# ✅ 已完成：历史多根 UX 与失败审计补强（2026-08-09）

## 问题

1. **仅有非批次根、无全局导出根**时：`loadRootOptions` 不自动选中首个根 → 历史页左侧空白。
2. **仅 1 个非批次根**时：原 `rootOptions.length > 1` 才显示下拉 → 用户看不见当前浏览根。
3. **自动结批失败**审计 `export.auto_pdf` 的 `extra` 缺 `reportKind` / `outputDir`（成功路径已有）。

## 修复

| 位置 | 变更 |
| --- | --- |
| `ReportHistory.vue` | `showRootSelector`：有非批次根即显示；`loadRootOptions` 后若当前左根无效则落首个选项；挂载/配置恢复后按左根刷新列表 |
| `report-auto-export-trigger-service.ts` | 失败审计补 `reportKind`；解析仍成功时再补 `outputDir` |

---

# ✅ 已完成：非批次 Windows 手测与审计证据（support-pack）

证据包：`_Temp/support-pack-0.3.146/`（现场 UA 实为较新桌面壳；模版/审计内容有效）。

| 项 | 证据 |
| --- | --- |
| 非批次模版落盘 | `a044-smoke-80k-split-sqlite.json`：`reportKind=nonBatch`，`nonBatchOutputDir=C:\Users\dp\Desktop\ReportEditor044Smoke` |
| 手动模拟结批直落指定目录 | 多条 `export.manual_pdf` `result=ok`，`detail.reportKind=nonBatch`，`outputDir` 与模版一致；PDF 路径在该目录下（含分卷 part） |
| 失败审计字段 | 同模版 `export.manual_pdf` `result=fail` 亦带 `reportKind`/`outputDir` |
| 另一非批次样例 | `8f650efa-…` → `C:\Users\dp\Desktop\ReportEditorNonBatchTest\`，审计含 `reportKind=nonBatch` |

勾选对照：

- [x] 手动模拟结批：非批次直落指定目录（审计 + 落盘路径）。  
- [x] 审计：`export.manual_pdf` detail 含 `reportKind` / `outputDir`（非批次已验；批次 `batchNo` 由单测与成功审计路径覆盖）。  
- [x] 旧模版兼容：缺字段默认 `batch`（schema/migrate 单测与后端自检）。

---

# ⌛️ 未完成：批次 OPC / 自动结批现场手测

需现场 PLC / 自动结批绑定，本机 support-pack **无** `export.auto_pdf` 样本：

- [ ] 批次模版自动结批：落 `根\<批号>\`；文件名 OPC 与目录 OPC 各验一次；两路均无值时结批失败且 PLC 反馈状态码。  
- [ ] 非批次模版自动结批：落模版绝对路径；目录不存在自动创建；相对路径/未配置时显式失败。  
- [ ] 手动模拟结批：批次无批号 → 报错禁止导出（代码已实现；缺现场截图/审计样本）。  
- [ ] 历史报表：下拉切换到非批次目录可见产出、可删/可拷 U 盘；全局 `watchDir` 不被非批次浏览污染（UX 已修；缺手测勾选）。

## 现场提醒（行为变化）

- **批次导出不再静默回落**：现网若有「未绑批号 OPC、靠保底目录直落根」的用法，升级后会显式失败——需在「生成报表」补绑批号变量，或把模版改为非批次并指定目录。
