# Cursor 与 OpenAI 接入

> Report Editor **0.3.x** 起支持本机 OpenAI 兼容 `/v1` 网关，供应用内 AI 助手与 **Cursor / Codex** 调用。

## 本机 Cursor 快速配置

| 项 | 值 |
|---|---|
| Base URL | `http://127.0.0.1:8000/v1`（设置页「Chat API（本机）」可复制） |
| API Key | 任意占位（本机 loopback **不校验** Agent Token） |
| 模型 | 与设置页 LLM 模型一致 |

局域网接入需在设置中开启「允许局域网访问 Agent API」并配置 **Agent Token**。

## 写入总闸与单工具开关

- **设置 → AI 助手**：`write_tools_enabled`（允许 AI 写入工具）为写入/确认类工具总闸。
- **侧栏 → AI 工具**（`/ai-tools`）：39 项工具按分组展示，可单独禁用；禁用后 Cursor 上游 `tools` 列表不含该项，调用返回明确错误。

## Pending 弹框（本机 UI 执行）

以下操作**不会**在 Cursor 内直接完成，而是进入 `pending_prompts` 队列，由 `AiPendingPromptDialog` 轮询并弹框：

| kind | 说明 |
|------|------|
| `credential` | 填写 DB/OPC 密码 |
| `confirm_delete` | 删除数据源 / 模版 / 版式 |
| `confirm_reset` | 快速复位（清空配置与资产） |
| `confirm_import_merge` | merge 导入配置包 |
| `confirm_manual_export` | 模拟结批 → UI 调 `runPdfExport` |
| `pick_export_dir` | 选 PDF 输出目录或另存 `.rebak` 备份 |
| `check_update` | 检查软件更新（**不自动安装**） |

**禁止**向 LLM 返回密码明文或 `.rebak` 备份内容。

## 0.3.4 新增工具摘要

### 模版与版式
- `list_layout_presets`、`copy_template`、`copy_layout_preset`
- `create_blank_template`、`create_blank_layout`
- `delete_template`、`delete_layout_preset`（需确认）

### 配置与备份
- `export_config_share_summary`（只读脱敏）
- `request_config_backup_export` → UI 另存加密 `.rebak`
- `request_config_import_merge`、`request_config_reset`（需确认）
- `get_export_dir_prefs`、`set_export_dir`、`request_pick_export_dir`

### 导出与系统
- `preflight_export`、`request_manual_export`（Electron 运行中）
- `request_check_app_update`

## 客户端偏好镜像

前端定期将 `localStorage` 中的输出目录等偏好 POST 到 `/settings/client_prefs/mirror`，供 `get_export_dir_prefs` 读取。AI 通过 `set_export_dir` 写入时带 `pending_apply`，轮询时应用至本机。

## 相关 API（本机 loopback）

- `GET/PATCH /settings/ai`
- `GET/PATCH /settings/ai/tools`
- `GET/POST /settings/ai/pending_prompts/*`
- `POST /v1/chat/completions`（OpenAI 兼容，含 tools）

## 验收要点（0.3.4）

1. Cursor 调用 `copy_template` 后模版列表多一条；`delete_template` 确认后消失并刷新。
2. `request_config_reset` 取消无变更；确认后连接/模版清空。
3. `request_manual_export` 确认后生成 PDF（Electron 运行中）。
4. `request_check_app_update` 触发设置页同款检查，不安装。
5. 关闭某工具后 Cursor 无法调用，且上游 tools 不含该项。
