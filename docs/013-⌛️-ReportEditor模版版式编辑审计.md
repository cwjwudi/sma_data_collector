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

后端模板/版式路由目前只落盘，**不**调用 `append_audit`。

## 建议记录粒度（默认 · 待开工确认）

**记「持久化写操作」，不记每一次画布拖拽/选中**（避免审计爆炸、与现有「不含只读操作」文案一致）。

### MVP action 约定

| action | 触发 | object_type | summary 建议 |
|--------|------|-------------|--------------|
| `template.save` | 编辑器保存成功（含新建后首次 PUT） | `template` | 名称 + id 短缀 |
| `template.delete` | 列表删除成功 | `template` | 同上 |
| `template.duplicate` | 列表复制成功 | `template` | 源名 → 新名 |
| `template.rename` | 仅改名并落盘（若与 save 同路径可合并进 `template.save` + detail.reason） | `template` | 旧名 → 新名 |
| `layout.save` | 版式编辑器 / 列表新建保存成功 | `layout_preset` | 名称 + id |
| `layout.delete` | 删除版式成功 | `layout_preset` | 同上 |
| `layout.duplicate` | 复制版式成功 | `layout_preset` | 源 → 新 |

失败：同一 action、`result: fail`、`summary` 带错误摘要（对齐连接保存写法）。

### 默认不记（二期可选）

| 行为 | 原因 |
|------|------|
| 打开编辑器、切换页、预览刷新 | 只读 |
| 未保存离开 / 撤销重做 | 未持久化；若记需另定策略 |
| 显示顺序拖拽（仅 order 偏好） | 可另加 `template.reorder`；MVP 可跳过 |
| AI 代改模版/版式 | 若走同一 PUT，应**自然落入** `*.save`；若走独立工具，可加 `detail.source: ai` |

## 拟实现落点（建议）

### 方案优选：**前端写审计（与现有多数路径一致）**

1. **模版**  
   - `TemplateEditorWorkspace` 在 `api.putTemplate` 成功/失败后 `auditLog({ action: 'template.save', ... })`  
   - `TemplateManager`：删除 / 复制 / 改名（若独立于编辑器 save）各写一条  
2. **版式**  
   - 在 `saveLayoutPresetFlexible` / `deleteLayoutPresetFlexible` 成功失败处集中写（列表与编辑器共用，避免漏点）  
3. **`AuditLogSection`**：`actionOptions` 增加上表 actions；文案补充「模版与版式保存/删除」  
4. **单测**：对 registry / 薄封装做契约测（mock `auditLog` 被调用），或对关键调用点做字符串契约

### 备选：后端路由内 `append_audit`

- 优点：凡经 API 的写（含 AI）必记、前端难漏  
- 缺点：需区分「新建 vs 更新」、summary 中文需后端拼；与当前 DB 审计「前后端混写」风格可并存  
- 若选后端：在 `templates.py` / `layout_presets.py` 的 PUT/DELETE 成功后写；前端可不再重复（避免双记）

**默认推荐前端集中 + 版式走 registry**；若后续确认 AI 大量旁路写盘，再补后端一层或只后端。

## 验收（开工后）

- [ ] 模版编辑器保存 → 审计出现 `template.save`，可展开见 `object_id`  
- [ ] 模版删除 / 复制 → 对应 action  
- [ ] 版式保存 / 删除 / 复制 → `layout.*`  
- [ ] 失败路径有 `result: fail` 且不阻断保存错误提示  
- [ ] 操作审计筛选下拉含新类型；导出 JSON/CSV 能带上  
- [ ] 画布拖拽未保存不产生洪水日志

## 本轮范围

- ✅ 记录诉求与缺口（模版/版式零审计）  
- ✅ 拟定 MVP action 与「只记持久化」原则  
- ✅ 推荐落点（编辑器 / Manager / layout-registry）  
- ⌛️ 实现与发版（待开工）

## 开工前可确认（可选）

| # | 问题 | 默认 |
|---|------|------|
| Q1 | 是否记录每一次自动保存（若有）还是仅显式「保存」？ | **仅显式保存成功**（及列表 CRUD） |
| Q2 | 改名是否独立 action？ | **可并入 `*.save`，detail 带 rename** |
| Q3 | 前后端谁写？ | **前端为主**；AI 旁路多了再补后端 |
| Q4 | 是否记「打开编辑器」？ | **否** |
