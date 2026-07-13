# ReportEditor 数据源滑动锁与工作台空白

> 产品发版计划见 [`_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.57.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.57.md)（目标版本 **0.3.57**）。  
> 本文件为 **任务看板**（H1 子任务状态）；规则见 [CLAUDE.md](../CLAUDE.md)。

---

# ⌛️ 未完成：修复数据源滑动锁 UI

- **目标**：右上角「可编辑 / 已锁定」轨道恢复正常胶囊开关，无巨大白块。
- **范围**：`DatasourceLockToggle.vue`（钉死轨道几何、`appearance: none`、拇指改 transform/SVG、去 Emoji）。
- **验收**：Mac 目视轨道尺寸正常；文案与 `aria-checked` 一致；可滑动 + 键盘切换。
- **详细计划 / 规则 R1–R3**：见版本 Plan `0.3.57.md`。

---

# ⌛️ 未完成：修复数据库工作台主区空白

- **目标**：进入「数据库工作台」后始终可见工作台骨架（「+ 新建」、连接面板或占位），不得长时间纯空白。
- **范围**：`DataSourceConfig.vue` 异步挂载/遮罩、`DatabaseWorkbench.vue` / `ConnectionManager.vue` 高度链与空态、必要时异步 `errorComponent`。
- **验收**：冷启动 / keep-alive 再进 / DB↔OPC 切换均能看到配置区；无连接时有占位指引。
- **详细计划 / 规则 R4–R6**：见版本 Plan `0.3.57.md`。

---

# ⌛️ 未完成：回归锁定语义与发版 0.3.57

- **目标**：锁业务语义不变；bump 0.3.57、打 Mac 包、补 `latest.json`、写 `007_版本发布记录.md`。
- **验收**：锁定后不可新建/保存改连接；解锁可编辑；OPC Tab 锁状态一致；安装包可安装目视通过。
- **证据**：发版后回填本 H1 与版本 Plan 状态。
