# ✅ OPC UA 动态采集间隔联调

目标：让 `trigger=time` 和 `trigger=time_and_variable` 数据组从 OPC UA 点位读取采集间隔，并在测试 PLC `192.168.50.233` 完成动态修改、非法值容错及外部触发联调。

## ✅ 配置模型与运行时调度

- 新增 `groups[].interval_point`，引用 `points[].name`，点位数值单位为秒。
- `interval_seconds` 保留为静态默认值；首次读取失败时使用该值，运行中读取失败或值非法时保留最后一个有效值。
- 动态值必须是大于零的有限数值，不接受布尔值、字符串、零、负数、NaN 或无穷大。
- 适用模式限定为 `time` 和 `time_and_variable`；配置加载时校验点位引用及模式。
- 间隔变化后以检测时刻重新锚定节拍，不追补旧周期；`time_and_variable` 的变量轮询及上升沿立即采集保持独立。
- Web 配置页面增加动态间隔点位选择器。

实际配置文件 `config/collector/AA_SMA_DATA_TEST.json`：

- 新增点位 `ProductCollectionInterval`，NodeId 为 `ns=6;s=::ParallelTe:rCollectorIntervalSeconds`。
- `Data_Product` 增加 `"interval_point": "ProductCollectionInterval"`，静态回退值保持 `5` 秒。

PLC 工程新增 `ParallelTe:rCollectorIntervalSeconds : REAL := 5.0`，并加入 cp1586 OPC UA 映射。

## ✅ 自动化测试

- 新增动态间隔配置、调度重锚、非法值保留及混合触发独立性测试。
- 定向测试：`16 passed`。
- 完整采集器回归：`146 passed, 4 warnings`；4 条均为既有弃用/测试返回值警告。
- Automation Studio 4.12.6.106 构建：`0 errors, 6 warnings`；新增变量的“已声明但未在 PLC 逻辑中使用”告警符合其作为 OPC UA 配置入口的用途，其余为既有告警。

## ✅ 192.168.50.233 实机联调

目标身份与安全门：

- CPU：`X20CP1586`
- Automation Runtime：`J4.93`
- 角色：`dedicated_test_plc`
- 环境预检：`7/7 checks passed`
- 下载前项目/配置/CPU/AR/包检查均通过；RUC 下载成功。
- 下载后 OPC UA 读回：动态间隔 `5.0`、外部触发 `false`。

真实采集窗口使用 `tools/dynamic_interval_live_test.py`，仅启动 `Data_Product`，不初始化或写入数据库：

1. 初始 5 秒阶段的定时事件为 `0.031, 4.828, 9.812, 14.828s`，相邻稳定周期约 5 秒。
2. PVI 将间隔从 `5.0` 改为 `2.0` 并读回成功；采集器检测变化后重新锚定，后续定时事件为 `17.922, 19.843, 21.843, 23.843, 25.843, 27.843, 29.828...s`，相邻周期约 2 秒。
3. 外部触发产生独立 `trigger_type=variable` 事件，且采集器成功将布尔触发复位；定时事件未被取消。
4. 专用非法值窗口先以 2 秒运行，再将点位写为 `0.0`。运行日志记录“返回无效值 0.0，继续使用 2s”，指标为 `dynamic_interval_invalid=1`，事件序列继续保持约 2 秒。

原始证据：

- `docs/dynamic_interval_live_evidence.json`：15 个采集事件，`dynamic_interval_changed=1`。
- `docs/dynamic_interval_invalid_value_evidence.json`：9 个采集事件，`dynamic_interval_changed=1`、`dynamic_interval_invalid=1`。
- 工具链审计与 PVI 写入记录位于 `C:\Users\BR\codex_ws\br_device_autodev\var\audit\2026-07-14`。

联调结束后已恢复并读回：

- `ParallelTe:rCollectorIntervalSeconds = 5.0`
- `gDataSQLOperate.ProductInsert = false`
- PLC 状态：`WarmStart`

## ✅ 验收结论

配置、代码、Web 配置界面、PLC 点位与 OPC UA 映射均已完成。真实 PLC 验证了 5 秒到 2 秒的在线切换、非法值保留最后有效节拍，以及时间与外部触发并行工作，满足本任务验收条件。
