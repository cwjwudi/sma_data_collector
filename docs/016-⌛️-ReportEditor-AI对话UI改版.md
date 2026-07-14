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

1. `AiDrawer` 深色玻璃 token；展开态居中圆角面板；Esc 先收起再关  
2. 顶栏：模型 `<select>` → `patchAiSettings`；新对话 / 展开 / 关闭  
3. 用户：右气泡 +「我」头像；助手：Agent 胶囊 + 无厚底 + 复制  
4. composer 大圆角壳 + 发送；排队收纳条保留  
5. `chat-persist.expanded` 记忆展开偏好  

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
- [ ] 流式 / 轨迹 / 排队 / 停止 / pending 无回归
- [ ] Electron 与浏览器布局一致

## 不做（本期）

- 多会话列表、附件、Share/Drive、赞踩、整站深色
