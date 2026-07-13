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
