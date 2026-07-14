# ReportEditor AI 对话页 UI 改版（参考 ChatGPT 玻璃态）

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **状态**：已合入 **main** · **0.3.94**（原分支 `feat/016-ai-chat-ui`）。  
> 相关实现面：[`AiDrawer.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/ai-assistant/AiDrawer.vue)、[`chat-persist.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/ai-assistant/chat-persist.ts)、[`ai_openai.py`](../_Prj/SD_SMA_ReportEditor/backend/api/routers/ai_openai.py) 流式。  
> UI 协作约定：[.cursor/skills/ui-ux-pro-max-report-editor](../.cursor/skills/ui-ux-pro-max-report-editor/SKILL.md)。

---

# ✅ 已完成：AI 对话页视觉与布局对齐参考稿（→ 0.3.94）

## 产品诉求（2026-07-13）

深色玻璃态、顶栏模型选择、右对齐用户气泡 + 头像、左对齐助手无厚气泡、底栏大圆角输入；默认抽屉可展开近全屏。

## 参考图

![AI 对话 UI 参考（ChatGPT 风格玻璃态）](assets/016-ai-chat-ui-reference.png)

## 已拍板（2026-07-14）

| # | 结论 |
|---|------|
| 能力不回退 | 流式、工具轨迹、排队收纳、pending、停止 |
| **Q1** | **C** 默认抽屉 + 可展开近全屏 |
| **Q2** | **A** 仅 AI 面板深色玻璃 |
| **Q3** | **A** 顶栏下拉切模型 |
| **Q4** | **B** 无会话侧栏 |
| **Q5** | **B** 仅复制 |
| **Q6** | **A** 无附件 |

## 本轮实现

1. `AiDrawer` 深色玻璃；展开默认约 96%×94% 视口，八向拖拽调尺寸并记忆  
2. 顶栏模型下拉 / 新对话 / 展开·收起 / 关闭  
3. 用户右气泡 +「我」；助手 Agent 胶囊 + 无厚底 + 复制；流式期纯文本  
4. 后端真流转发上游 `delta`；工具轮与 claim 再调不再空 `replace` 清屏  
5. `chat-persist`：`expanded` + 展开宽高  

## 验收

- [x] 默认抽屉 + 可展开近全屏，深色玻璃（用户确认合入）
- [x] 用户气泡右对齐 + 头像；助手无厚底 + 可复制
- [x] 顶栏可切换模型
- [x] 无会话侧栏、无附件、无赞踩
- [x] 流式 / 轨迹 / 排队 / 停止 / pending（合入时以分支修复合计为准）
- [x] Electron 与浏览器布局一致（同一套 AiDrawer）

## 不做（本期）

- 多会话列表、附件、Share/Drive、赞踩、整站深色

---

# ✅ 已完成：流式失效 / 工具与 claim 清屏（随 0.3.94）

| 问题 | 修复要点 |
|------|----------|
| 整轮缓冲后才模拟 delta | `iter_chat_stream_sse` 上游 content 即时转发 |
| 进 tools 时 `replace ""` | 去掉；下一段前 `\n\n` |
| claim 再调空 replace | 只切 thinking；前端忽略空 replace；最终改写可追加 |

---

# ✅ 已完成：探活 claim 误伤「审计/只读确认」（交叉 006 · → 0.3.95）

> 详情见 **[docs/006](006-🚧-ReportEditor-AI上游错误体验.md)**。  
> 摘要：只读确认「探活已开启」不再被改写成「没有成功的写入工具结果」；施为声称仍须 write。
