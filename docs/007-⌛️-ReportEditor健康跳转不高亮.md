# ReportEditor 仪表盘健康项跳转后不亮控件

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 现象来源：现场/生产另一台电脑；用户反馈健康列表点击模版名进入编辑器后**没有任何控件被选中高亮**。  
> 关联：仪表盘「模版与版式健康」（`DashboardAssetHealth`）；绑定扫描不探活数据源。

---

# ⌛️ 未完成：健康告警点击跳转后控件无高亮

## 现场现象（2026-07-13）

1. 仪表盘「模版与版式健康」列出多条警告（截图场景含「连接未设置默认数据库」「绑定的数据库连接不存在」等）。  
2. 用户判断：生产机上**数据库连接本身应存在**；更可能是部分 **OPC UA 绑定当前为空节点**。  
3. 点击告警里的模版名跳进模版编辑器后：**画布上没有任何控件被选中/高亮**，无法直接落到问题控件。

## 产品预期（当前文案）

`binding_config_scan` 对 OPC 空节点类问题的 hint 写明：

> 「仪表盘点击模版名可跳转并自动选中；控件 ID：…」

即：**带 `meta.elementId` 的问题**应带 `?focus=<id>` 打开编辑器并选中该控件。

## 原因分析（代码对照 · 文档阶段，未改代码）

### A. 连接级告警本身不带控件 ID（与截图两类文案一致）

| kind | 来源 | meta 常见字段 | 能否 focus |
|------|------|---------------|------------|
| `missing_db` | `validate_bindings_against_config` → 按模版汇总的 `connection_id` | `connection_id`（无 `elementId`） | **否** |
| `missing_default_database` | 同上 | `connection_id` / `name` | **否** |

前端 `DashboardAssetHealth.templateEditorLink`：

```ts
const focus = typeof it.meta?.elementId === "string" ? it.meta.elementId.trim() : "";
query: focus ? { focus } : {}
```

无 `elementId` → 只打开模版，**故意不选中任何控件**。  
因此：若用户点的是「连接不存在 / 未设默认库」这类项，**不高亮是当前实现行为，不是跳转失败**。

这类告警是「整模版引用了某个连接 ID」级别的汇总，扫描侧没有展开到「哪些控件用了该连接」。

### B. OPC 空节点类告警应能高亮，但仍有缺口

| kind（示例） | 扫描侧 | meta |
|--------------|--------|------|
| `opc_binding_empty_node` | `binding_config_scan._check_opc_node` + placement | 含 `elementId`、`path`、`location` 等 |
| `sql_param_opcua_unconfigured` 等 | 部分仅有 `path` / `paramIndex` | **可能无 `elementId`** |

若生产现场实际是 OPC 空节点，但列表上仍显示成「连接不存在」等连接级文案，则点击仍无 focus——需对照该条 `kind` / `meta`（开发者工具 Network：`/assets/health-scan`）。

### C. 版式资产链接根本不进编辑器

版式问题：

```vue
<router-link … to="/layouts">…（版式）</router-link>
```

只进版式列表，**无版式编辑器 `focus` 路由**，更不会高亮控件。

### D. 即便 URL 带了 focus，页眉/页脚/版式区控件可能仍「选不中」

`TemplateEditorWorkspace`：

- `applyFocusFromRouteQuery`：`selId = focus`  
- `sel` 计算属性**只在**正文 `bodyPages` + 封面/末页**画布 body** 里找 id  
- **不包含** `headerElements` / `footerElements` / `*ZoneElements` 等  

因此：问题控件若在页眉页脚或封面版式装饰层，会切页（`watch(selId)` 有部分 sheet 切换），但 **`sel` 仍为 null → 无属性面板/无选中框高亮**。这与「OPC 绑在页眉/版式区」的现场假设吻合。

### E. 生产「库明明在」却报 missing_db 的可能解释（旁证，非跳转主因）

健康扫描**不探活**：只比对模版 JSON 里的 `connection_id` 与本机 `config.json` 的 `db_connections[].id`。

| 可能 | 说明 |
|------|------|
| 连接 ID 不一致 | 生产重建过连接（新 UUID），模版仍写旧 id → `missing_db` |
| 配置未同步 | 模版从别机拷来，连接配置未一并导入 |
| 演示/远程通道 | 特殊连接字段可能导致校验路径不同（需对照具体连接） |

「未设默认库」则是连接**存在**但 `database` 字段为空（MySQL 等）——与「库服务在跑」不是同一回事。

## 拟改（确认后开工 · 建议拆实现）

1. **连接级告警体验**  
   - 跳转后提示：「此为连接级问题，请到数据源检查连接 XXX；或打开模版后在绑定面板按连接筛选。」  
   - 可选：扫描展开为「每个引用该连接的控件」一条 issue（带 `elementId`），代价是列表变长。  
2. **OPC/控件级告警**  
   - 保证 `meta.elementId` 齐全；仪表盘对缺失 focus 的项明示「无法定位到控件」。  
3. **版式**  
   - 链接到 `LayoutPresetEditor` 并支持 `?focus=`。  
4. **选中模型**  
   - `sel` / 选中框覆盖页眉页脚与 zone 控件，或 focus 时临时切到可编辑层并选中。  
5. **验收**  
   - 单测：`missing_db` 无 focus；`opc_binding_empty_node` 有 focus；页眉 OPC 空节点 focus 后 `sel` 非空（修后）。

## 验收（实现后）

1. 点击带 `elementId` 的 OPC 空节点警告 → 编辑器选中对应控件（含页眉/区若在范围内）。  
2. 点击连接级警告 → 不假装高亮；有明确文案引导去数据源或列出引用控件。  
3. 版式警告可进版式编辑器并尽量定位。

## 本轮范围

- ✅ 记录现象与根因分析（本文档）  
- ⌛️ 代码修复与单测（待用户确认开工）

---

# ⌛️ 未完成：生产机健康告警与「库已存在 / 控件能选表」认知对齐

## 用户补充（2026-07-13）

现场确认：数据源里连接都配过；模版控件里也能正常选出**表 / 列 / 筛选条件**。因此「连接不存在 / 未设默认库」**不等于**当前可视化绑定不可用。

## 为何能选表，仍报「未设置默认数据库」

健康扫描只看 **数据源连接对象**上的 `database` 字段：

```text
config.json → db_connections[].database
```

而可视化 SQL（表/列/筛选）用的是**控件里**的库名，例如：

```text
scalarSqlVisual.database / tableSqlVisual.database（随控件保存）
```

目录接口也允许请求体临时带 `database`，**不强制**连接级默认库非空。

因此常见组合是：

| 位置 | 状态 | 结果 |
|------|------|------|
| 数据源表单「数据库」 | 空 | 健康扫描 → `missing_default_database` |
| 控件可视化面板里选的库 | 有值 | 能列库、选表、选列、筛选，预览正常 |

**这不是「库没配好」的矛盾，而是扫描口径偏严、与可视化路径不一致。**

运维上若只想消告警：打开**数据源 → 该连接 → 填写「数据库」并保存**（与控件里常用的库名一致即可）。  
不填也可以继续用可视化绑定；风险主要在**未带库名的手写标量 SQL / 部分导出路径**可能 1046。

## 为何能选表，仍报「绑定的数据库连接不存在」

扫描会**整份 JSON 深挖**所有 `connectionId`（含封面/封尾快照、版式快照、旧控件残留），再和本机 `db_connections[].id` 比对。

因此可能：

1. **当前正编辑的控件**绑的是存在的连接 A（能选表）；  
2. **同模版其它页 / 快照 / 旧控件**仍写着已删除或重建前的连接 B → 仍报 `missing_db`。

「数据源列表里都有连接」≠「模版 JSON 里每一个历史 connectionId 都还在」。

**建议核对：** 对该告警看 `meta.connection_id`，在数据源列表里搜这个 UUID；找不到就是陈旧引用。处理：打开模版各页/封面封尾，把仍指向旧 ID 的绑定改到现连接，或清掉废弃控件后保存再扫描。

## 和「跳转不高亮」的关系

这两类告警仍是**连接级汇总**，无 `elementId`，点模版名进编辑器**不会**高亮某个控件——与「控件其实能用」可以同时成立。
