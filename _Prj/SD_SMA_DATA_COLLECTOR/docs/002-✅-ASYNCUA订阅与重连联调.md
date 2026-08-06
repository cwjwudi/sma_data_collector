# ✅ asyncua、触发订阅与完整重连状态机

## 实现结果

- OPC UA 客户端从同步 `python-opcua` 迁移为原生异步 `asyncua`。
- 批量读取、逐点回退、心跳、插入反馈、标量/数组触发复位均使用异步 OPC UA 调用。
- 连接状态明确区分 `disconnected`、`connecting`、`connected`、`reconnecting`、
  `stopping`；同一端点仅运行一个重连任务，采用有上限的指数退避。
- 读写请求具有超时和并发上限；连接错误会废弃故障会话并唤醒重连状态机。
- 已登记的 OPC UA DataChange Subscription 在重连后自动重建。
- `variable`、`time_and_variable` 和并行布尔数组触发均支持
  `trigger_mode: subscription`；`poll` 模式继续兼容旧配置。
- Web 配置页提供“订阅（推荐）”和 1–10 秒轮询下拉选项。
- Web OPC UA 浏览器同步迁移为异步接口。

## 自动化与冒烟验证

- 完整快速测试：`211 passed`。
- Python 编译、JavaScript 语法检查通过。
- asyncua/订阅/写入定向测试：`13 passed`。
- 15 秒真实 PLC/MySQL 冒烟：通过；证据见
  `asyncua_subscription_smoke_evidence.json`。
- 25 秒主动断线恢复冒烟：通过；恢复耗时约 `0.109 s`，订阅句柄
  `6 → 6`；证据见 `asyncua_subscription_reconnect_smoke_evidence.json`。
- Web OPC UA 浏览实机验证：连接、根节点浏览、节点元数据读取和断开均成功。

## 一小时真实 PLC/MySQL 连续测试

测试配置：
`C:\Users\BR\codex_ws\p000_sd_sma_scada\config\collector\AA_test.json`。
测试程序仅在原配置目录创建临时派生配置以启用订阅，结束时自动删除；原始配置及其中
的数据库口令未被修改或提交。

执行时间：2026-07-29 11:42:56 至 12:44:02（Asia/Shanghai）。

- 请求时长：`3665 s`
- 实际时长：`3665.188 s`
- 订阅事件：`21072`
- 数据库成功提交：`20015` 行
- 数据库失败/死信/停机剩余：`0 / 0 / 0`
- 并行触发边沿/接受行/确认复位：`11708 / 11708 / 11708`
- 并行拒绝行：`0`
- 两次主动断线恢复：
  - 第 900 秒：`0.094 s`，订阅句柄 `6 → 6`
  - 第 2400 秒：`0.110 s`，订阅句柄 `6 → 6`
- 结束前连接状态：`PLC_TPS = connected`
- 六个采集组的触发确认数全部等于尝试数。
- 所有六张目标表均有正向行数增量。

完整机器可读证据见 `asyncua_subscription_1h_evidence.json`，结果
`passed: true`。

正常停机删除服务端订阅时，B&R 服务器返回过一次 `BadNoSubscription` 警告；客户端
已完成断开，最终状态和数据指标不受影响。
