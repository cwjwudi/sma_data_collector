# ReportEditor 仪表盘健康项跳转后不亮控件

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 现象来源：现场/生产另一台电脑；用户反馈健康列表点击模版名进入编辑器后**没有任何控件被选中高亮**。  
> 关联：仪表盘「模版与版式健康」（`DashboardAssetHealth`）；绑定扫描不探活数据源。  
> 相关代码：`DashboardAssetHealth.vue`、`TemplateEditorWorkspace.vue`（`applyFocusFromRouteQuery` / `sel`）、`asset_health_scan.py`、`binding_config_scan.py`、`ai_template_bindings.py`。

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

1. **连接级告警体验**（对应用例 **A / D / G**）  
   - 跳转后提示：「此为连接级问题，请到数据源检查连接 XXX；或打开模版后在绑定面板按连接筛选。」  
   - 可选：扫描展开为「每个引用该连接的控件」一条 issue（带 `elementId`），代价是列表变长。  
2. **OPC/控件级告警**（**B / C**）  
   - 保证 `meta.elementId` 齐全；仪表盘对缺失 focus 的项明示「无法定位到控件」。  
3. **版式**（**E**）  
   - 链接到 `LayoutPresetEditor` 并支持 `?focus=`。  
4. **选中模型**（**C**）  
   - `sel` / 选中框覆盖页眉页脚与 zone 控件，或 focus 时临时切到可编辑层并选中。  
5. **验收**：按下表矩阵 A–G 落地单测 + 手工；修后 C3/C4 应变绿。

## 测试用例（实现时必须覆盖；先红后绿）

> 约定：  
> - **可 focus** = issue `meta.elementId` 非空字符串 → 链接带 `?focus=<id>`。  
> - **选中高亮** = 编辑器 `selId === focus` 且 `sel` 非空（属性面板 / 画布选中框可见）。  
> - 「修前」若干断言描述**当前缺口**；实现时按拟改目标翻绿，勿为迁就旧行为改弱断言。

### A. 仪表盘跳转链接（vitest · 建议抽纯函数或扩 `DashboardAssetHealth` 相关测）

| # | 用例 | 前置 | 操作 / 断言 |
|---|------|------|-------------|
| A1 | 连接级 `missing_db` 无 focus | issue：`kind=missing_db`，`meta={ connection_id }`，无 `elementId` | `templateEditorLink` → `query` 为空对象；`params.id === assetId` |
| A2 | 连接级 `missing_default_database` 无 focus | 同上，`kind=missing_default_database` | 同 A1，无 `?focus` |
| A3 | OPC 空节点有 focus | `kind=opc_binding_empty_node`，`meta.elementId="e1"` | `query: { focus: "e1" }` |
| A4 | `elementId` 仅空白 | `meta.elementId="  "` | 视为不可 focus，`query` 为空（与 `.trim()` 一致） |
| A5 | 非字符串 `elementId` | `meta.elementId=123` 或缺失 | 无 focus（仅接受 string） |
| A6 | 模版名链接目标 | `assetKind=template` | `name: "TemplateEditor"`，`params.id` 正确 |
| A7 | 无 focus 项 UI 明示（修后） | 连接级 issue | 列表或 hint 含「连接级 / 无法定位到单个控件」类文案（实现定稿）；修前可红 |

### B. 扫描侧 meta 契约（pytest · 扩 `test_binding_config_scan.py` / `test_asset_health_scan.py`）

| # | 用例 | 断言 |
|---|------|------|
| B1 | 正文 OPC 空节点带 `elementId` | 既有 `test_empty_opc_binding`：`meta.elementId == "e1"`；`location` 含正文页 |
| B2 | 页眉 OPC 空节点带 `elementId` | 扩 `test_empty_opc_binding_on_page2_header`：`meta.elementId == "h1"`；`location` 含页眉 |
| B3 | 封面画布 OPC 空节点带 `elementId` | `coverElements` / 封面区：`meta.elementId` 非空；message 含封面定位 |
| B4 | 表格单元格 OPC 空节点带宿主 `elementId` | `test_table_cell_opc_location`：`meta.elementId == "tbl1"`（或约定的宿主 id） |
| B5 | `missing_db` 汇总无 `elementId` | 模版 JSON 含陈旧 `connectionId`，config 无该 id → issue `kind=missing_db`，`meta` 有 `connection_id`、**无** `elementId` |
| B6 | `missing_default_database` 无 `elementId` | 连接存在但 `database=""` → 同上结构 |
| B7 | （可选切片）展开为控件级 | 若实现「按引用控件拆条」：每条带 `elementId` + 同一 `connection_id`；未做则本条标 ⌛️ 跳过 |
| B8 | 仅有 `path` 无 placement 的 SQL 参数类 | 文档化现状：`sql_param_*` 等是否带 `elementId`；修后目标「能反查则补齐」 |

### C. 编辑器 focus → 选中模型（vitest · 建议抽 `findSelectableElement` / 扩 workspace 相关测）

| # | 用例 | 前置 | 期望（修后） | 修前现状 |
|---|------|------|--------------|----------|
| C1 | 正文控件 focus | `bodyPages[0]` 含 `id=e1`，`route.query.focus=e1` | `selId=e1`，`sel` 非空，属性面板绑定该控件 | 已基本满足 |
| C2 | 封面画布 body focus | 控件在 `coverElements`（或封面 body 列表） | 切到 cover sheet；`sel` 非空 | 多半已满足（`sel` 查 cover/back body） |
| C3 | 页眉控件 focus | `headerElements` 含 `id=h1`，`focus=h1` | **`sel` 非空**；选中框/属性面板可见；可切到 body sheet | **缺口**：`sel` 不含 header → 无高亮 |
| C4 | 页脚 / zone 装饰 focus | `footerElements` 或 `coverBodyZoneElements` 等 | 同 C3，可定位并选中 | **缺口**：同 C3 |
| C5 | focus 指向不存在的 id | 模版无该 id | 不抛错；不假选中；可提示「控件已删除」 | 现状：`selId` 设上但 `sel=null` |
| C6 | 无 `focus` query | 仅打开模版 | `selId` 保持默认（通常 null），不误选 | 应已满足 |
| C7 | `applyFocusFromRouteQuery` 触发时机 | 模版 `editing` 就绪后 / `route.query.focus` 变化 | 迟到到达的 focus 仍能选中（watch 覆盖） | 对照现有 watch |

> 实现建议：把「按 id 在模版各层查找元素」抽成纯函数，C1–C5 不依赖整页挂载；UI 冒烟可另加一两条。

### D. 连接级体验（不假装高亮 · 修后）

| # | 用例 | 断言 |
|---|------|------|
| D1 | 点 `missing_db` 进编辑器 | URL **无** `focus`；画布无选中框 |
| D2 | 进编辑器后有引导（修后） | toast / 顶栏 hint / 空态文案之一：指向数据源检查 `connection_id`，或说明「连接级汇总」 |
| D3 | 可选：数据源深链 | 若产品做「跳数据源并高亮连接」：另开路由用例；本看板默认不强制 |

### E. 版式资产跳转（vitest + 手工）

| # | 用例 | 修前 | 修后目标 |
|---|------|------|----------|
| E1 | 版式 issue 链接 | `to="/layouts"` 仅列表 | 进 `LayoutPresetEditor`（带 preset id） |
| E2 | 版式控件 focus | 无 | 支持 `?focus=` 并在版式编辑器选中（若版式有控件模型） |
| E3 | 模版 vs 版式分流 | `assetKind` 分支正确，互不串链 | 保持 |

### F. 手工验收（发版 / 真机 · 不可省）

| # | 步骤 | 期望 |
|---|------|------|
| F1 | 仪表盘点一条「连接未设置默认数据库」 | 进模版；**无**控件高亮；有连接级说明（修后）或至少不误导为「跳转坏了」 |
| F2 | 点一条「绑定的数据库连接不存在」 | 同 F1；用 Network 核对 `meta.connection_id` 是否在本机数据源列表 |
| F3 | 人为造正文 OPC 空节点 → 扫描 → 点模版名 | URL 含 `?focus=`；正文控件选中高亮 |
| F4 | 人为造**页眉** OPC 空节点 → 点模版名 | 修后：页眉控件选中高亮；修前：可记录「切页但无选中」复现本看板 |
| F5 | 点版式类警告 | 修前：进版式列表；修后：尽量进编辑器并定位 |
| F6 | 半屏窗口重复 F3 | 选中后属性面板可见，不因布局裁切误判「没高亮」 |

### G. 认知对齐 / 回归（与下方第二 H1 交叉）

| # | 场景 | 期望 |
|---|------|------|
| G1 | 连接表单 `database` 空，控件 visual 已选库 | 仍报 `missing_default_database`；点进编辑器不高亮（A1/D1）；填连接默认库并保存后告警消失 |
| G2 | 模版残留陈旧 `connectionId`，当前控件用新连接 | 仍报 `missing_db`；能选表与告警可并存；清残留或改绑后消失 |
| G3 | OPC 空节点 hint 文案 | 仍承诺「可跳转并自动选中」的项，**必须**带 `elementId` 且修后 C 组能选中；否则改 hint 勿空口 |
| G4 | 健康扫描不探活 | 不断网/不断连情况下，告警种类不因「服务在跑」而消失（与探活看板无关） |

## 验收（实现后 · 对照矩阵）

1. **F3 + C1**：带 `elementId` 的正文 OPC 空节点 → 编辑器选中对应控件。  
2. **F4 + C3/C4**：页眉/区控件 focus 后 `sel` 非空（本看板核心缺口）。  
3. **F1/F2 + A1/D1/D2**：连接级警告 → 不假装高亮；有明确文案。  
4. **E1/E2**：版式警告可进版式编辑器并尽量定位。  
5. **B5/B6 + G1/G2**：扫描 meta 契约与现场认知对齐不回归。

## 本轮范围

- ✅ 记录现象与根因分析（本文档）  
- ✅ 补充测试用例矩阵（A–G）  
- ⌛️ 代码修复与按矩阵落地单测（待用户确认开工）

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
相关自动化见上方矩阵 **A1/A2、D1、G1/G2**。
