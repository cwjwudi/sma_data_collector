# ReportEditor 数据源滑动锁与工作台空白

> 产品计划：[`0.3.57`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.57.md) / [`0.3.58`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.58.md) / [`0.3.59`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.59.md)。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。

---

# ✅ 已完成：0.3.57 滑动锁外观止血

- 轨道钉死 88×32 + SVG；进度同步见 0.3.58。

---

# ✅ 已完成：0.3.58 工作台空白（缺 `draft`）+ 锁进度 + UI 测试

- **主因**：`ConnectionManager` 未声明 `draft` → 挂载崩溃。
- **验收**：面板可见；暴露空连接表单刷新问题 → 0.3.59。

---

# ✅ 已完成：空连接态表单周期性刷新清空（0.3.59）

## 根因

- `startLoadWatch` 在 API 已成功返回 `[]` 后仍每 2.5s 非 background `reloadConnections`。
- 空列表分支每次 `draftConn = null` + 常把 `connectionsLoading=true` → 输入框卸载丢光标；子组件再被冲草稿。

## 实现

- `empty-connections-reload-policy.ts`：`emptyReloadDraftAction` / `shouldContinueEmptyLoadWatch` / `shouldPreserveCreateDraftOnNullModel`。
- `DatabaseWorkbench`：空列表成功 → `emptyListConfirmed` 并 `stopLoadWatch`；`creatingNew` 时不重置 `draftConn`；loadWatch 仅 `background: true`。
- `ConnectionManager`：`[modelValue, creatingNew]` watch，连续新建+null 保留本地 draft。

## 测试证据

- `empty-connections-reload-policy.test.ts`
- `ConnectionManager.test.ts`：loading 闪烁保留输入；选中连接 → +新建仍清空
- **`npm test`：274 passed**

## 验收

- `(0/0)` 下连续输入名称/主机不再被周期清空、光标不因 loading 闪烁丢失。
- API 返回空后不再轮询砸表单；配置导入仍可强制刷新。
