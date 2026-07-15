# QUERY_WEB 5000 万行游标分页验证

## 实现范围

- `/api/history/by-view` 默认采用游标分页，普通查询不执行 `COUNT(*)`。
- 每页请求 50 条时数据库读取 51 条，第 51 条仅用于计算 `has_more`。
- 下一页以 `sort_by + id` 作为稳定游标，不再使用深 `OFFSET`。
- 支持 BatchCode、时间、BatchCode AND 时间、BatchCode OR 时间。
- 未设置时间和批次时按时间索引直接返回最新 50 条，不再强制补最近 24 小时。
- 插件和 OPC UA 页码链路继续使用原 OFFSET/总数模式。

## 真实数据库

- MariaDB 10.11.11
- `sma_data_stress_test.Data_Product`
- 精确 50,000,000 行
- 索引：`collection_time` 单列索引、`(BatchCode, collection_time)` 联合索引、`id` 主键

## 结果

| 场景 | 返回行数 | 耗时 |
| --- | ---: | ---: |
| 最新第一页（含首次连接准备） | 50 | 35.752 ms |
| 最新第二页 | 50 | 5.458 ms |
| BatchCode 第一页 | 50 | 4.344 ms |
| BatchCode 第二页 | 50 | 5.279 ms |
| 时间单条件 | 50 | 5.112 ms |
| BatchCode AND 时间 | 50 | 4.465 ms |
| BatchCode OR 时间 | 50 | 110.616 ms |

第一页与第二页 ID 集合无重复。完整参数、检查结果和 `EXPLAIN FORMAT=JSON` 保存在 `CURSOR_PAGINATION_50M_RESULT.json`。

## 执行计划

- 最新数据：`idx_Data_Product_collection_time`，估算读取 51 行。
- BatchCode：`idx_Data_Product_BatchCode_collection_time`，`ref`。
- 时间范围：`idx_Data_Product_collection_time`，`range`。
- BatchCode AND 时间：联合索引，`range`。
- BatchCode OR 时间：`index_merge`；虽然显著快于原全表扫描，但仍慢于 AND 查询。

## 门禁

- QUERY_WEB 非集成测试：73 passed，8 deselected。
- 新增数据库测试明确断言游标模式不执行 `COUNT(*)`。
- `query.js` 通过 `node --check`。
