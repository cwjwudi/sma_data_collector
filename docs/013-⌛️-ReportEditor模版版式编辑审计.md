# ReportEditor：报表模版与版式编辑写入操作审计

> 本文件为 **任务看板 / 实现计划**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **本轮仅写计划，未改代码。**  
> 产品诉求：在**报表模版编辑**与**版式（页眉页脚）编辑**时记录审计，便于现场追溯。  
> 现有能力：[`auditLog.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/auditLog.ts)、[`AuditLogSection.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/settings/audit/AuditLogSection.vue)、后端 [`audit_log.py`](../_Prj/SD_SMA_ReportEditor/backend/modules/audit_log.py)。

---

# ⌛️ 未完成：模版 / 版式编辑关键写操作落审计

## 产品诉求（2026-07-13）

1. 用户在**报表模版**（列表管理 + 编辑器保存）与**版式**编辑相关操作时，应在「操作审计」中可见。  
2. 与现有数据源连接、导出结批、配置导入导出等审计风格一致（`action` + `summary` + `object_id`，失败不阻断主流程）。  
3. 本轮**先写看板**；实现另开版本切片。

## 现状（代码对照）

| 域 | 写路径 | 是否已写审计 |
|----|--------|--------------|
| DB / OPC 连接保存删除 | 前端 `auditLog` + 部分后端 `append_audit` | ✅ |
| 导出结批 / 写回 PLC | `report-auto-export-trigger-service` / `ReportGenerator` | ✅ |
| 配置导入导出 / 复位 / 更新 | Settings 各区块 | ✅ |
| **模版** `PUT/DELETE /templates` | [`TemplateEditorWorkspace`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateEditorWorkspace.vue) 保存；[`TemplateManager`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/TemplateManager.vue) 复制/删/改名等 | ❌ 无 `template.*` |
| **版式** `PUT/DELETE /layout-presets` | [`layout-registry`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/layout-registry.ts) `saveLayoutPresetFlexible`；[`LayoutPresets`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/LayoutPresets.vue) / [`LayoutPresetEditor`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/LayoutPresetEditor.vue) | ❌ 无 `layout.*` |
| 审计筛选下拉 `actionOptions` | `AuditLogSection.vue` | 无模版/版式项 |

后端模板/版式路由目前只落盘，**不**调用 `append_audit`。审计文件为 JSONL **追加**（约 90 天 / 最多约 5000 行）。

## 已确认约定（2026-07-13）

### 记什么

**只记持久化写操作**，不记拖拽/选中/打开/预览/撤销。

| action | 触发 | object_type | summary |
|--------|------|-------------|---------|
| `template.save` | PUT 模版成功（含新建首次、应用版式导致的 PUT） | `template` | 名称 + id 短缀；折叠后「共 N 次保存」 |
| `template.delete` | 删除成功（含批量删 → **一条汇总**） | `template` | 单删：名称；批删：数量 + 最多 5 名 +「等」 |
| `template.duplicate` | 复制成功 | `template` | 源名 → 新名 |
| `layout.save` | PUT 版式成功（含新建） | `layout_preset` | 同模版 save |
| `layout.delete` | 删除成功（批删同模版规则） | `layout_preset` | 同模版 delete |
| `layout.duplicate` | 复制成功 | `layout_preset` | 源 → 新 |

- **改名**：并入 `*.save`（`detail.reason: rename` 可选），不单独 `*.rename`。  
- **失败**：同 action、`result: fail`、短错误；**不折叠**；不阻断主流程报错。  
- **新建**：首次落盘即 `*.save`（可 `detail.created: true`），不造 `*.create`。  
- **配置导入**：只记现有 `config.import`，**不**为每个模版再刷 `template.save`。  
- **显示顺序**：MVP 不记。  
- **AI 代写**：走同一 PUT → 自然 `*.save`（后端写）。

### 15 分钟折叠（已确认）

仅 **`template.save` / `layout.save` 且 result=ok**：

- 键：`action` + `object_id`  
- 距**上一条同键成功 save** &lt; **15 分钟** → **不新开行**：刷新 `ts`、`detail.save_count` +1、更新 summary 名称、「共 N 次保存」；`detail.first_ts` / `last_ts`  
- 删 / 复制 **不**折叠  
- 改名后 id 不变 → 继续叠原 save 条并刷新名称  
- 窗内 fail 再 ok：fail 单独条；ok 相对**上一成功 save**判断是否折叠  

不做内容 diff / 画布快照。

### 谁写（已确认）

| 动作 | 写入方 |
|------|--------|
| `*.save`（含折叠） | **后端** PUT 成功后 `append_or_coalesce_audit`（AI/旁路也不漏） |
| `*.delete` / `*.duplicate` | **前端** Manager / layout-registry（批删一条汇总） |
| 禁止 | 同一成功 save 前后端各写一条 |

`AuditLogSection.actionOptions` 增加上表 actions；展开可见 `save_count` / 起止时间。

### 拟改落点

1. `audit_log.py`：`append_or_coalesce_audit(..., window_sec=900)`（改写 JSONL 最近匹配行或追加）。  
2. `templates` / `layout_presets` 路由 PUT 成功后调 coalesce（summary 用 body 名称）。  
3. DELETE 可由后端也写（可选）；默认删/复制前端写，避免与批删汇总逻辑分叉——**批删必须前端或统一后端批接口写一条**。  
4. 前端：删/复制/`auditLog`；**保存路径不再** `auditLog(template.save)`，防双记。  
5. 单测：`test_audit_coalesce.py` + 前端批删摘要纯函数测。

---

## 测试用例（已补全 · 开工必跟）

> 风格对齐 [docs/014](014-✅-ReportEditor-AI流式输出.md)。  
> **B** = 后端 pytest（tmp_path JSONL）；**F** = 前端 vitest；**M** = 手工；**R** = 回归。

### B. 后端 · coalesce 与路由

| # | 用例 | 期望 |
|---|------|------|
| B1 | 同 `object_id` 两次 `template.save` ok，间隔 &lt;15min | 文件仍 **1** 行；`save_count=2`；`ts`/`last_ts` 为第二次；summary 含「共 2 次」 |
| B2 | 两次 ok，间隔 ≥15min | **2** 行；各 `save_count=1`（或无 count） |
| B3 | ok → fail → ok（均 &lt;15min） | fail **独立 1** 行；两条 ok **折叠为 1** 行（相对上一成功 save） |
| B4 | 不同 `object_id` 交替 save | 互不折叠，各至少 1 行 |
| B5 | `layout.save` 同 B1 | 版式同样折叠 |
| B6 | coalesce 键忽略 fail 行 | 找「最近成功同键」时跳过中间的 fail |
| B7 | 改名后同 id 再 save（&lt;15min） | 叠同一行；summary 名称变为新名 |
| B8 | PUT 模版 API 成功（集成/mock） | 自动出现 `template.save`，前端未再 POST 同条 |
| B9 | 空 `object_id` | 不折叠（或每次追加）；不损坏文件 |
| B10 | 连续两次物理 `delete` 审计 | 若走后端删：**2** 行不折；批删见 F3 |

### F. 前端 · 删/复制/筛选/防双记

| # | 用例 | 期望 |
|---|------|------|
| F1 | 编辑器保存 | **不**再调用 `auditLog('template.save')`（由后端写）；可用 spy 断言 |
| F2 | 单条删除成功 | `template.delete` + 名称 summary；fail 时 `result:fail` |
| F3 | 批量删 3 个模版 | **1** 次 `auditLog`；summary 含 `3`；`detail.ids.length===3`；名称列表 ≤5 |
| F4 | 复制模版 | `template.duplicate`；summary 含源→新 |
| F5 | 版式删/复制 | `layout.delete` / `layout.duplicate` 同 F2/F4 |
| F6 | `actionOptions` | 含 `template.save/delete/duplicate` 与 `layout.*` |
| F7 | 批删摘要纯函数 | 1 个名 / 5 个名 / 6 个名截断「等」 |
| F8 | 配置导入路径 | 不循环调用 `template.save` 审计 |

### M. 手工 / 真机

| # | 用例 | 期望 |
|---|------|------|
| M1 | 模版编辑器 15 分钟内保存 ≥5 次 | 审计列表 **1** 条 save，展开 `save_count≥5` |
| M2 | 等满 15 分钟再保存 | **新**一条 save |
| M3 | 保存故意失败（断后端）再成功 | 有 fail 条；成功条可折叠到更早成功 save |
| M4 | 删除、复制各一次 | 各 1 条中文可读 |
| M5 | 多选删多个模版 | **1** 条汇总 |
| M6 | 版式编辑器重复 M1/M4 | 同模版行为 |
| M7 | 操作审计筛选新 action + 导出 CSV | 能滤、能导出含新类型 |
| M8 | 只拖拽改位置不保存 | **无**新 `template.save` |
| M9 | 配置导入含模版 | 有 `config.import`；**无**洪水 `template.save` |
| M10 | AI 工具改模版并落盘（若环境可用） | 有 `template.save`（后端），无双记 |

### R. 回归

| # | 说明 |
|---|------|
| R1 | 原有连接保存 / 导出 / 配置导入审计仍可用 |
| R2 | 审计导出 JSON/CSV、分页、日期筛选不回归 |
| R3 | JSONL trim（90 天 / 5000 行）在大量 coalesce 改写后仍正常 |

### 单测落点建议

```text
backend/modules/test_audit_coalesce.py     ← B1–B7、B9
backend/...（路由测可选）                   ← B8
frontend/.../audit-batch-summary.test.ts   ← F7
frontend 对 TemplateManager 删/复制 spy    ← F2–F4（或薄封装测）
```

## 验收（开工后）

- [ ] 模版/版式保存 → `*.save`；15 分钟内多次保存折叠为一条  
- [ ] 删 / 复制各一条；批删一条汇总  
- [ ] 失败独立；不阻断主流程  
- [ ] 前端保存不双记；筛选与导出含新 action  
- [ ] 拖拽不保存无洪水；配置导入不拆记  
- [ ] B/F 单测通过；M 冒烟勾选  

## 本轮范围

- ✅ 诉求与缺口  
- ✅ 只记持久化 + **15 分钟折叠（已确认）**  
- ✅ **G1–G10 / Q1–Q7 默认已拍板写入**  
- ✅ **测试用例 B1–B10 / F1–F8 / M1–M10 / R1–R3**  
- ⌛️ 实现与发版（待开工）

## 拍板一览（全部按默认）

| # | 结论 |
|---|------|
| Q1 | 仅显式保存 + 列表 CRUD（无「打开编辑器」） |
| Q2 | 改名并入 `*.save` |
| Q3 | save 后端 coalesce；删/复制前端（批删一条） |
| Q4 | 不记打开编辑器 |
| Q5 | 15 分钟窗折叠成功 save |
| Q6 | 批量删除一条汇总 |
| Q7 | 配置导入不拆成逐模版 save |
