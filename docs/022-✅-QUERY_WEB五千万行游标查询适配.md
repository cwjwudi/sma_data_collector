# ✅ 已完成：通用查询改为索引优先的游标分页

`SD_SMA_DATA_COLLECTOR_QUERY_WEB` 的通用查询页已改为每次读取 `page_size + 1` 行，不再强制执行 `COUNT(*)`，并使用 `sort_by + id` 游标继续翻页。旧插件和 OPC UA 页码链路继续保留 OFFSET/总数行为，避免破坏既有协议。

实现包含 Data_Batch 批次下拉、按时间/按批次号互斥模式、Group 级 `batch_field` 明确绑定、前后页游标栈及稳定双字段排序。批次模式不传时间，时间模式不传 BatchCode，服务端对混合或缺失条件返回 400。

# ✅ 已完成：5000 万行真实数据库验收

已使用 `sma_data_stress_test.Data_Product` 精确 50,000,000 行验证：最新第二页 5.458 ms、BatchCode 4.344～5.279 ms、时间 5.112 ms、AND 4.465 ms、OR 110.616 ms；连续两页各 50 行且 ID 无重复。执行计划分别命中时间索引、联合索引与 `index_merge`。

完整报告见 [`_Prj/SD_SMA_DATA_COLLECTOR_QUERY_WEB/docs/2026-07-15-CURSOR_PAGINATION_50M_REPORT.md`](../_Prj/SD_SMA_DATA_COLLECTOR_QUERY_WEB/docs/2026-07-15-CURSOR_PAGINATION_50M_REPORT.md)，原始 JSON 记录保存在同目录。

# ✅ 已完成：兼容性与自动化测试

QUERY_WEB 非集成测试 79 passed、8 deselected；新增测试覆盖 Data_Batch 字典读取、Group 批次字段持久化、互斥条件校验、连续游标翻页。前端脚本通过 `node --check`，浏览器实测两种模式的清空/禁用行为及各50行结果。

# ✅ 已完成：Data_Batch 小表与生产约束

压力测试库已创建只有 `BatchCode VARCHAR(255) NOT NULL` 的 `Data_Batch`，未创建索引；从 Data_Product 写入1000个不同批次号。建表脚本、操作记录和实库结果保存在 [`_Doc/007_Data_Product_5000万行压力测试`](../_Doc/007_Data_Product_5000万行压力测试/)。
