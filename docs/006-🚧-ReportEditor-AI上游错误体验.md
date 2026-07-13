# ReportEditor AI 助手：上游错误与写入类能力闭环

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 版本计划：探活 [0.3.60](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.60.md)；上游错误体验 [0.3.62](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.62.md)；Agent 工具轨迹 [0.3.66](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.66.md)；轨迹假失败 [0.3.71](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.71.md)；排队收纳 [0.3.77](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.77.md)；流式先工具 [0.3.78](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.78.md)；多轮简洁 [0.3.79](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.79.md)；复制模版/版式 [0.3.80](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.80.md)。  
> **范围说明**：不只「开启定时探活」；在开启「允许 AI 写入工具」后，数据源、模版/版式资产、备份恢复、结批导出、演示冒烟、诊断取证等能力域均须**真正执行并反映到 UI**（禁止空口答应）。完整域表见下方能力矩阵 H1（仍 ⌛️）。  
> **Agent 体验**：对话须可见工具调用与状态；口头结论必须与工具结果一致——轨迹 H1 已于 **0.3.66** 落地（探活强制再调）。

---

# ✅ 已完成：复制模版 / 版式端到端（能力矩阵 B · → 0.3.80）

## 产品诉求

用户说「复制某某模版/版式」时，须真调 `copy_template` / `copy_layout_preset` → 落盘新 id → `mark_ui_reload(assets)` → 列表出现副本；禁止空口答应。

## 代码侧（本版前已有）

- `ai_asset_ops.copy_*`：深拷贝 + `mark_ui_reload(assets=True)`
- 前端 `client-prefs-mirror`：`ui_reload.assets` → `notifyAssetsChanged`

## 本版加固（0.3.80）

1. `test_ai_asset_ops.py`：复制成功落盘、列表可见、mirror `assets`；缺源失败；总闸关闭拒绝  
2. `SYSTEM_PROMPT`：复制必须点名 `copy_template` / `copy_layout_preset`（先 `list_*` 取 id）

## 验收

- [x] B：copy_* 成功 → 磁盘与列表有副本 + `ui_reload.assets`  
- [x] 总闸关 → 拒绝且不落盘  
- [x] 提示词含 copy 工具名  

---

# ✅ 已完成：多轮对话默认简洁（最近 N 轮进请求 · → 0.3.79）

## 现象（2026-07-13）

连续提问时回复常复述前文、铺垫过长，显得啰嗦。

## 根因

抽屉把几乎全部历史 user/assistant 正文每次 POST 给模型；`SYSTEM_PROMPT` 未约束「只答最新、勿复述」。

## 已拍板

| # | 结论 |
|---|------|
| 请求窗口 | 发给 LLM **最近 8 条**消息（`sliceRecentChatMessages`）；截断后若首条是 assistant 再丢掉，避免半轮开场 |
| 抽屉展示 | **仍显示完整历史**（仅请求侧截断） |
| 提示词 | 默认简洁：只针对最新问题；勿复述已完成操作，除非用户要求回顾 |
| 本条不做 | 旧轮摘要压缩、可配置 N 的设置页 UI |

## 实现（0.3.79）

1. `chat-history-window.ts` + 单测  
2. `AiDrawer.runOneTurn` 用窗口切片再发流  
3. `SYSTEM_PROMPT` 增简洁约束  

## 验收

- [x] 长会话请求体不超过约 8 条（单测覆盖切片）  
- [x] 抽屉仍可见更早气泡  
- [x] 提示词含简洁约束  

---

# ✅ 已完成：流式同轮先工具后正文（→ 0.3.78）

## 现象（2026-07-13）

用户说「打开探活」时，气泡里**先**出现「已开启…」，工具轨迹与设置开关**后**才更新，观感像空口答应。

## 根因

0.3.72 流式：上游同一轮里 `content` 即时 SSE `delta`，`tool_calls` 等流结束才执行 → 必然「先结论、后办事」。

## 已拍板

| # | 结论 |
|---|------|
| 同轮有 tool_calls | **缓冲正文、不发 delta**；先 `status:tools` + `tool` 事件；结论由下一轮再流 |
| 同轮无 tool | 上游结束后再分段放出正文（`chunk_text_for_simulated_stream`） |
| 空口探活声称 | 纠错再调前先 `replace` 清空已放出的假文案 |
| 写类 tool 成功 | 前端立刻 `syncPendingClientPrefsFromBackend`（开关不等整轮结束） |
| 顺带 | `upsert_db/opc` 成功补 `mark_ui_reload(datasource)` |

## 实现（0.3.78）

1. `ai_chat_stream.should_hold_content_for_tools` + `iter_chat_stream_sse` 缓冲策略  
2. `SYSTEM_PROMPT`：工具成功前禁完成态措辞  
3. `AiDrawer`：tool `ok` 即时 mirror  
4. `ai_datasource_ops`：upsert 后 `mark_ui_reload`

## 验收

- [x] 同轮「正文+探活工具」：用户先见工具轨迹，后见结论文案  
- [x] 纯聊天轮：正文仍可分段出现  
- [x] 探活工具成功后设置开关尽快刷新  
- [x] upsert 连接后数据源列表可 reload  

---

# ✅ 已完成：排队改到输入框上方收纳（类 Cursor · → 0.3.77）

## 现象（2026-07-13）

生成中再发问时，排队项以**用户气泡**插入消息列表并标「排队中」。当前轮结束后列表滚动/重排，排队气泡会**浮到刚出完的回复上方**，读起来像「历史里突然多了还没问的话」，和 Cursor 等产品「队在输入区附近、正文流只放已发送/已回答」不一致。

## 产品诉求

排队**不要进消息时间线**；在**输入框上方**用一块可收纳区域展示待发问题，直到该条**开始回复**（出队变为正式 user 气泡）再进入消息流。

## 已拍板（按默认 ★ · 2026-07-13）

| # | 问题 | 结论 |
|---|------|------|
| Q1 | 排队 UI 位置 | **composer 正上方**：折叠条「排队 N」；展开为列表（摘要 + × 取消） |
| Q2 | 消息列表是否仍渲染 `queued` | **否**；队列只活在 `chat-queue` + 收纳条 |
| Q3 | 出队瞬间 | 收纳条去掉该项 → 消息流追加正式 user 气泡 → 开始助手流式回复 |
| Q4 | 空闲且队列空 | **整块收纳条隐藏** |
| Q5 | 暂停 / 上限 / 单条取消 | 行为不变 |
| Q6 | 持久化 | 排队**不持久化**；加载时丢弃历史 `queued` 气泡 |
| Q7 | 本条不做 | 流式「先工具后正文」、多轮啰嗦压缩（另条） |

## 实现（0.3.77）

1. `AiDrawer.vue`：`queue` 改为 `ref`；消息流去掉 queued 气泡与取消按钮。  
2. composer 上方收纳条：折叠标题、摘要列表、× 取消；暂停提示挂在收纳条。  
3. 入队只改 `queue`；出队 `runOneTurn` 再写入正式 user 气泡。  
4. 持久化加载过滤 `status=queued`。

## 验收

| # | 用例 | 期望 |
|---|------|------|
| T1 | 生成中连发 2 问 | 消息流无排队气泡；输入框上收纳显示 2 条 |
| T2 | 当前轮结束 | 队首出队 → 正式 user 气泡出现在流末 → 开始回答 |
| T3 | × 取消某条 | 仅该条从收纳消失 |
| T4 | 队列空 | 收纳条消失 |
| T5 | 本轮 error 暂停 | 收纳仍在；「继续排队」后照常出队 |

- [x] T1–T5（实现按约定；`chat-queue` 单测仍绿）

## 与其它 AI 体验债的关系（仅索引）

| 债 | 说明 | 状态 |
|----|------|------|
| 流式先正文后工具 | 同轮「已开启探活」早于工具/开关 | ✅ **0.3.78** |
| 多轮啰嗦 | 全量历史进请求，易复述 | ✅ **0.3.79** |

---

# ✅ 已完成：Agent 可见工具轨迹与结论闭环（探活硬守卫 · → 0.3.66）

> **开工拍板（2026-07-13）**  
> - **本轮范围**：仅本 H1（选项 **1A**）。能力矩阵 A–N **本轮不做**。  
> - **结论策略（B1）**：**强制再调**——口头声称探活已开/已关但无成功工具证据 → 纠错 + 再进 tool loop；仍失败则**改写**为如实失败。  
> - **轨迹**：`report_editor_tool_trace`；`AiDrawer` 可折叠展示。正文流式见 **[docs/014](014-✅-ReportEditor-AI流式输出.md) / 0.3.72**（本 H1 原写「不做 SSE」已废止）。

## 实现（0.3.66）

1. `modules/ai_tool_trace.py`：脱敏 `args_summary` + `attach_tool_trace`。  
2. `modules/ai_claim_guard.py`：探活声称检测 / 强制再调纠错文案 / 失败改写。  
3. `run_chat_completion`：收集轨迹；不匹配时再跑一轮；仍假成功则改写正文。  
4. `AiDrawer`：助手气泡下可折叠工具列表（失败默认展开）。

## 测试

- `test_ai_tool_trace_claim_guard.py`、`test_ai_chat_tool_trace.py`  
- `aiSettings.tool-trace.test.ts`

## 验收

1. 开启探活且工具成功 → 可见轨迹成功步；文案可写已开启。  
2. 空口「已开启」→ 服务端再调；仍无证据 → 文案含「未能确认」，无假成功。  
3. 总闸关闭导致工具失败 → 轨迹红色失败；不得声称已开启。

## 与既有 H1 关系

- 能力矩阵 H1：仍 ⌛️。  
- 探活落库已在 0.3.60/0.3.63；本条补 **可观测 + 强制再调**。

---

# ✅ 已完成：工具轨迹把成功读工具标成「含失败」（→ 0.3.71）

## 现象（现场截图 · 2026-07-13）

诊断对话工具轨迹标题「含失败」，红标：

- `get_connection_health_summary`（`live_probe: true`）
- `list_templates`

同轮其它带显式 `ok: true` 的工具为绿；正文仍写出连接成功与模版绑定问题（靠其它工具/模型综合）。用户误以为这两步真失败。

## 根因

`tool_result_ok` 仅在结果含 `"ok"` 键时判成功；**否则一律 False**。  
而 `_tool_list_templates` / `_tool_health_summary`（无 live 失败时）等读类工具返回 `{templates,count}` / `{db_count,…}`，**无 `ok` 字段** → 轨迹假失败。

## 实现（0.3.71）

1. `tool_result_ok`：无 `ok` 时，无 `error` 视为成功；显式 `ok` 仍优先。  
2. `list_templates` / `health_summary` / `query_audit` 成功载荷补 `ok: true`；live 探活有失败时 health 摘要 `ok: false`。  
3. 单测：无 `ok` 的 list/health 载荷 → 轨迹步 `ok=true`。

## 验收

1. 再跑诊断：`list_templates`、成功的 health 摘要应为绿，不因「无 ok 字段」标红。  
2. 真失败（`ok:false` / `error`）仍红。  
3. 能力矩阵 A–N 仍 ⌛️（本条仅轨迹展示正确性）。

---

# ⌛️ 未完成：AI 写入/确认类能力须端到端可用（能力域扩展）

## 产品诉求（2026-07-13）

现场已确认写入总闸开启，仍要求助手能**实际做事**，而不只是聊天答应。  
下列能力域均应对齐「调工具 → 落库/弹框 → UI 可见」；**禁止空口答应**。

| 能力域 | 用户说法示例 | 期望结果 | 工具侧（摘要） |
|--------|--------------|----------|----------------|
| 定时探活 | 「开启定时探活」 | 偏好落库 + 设置开关变开 | `update_connection_probe_settings`（0.3.60 切片，代码已合入） |
| 配置数据源 | 「加一个 MySQL / 改 OPC」 | 连接写入；密码走本机弹框；列表刷新 | `upsert_*` / `request_connection_credentials` / `delete_*` |
| 模版资产 | 「复制/删除/新建空白模版」 | 落盘；删除需确认；列表刷新 | `copy_template` / `delete_template` / `create_blank_template` |
| 版式资产 | 「复制这份版式」「删掉版式」 | 同模版侧 | `copy_layout_preset` / `delete_layout_preset` / `create_blank_layout` |
| 打开编辑 | 「打开某某模版/版式」 | pending 确认后跳转编辑器 | `request_open_template` / `request_open_layout` |
| 模版排序 | 「把某某排到最前」 | 本机展示顺序更新并 reload | `set_template_display_order` |
| 备份 / 恢复 / 复位 | 「导出备份」「导入配置」「清空复位」 | `.rebak` 另存 / merge / 复位确认；**密文不进 LLM** | `request_config_backup_export` / `import_merge` / `reset` |
| 演示与冒烟 | 「做个绑定冒烟模版」 | 依赖已有 DB/OPC；演示一键入口已拆除（012） | `create_binding_smoke_template` / `apply_template_sheet_layouts` |
| 导出目录 | 「把 PDF 输出改到某某路径」 | 写偏好或唤起选目录 | `set_export_dir` / `request_pick_export_dir` |
| 结批 / 预检 | 「预检一下」「模拟结批一次」 | 预检结果如实；结批需确认后本机导出 | `preflight_export` / `request_manual_export` |
| 结批写回 / 并行 | 「结批结果写到 OPC」「并行改成 4」 | 配置落库 | `set_export_result_feedback` / `set_max_parallel_exports` |
| 触发绑定检查 | 「自动结批触发变量对不对」 | 调工具返回事实，不编造 | `check_auto_trigger_bindings`（read） |
| 诊断排障 | 「链路哪里坏了」「看审计」 | **必须调工具**拿事实 | `diagnose_work_chain` / `inspect_template_bindings` / `query_audit_log` / `get_dev_runtime_snapshot` 等 |
| 检查更新 | 「有没有新版本」 | 仅检查、不自动安装 | `request_check_app_update` |

> 只读诊断类也算「能力域」：验收标准是**禁止编造连接/审计/版本事实**，与写入类同样禁止空口。

## 代码侧已有工具（对照 `ai_tool_catalog`）

工具大多已注册；问题仍是 **模型不调工具 / 总闸 / 数据源锁 / pending 未完成 / UI 未 reload**，而非「没有 API」。

### 1. 数据源

| 工具 | 风险 | 说明 |
|------|------|------|
| `upsert_db_connection` / `upsert_opc_server` | write | 新建/更新（密码走 UI） |
| `request_connection_credentials` | write | 唤起密码弹框 |
| `delete_db_connection` / `delete_opc_server` | confirm | UI 确认后删除 |
| `update_connection_probe_settings` | write | 定时探活 |
| `list_*` / `get_*` / `probe_connection` / `get_datasource_inventory` | read | 配置前应先读 |
| ~~`ensure_user_demo_database`~~ | — | **0.3.69 已随演示与培训拆除**；冒烟模版改依赖已有连接 |

门槛：写入总闸；**数据源锁定**时 upsert/delete/凭证会拒绝并弹出解锁；探活偏好不挡（已实现）。

### 2. 模版与版式资产

| 工具 | 风险 | 说明 |
|------|------|------|
| `copy_template` / `copy_layout_preset` | write | 深拷贝 + `mark_ui_reload(assets)` |
| `create_blank_template` / `create_blank_layout` | write | 最小合法空资产 |
| `delete_template` / `delete_layout_preset` | confirm | pending 确认后删 |
| `create_binding_smoke_template` | write | 绑定冒烟模版（可顺带演示库） |
| `apply_template_sheet_layouts` | write | 套用封面/封尾版式并提升控件 |
| `set_template_display_order` | write | 模版管理页排序 |
| `request_open_template` / `request_open_layout` | confirm | 确认后跳转编辑器 |
| `list_templates` / `get_template_summary` / `list_layout_presets` | read | 操作前列举 |

### 3. 配置备份与路径

| 工具 | 风险 | 说明 |
|------|------|------|
| `request_config_backup_export` | confirm | 另存加密 `.rebak`；密文/口令不进 LLM |
| `request_config_import_merge` | confirm | merge 导入 |
| `request_config_reset` | confirm | 快速复位（高危） |
| `set_export_dir` / `request_pick_export_dir` | write/confirm | 输出/监视目录 |
| `export_config_share_summary` / `get_export_dir_prefs` | read | 摘要与当前路径 |

### 4. 导出、结批与现场

| 工具 | 风险 | 说明 |
|------|------|------|
| `preflight_export` | read | 结批前预检 |
| `request_manual_export` | confirm | 模拟结批（本机 Electron 执行） |
| `set_export_result_feedback` | write | 结批结果 OPC 写回 |
| `set_max_parallel_exports` | write | 自动结批并行 1–16 |
| `check_auto_trigger_bindings` | read | 触发变量校验 |
| `summarize_report_history` / `analyze_export_parallel_health` / `get_export_result_feedback` | read | 历史与健康度 |

### 5. 诊断与系统（以「调工具拿事实」为验收）

| 工具 | 风险 | 说明 |
|------|------|------|
| `diagnose_work_chain` / `inspect_template_bindings` / `explain_export_diagnostics` | read | 链路/绑定/导出诊断 |
| `query_audit_log` / `get_dev_runtime_snapshot` / `get_app_version_and_endpoints` | read | 审计与运行时 |
| `request_check_app_update` | confirm | 只检查更新 |
| `explain_plc_heartbeat` | read | 心跳说明 |
| `suggest_config_change` | read | **仅建议、不落库**；不得冒充已修改 |

## 共性失败模式（与探活同类）

1. **空口答应**：未发 `tool_calls`，或只调 `suggest_config_change`。  
2. **总闸未开 / 工具被禁用**：工具报错，模型仍说「已完成」。  
3. **confirm 未走完**：删除、备份、导入、结批、打开编辑停在 pending。  
4. **UI 未刷新**：写库成功但列表/开关不更新（探活已 mirror；其余靠 `ui_reload` + 聊天结束拉 mirror）。  
5. **数据源锁**：改连接被挡；须引导解锁确认。  
6. **密文泄漏**：备份/密码相关内容出现在聊天（硬性禁止）。

## 拟改（分版本；本条登记标准）

1. **系统提示**：按能力域点名必调工具；`ok=false` / `awaiting_user_*` 如实转述。→ **0.3.62 已加强 SYSTEM_PROMPT**；端到端剧本仍待后续。  
2. **端到端剧本**：每个能力域至少 1 条成功 + 1 条总闸关闭失败（诊断域改为「未调工具则失败」）。  
3. **UI 同步审计**：各 write/confirm 成功路径是否 `mark_ui_reload` / pending 完成回调。  
4. **单测**：总闸关拒绝；成功 reload；confirm 仅 pending。  
5. **切片**：探活已 ✅（0.3.60 代码 / 随 0.3.62 发版线）；其余按现场痛点排期（资产 → 备份 → 结批 → 诊断体验），**标准以本表为准**。

## 验收（能力矩阵 · 写入总闸已开，除非注明）

| # | 场景 | 通过标准 |
|---|------|----------|
| A | 配置数据源 | upsert → 列表更新；需密码则弹框 |
| B | 复制模版 / 版式 | copy_* 成功 → 列表出现副本（✅ 0.3.80） |
| C | 删除模版 / 版式 | 确认后消失；取消则仍在 |
| D | 备份 | 另存 `.rebak`；聊天无口令/密文 |
| E | 恢复 / 复位 | 确认流 → merge/复位生效 + UI reload |
| F | 总闸关闭 | 任一 write/confirm 意图 → 明确提示，**状态不变** |
| G | 新建空白 / 冒烟模版 / 演示库 | 资产或库出现 + reload |
| H | 打开模版/版式 | 确认后进入对应编辑器 |
| I | 模版排序 | 顺序变更在模版管理页可见 |
| J | 导出目录 | 路径写入或选目录弹框完成 |
| K | 预检 / 模拟结批 | 预检有事实；结批确认后本机导出（非口头） |
| L | 结批写回 / 并行上限 | 配置可读回一致 |
| M | 诊断类 | 答复可追溯到工具结果，禁止编造连接/审计 |
| N | 检查更新 | 仅检查结果；不声称已安装 |

---

# ✅ 已完成：LLM 额度不足时错误展示不友好（→ 0.3.62）

## 现象（现场截图 · 2026-07-13）

- 场景：侧栏 **AI 助手**，用户发送「打开定时探活」。
- 界面在输入框下方以**红色长文**直接展示：

```text
LLM 上游错误：{ "error": { "message": "You exceeded your current quota, please check your plan and billing details. …", "type": "insufficient_quota", "param": null, "code": "insufficient_quota" } }
```

- 用户难以一眼理解：是 **Key/套餐额度用尽**，还是软件本身故障。

## 根因（代码对照）

后端 `_forward_llm` 原先把上游 **原始 JSON** 拼进 `HTTPException`；前端原样展示。

## 实现（0.3.62）

1. `modules/llm_upstream_errors.py`：`format_llm_upstream_error` 映射 `insufficient_quota` / Key / 限流 / 模型不存在 / 5xx；未知错误短摘要（≤160 字），默认不含整段 JSON。  
2. `ai_openai._forward_llm` 接入上述格式化。  
3. 单测 `modules/test_llm_upstream_errors.py`。

## 验收

1. 复现 `insufficient_quota` → 中文额度/账单说明，**默认无整段 JSON**。  
2. 文案提示到「设置 → AI 助手」；并注明 ChatGPT 订阅与 API 不互通。  
3. 单测覆盖常见 code。

## 备注

- AI 输入框描边与 [docs/005](005-✅-ReportEditor控件默认无边框.md) 无关。  
- 运维侧欠费仍须充值/换 Key；软件只负责说清楚原因。

---

# ✅ 已完成：澄清「ChatGPT 订阅 ≠ API 额度」（→ 0.3.62）

## 现场补充（2026-07-13）

用户反馈：仍在 **GPT（ChatGPT）订阅期内**，不应出现额度错误。  
同时打开的是 [platform.openai.com](https://platform.openai.com) → **Usage**，区间内显示约 **$0.00 / 1 request / 7 tokens**。

## 说明（事实）

| 对比项 | ChatGPT 网页/App 订阅（Plus 等） | OpenAI API（platform + API Key） |
|--------|----------------------------------|----------------------------------|
| 用途 | 浏览器里用 chatgpt.com | 第三方应用（含本报表编辑器）调 `/v1/chat/completions` |
| 计费 | 订阅月费 | 另计：预付费额度 / 按量账单（Usage 页） |
| 是否互通 | 不互通 | 有 Plus 不会自动带上 API 额度 |

## 实现（0.3.62）

1. 设置 → AI 助手增加醒目提示：API Key + Base URL 与 ChatGPT 网页订阅不互通。  
2. `insufficient_quota` 中文映射文案中再次点明不互通。

## 建议用户自查

1. [Billing](https://platform.openai.com/settings/organization/billing) 是否有可用 credit / 付款方式。  
2. 设置页 API Key 是否属于该 Organization/Project。  
3. 若只用 ChatGPT 订阅：换其它已开通 API 的上游，或自备有额度的 Key。

---

# ✅ 已完成：切换硅基流动等上游后模型名仍残留 gpt-*（→ 0.3.62）

## 现象（2026-07-13）

- Base URL 已改为硅基；刷新列表无 `gpt-*`，但模型框仍残留 `gpt-4.1`。

## 实现（0.3.62）

1. `ai-model-list.ts`：`isModelInUpstreamList` / `pickPreferredChatModel`（跳过 embedding）。  
2. 刷新列表后：当前模型不在列表 → 警告 + 输入框标黄。  
3. 「改用列表首个聊天模型」一键改选（仍须用户保存）。  
4. 设置页说明：换上游后勿沿用 `gpt-*`。

### 本版不做

- 保存 Base URL 时自动强制改写模型（仅警告 + 一键改选）。

---

# ✅ 已完成：AI「开启定时探活」须真正落库并刷新 UI（→ 0.3.60 代码 / 0.3.62 发版线）

> 本条是上方「写入类能力矩阵」的**首发切片**；数据源配置 / 模版复制删除 / 备份恢复见矩阵 H1（仍 ⌛️）。

## 现象（现场 · 2026-07-13 · 0.3.59）

- 用户确认 **「允许 AI 写入工具」已开**，仍要求 AI **实际能打开**定时探活。
- 助手常口头答应「正在开启」，设置页「启用定时探活」仍为关，或配置已写但开关不刷新。

## 能力与门槛

| 项 | 说明 |
|----|------|
| 工具名 | `update_connection_probe_settings`（写探活开关/间隔） |
| 风险级 | **write**（`ai_tool_catalog`） |
| 总闸 | 设置 → AI → **「允许 AI 写入工具」**；关则工具返回明确错误 |
| 数据源锁 | **不挡探活偏好**：探活是应用偏好，不改连接凭证（0.3.60 起） |
| 持久化 | `config.json` → `app_preferences.connection_probe_*` |
| UI 同步 | 成功后 `mark_ui_reload(connection_probe=True)` → 聊天结束拉 mirror → `report-editor-connection-probe-changed` |

## 实现要点（已落地）

1. `_tool_update_probe`：要求 `enabled` 和/或 `interval_sec`；成功后 `mark_ui_reload(connection_probe=True)`。  
2. `SYSTEM_PROMPT`：开启/关闭探活必须调工具（传 `enabled`），禁止空口答应。  
3. 前端：`client-prefs-mirror` 派发探活变更事件；设置页/导航/数据源页回读。  
4. 探活偏好**不再**因数据源锁拒绝。

## 测试用例（已绿）

### 后端 `modules/test_ai_update_probe.py`

| 用例 | 期望 |
|------|------|
| `test_update_probe_enables_and_marks_ui_reload` | `enabled=true` → config 落库；mirror `pending_apply` + `ui_reload.connection_probe` |
| `test_update_probe_disable_and_interval` | 可关、可改间隔 |
| `test_update_probe_requires_args` | 空参数 → `ok=false`，提示传 `enabled` |
| `test_update_probe_blocked_when_write_disabled` | 总闸关 → 错误含「写入工具」 |
| `test_update_probe_works_when_datasource_locked` | 数据源锁定仍可开启探活 |
| `test_system_prompt_requires_probe_tool` | 系统提示含工具名与 `enabled=true` |

### 前端 `src/lib/client-prefs-mirror.test.ts`

| 用例 | 期望 |
|------|------|
| pending + `connection_probe` | 派发 `report-editor-connection-probe-changed`，`detail.via === 'ai'` |
| 无 `pending_apply` | 不派发 |
| 仅其它 reload 标志 | 不因探活标志误派发 |

## 验收

1. 写入总闸开 + 模型调工具成功 → `connection_probe_enabled=true`，设置开关同步开。  
2. 写入总闸关 → 工具失败文案；单测覆盖。  
3. 数据源锁定不影响探活开关。  
4. 后端 + 前端上述单测全绿。

## 回归修复（0.3.63）：反复开关不生效

| 根因 | 修复 |
|------|------|
| 设置页连点并发 PATCH，后写覆盖先写的相反态 | 串行落库 + 乐观更新（`connection-probe-serial-persist`） |
| AI 传字符串 `"false"` 时 `bool()` 为 True | `_coerce_tool_bool` |
| mirror 清除用旧 pending 冲掉新一轮 AI 写入 | `pending_token` ack；过期 ack 保留 pending |
