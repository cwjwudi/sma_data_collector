# ReportEditor AI 对话页 UI 改版（参考 ChatGPT 玻璃态）

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **状态**：🚧 实现中 · **0.3.94** · 分支 `feat/016-ai-chat-ui`（效果不满意可整支丢弃）。  
> 相关实现面：[`AiDrawer.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/ai-assistant/AiDrawer.vue)、[`chat-persist.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/ai-assistant/chat-persist.ts)。  
> UI 协作约定：[.cursor/skills/ui-ux-pro-max-report-editor](../.cursor/skills/ui-ux-pro-max-report-editor/SKILL.md)。

---

# 🚧 进行中：AI 对话页视觉与布局对齐参考稿（→ 0.3.94）

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

1. `AiDrawer` 深色玻璃 token；展开态默认约 **96%×94% 视口**，八向拖拽调尺寸并记忆；Esc 先收起再关  
2. 顶栏：模型 `<select>` → `patchAiSettings`；新对话 / 展开 / 关闭  
3. 用户：右气泡 +「我」头像；助手：Agent 胶囊 + 无厚底 + 复制  
4. composer 大圆角壳 + 发送；排队收纳条保留  
5. `chat-persist`：`expanded` + `expandedWidthPx` / `expandedHeightPx`  

## 回滚

```bash
git checkout main
git branch -D feat/016-ai-chat-ui   # 若尚未合并
# 若已合并：git revert <merge-or-commit>
```

## 验收

- [ ] 默认抽屉 + 可展开近全屏，均可深色玻璃观感
- [ ] 用户气泡右对齐 + 头像；助手无厚底 + 可复制
- [ ] 顶栏可切换模型
- [ ] 无会话侧栏、无附件、无赞踩
- [ ] 流式 / 轨迹 / 排队 / 停止 / pending 无回归（见下方流式回归 H1）
- [ ] Electron 与浏览器布局一致

## 不做（本期）

- 多会话列表、附件、Share/Drive、赞踩、整站深色

---

# 🚧 进行中：016 改版后助手正文流式显示失效（回归）

> **流程**：先记录本 H1，再改代码；合入前须你目视确认流式恢复。  
> **发现**：2026-07-14 · 用户在 `0.3.94` DMG（玻璃态 UI）上试聊。  
> **相关能力**：能力不回退条款；流式基线见 [docs/014](014-✅-ReportEditor-AI流式输出.md)（014 约定「对上游转发 delta」）。

## 现象

- 改版前后端表现：助手正文**长时间停在空/…**，接近整段结束后才一次性（或极快扫过）出现。  
- 前端候选修复 `a3f13e4`（流式期纯文本）**目视仍未好** → UI 渲染不是主因。

## 根因（已核实代码 · 2026-07-14）

| 嫌疑 | 结论 |
|------|------|
| 前端 Markdown/`v-html` | 次要；`a3f13e4` 已规避，验收仍失败 |
| **后端 `iter_chat_stream_sse` 整轮缓冲** | **主因**：`_iter_upstream_stream` 虽按 token 产出 `content`，但外层只 `content_parts.append`，**等本轮上游全部结束后**才 `chunk_text_for_simulated_stream` 再发 `delta`。上游生成期间 UI 无正文增量 → 体感「流式失效」。 |
| 与 014 设计偏差 | 014 写「转发 delta」；实现却是「缓冲 + 模拟打字」 |

工具轮仍需：若本轮最终带 `tool_calls`，不应把半截「已完成」文案留给用户 → 已流式放出的正文用 `replace` 清空后再进 `tools` 相位。

## 拟修复

1. 收到上游 `content` 立即 `yield` SSE `delta`（并切 `writing`）  
2. 若本轮最终有 `tool_calls`：`replace` 清空已流出正文 → `tools` → 执行工具 → 下一轮继续真流式  
3. 去掉（或仅作兜底）无工具路径上的「整段后再模拟分段」  
4. 单测覆盖：无工具时 delta 在上游结束前即可出现（mock 异步迭代）

## 验收

- [ ] 无工具短答：生成过程中可见逐字/逐段增长（不是等完再刷）  
- [ ] 有工具轮：工具阶段轨迹可见；最终正文仍流式；不应长期留下工具前半截胡话  
- [ ] 停止 / 抽屉 / 展开态行为不回归  
- [ ] `a3f13e4` 纯文本流式渲染保留（降低卡顿）

## 不做（本条）

- 不改 SSE 事件名与前端解析协议  
- 不恢复「仅模拟打字、上游仍整包等完」为默认路径
