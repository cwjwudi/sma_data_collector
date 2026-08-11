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

范围优先曾写：**数据库工作台**连接 CRUD；OPC UA 面板有同类「无忙态 / 新建无 id 连点」风险。  
**2026-08-11 本机手测**：四类现象在 **OPC UA** 路径已用审计复现（见下「本机运行时复现」）；DB 工作台仍待对照补测。

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
- [x] 运行时手测勾选（见下一 H1；OPC 路径本机已复现）

## 证据

- `ConnectionManager.vue`：`save` / `runTest` / `testAndSave` / `remove`
- `DatabaseWorkbench.vue`：`onConnectionUpdated`、`reloadConnections`、`probeAllDatabaseConnections`
- `backend/api/routers/database.py`：`upsert_connection` / `delete_connection` / `test*`
- `OpcUaPanel.vue`：`saveServer` / `removeServer` / `testDraft` / `loadServers` → `probeAllOpcConnections`

---

# ✅ 已完成：本机运行时复现（OPC UA 路径，2026-08-11）

## 环境与材料

| 项 | 值 |
| -- | -- |
| 主机 | `WIN-VADV2GRD869` / os_user `dp` |
| 版本痕迹 | 审计含 `update.applied`：`0.3.163` → `0.3.164`（本机可复现；远端登记环境未能复现） |
| 证据文件 | 本机导出审计 `report-editor-audit-2026-08-11.json`（152 条；其中 `opcua.connection_save`×48、`opcua.connection_delete`×37） |
| 复现入口 | 数据源 → **OPC UA**（非数据库工作台） |

## 现象对照（口述 → 运行时）

| 口述 | 本机结论 | 置信 |
| ---- | -------- | ---- |
| 多次点击保存会保存好多个 | **已复现**。同名同 endpoint 在无 `form.id` 时连点 → 多条不同 `uuid`（例：`RRR`/`WWW222`/`666`/`测试机` 各出现 2 个 id） | 高 |
| 连接测试很慢、很卡 | **已复现（与坏链强相关）**。保存/删后 `loadServers` 必调 `probeAllOpcConnections` → 对**全部**已存连接并行 `POST /opcua/test_saved/{id}`；不可达 endpoint（如 `192.168.1.10:4840`、`192.168.137.1:4840`、`127.0.0.10:4840`）单次约 8s 超时，多条叠加时新建/删除操作体感卡顿 | 高 |
| 老的配置删不掉 | **部分复现为「体感删不掉 / 连点才消」**。`removeServer` **无 busy/防重**；`form.id` 在 `await loadServers()` 完成前仍保留 → 同一 id 可在 ~150–320ms 内连打 DELETE 5～10 次（审计爆发）。首条删除已落盘，后续 DELETE 的 `before=null` 仍记 `ok`，UI 因全量探活未结束仍「卡住」，像删不动 | 高 |
| 新建配置会不显示 | **与 A 叠加可解释**：连点产生多条同名 tab；`saveServer` 用 name+endpoint 在列表里找 `created`，多副本时选中/展示易乱；刷新期无明确忙态 | 中 |

## 审计硬证据（节选）

1. **连点新建多 uuid（验证 A · OPC）**  
   - `WWW222` @ `opc.tcp://127.0.0.1:4840`：`d1d04b7a-…` 与 `77c27478-…` 间隔约 80ms 各建一条。  
   - `RRR` 同理：`cd5615e7-…` 与 `326b1c12-…`。  
   - 说明：`POST /opcua/servers` 在 `id` 为空时每次 `uuid4()` + `append`；前端 `saveServer` **无 busy**，保存成功后 **未立刻写回 `form.id`**（等 `loadServers` + name/endpoint 匹配），窗口内可再 POST 新建。

2. **删除爆发（验证 C · OPC）**  
   - `446ced4d-…`：约 320ms 内 `opcua.connection_delete` ×9。  
   - `660c918a-…`（`SMA_TEST2` / `127.0.0.1:4840`）：约 240ms 内 ×10；前 1～2 条 `detail.before` 有 name/url，其后 `before=null`（已删仍打 DELETE）。  
   - 后端 `delete_server` **幂等仍写审计**，故审计条数 ≈ 连点次数，不等于「删失败」。

3. **坏链与卡顿（验证 D · OPC）**  
   - 会话中出现不可达/异常 endpoint：`192.168.1.10:4840`、`192.168.137.1:4840`、`127.0.0.10:4840` 等。  
   - 每次 `loadServers` 成功后立即 `probeAllOpcConnections()`（`OpcUaPanel.vue`）；点 tab 也会再全量探测。  
   - `probeConnectionIds` 虽用 generation 丢弃过期 UI 结果，但 **HTTP/后端探测仍会跑完**；坏链超时叠加 → 新建/删除操作期间 UI 卡顿。

4. **审计双记说明**  
   - `opcua.connection_save`：前端 `auditLog` + 后端 `audit_log.append_audit` 各一条 → 同一次保存常成对出现（计数×2，勿当成两次用户点击）。  
   - `opcua.connection_delete`：仅后端记；爆发次数 ≈ 真实连点 DELETE 次数。

## 为何远端登记环境「不能复现」

静态排查时优先写了 **数据库工作台**；本机可复现路径在 **OPC UA 面板**，且依赖：

1. 存在 **不可达 / 错误** 的 OPC endpoint（触发全量 `test_saved` 超时）；  
2. 在 **新建态（无 id）** 下连点「保存」，或删除时连点（无防重）；  
3. 连接列表里已有多条坏链时，任意一次保存/删除/切 tab 都会放大卡顿。

仅测「可达的本机 demo OPC」或只点一次保存，往往看不到重复条目与卡顿，与远端「登记了但环境复现不了」一致。

## 结论（给修复用）

1. **根因主链（OPC，已证实）**：无 id 连点保存 → 多 uuid；无 busy 连点删除 → 多次 DELETE + 审计爆发；保存/删除/切 tab → `probeAll` 全量测连，坏链超时拖垮交互。  
2. **「删不掉」优先按**「重复副本未删净（A）+ 删除后探活卡顿伪装成失败（D）+ 无防重连点」**解释，而非 DELETE API 拒删。  
3. **修复优先级不变**：P0 保存防重 + 立刻绑定 `saved_id`/`form.id`；P0 删除 busy/单飞；P1 `probeAll` 限流/保存后仅测当前/坏链短超时；删除成功先摘 tab。  
4. DB 工作台静态结论仍有效，本轮手测以 OPC 为准；DB 连点保存可另补一轮对照。

## 验收方式（本 H1）

- [x] 本机 OPC 路径复现 A/C/D，审计可指到具体 id/时间簇  
- [x] 写明与远端「不能复现」的环境差（坏链 + OPC 面板 + 连点）  
- [x] 结论回写修复优先级（不改代码，仅证据闭环）

---

# ✅ 已完成：手测复现清单（OPC 本机）

| # | 步骤 | 期望 / 观察 | 本机 |
| - | ---- | ----------- | ---- |
| 1 | 解锁 → 新建 → 慢点一次「保存」 | 顶部出现一条且选中；`form` 带 id | 未单独慢点记录；逻辑与静态 A 一致 |
| 2 | 新建 → **连点**「保存」 | 是否出现多条（验证 A） | ✅ 审计：`RRR`/`WWW222` 等双 id |
| 3 | 新建 → 「测试并保存」连点 | DB 路径；OPC 无同名按钮 | OPC：N/A（测「测试连接」+ 坏链超时） |
| 4 | 锁态下点删除 | 应提示锁定，配置仍在 | 未专项测；代码有 `datasourceLocked` 分支 |
| 5 | 解锁后删除一条，重启进页 | 该 id 应消失 | ✅ 能删掉；连点会多记审计；坏链时体感卡 |
| 6 | 多条无效主机时进页 / 保存 / 删 | 全量探测导致卡顿 | ✅ 与坏链 + `probeAllOpcConnections` 一致 |

环境：本机 Win，审计时段版本约 **0.3.164**（见上表）。DB 工作台 #1–#3 仍可补测。

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
