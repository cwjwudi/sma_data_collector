# SQLite outbox 定期清理实机验证报告

## 测试范围

- 日期：2026-07-17
- PLC：`192.168.50.233:4840`
- 目标数据库：`192.168.50.22 / sma_data_test1`
- 原始配置：仓库顶层 `config/collector/AA_SMA_DATA_TEST.json`，测试过程只读
- 测试产物：仅写入采集器自身的 `runtime/queue`
- PLC 程序：未构建、未下载、未修改

测试从原始配置派生临时运行配置，使用独立的 `live_cleanup_test_outbox.db`，并设置 `completed_retention_days=0`、`cleanup_interval_seconds=2`，以在 30 秒实机采集窗口内验证运行期清理。派生配置在测试后删除，避免复制保存数据库口令。

## PLC 与数据库结果

六个数据组各主动触发 8 次，全部完成 PLC 确认复位。Alarm/Audit 仅使用数组索引 70–71；测试结束后全部触发点读回为 `false`，脚本错误为 0。

| 指标 | 结果 |
|---|---:|
| 实际采集回调 | 291 |
| outbox 接收 | 291 |
| outbox 完成 | 291 |
| MySQL 提交 | 284 |
| 明确业务唯一冲突 | 7 |
| 数据库失败 | 0 |
| dead-letter | 0 |
| 停机残留 | 0 |

`284 + 7 = 291`，与 outbox 接收和完成数量一致。

## 定期清理结果

| 指标 | 结果 |
|---|---:|
| 维护执行次数 | 17 |
| 清理 completed 行数 | 291 |
| 最终 pending / processing / retry / dead-letter / completed | 全部 0 |
| SQLite schema | v2 |
| `(status, completed_at)` 清理索引 | 存在 |
| 测试 outbox 主文件 | 352,256 bytes |

测试结束后又以 SQLite 只读连接独立断言：`outbox_records` 表为空、schema v2、清理索引存在。结果证明运行期间定期清理已真实执行，而不是只依赖正常停机清理。

## 测试命令

```powershell
uv run python tools/persistent_outbox_live_stress.py runtime/queue/live_cleanup_test_config.json `
  --duration 30 --interval 0.5 --parallel-width 2 --parallel-start-index 70 `
  --report runtime/queue/live_cleanup_test_report.json
```

原始 JSON 报告保存在 `runtime/queue/live_cleanup_test_report.json`，独立测试 SQLite 保存在 `runtime/queue/live_cleanup_test_outbox.db`；二者均位于采集器目录内且不纳入 Git。

## 结论

实机测试通过。真实 PLC 触发、SQLite 持久化、实际 MySQL 写入及运行期定期清理形成完整闭环；本轮没有修改采集器目录之外的最终文件内容。
