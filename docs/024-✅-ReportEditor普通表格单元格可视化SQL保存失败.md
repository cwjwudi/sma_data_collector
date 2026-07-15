# ReportEditor：普通表格单元格可视化 SQL 保存被拒

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：✅ 已修复（**0.3.101**）。  
> **发现**：2026-07-15 · 0.3.100 现场 · 模版「SMA数据测试」封面普通表格选中单元格配库后保存失败。  
> **相关**：前端 [`model.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/model.ts) · 后端 [`schemas/report_template.py`](../_Prj/SD_SMA_ReportEditor/backend/schemas/report_template.py) · 单测 [`test_template_table_cell_scalar_sql.py`](../_Prj/SD_SMA_ReportEditor/backend/modules/test_template_table_cell_scalar_sql.py)。

---

# ✅ 已完成：`TemplateTableCell` 补齐 `scalarSql*`（→ 0.3.101）

## 现象（用户原话 / 截图）

- 场景：模版编辑器，**普通表格**（「数据库填充」开关为关），选中单个单元格，在右侧绑定面板配置 SQL / 可视化选表。
- 顶栏橙条：`coverElements.….tableCells.….scalarSqlVisual` / `scalarSqlFillMode` → **Extra inputs are not permitted**。
- 「有单元格绑定则禁开数据库填充」是互斥提示，**不是**本保存失败原因。

## 产品语义

| 能力 | 含义 |
|------|------|
| **数据库填充** | 整表动态扩行（`tableSqlFill`） |
| **单元格标量 SQL** | 固定格子查一个值；普通表合法路径 |

## 根因（CONFIRMED · 已证伪「不允许配库」）

1. 前端单元格早已支持 `scalarSqlFillMode` / `scalarSqlVisual`。  
2. 后端同字段只在**控件级** `TemplateElement` / `LayoutZoneElement`；**`TemplateTableCell` 缺失**。  
3. `extra="forbid"` → 保存校验拒收。  
4. 现场偶发 `scalarSqlFillMode='Visual'`（大小写）；补字段后若无归一化会变成 enum 错，故单元格侧加 `before` 校验转小写。

## 修复规划（已执行）

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1 | `TemplateTableCell` 增加 `scalarSqlFillMode` / `scalarSqlVisual` | ✅ |
| 2 | `scalarSqlFillMode` 大小写归一（`Visual`→`visual`） | ✅ |
| 3 | 后端单测 `test_template_table_cell_scalar_sql.py`（封面复现 / 正文往返 / extra 仍 forbid / 控件级不受影响） | ✅ 6 passed |
| 4 | bump **0.3.101** + `APP_VERSION` + 007 | ✅ |
| — | 保存失败文案 polish | 不做（本版） |

## 验收

- [x] schema 接受单元格 `scalarSql*`；非法 extra 仍 forbid  
- [x] 封面路径复现用例通过；正文 roundtrip 保留 visual  
- [x] `'Visual'` / `'MANUAL'` 归一为小写  
- [ ] 安装 0.3.101 后现场：普通表单元格可视化 SQL 可保存重开（手测）  

## 不做

- 不改「有单元格绑定则禁开数据库填充」  
- 不在本条做 002 其它表格债  
