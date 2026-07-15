# ✅ 已完成：通用查询改为索引优先的游标分页

`SD_SMA_DATA_COLLECTOR_QUERY_WEB` 的通用查询页已改为每次读取 `page_size + 1` 行，不再强制执行 `COUNT(*)`，并使用 `sort_by + id` 游标继续翻页。旧插件和 OPC UA 页码链路继续保留 OFFSET/总数行为，避免破坏既有协议。

实现包含 BatchCode 输入、AND/OR 选择、批次字段配置/自动识别、无时间条件时按索引返回最新数据、前后页游标栈及稳定双字段排序。

# ✅ 已完成：5000 万行真实数据库验收

已使用 `sma_data_stress_test.Data_Product` 精确 50,000,000 行验证：最新第二页 5.458 ms、BatchCode 4.344～5.279 ms、时间 5.112 ms、AND 4.465 ms、OR 110.616 ms；连续两页各 50 行且 ID 无重复。执行计划分别命中时间索引、联合索引与 `index_merge`。

完整报告见 [`_Prj/SD_SMA_DATA_COLLECTOR_QUERY_WEB/docs/2026-07-15-CURSOR_PAGINATION_50M_REPORT.md`](../_Prj/SD_SMA_DATA_COLLECTOR_QUERY_WEB/docs/2026-07-15-CURSOR_PAGINATION_50M_REPORT.md)，原始 JSON 记录保存在同目录。

# ✅ 已完成：兼容性与自动化测试

QUERY_WEB 非集成测试 73 passed、8 deselected；新增测试覆盖无 COUNT、BatchCode 单条件、无时间最新数据、AND/OR 分组、连续游标翻页和 API 不补 24 小时范围。前端脚本通过 `node --check`。
