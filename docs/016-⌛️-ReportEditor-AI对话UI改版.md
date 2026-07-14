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
> **相关能力**：能力不回退条款；流式基线见 [docs/014](014-✅-ReportEditor-AI流式输出.md)。

## 现象

- 改版前：助手正文随 SSE `delta` **逐段/逐字**出现。  
- 改版后（展开深色对话窗）：流式**像失效**——表现为长时间无增量、或接近整段结束后才一次性出现。  
- 顶栏「生成中 / 撰写中」等 phase 是否仍变，现场未强制区分；优先保证**正文可见增量**。

## 根因分析（记录）

| 嫌疑 | 说明 | 结论 |
|------|------|------|
| SSE / 后端断流 | `sendAiChatStream` / 解析未改 | 低（与 UI 改版同期、API 未动） |
| 流式期每帧 `v-html` + MarkdownIt | 每个 delta 全量 `renderAssistantMarkdown`，DOM 重绘重、易卡成「整段才出」 | **主嫌疑** |
| 仅就地改 `a.content` | 深对象字段更新偶发不驱动列表项重绘 | 次嫌疑 |
| 每 delta `scrollToBottom` | 高频异步滚动加重卡顿 | 次嫌疑 |

## 拟修复（候选 · 待你验收）

代码已落在分支提交 `a3f13e4`（**先记本条后再合验收**）：

1. `status === 'streaming'`：纯文本 `{{ m.content }}` + 光标，**不**跑 Markdown/`v-html`  
2. 结束后再 `renderAssistantMarkdown`  
3. `patchAssistantMessage`（`splice`）保证列表项更新  
4. `scheduleScrollToBottom` 按 rAF 节流  

若验收仍「整段才出」：再查上游/代理缓冲（非 UI），另开条。

## 验收

- [ ] 普通短答：可见逐字/逐段增长，末尾有光标；结束后 Markdown 正常  
- [ ] 含工具轮：工具轨迹仍可折叠展示；正文在 writing 阶段仍有流式感  
- [ ] 停止生成：流式中断后状态正确  
- [ ] 抽屉态与展开态行为一致  

## 不做（本条）

- 不改 SSE 协议 / 后端推送节奏（除非验收证明非 UI 问题）  
- 不在流式期做完整 Markdown 实时排版
