# ReportEditor：普通表格单元格可视化 SQL 保存被拒

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：⌛️ 已登记根因；**未开工改代码**（待用户说「开工」）。  
> **发现**：2026-07-15 · 0.3.100 现场 · 模版「SMA数据测试」封面普通表格选中单元格配库后保存失败。  
> **相关**：前端 [`model.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/model.ts) · 后端 [`schemas/report_template.py`](../_Prj/SD_SMA_ReportEditor/backend/schemas/report_template.py) · 单测 [`table-cell-scalar-sql.test.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/table-cell-scalar-sql.test.ts)。

---

# ⌛️ 未完成：`TemplateTableCell` 缺 `scalarSql*` 字段导致保存校验失败

## 现象（用户原话 / 截图）

- 场景：模版编辑器，**普通表格**（「数据库填充」开关为关），选中单个单元格，在右侧绑定面板配置 SQL / 可视化选表（`{{p0}}`/`{{p1}}`、连接、列等）。
- 顶栏橙条：

```text
保存失败：模版数据无效: 2 validation errors for ReportTemplate
coverElements.21.tableCells.0.0.scalarSqlVisual
  Extra inputs are not permitted
coverElements.21.tableCells.0.0.scalarSqlFillMode
  Extra inputs are not permitted
```

- 旁注：「存在单元格 OPC UA / SQL 绑定时无法开启（数据库填充）；请先清空绑定。」——这是**另一条规则**（整表填充与单元格绑定互斥），**不是**本条保存失败的直接原因。

## 这是干什么的（产品语义）

| 能力 | 含义 | 本场景 |
|------|------|--------|
| **数据库填充**（`tableSqlFill`） | 整表按查询结果动态扩行/列 | 关；且有单元格绑定时常禁止打开 |
| **单元格标量 SQL**（`bindingKind=sql` + `sqlText` / 可视化） | 普通表固定格子里查**一个值**填入该格 | ✅ 用户正在做的事；合法产品路径 |

也就是说：普通表里给单个格子配数据库，是**支持的设计**（前端 hydrate / 预览 / 属性面板均已接）；报错不是「不允许这样配」，而是**保存时后端 schema 跟不上前端**。

## 根因（CONFIRMED）

1. **前端** `TemplateTableCell`（及 Zone 单元格）已有：
   - `scalarSqlFillMode`（`manual` | `visual`）
   - `scalarSqlVisual`（连接 / 库表 / 取值列 / 条件列 / `whereParamSlot` 等）
2. **后端** 同名字段只挂在**控件级** `TemplateElement` / `LayoutZoneElement` 上；**单元格模型** `TemplateTableCell` 仅有：

```text
text / bindingKind / opcuaNodeId / sqlText / sqlParams / mongoQuery / bgColor / decimalPlaces
```

   **没有** `scalarSqlFillMode` / `scalarSqlVisual`。
3. 模型配置 `extra="forbid"` → 前端把可视化配置写进 `coverElements[…].tableCells[r][c]` 后，`ReportTemplate.model_validate` 直接判 **Extra inputs are not permitted**，API 返回「模版数据无效」。
4. 路径 `coverElements.21` 说明问题出在**封面区**第 22 个控件的表格格子上；正文 `bodyPages` 同类单元格同样会炸。

## 修复方向（开工后）

1. 在 `backend/schemas/report_template.py` 的 `TemplateTableCell` 增加与元素级一致的可选字段：
   - `scalarSqlFillMode: ScalarSqlFillMode | None = None`
   - `scalarSqlVisual: ScalarSqlVisualConfig | None = None`
2. 后端单测：带 `scalarSqlVisual` 的单元格模版 `parse_report_template` / `save` 通过；非法 extra 仍 forbid。
3. 回归：前端已有 `table-cell-scalar-sql.test.ts`；可补一条「往返 JSON 含单元格 visual」的 API/schema 测。
4. （可选 polish）保存失败文案把 pydantic 原文收成「表格单元格可视化 SQL 字段与后端 schema 不一致，请升级服务端」——次要。

## 验收

- [ ] 普通表（填充关）单元格可视化 SQL 配置后可保存、重开仍在  
- [ ] 封面 / 正文 / 版式区表格单元格均不报 extra_forbidden  
- [ ] 整表「数据库填充」与单元格绑定互斥提示行为不变  
- [ ] 控件级（非表格）标量 SQL 不受影响  

## 不做（本条）

- 不改「有单元格绑定则禁开数据库填充」产品规则  
- 不在本条做表格系统其它债（002 P1-A 横幅等）  
- 拍板登记阶段不改产品代码  

## 与 002 的关系

属前后端 schema 漂移的**正确性 bug**，不在 002 原审计清单内；独立跟踪本文件。修复极小（补两字段），建议优先于大表格债。
