# ReportEditor AI 助手：上游错误与写入类能力闭环

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 版本计划：探活 [0.3.60](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.60.md)（代码已合入）；本版体验切片 [0.3.62](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.62.md)。  
> **范围说明**：不只「开启定时探活」；在开启「允许 AI 写入工具」后，数据源、模版/版式资产、备份恢复、结批导出、演示冒烟、诊断取证等能力域均须**真正执行并反映到 UI**（禁止空口答应）。完整域表见下方 H1。

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
| 演示与冒烟 | 「建个演示库」「做个绑定冒烟模版」 | 库/模版落盘 + UI reload | `ensure_user_demo_database` / `create_binding_smoke_template` / `apply_template_sheet_layouts` |
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
| `ensure_user_demo_database` | write | 创建用户演示库 |
| `list_*` / `get_*` / `probe_connection` / `get_datasource_inventory` | read | 配置前应先读 |

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
| B | 复制模版 / 版式 | copy_* 成功 → 列表出现副本 |
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
