# ✅ 已完成：variable 触发快照点位替换

目标：为 `time_and_variable` 数据组增加按逻辑字段配置的 variable 快照源替换；time 记录仍读实时点，variable 记录从 PLC 快照点读取，两者写入相同数据库列。

实现结果：

- 新增 `groups[].variable_point_overrides`，映射“逻辑字段 -> variable 快照点”。未配置时行为与旧版完全一致。
- time 读取 `data_points` 实时路径；variable 仅替换已配置字段的 OPC UA 路径，输出键和数据库列名仍为原逻辑名。
- 加载器校验适用模式、映射对象类型、本组逻辑点、全局源点与显式 `datatype` 兼容性。
- Web 配置界面可编辑快照映射，切换离开 `time_and_variable` 或移除逻辑点时自动清理无效映射。
- 基于 `C:\Users\BR\codex_ws\p000_sd_sma_scada\config\collector\AA_test.json` 的 PLC/MySQL 地址生成 `config/variable_snapshot_1h_test.json`；口令留空，运行时通过 `SD_SMA_DB_PASSWORD` 注入。

验证证据：

- 针对性测试：`10 passed`，覆盖加载、Web 校验、向后兼容、非法映射及 time/variable 分源读取。
- 完整回归：`180 passed, 4 warnings`；4 条均为既有 FastAPI/pytest 弃用或返回值警告。
- JavaScript 语法：`node --check web_config/static/config.js` 通过。
- 35 秒真实冒烟测试：time `38`、variable `4`、MySQL 提交 `42`、错误 `0`、停机残留 `0`；证据见 `variable_snapshot_smoke_evidence.json`。
- 1 小时真实持续测试：2026-07-21 00:44:02 至 01:44:15，请求 `3610s`，实际 `3612.079s`。time `3612`、variable `360`；触发写入 `360/360` 成功；variable 全部为快照字符串 `SMA Tablet`，time 无快照串串入；MySQL 提交 `3972`，失败、dead-letter 和停机残留均为 `0`。证据见 `variable_snapshot_1h_evidence.json`。

运行约束：PLC 侧仍应先写完快照再置 Trigger，并在 Trigger 被采集器复位前保持快照不变。本功能解决实时源与事件快照源串读，不额外提供数据库事务 ACK。
