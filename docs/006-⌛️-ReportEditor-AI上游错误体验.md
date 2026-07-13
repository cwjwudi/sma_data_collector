# ReportEditor AI 助手上游错误体验

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **本轮仅记录问题**，未改代码、未定发版号。

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

- 截图中 AI 输入框仍有**可见描边**（焦点/默认边），与 [docs/005-⌛️-ReportEditor控件默认无边框.md](005-⌛️-ReportEditor控件默认无边框.md) 相关，**不在本条修复范围**；本条只跟 LLM 错误文案。
- **运维侧**：若 Key 确已欠费，映射文案再友好也无法代替充值/换 Key；软件只负责说清楚原因。

---

# ⌛️ 未完成：澄清「ChatGPT 订阅 ≠ API 额度」（用户易混淆）

## 现场补充（2026-07-13）

用户反馈：仍在 **GPT（ChatGPT）订阅期内**，不应出现额度错误。  
同时打开的是 [platform.openai.com](https://platform.openai.com) → **Usage**，区间内显示约 **$0.00 / 1 request / 7 tokens**。

## 说明（事实）

| | ChatGPT 网页/App 订阅（Plus 等） | OpenAI **API**（platform + API Key） |
|--|--|--|
| 用途 | 浏览器里用 chatgpt.com | 第三方应用（含本报表编辑器）调 `/v1/chat/completions` |
| 计费 | 订阅月费 | **另计**：预付费额度 / 按量账单（Usage 页） |
| 是否互通 | **不互通** | 有 Plus **不会**自动带上 API 额度 |

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
- 「刷新模型列表」下拉为硅基模型（`deepseek-ai/DeepSeek-V3`、`DeepSeek-R1`、BGE 等），**无任何 gpt-***。
- 但「模型」输入框当前值仍是 **`gpt-4.1`**（或历史默认 `gpt-4o-mini`）。

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
3. 设置页说明：OpenAI 兼容上游的模型 ID 以该平台为准，**不能沿用 gpt-* 名**。
