# SD SMA Data Collector 变更索引

## 2026-07-20

- **早期 Win10 覆盖保存兼容修复**：备份配置改为仅复制 JSON 内容，避免 `copy2()` 元数据系统调用触发 WinError 127；完整测试 `170 passed`。详见 [docs/004-✅](docs/004-✅-配置覆盖保存兼容早期Win10.md)。
