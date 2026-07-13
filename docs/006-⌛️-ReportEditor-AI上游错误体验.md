# ReportEditor AI 助手：上游错误与写入类能力闭环

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 版本计划（定时探活首切片）：[0.3.60 Plan](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.60.md)。  
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

1. **系统提示**：按能力域点名必调工具；`ok=false` / `awaiting_user_*` 如实转述。  
2. **端到端剧本**：每个能力域至少 1 条成功 + 1 条总闸关闭失败（诊断域改为「未调工具则失败」）。  
3. **UI 同步审计**：各 write/confirm 成功路径是否 `mark_ui_reload` / pending 完成回调。  
4. **单测**：总闸关拒绝；成功 reload；confirm 仅 pending。  
5. **切片**：探活优先；其余按现场痛点排期（资产 → 备份 → 结批 → 诊断体验），**标准以本表为准**。

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

# ⌛️ 未完成：LLM 额度不足时错误展示不友好

## 现象（现场截图 · 2026-07-13）

- 场景：侧栏 **AI 助手**，用户发送「打开定时探活」。
- 界面在输入框下方以**红色长文**直接展示：

```text
LLM 上游错误：{ "error": { "message": "You exceeded your current quota, please check your plan and billing details. …", "type": "insufficient_quota", "param": null, "code": "insufficient_quota" } }
```

- 用户难以一眼理解：是 **Key/套餐额度用尽**，还是软件本身故障。

## 根因（代码对照）

后端 `_Prj/SD_SMA_ReportEditor/backend/api/routers/ai_openai.py` 中 `_forward_llm`：

```python
if resp.status_code >= 400:
    detail = resp.text[:2000]
    raise HTTPException(resp.status_code, f"LLM 上游错误：{detail}")
```

上游（OpenAI 兼容）返回的 **原始 JSON 正文**被原样拼进 `HTTPException` 详情；前端 AI 抽屉再把该字符串展示给用户，**未按 `error.code` / `type` 做中文归类**。

本例上游语义明确：

| 字段 | 值 |
|------|-----|
| `error.code` / `type` | `insufficient_quota` |
| 含义 | 当前 API Key / 套餐**额度不足或账单受限**（非报表编辑器逻辑 bug） |

## 影响

1. **体验**：英文 JSON 堆在聊天区，像程序崩溃。
2. **排障误导**：现场易当成「AI 助手坏了」，而非去设置页换 Key / 充值 / 换上游。
3. **同类错误一并裸奔**：速率限制、Key 无效、模型不存在等也会同样甩原始 body。

## 拟改（确认后开工；可挂后续小版本）

1. **后端**：对常见上游码映射短中文，例如：
   - `insufficient_quota` → 「LLM 额度不足或账单受限，请到设置检查 Key / 套餐，或更换上游。」
   - `invalid_api_key` / 401 → 「LLM Key 无效或未配置。」
   - `rate_limit_*` → 「请求过于频繁，请稍后再试。」
   - 其余：保留简短摘要 + 可选「详情」折叠，避免默认甩满 JSON。
2. **前端**：AI 抽屉错误区优先显示映射文案；需要时再展开原始 detail。
3. **测试**：对 `_forward_llm` / 错误格式化函数单测（quota / invalid key / 未知 JSON）。

## 验收（实现后）

1. 复现 `insufficient_quota` 时，主文案为中文说明，**默认不出现整段 JSON**。
2. 设置页入口提示可发现（文案或链到「设置 → AI」）。
3. 单测覆盖常见 code 映射。

## 备注

- 截图中 AI 输入框仍有**可见描边**（焦点/默认边），与 [docs/005-✅-ReportEditor控件默认无边框.md](005-✅-ReportEditor控件默认无边框.md) **无关**（005 已改为模版 `showBorder`）；本条只跟 LLM 错误文案。
- **运维侧**：若 Key 确已欠费，映射文案再友好也无法代替充值/换 Key；软件只负责说清楚原因。

---

# ⌛️ 未完成：澄清「ChatGPT 订阅 ≠ API 额度」（用户易混淆）

## 现场补充（2026-07-13）

用户反馈：仍在 **GPT（ChatGPT）订阅期内**，不应出现额度错误。  
同时打开的是 [platform.openai.com](https://platform.openai.com) → **Usage**，区间内显示约 **$0.00 / 1 request / 7 tokens**。

## 说明（事实）

| 对比项 | ChatGPT 网页/App 订阅（Plus 等） | OpenAI API（platform + API Key） |
|--------|----------------------------------|----------------------------------|
| 用途 | 浏览器里用 chatgpt.com | 第三方应用（含本报表编辑器）调 `/v1/chat/completions` |
| 计费 | 订阅月费 | 另计：预付费额度 / 按量账单（Usage 页） |
| 是否互通 | 不互通 | 有 Plus 不会自动带上 API 额度 |

报表编辑器 AI 助手走的是设置里配置的 **LLM Base URL + API Key**，对应 **API 账号**，不是 ChatGPT 登录会话。

因此：

1. 订阅期内仍可能收到 `insufficient_quota`——API 侧无可用额度、未绑支付、组织限额、或 Key 所属项目无余额。
2. Usage 页几乎 $0、仅 1 次请求，更说明问题不在「用超了多少」，而在 **API 计费/额度未开通或 Key 无可用配额**（需到 **Billing** 查看支付方式与额度，而不仅是 Usage 曲线）。
3. 软件侧仍应把该错误显示成中文「额度/账单」提示（见上一 H1），避免误判为程序崩溃。

## 建议用户自查

1. [platform.openai.com/settings/organization/billing](https://platform.openai.com/settings/organization/billing)（或 Billing）是否有可用 credit / 付款方式。  
2. 设置页里的 API Key 是否属于该 Organization/Project。  
3. 若只用 ChatGPT 订阅、不想开 API 账单：需换其它已开通 API 的上游，或自备有额度的 Key。

---

# ⌛️ 未完成：切换硅基流动等上游后模型名仍残留 gpt-*

## 现象（2026-07-13）

- 设置 → AI：**LLM Base URL** 已改为 `https://api.siliconflow.cn/v1`。
- 「刷新模型列表」下拉为硅基模型（`deepseek-ai/DeepSeek-V3`、`DeepSeek-R1`、BGE 等），列表中**没有**任何 `gpt-*` 模型。
- 但「模型」输入框当前值仍是 `gpt-4.1`（或历史默认 `gpt-4o-mini`）。

## 原因

1. **硅基流动（OpenAI 兼容托管）不提供 OpenAI 官方 GPT 权重**；列表里不会出现 `gpt-4o` / `gpt-4.1`。
2. 本软件「模型」为**可手输 Combobox**：切换 Base URL **不会自动清空/改写**已保存的 `llm_model`。
3. 默认配置里曾用 OpenAI 系占位名（如 `gpt-4o-mini`），换上游后若未重选，会继续把无效模型名发给硅基 → 上游报错或行为异常。

## 用户立刻可做

1. 在下拉里选 **`deepseek-ai/DeepSeek-V3`**（推荐，支持工具调用）。  
2. 保存 AI 设置后再试助手。  
3. 不要用手输 `gpt-4.1`（硅基没有该模型）。

## 拟改（产品，确认后实现）

1. 切换 / 保存 `llm_base_url` 时：若当前 `llm_model` 不在「刚拉取的上游列表」中，提示并清空或自动选列表第一项聊天模型。  
2. 刷新模型列表成功后：若当前值不在列表中，输入框标红/警告「当前模型不在上游列表」。  
3. 设置页说明：OpenAI 兼容上游的模型 ID 以该平台为准，不能沿用 `gpt-*` 名。

---

# 🚧 进行中：AI「开启定时探活」须真正落库并刷新 UI（→ 0.3.60）

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

## 根因（已定位）

1. **模型空口答应**：未调工具 / 调了 `suggest_config_change` 只给建议不落库。  
2. **写成功但 UI 不刷新**：`ConnectionProbeSection` 原先仅 `onMounted` 读偏好；AI 写库后无事件。  
3. **总闸关时仍口头成功**：系统提示未强制「工具失败必须如实告知」。

## 实现要点（代码已落地，发版前验收）

1. `_tool_update_probe`：要求 `enabled` 和/或 `interval_sec`；成功后 `mark_ui_reload(connection_probe=True)`；返回可读 `message`。  
2. `SYSTEM_PROMPT`：开启/关闭探活必须调 `update_connection_probe_settings`（传 `enabled`），禁止空口答应。  
3. 前端：`client-prefs-mirror` 识别 `ui_reload.connection_probe` 并派发事件；设置页/导航/数据源页正确回读。  
4. 探活偏好**不再**因数据源锁拒绝。

## 测试用例（必须绿）

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

### 手工验收（发版后）

1. 开写入总闸 + 可用上游模型（如硅基 `DeepSeek-V3`）。  
2. 对助手说「开启定时探活」→ 工具成功 → 设置页开关**立即为开**（无需离页）。  
3. 关总闸再说一次 → 助手应说明须先开写入，开关保持关。

## 验收（0.3.60）

1. 写入总闸开 + 模型调工具成功 → `connection_probe_enabled=true`，设置开关同步开。  
2. 写入总闸关 → 工具失败文案；单测覆盖。  
3. 数据源锁定不影响探活开关。  
4. 后端 + 前端上述单测全绿。
