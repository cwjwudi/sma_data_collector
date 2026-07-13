# ReportEditor 数据源滑动解锁 UI 与限时自动上锁

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **状态**：仅登记需求，**未开工实现**。  
> 相关实现面：[`DatasourceLockToggle.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/datasource/DatasourceLockToggle.vue)、[`datasource-lock-geometry.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/datasource/datasource-lock-geometry.ts)、数据源页 [`DataSourceConfig.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/DataSourceConfig.vue)。  
> 相近历史：[docs/008-✅-ReportEditor数据源锁定表单按钮被顶出.md](008-✅-ReportEditor数据源锁定表单按钮被顶出.md)、[docs/004-✅-ReportEditor数据源UI修复.md](004-✅-ReportEditor数据源UI修复.md)。  
> UI 协作约定：[.cursor/skills/ui-ux-pro-max-report-editor](../.cursor/skills/ui-ux-pro-max-report-editor/SKILL.md)。

---

# ⌛️ 未完成：成熟滑动解锁交互 + 解锁后 60s 自动上锁

## 产品诉求（2026-07-13）

1. **滑动解锁 UI**：现有数据源锁定/解锁控件不好看、不好操作，需换成**成熟方案**的滑动解锁设计（可参考主流「滑块到终点解锁」交互，手感与可达性达标）。  
2. **限时解锁**：用户滑动**解锁成功后**，进入可编辑状态，并启动 **60 秒倒计时**；倒计时结束**自动重新锁定**（关闭可编辑）。倒计时过程中应有清晰剩余秒数反馈。

## 现状（粗对照）

| 点 | 现状 | 诉求 |
|----|------|------|
| 控件 | `DatasourceLockToggle` 自研窄轨滑块 + 「已锁定/可编辑」文案 | 成熟滑动解锁观感与手感 |
| 操作 | 指针拖拽阈值；触控/精细度反馈一般 | 易滑、易达终点、误触可控 |
| 解锁时效 | 解锁后一直可编辑，直至用户再滑锁定 | 解锁后 **60s** 自动上锁 |
| 反馈 | 无倒计时 | 解锁态显示剩余秒数（如「59s 后自动锁定」） |

## 业务语义（默认保持，除非另拍板）

| # | 约定 |
|---|------|
| B1 | `datasource_locked` 偏好语义不变：锁定后 UI/API 不可新建/编辑/删除连接；仍可查看与测试连通 |
| B2 | AI 在锁定下写类工具仍拒绝；解锁确认流（含 AI pending「请解锁数据源」）语义不变 |
| B3 | **自动上锁**与手动滑动锁定效果一致（写回 `datasource_locked=true` + 派发 `report-editor-datasource-lock-changed`） |
| B4 | 倒计时仅在「从锁定 → 解锁」成功后启动；用户在倒计时内**手动再锁定**则取消倒计时 |

## 已拍板（登记阶段）

| # | 结论 |
|---|------|
| 本轮 | **只记看板**，不改代码、不发版 |
| 倒计时时长 | **60 秒**（解锁成功起算） |
| 到期行为 | **自动锁定**（关闭可编辑） |

## 待拍板（开工前）

| # | 问题 | 候选 |
|---|------|------|
| Q1 | 成熟方案选型 | A) 自研对齐常见 slide-to-unlock（大拇指轨 + 终点吸附 + 触感反馈） · B) 引入轻量成熟组件再皮肤化 |
| Q2 | 倒计时内再次解锁 | A) 重置为全新 60s · B) 不延长（保持原到期点）——默认倾向 **A** |
| Q3 | 倒计时 UI 位置 | A) 滑块旁实时秒数 · B) 页面顶栏/提示条 |
| Q4 | 离开数据源页 | A) 后台继续计时并到期上锁 · B) 离开即立即上锁 · C) 暂停计时回来续算 |
| Q5 | 解锁是否仍需二次确认 | A) 仅滑动即解锁（现状） · B) 滑到终点后再点确认（更防误触） |
| Q6 | AI pending 解锁 | 人工确认解锁后是否同样走 60s 倒计时——默认倾向 **是** |

## 拟改（开工后）

1. 重做 `DatasourceLockToggle`（或替换）为成熟滑动解锁交互与视觉。  
2. 解锁成功：写 `datasource_locked=false`，启动 60s 定时器，UI 展示剩余秒数。  
3. 到期 / 手动锁定：写 `datasource_locked=true`，清定时器，派发锁变更事件。  
4. 单测：几何/阈值、60s 到期上锁、中途手动锁定取消计时、（若拍板）重置倒计时。  
5. 手工：触控板/鼠标拖滑手感；到期后表单操作区恢复锁定态。

## 验收（登记用 · 实现后勾）

- [ ] 滑动解锁观感与操作明显优于现状（易滑、终点明确）
- [ ] 解锁后可见倒计时；满 60s 自动锁定
- [ ] 倒计时内手动锁定立即生效且不再自动改状态
- [ ] 锁定业务门禁与 AI 写拒绝不回归（对照 008 / 现有锁语义）
- [ ] Electron 与浏览器数据源页行为一致

## 不做（本登记）

- 本轮不实现 UI / 倒计时逻辑  
- 不改变「锁定禁止改连接」的核心安全语义  
- 不把倒计时做成可配置项（除非后续单独拍板）
