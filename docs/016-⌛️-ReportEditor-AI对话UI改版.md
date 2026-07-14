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

工具轮：**已改**——进入 tools **不再** `replace` 清空（见下方「吞正文」H1）；claim guard 纠错仍可用 `replace`。

## 拟修复

1. 收到上游 `content` 立即 `yield` SSE `delta`（并切 `writing`） ✅  
2. ~~有 tool_calls 时 replace 清空~~ → **改为保留正文**（见下一 H1）  
3. 去掉无工具路径上的「整段后再模拟分段」（仅作未流出兜底） ✅  
4. 单测：`plan_live_content_sse` ✅  

## 验收

- [ ] 无工具短答：生成过程中可见逐字/逐段增长（不是等完再刷）  
- [ ] 有工具轮：工具阶段轨迹可见；最终正文仍流式  
- [ ] 停止 / 抽屉 / 展开态行为不回归  
- [ ] `a3f13e4` 纯文本流式渲染保留（降低卡顿）

## 不做（本条）

- 不改 SSE 事件名与前端解析协议  
- 不恢复「仅模拟打字、上游仍整包等完」为默认路径

---

# 🚧 进行中：工具轮开始时把已流出正文「吞掉」

> **流程**：先记录，再改。  
> **发现**：2026-07-14 · 真流转发修复后用户反馈。

## 现象

1. 助手先流式说出一段话（常伴随即将调工具）。  
2. **一开始调用工具**，这段话从气泡里消失。  
3. 工具跑完后再答一段；若再次调工具，**这一段又被清掉**。

## 根因

`cb208f8` 为规避「带 tool_calls 的半截已完成文案」，在进入 `tools` 相位前发送了：

`event: replace` + `{"text":""}`

前端把**同一条**助手消息 `content` 置空 → 已读文字被吞。多轮工具会反复清空。

## 拟修复

1. **进入 tools 时不再 `replace` 清空**；保留已流出正文，下一轮 `delta` 追加在同一气泡。  
2. 工具轮与下一轮正文之间插入 `\n\n`，避免两段粘在一起。  
3. `replace` 仍保留给 claim guard 纠错改写（探活/诊断等），不用于工具轮。  
4. 更新 `plan_live_content_sse` 单测：有工具时**无** replace。

**实现**：`plan_claim_retry_client_events` + 前端忽略空 replace（见随后 fix 提交）。

## 验收

- [ ] 「先说话 → 调工具 → 再说话」：第一段仍在，第二段接在后面  
- [ ] 连续两轮工具：中间正文不被清空  
- [ ] claim guard 需要改写时仍可用 `replace`（非空改写）；**空 replace 不得清屏**

---

# 🚧 进行中：claim guard 空 replace 吞掉已流出正文（真根因）

> **流程**：先记录，再改。  
> **发现**：2026-07-14 · `f69b7b2`（去掉 tools 前清空）之后用户仍反馈吞字。  
> **深入结论**：工具分支已不再 `replace ""`；**仍会清空的是 claim guard「强制再调」路径**。

## 现象（用户原话对齐）

1. 先流出一段话 → 随后开始调工具 → **这段话消失**  
2. 再答一段 → 又调工具 → **这段又消失**  
3. 「重新开始回复」时会吞掉前一段

## 时序根因（代码）

`iter_chat_stream_sse` 在**本轮没有解析到 tool_calls** 但正文命中探活/诊断完成态断言时：

```text
needs_*_claim_retry(assistant_text, tool_trace) == True
  → yield event:replace data:{"text":""}   // 整泡清空
  → 注入纠错 system，continue 下一轮
  → 模型再调工具
```

用户体感：话刚说完 → 屏幕被清空 → 工具轨迹出现（像「一调工具就把话吞了」）。  
多轮重复时，每次强制再调都会再清一次。

另：最终 `replace` 成改写文案时，若气泡里已有「工具前说明 + 后文」，**整段替换**也会误伤前序交互（次要）。

`f69b7b2` 只修了「有 tool_calls 时进入 tools」路径，**未覆盖 claim 空 replace**。

## 拟修复

1. **后端**：claim 强制再调时**禁止** `replace ""`；只 `status: thinking` 并 continue（纠错仍进 LLM messages）  
2. **后端**：最终改写若本轮前已有流出正文 / 曾跑过工具 → 改为 `delta` 追加 `\n\n`+改写，避免整泡替换  
3. **前端**：防御——`replace` 且 `text===""` 时 **忽略**（不把已有 content 置空）  
4. 单测：空 replace 策略 / 前端忽略（可测纯函数）

## 验收

- [ ] 命中 claim 再调：已显示正文保留，随后出现工具轨迹与续写  
- [ ] 最终失败改写：不删除工具前已流出的说明文字（追加或仅改末段）  
- [ ] 无工具短答流式仍正常

---

# ⌛️ 未完成：探活 claim 误伤「审计/只读确认」（交叉）

> 详情与用例见 **[docs/006](006-🚧-ReportEditor-AI上游错误体验.md)** 对应 H1（2026-07-14 登记）。  
> 摘要：问「分析审计」后用 `get_connection_health_summary` 只读确认「探活已开启」，仍被改写成「未能确认…没有成功的写入工具结果」。

---

---

# ⌛️ 登记：探活 claim 误伤只读查证（交叉 006）

现场：「分析审计」→ 已用 `get_connection_health_summary` 确认当前探活已开，仍被改写成「没有成功的写入工具结果」。  

详见 [docs/006 · 探活 claim 误伤只读查证](006-🚧-ReportEditor-AI上游错误体验.md)（先记未修）。
