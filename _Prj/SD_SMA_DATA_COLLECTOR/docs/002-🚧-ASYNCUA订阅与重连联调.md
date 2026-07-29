# 🚧 进行中：迁移 asyncua 异步通信

目标是将采集器从已废弃的同步 `python-opcua` 迁移至 `asyncua`，去除
`asyncio.to_thread()` 和同步调用超时后残留工作线程的问题，同时保持现有批量读写、
心跳、插入反馈和触发复位行为。

验收标准：

- 同一连接支持异步批量读写和受控并发。
- 连接生命周期具有明确状态，断线后单通道重连，成功后恢复注册的订阅。
- 快速测试在无 PLC/数据库环境下可重复通过。

# 🚧 进行中：触发点订阅与配置兼容

变量触发组新增 `trigger_mode`：

- `poll`：兼容现有配置，按 `trigger_interval_seconds` 轮询。
- `subscription`：使用 OPC UA DataChange Subscription，重连后自动重建。

Web 配置页把“触发间隔”改为下拉框，提供 1–10 秒及“订阅”选项。配置加载器继续
接受历史上的任意正数间隔，避免旧配置无法启动。

# ⌛️ 未完成：真实 PLC、数据库与一小时连续测试

使用 `C:\Users\BR\codex_ws\p000_sd_sma_scada\config\collector\AA_test.json` 派生运行参数，
对配置中的 PLC 和数据库执行读写、触发、复位、断线重连、订阅恢复和至少一小时连续
运行测试。测试不得改写或提交含现场口令的原始配置，证据写入本目录。
