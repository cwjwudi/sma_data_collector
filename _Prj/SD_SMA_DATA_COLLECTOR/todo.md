# SD SMA Data Collector 变更索引

## 2026-07-21

- **time_and_variable 的 variable 快照点位替换**：新增 `variable_point_overrides`，time 仍读实时点、variable 按字段读 PLC 快照点且保持原数据库列名；完整回归 `180 passed`，真实 PLC/MySQL 持续 `3612.079s`，提交 `3972` 条且错误/残留为 `0`。详见 [docs/005-✅-variable触发快照点位替换.md](docs/005-✅-variable触发快照点位替换.md)。

## 2026-07-20

- **早期 Win10 覆盖保存兼容修复**：备份配置改为仅复制 JSON 内容，避免 `copy2()` 元数据系统调用触发 WinError 127；完整测试 `170 passed`。详见 [docs/004-✅](docs/004-✅-配置覆盖保存兼容早期Win10.md)。
