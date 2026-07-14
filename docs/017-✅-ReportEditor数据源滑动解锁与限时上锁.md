# ReportEditor 数据源滑动解锁 UI 与限时自动上锁

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **状态**：已实现 → **0.3.93**。  
> 相关实现：[`DatasourceLockToggle.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/datasource/DatasourceLockToggle.vue)、[`datasource-unlock-session.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/datasource/datasource-unlock-session.ts)、[`datasource-lock-geometry.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/datasource/datasource-lock-geometry.ts)。  
> 视觉示意：`docs/assets/017-style-D3-subtle-sheen.png`（D3）。  
> 版本计划：[`0.3.93.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.93.md)。

---

# ✅ 已完成：成熟滑动解锁 + 60s 限时自动上锁（→ 0.3.93）

## 产品诉求

1. 成熟滑动解锁（D3：Indigo 灰 + 克制细白光扫）  
2. 解锁后 60s；滑块匀速回退 + 「剩余 Ns」；再滑到解锁端重置满 60s  
3. 切页后台继续计时；AI pending 确认解锁同一窗口  

## 实现要点（0.3.93）

1. `datasource-unlock-session`：应用级 60s 会话；到期 `datasource_locked=true`  
2. `DatasourceLockToggle`：加宽轨；解锁态 Indigo 填充 + sheen；旁侧/轨内秒数  
3. `AiPendingPromptDialog`：`confirm_unlock_datasource` → `beginUnlockSession()`  
4. 单测：`datasource-lock-geometry` + `datasource-unlock-session`

## 验收

- [x] 滑动解锁 D3 视觉（Indigo + 克制光扫）
- [x] 解锁后滑块回退 + 剩余秒数；满 60s 自动锁定
- [x] 再滑到解锁端重置 60s
- [x] 切页会话仍计时（模块级 ticker）
- [x] AI pending 解锁同源 60s
- [x] 右滑/拖回锁定端立即上锁
- [x] 几何与会话单测通过

## 已拍板摘要

| # | 结论 |
|---|------|
| Q1 | 自研 |
| Q2 | 回退 + 再滑重置 60s |
| Q3 | 回退 + 秒数 |
| Q4 | 切页续计 |
| Q5 | 滑到底即解锁 |
| Q6 | AI 同源 60s |
| Q7 | **D3** |

```bash
cd _Prj/SD_SMA_ReportEditor/frontend && npm run test -- --run src/features/datasource/datasource-lock-geometry.test.ts src/features/datasource/datasource-unlock-session.test.ts
```
