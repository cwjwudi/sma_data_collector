# Query Web CPU 优化实施记录

## 实施内容

- 活动配置增加文件版本缓存，高级 OPC UA 绑定只在配置变化时重新编译。
- OPC UA 控制节点改为去重批量读取，心跳节点类型按连接缓存，并修复跨事件循环复用失效连接的问题。
- PLC 控制位必须被实际读取为 False 后才重新布防，避免持续 True 形成查询触发风暴。
- 运行状态接口支持 `since_revision` 轻量响应；高级查询页改为 1 秒串行轮询，并在页面隐藏时暂停。
- 全量快照数据库读取移入工作线程，同一插件的并发请求合并为一个任务，保留 100,000 行上限和原有分页行为。

## 性能验收

测试环境为同一 Windows 设备、同一交付配置和同一个可写 OPC UA Mock。优化前后分别连续采样 60 秒完整进程树：

| 版本 | 单核 CPU 平均占用 | 平均 RSS | 最大 RSS |
| --- | ---: | ---: | ---: |
| 优化前 | 3.600% | 89.02 MB | 89.04 MB |
| 优化后 | 0.849% | 87.94 MB | 87.96 MB |

CPU 降幅为 76.42%，满足“至少降低 60% 且稳态不高于 1.5%”的目标。配置处理微基准从每轮 15.273ms 降至 0.430ms，降幅 97.19%。

## 接口兼容

- `GET /api/plugins/runtime-state/{plugin_key}` 不传参数时继续返回完整状态，并新增 `changed=true`。
- 传入 `since_revision=<revision>` 且版本未变化时，仅返回 `plugin_key`、`revision` 和 `changed=false`。
- 配置文件结构、OPC UA 节点配置、查询结果和快照上限均未改变。

## 验收证据

- 非集成测试：112 passed，9 deselected。
- OPC UA Mock 集成测试：9 passed，112 deselected。
- Python 编译及 `specialized_query.js` 语法检查通过。
