# ReportEditor 数据源配置：新建不显示 / 测连卡顿 / 删不掉 / 连点保存重复

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 相关：[`docs/004-✅-ReportEditor数据源UI修复.md`](004-✅-ReportEditor数据源UI修复.md)、[`docs/008-✅-ReportEditor数据源锁定表单按钮被顶出.md`](008-✅-ReportEditor数据源锁定表单按钮被顶出.md)、[`docs/017-✅-ReportEditor数据源滑动解锁与限时上锁.md`](017-✅-ReportEditor数据源滑动解锁与限时上锁.md)。  
> 主要代码：`ConnectionManager.vue`、`DatabaseWorkbench.vue`、`OpcUaPanel.vue`、`backend/api/routers/database.py`。

---

## 用户反馈（2026-08-10）

数据源配置页现场现象（口述，待手测复现确认）：

1. **新建配置会不显示**（口述「不现实」按「不显示」理解）
2. **连接测试很慢、很卡**
3. **老的配置删不掉**
4. **多次点击保存会保存好多个**（重复条目）

范围优先：**数据库工作台**连接 CRUD；OPC UA 面板有同类「无忙态 / 新建无 id 连点」风险，一并列入排查。

---

# 🚧 进行中：静态排查（代码对照）

## 目标

在未改代码前，把四类现象映射到可疑调用链与可复现步骤，便于下一轮定点修复与单测。

## 已核对结论（代码级，待运行时验证）

### A. 多次点击保存 → 多条配置（高置信）

| 环节 | 说明 |
| ---- | ---- |
| 后端语义 | `POST /database/connections`：`body.id` 为空则 **新建** `uuid` 并 `append`；有 id 才 upsert（`database.py`） |
| 前端草稿 | `ConnectionManager.save()` 用 `id: draft.id \|\| null`；**保存成功后未立刻写回 `draft.id`**，只 `emit('updated', mine)` 等父组件 `reloadConnections` |
| 忙态窗口 | `busy` 在 `save` 的 `finally` 里即清除；此时列表刷新往往尚未完成 → **可再次点「仅保存」且仍无 id → 再插一条** |
| 测试并保存 | `testAndSave` → `runTest()` 的 `finally` 先把 `busy=false`，再 `await save()`，中间可连点 |
| OPC 同类 | `OpcUaPanel.saveServer()` **无 busy/防重**；`form.id` 空时每次 POST 新建；回填靠 name+endpoint 匹配，易在连点下叠多条 |

**建议复现**：解锁数据源 →「+ 新建」→ 填名称 → 快速连点「仅保存」2～3 次 → 顶部标签应出现多条同名/同引擎连接。

**修复方向（未做）**：

1. 保存响应拿到 `saved_id` 后 **同步写入 `draft.id`**（或父组件乐观插入 tab），再允许下一次保存。
2. 保存/测连全程 `busy`（含 `testAndSave` 整段），按钮禁用至列表刷新完成；可选 **in-flight 单飞**（忽略重复点击）。
3. 名称非空校验；可选同名提示。

### B. 新建后「不显示」（中置信，可能与 A 叠加）

| 可疑点 | 说明 |
| ---- | ---- |
| 刷新链路 | `onConnectionUpdated` → `clearWorkbenchSession` + `reloadConnections(preferredId, { force:true })`；依赖响应里的 `saved_id` / 名称匹配 |
| 空列表首存 | 从 `(0/0)` 保存时，`reloadConnections` 非 background 会把 `connectionsLoading=true`，表单区短暂变成「正在加载…」，若刷新失败或 `preferredId` 未命中，体感像「建了没了」 |
| 标签文案 | 名称为空时标签仅显示引擎名（`connectionTabLabel`），多条重复时难以辨认「新建那条」 |
| 标签过多 | 连点产生大量 tab 时，新建标签可能被挤出可视区（需看 `tabs-conn` 是否横向滚动） |
| 与锁/会话 | 锁定时「+ 新建」禁用；解锁会话过期后保存失败应有文案，需与「静默失败」区分 |

**建议复现**：解锁 → 新建唯一名称 → 点一次「仅保存」→ 看顶部是否出现对应 tab 且选中；再试「名称留空保存」。

### C. 老配置删不掉（中置信）

| 可疑点 | 说明 |
| ---- | ---- |
| 数据源锁 | `locked` 时删除按钮 `disabled`，点了也只会提示「无法删除」——现场若滑块在锁态，最像「删不掉」 |
| 删除后事件 | `remove()` 成功后 `emit('updated', null)` **再** `emit('new')`：先异步全量 reload，再进新建态；若用户以为「应回到空列表却仍看到旧 tab」，可能是 **未删掉的重复副本**（A）或 reload 尚未结束 |
| API | `DELETE /database/connections/{id}` 在可写时过滤 id 后 `_save`；无「禁止删演示」硬拦截（远程演示也可删），锁由 `assert_datasource_writable` 拦截 |
| OPC | `removeServer` 无 try/catch：失败时可能无明确 UI；删后 `loadServers`+`startNew` |

**建议复现**：确认滑动锁为**解锁** → 选中一条旧连接 → 删 → 刷新页/重进数据源，确认文件侧是否仍在；若锁态下删除，应看到锁定提示而非静默。

### D. 连接测试很慢很卡（中高置信）

| 可疑点 | 说明 |
| ---- | ---- |
| 单次超时 | DB `connect_timeout=10`（`db_readonly_service`）；OPC 测试约 8～15s（`opcua_service`）——主机不可达时单次可卡满超时 |
| 保存后群测 | `reloadConnections(..., force)` 成功后常触发 `probeAllDatabaseConnections({ force })`：**当前连接 + 其余连接** 并行 `test_saved`；连接多或大量无效主机时，后端与 UI 同时承压 |
| 表单忙态 | 手动「测试连接」期间整表 `busy`，体感「整页卡住」 |
| 导航健康 | 侧栏/导航也可能 `probeAll*ForNav`，与工作台叠加 |

**建议复现**：准备 1 条故意错误主机 + 若干已有连接 → 保存或进入数据源页 → 观察是否长时间转圈/卡顿；对比只测一条与全量探测的耗时。

## 验收方式（本 H1）

- [x] 四类现象均有代码对照与可疑点
- [x] 写出可复现步骤与修复方向
- [ ] 运行时手测勾选（见下一 H1）

## 证据

- `ConnectionManager.vue`：`save` / `runTest` / `testAndSave` / `remove`
- `DatabaseWorkbench.vue`：`onConnectionUpdated`、`reloadConnections`、`probeAllDatabaseConnections`
- `backend/api/routers/database.py`：`upsert_connection` / `delete_connection` / `test*`
- `OpcUaPanel.vue`：`saveServer` / `removeServer` / `testDraft`

---

# ⌛️ 未完成：手测复现清单

| # | 步骤 | 期望 / 观察 |
| - | ---- | ----------- |
| 1 | 解锁 → 新建 → 慢点一次「仅保存」 | 顶部出现一条且选中；`draft` 带 id |
| 2 | 新建 → **连点**「仅保存」 | 当前是否出现多条（验证 A） |
| 3 | 新建 → 「测试并保存」连点 | 是否重复插入 + UI 是否长时间 busy |
| 4 | 锁态下点删除 | 应提示锁定，配置仍在 |
| 5 | 解锁后删除一条，重启进页 | 该 id 应消失 |
| 6 | 多条无效主机时进页 / 保存 | 是否全量探测导致卡顿 |

环境：ReportEditor 当前开发版或现场安装包版本号请在复现时注明。

---

# ⌛️ 未完成：修复实现（防重保存 / 乐观 id / 删除与探测）

## 范围（建议按优先级）

1. **P0** 保存防重 + 响应后立刻绑定 `saved_id`（DB + OPC）
2. **P0** `testAndSave` / 删除 的忙态与错误提示闭环
3. **P1** 删除成功后本地先摘 tab，再后台 reload（避免「删了还在」错觉）
4. **P1** 全量 `probeAll`：错峰、并发上限、或保存后仅测当前连接；缩短不可达超时或前端可取消
5. **P2** 新建保存后保证 tab 可见（选中 + 滚动进视口）；空名称校验

## 非目标（本轮）

- 不改动数据源锁的业务语义（锁后禁止改/删）
- 不重做数据源信息架构

## 验收（实现后）

- 连点保存只产生 **一条**；单测锁「无 id 双飞只建一条」或「第二次带 id upsert」
- 删除后 tab 立即消失且落盘一致；锁态有明确文案
- 测连：无效主机有超时上限；保存不触发「全连接长时间阻塞 UI」

---

# ⌛️ 未完成：回归单测与文档收尾

- 前端：`ConnectionManager` 保存防重 / `saved_id` 回写；可选 OPC `saveServer` busy
- 后端：若加幂等（如短窗同内容去重）再补 API 测；默认以前端防重为主
- 关闭本看板前：文件名改 `052-✅-…`，`todo.md` 记验收证据
