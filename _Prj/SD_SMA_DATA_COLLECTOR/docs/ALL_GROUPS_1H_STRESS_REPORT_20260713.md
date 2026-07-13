# 全配置数据组一小时实机压力测试报告

## 测试范围

- 分支：`fix/collector-parallel-deque`
- 配置：仓库顶层 `config/collector/AA_SMA_DATA_TEST.json`
- PLC：`192.168.50.233`
- 数据库：配置指定的 MySQL 测试库
- 正式持续时间：3662.451 秒（61 分 2.451 秒）
- 未执行 Automation Studio 构建或 PLC 下载。

全部配置数据组均参与测试：

- `Data_Recipe`
- `Data_Product`
- `Data_Alarm`
- `Data_Audit`
- `Data_Batch`
- `Data_BatchInfo`

## 测试方法

四个单点组通过各自配置的 OPC UA Trigger 施压，使用 PLC 当前业务数据：

- Product 每个压力周期触发。
- Recipe 每 2 个周期触发。
- BatchInfo 每 5 个周期触发。
- Batch 每 20 个周期触发，覆盖现有 `batch_upsert` 和唯一键冲突策略。

两个并行组每周期分别执行：

1. 10 个数组索引正常置位并等待采集器确认复位。
2. 在复位确认窗口内立即重新置位同一批索引，验证新事件不会被二次清零吞掉。

测试持续记录回调行数、MySQL 表行数、触发确认、队列、重试、dead-letter、提交结果及停机刷新结果。

## 正式结果

| 数据组 | 回调行数 | MySQL 行数增量 | 差额 | 触发确认 |
| --- | ---: | ---: | ---: | ---: |
| Data_Recipe | 839 | 839 | 0 | 839 |
| Data_Product | 1691 | 1691 | 0 | 1678（另有 PLC 自发事件） |
| Data_Alarm | 33560 | 33560 | 0 | 1678 正常轮 + 1678 快速轮 |
| Data_Audit | 33560 | 33560 | 0 | 1678 正常轮 + 1678 快速轮 |
| Data_Batch | 83 | 0 新增行 | 83 次按唯一键策略处理 | 83 |
| Data_BatchInfo | 335 | 335 | 0 | 335 |

`Data_Batch` 使用 `BatchCode` 唯一键和 `batch_upsert`。本轮业务数据对应已有批次，因此 83 次均进入配置规定的唯一键冲突/拒绝分支，没有插入重复批次行；这不属于数据丢失。

## 守恒与可靠性指标

- 成功提交：69985 行。
- Batch 唯一键冲突：83 行。
- DB 失败：0。
- retry queue：0。
- dead-letter：0。
- 并行边沿索引：67120。
- 并行完整行接受：67120。
- 并行拒绝：0。
- 复位确认窗口内立即重触发：31000，全部留待下一轮采集。
- 并行确认复位：67120。
- 触发复位超时：0。
- 停机刷新：84 行。
- 停机剩余：0。
- 运行期间 ERROR 日志：0。
- 测试驱动错误：0。

五个直接插入数据组满足：

```text
回调行数 = MySQL 行数增量
```

所有存储结果满足：

```text
回调总数 = 成功提交 + 明确唯一键冲突
          = 69985 + 83
          = 70068
```

## 测试结束状态

独立 OPC UA 读取确认：

- Recipe Trigger：False
- Product Trigger：False
- Alarm 100 元素 Trigger 数组：True 数量 0
- Audit 100 元素 Trigger 数组：True 数量 0
- Batch Trigger：False
- BatchInfo Trigger：False

采集器已正常停止，普通队列、retry queue、dead-letter 和 inflight 均为 0。

## 自动测试

实机压力测试结束后重新执行全量测试：`88 passed`。存在 3 个既有 `test_datatype.py` 返回值风格警告，不影响测试通过。

## 结论

修复分支在一小时全组压力下没有复现“触发已复位但有效数据未写入”的缺陷。正常批量等待期间，回调与数据库之间的差额始终与 deque 队列大小一致；安全停机后差额归零。当前剩余风险仍是内存 deque 无法抵抗断电或进程强制终止，留待后续 SQLite/持久化 outbox 特性解决。
