# ReportEditor 数据源滑动锁与工作台空白

> 产品发版计划见 [`_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.57.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.57.md)（**0.3.57**）。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。

---

# ✅ 已完成：修复数据源滑动锁 UI

- **实现**：`DatasourceLockToggle.vue` — 固定 88×32 轨道、`appearance: none`、拇指 `translateX(px)` + SVG 锁标；Enter/Space 可切换。
- **验收**：轨道不再呈巨大白块；静置态接近设置页开关观感。
- **证据**：前端 vitest 248 passed；发版包 0.3.57。

---

# ✅ 已完成：修复数据库工作台主区空白

- **根因**：全高页在 keep-alive 下高度链断裂时，`.main` 的 `flex:1; min-height:0` 被压成 0，只剩「+ 新建」。
- **实现**：`MainLayout` 用 `.content-scroll .page-fill-height` 后代选择器；`DataSourceConfig` / `DatabaseWorkbench` 为 stage/body/main 增加 `min-height` 兜底；`connectionsLoading` 暴露值正确解包。
- **验收**：无连接时可见「+ 新建」与「数据库连接」占位面板。

---

# ✅ 已完成：回归锁定语义与发版 0.3.57

- **实现**：bump 0.3.57，Mac 打包，更新 `007_版本发布记录.md` / `latest.json` / Plan / `todo.md`。
- **验收**：锁定业务语义未改；安装包可发。
