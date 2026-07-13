# ReportEditor 数据源滑动锁与工作台空白

> 产品计划：[`0.3.57`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.57.md) / [`0.3.58`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.58.md)（已发）→ [`0.3.59`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.59.md)（表单刷新清空续修）。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。

---

# ✅ 已完成：0.3.57 滑动锁外观止血

- 轨道钉死 88×32 + SVG；进度同步见 0.3.58。

---

# ✅ 已完成：0.3.58 工作台空白（缺 `draft`）+ 锁进度 + UI 测试

- **主因**：`ConnectionManager` 未声明 `draft` → 挂载崩溃。
- **实现**：补 `reactive`；`main--solo`；锁几何纯函数；Vue/契约测 263 passed。
- **验收**：0.3.58 安装后「数据库连接」面板可见。

---

# 🚧 进行中：空连接态表单周期性刷新并清空输入（0.3.58 复现）

## 现象

- 数据源 → 数据库工作台（**0/0 无连接**）面板已能显示。
- 在「名称 / 主机」等输入框打字时：**内容被清空、光标丢失**，感觉页面「一直在刷新」。
- 有时会短暂闪到「正在加载已保存的连接…」再回到空表单。

## 复现条件

- 本机无已保存数据库连接（健康计数 `(0/0)`）。
- 进入数据源页后开始编辑「+ 新建」表单（`creatingNew === true`）。

## 根因（代码链路）

### 1. 空列表轮询（直接触发）

`DatabaseWorkbench.startLoadWatch()`：无连接时每 **2.5s** 调一次 `reloadConnections(null)`（**非 background**），最多约 12 次（~30s）。

无连接时 `reloadConnections` 成功分支固定：

```js
if (!connections.value.length) {
  creatingNew.value = true
  activeConnId.value = ''
  draftConn.value = null   // ← 每次重载都把父级 model 打成 null
  ...
  return
}
```

且非 background 时空列表会先：

```js
connectionsLoading.value = true  // ← 表单切到 loading 占位，输入框卸载
```

### 2. 子组件把 null 当成「重置草稿」

`ConnectionManager` 对 `modelValue` 的 `watch(..., { immediate: true })`：

```js
if (!v) {
  draft.name = ''
  draft.host = '127.0.0.1'
  // …清空全部字段
}
```

父级反复 `draftConn = null` → 子级反复清空 → **光标丢失、输入被冲掉**。

### 3. 短路条件帮不上忙

背景重载的「签名未变则早退」要求 `connections.value.length > 0`，**空列表永远走满路径**，每次都重置 `draftConn`。

### 次要风险（同文件，未必是本现象主因）

- `onDatasourceChanged` → `reloadConnections(..., { force: true, background: true })`：空列表时同样会 `draftConn = null`。
- `dbConnectionHealth.total` watch：total>0 且本地 connections 仍空时会再拉一次。

## 拟改（实现前先落本文档；版本 **0.3.59**）

1. **空列表重载不得打断正在编辑的新建草稿**  
   - 若 `creatingNew` 且用户已在编辑（或简单：已有 `creatingNew`），重载成功且仍为空时：**不要**再赋 `draftConn = null`；不要把 `connectionsLoading` 拨回 true 盖住表单。
2. **`startLoadWatch` 降噪**  
   - 空列表轮询改为 `background: true`；或仅在「从未成功拉到过 connections API」时轮询；一旦 API 成功返回空数组则**停止**轮询（空是合法稳态，不是「还在启动」）。
3. **ConnectionManager**  
   - `modelValue` 从「有值 → null」且 `creatingNew` 仍为 true 时，**保留本地 draft**（仅在真正切换连接 / 点「+ 新建」时重置）。
4. **测试**  
   - 单测/组件测：模拟「空列表连续 reload」不应清空已输入的 `draft.name`；`startLoadWatch` 在 API 返回 `[]` 后不再调度。

## 验收

1. `(0/0)` 下连续输入名称/主机 10s+ 不被清空、光标不丢。
2. 不再周期性闪「正在加载已保存的连接…」。
3. 导入配置 / 真有连接变更时仍能刷新列表。
4. `npm test` 含上述回归用例。

---

# ⌛️ 未完成：实现 0.3.59 并打包

- bump、看板收尾 ✅、Mac 包、`latest.json` / `007` / `todo.md`。
