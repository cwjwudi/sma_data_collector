# ReportEditor：「冒烟·一键无边框」模板打不开（列表可见、打开 404）

> 本文件为 **缺陷看板**；规则见 [CLAUDE.md](../CLAUDE.md)。
> **登记日期**：2026-08-08 · 本机 dev（`frontend/package.json` 0.3.146）。
> **现象来源**：本机冒烟测试。

---

# ✅ 已完成：根因定位

## 现象

- 模板列表能看到「冒烟·一键无边框」（`cde79a7c-4c33-4ce6-be64-af012cf5600c`）。
- 点开报错；`GET /api/templates/{id}` 返回 **404「模版不存在」**。

## 根因

列表走 `.meta.json` sidecar（不解析正文），打开走 `template_store.load_template` → `parse_report_template`（Pydantic 全量校验）。该文件为 **0.3.x 早期落盘**，携带 5 类旧值，后端 schema 收紧后校验失败（90 个 ValidationError），`load_template` 吞异常返回 None → 404：

| # | 旧值 | 现行 schema |
|---|------|-------------|
| 1 | `scalarSqlFillMode: "none"` | 仅 `manual` / `visual`（或缺省 None） |
| 2 | `nullDisplayMode: "empty"` | 仅 `blank` / `emptyLabel` / `fallbackText` |
| 3 | `mongoQuery: ""` | 对象或 None |
| 4 | `tableCells` / `tableColWidthsPx` / `tableColBgColors: null` | 数组 |
| 5 | `TemplateElement` 残留 `pageNumberMode: "plain"` | `extra="forbid"` 拒绝（版式区控件上浮残留，与 `ai_demo_template_ops._TEMPLATE_ELEMENT_DROP_KEYS` 同因） |

前端 hydrate 层（`normalizeScalarSqlFillMode` / `normalizeNullDisplayMode`）本就容忍并归一这些值，后端缺同等兼容层。

# ✅ 已完成：修复与验收

## 修复（后端 schema 兼容层，不改数据文件）

`backend/schemas/report_template.py`：新增 `_normalize_legacy_element_raw`，在 `TemplateTableCell` / `LayoutZoneElement` / `TemplateElement` 的 `model_validator(mode="before")` 统一归一：

- `scalarSqlFillMode`：大小写归一；`none`/`''`/未知 → None（原单元格字段级大小写归一并入此处）。
- `nullDisplayMode`：未知字符串 → `blank`（与前端对齐）。
- `mongoQuery`：`""` → None。
- `tableCells` / `tableColWidthsPx` / `tableColBgColors`：`null` → `[]`。
- 仅 `TemplateElement` 丢弃残留 `pageNumberMode`；`LayoutZoneElement` 该字段合法保留。

## 验收证据

- 新增 `backend/modules/test_template_legacy_field_compat.py`（4 例：元素/版式区/单元格/整模板现场复现）。
- 后端快速套件 `pytest modules -q -m "not integration"`：**281 passed**。
- 实测 `GET /api/templates/cde79a7c-…`：修复前 404 → 修复后 **200**，`name=冒烟·一键无边框`。

## 风险与边界

- 归一化只在解析入口生效；文件在下次保存前保持原样（保存后即写为新 schema）。
- 现场同期旧文件（如 Windows `backend-data`）同样受益，无需数据迁移脚本。
