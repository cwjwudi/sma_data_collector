# Cursor 与 OpenAI 兼容 API 接入

> **适用版本：** 0.3.0+  
> 应用内全页 AI 助手与 Cursor / 自定义 Agent 共用同一套本机工具层。

---

## 1. 能力概览

| 通道 | 入口 | 鉴权 |
|------|------|------|
| **应用内助手** | 任意页面右下角「AI」浮层 | 本机 `/api/settings/ai/chat`（无需 Bearer） |
| **Cursor / Agent** | `POST /v1/chat/completions` | `Authorization: Bearer <Agent Token>` |

后端将对话转发至用户在设置中配置的 **OpenAI 兼容 LLM**（`baseUrl` + `apiKey` + `model`），并在模型返回 `tool_calls` 时执行本地只读诊断工具（数据库/OPC 探活、审计查询、模版摘要等）。

**首版不做独立 MCP Server**；后续若需要，可薄封装复用同一 tool 层。

---

## 2. 设置步骤

1. 打开 **设置 → AI 助手与 Cursor 接入**。
2. 开启 **启用 AI 助手**。
3. 填写 **LLM Base URL**（默认 `https://api.openai.com/v1`）、**API Key**、**模型名**（如 `gpt-4o-mini`）。
4. 点击 **生成 Agent 令牌**，复制保存（仅显示一次；丢失需重新生成）。
5. 记录本机 Chat 地址，例如：`http://127.0.0.1:8000/v1`（端口以设置页「服务地址」为准）。

> **安全：** 用户 LLM API Key 与 Agent Token **分开存储**，均经 Fernet 加密写入 `config.json`，不会进入审计 CSV 或 Toast 全文。

---

## 3. Cursor 配置示例

在 Cursor 自定义模型 / OpenAI 兼容提供商中：

| 项 | 值 |
|----|-----|
| **Base URL** | `http://127.0.0.1:8000/v1`（或局域网地址，需开启「允许局域网访问 Agent API」） |
| **API Key** | 设置页生成的 **Agent Token**（非 OpenAI Key） |
| **Model** | 与设置页模型名一致（或任意字符串；网关会替换为已配置模型） |

### curl  smoke 测试

```bash
curl -s http://127.0.0.1:8000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"列出已保存的数据库连接名称"}]
  }'
```

---

## 4. 示例提示词（Cursor）

- 「检查最近结批/导出失败的审计记录，并解释 EXPORT_DIAGNOSTICS。」
- 「对名为 XXX 的 OPC UA 连接做 probe，并汇总健康状态。」
- 「列出所有报表模版摘要，并说明哪个模版绑定了 SQL。」
- 「当前应用版本与本机 /v1 地址是什么？」

0.3.1+ 可在应用内助手附带 **页面上下文**（路由、模版 ID）；Cursor 可在 `messages` 中自行说明当前关注点。

---

## 5. 工具清单（只读 · 0.3.0）

| 工具 | 说明 |
|------|------|
| `list_db_connections` | 已保存数据库连接（脱敏） |
| `list_opc_servers` | 已保存 OPC UA 连接（脱敏） |
| `probe_connection` | 对指定 DB/OPC 连接做连通测试 |
| `get_connection_health_summary` | 连接清单 + 探活设置摘要 |
| `query_audit_log` | 最近审计（可按 action/result 过滤） |
| `list_templates` / `get_template_summary` | 模版列表 / 单模版摘要 |
| `explain_export_diagnostics` | 解析 `---EXPORT_DIAGNOSTICS---` JSON |
| `get_app_version_and_endpoints` | 版本与本机 `/v1` 地址 |

### 0.3.1 增量

- 请求体 `report_editor_page_context`：路由、templateId、最近错误摘要注入 system prompt。
- `suggest_config_change`：生成配置建议 JSON，**不直接写入**。

### 0.3.2 增量

- `update_connection_probe_settings` 等受控写入（需开启「允许 AI 写入工具」）。
- 每次 tool 调用写审计 `ai.tool_call`。

---

## 6. 安全与网络

- **默认仅本机：** 非 loopback 来源访问 `/v1/*` 时，需在设置中显式开启 **允许局域网访问 Agent API**。
- **Tool 默认只读；** 写操作默认关闭，直到 0.3.2 且用户开启写入开关。
- **不向 LLM 发送** 数据库密码、OPC 密码明文。
- Agent Token 泄露等同于本机诊断 API 被滥用；请定期轮换。

---

## 7. 故障排查

| 现象 | 处理 |
|------|------|
| HTTP 401 | Agent Token 错误或已轮换 |
| HTTP 403 + LAN | 自局域网访问但未开启 LAN 开关 |
| HTTP 503 AI 未配置 | 设置页未启用或未填 LLM Key |
| 工具无结果 | 确认 `config.json` 中已有对应连接/模版 |
| Cursor 连不上 | 确认后端端口、防火墙；先用 curl 验证 |

---

## 8. 相关文档

- [002_里程碑与工单.md](002_里程碑与工单.md) — **M16**
- [007_版本发布记录.md](007_版本发布记录.md) — 0.3.0 变更
