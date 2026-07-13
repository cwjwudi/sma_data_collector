# ReportEditor 数据源滑动锁与工作台空白

> 产品计划：[`0.3.57.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.57.md)（部分）→ [`0.3.58.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.58.md)（闭环）。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。

---

# ✅ 已完成：0.3.57 滑动锁外观止血（轨道不再巨大白块）

- **实现**：`DatasourceLockToggle.vue` 钉死 88×32、`appearance: none`、拇指 `translateX` + SVG。
- **验收（部分）**：0.3.57 目视轨道尺寸正常；进度同步见 0.3.58。

---

# ✅ 已完成：0.3.57 高度链兜底（未真正解决空白）

- **当时误判**：仅高度链；**主因实为 ConnectionManager 缺 `draft`**（0.3.58 修）。
- **保留**：全高页 / stage min-height 兜底仍有价值。

---

# ✅ 已完成：重诊并修复工作台空白（0.3.58）

- **主因**：`ConnectionManager.vue` 使用 `draft` 但未 `reactive` 声明 → `immediate` watch 抛 `ReferenceError` → 子树空白，只剩「+ 新建」。
- **实现**：补 `const draft = reactive({…})`（声明在任何 watch 之前）；`main--solo` 单列；`conn-form-pane` / `page-fill-height` min-height 兜底。
- **验收**：`ConnectionManager` 挂载测（空态/新建/加载/锁定）绿；vitest 263 passed。

---

# ✅ 已完成：补测试门槛（同事建议）

- **实现**：`happy-dom` + `@vue/test-utils`；`datasource-lock-geometry` 单测；`ConnectionManager.test.ts`；`workbench-layout` class + CSS 契约测。
- **约定**：数据源 UI 改动不得仅靠 `src/lib` 全绿发版（见 0.3.58 Plan R8）。

---

# ✅ 已完成：锁进度与拖柄同步（0.3.58）

- **实现**：`datasource-lock-geometry.ts` — `fillWidthPx` 对齐拇指中心；`pctFromClientX` 按拇指中心区间映射；松手请求完成前保持拖拽视觉。
- **验收**：几何单测绿；组件用 `fillWidth`/`thumbLeft` px 绑定。

---

# ✅ 已完成：发版 0.3.58

- **实现**：bump 0.3.58，Mac 打包，更新 `007` / `latest.json` / Plan / `todo.md`。
- **验收**：锁定业务语义未改；安装包可发。
