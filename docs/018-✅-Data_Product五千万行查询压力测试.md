# ✅ 已完成：创建独立的 Data_Product 五千万行测试表

源库 `sma_data_test1` 保持只读；已在 `sma_data_stress_test.Data_Product` 生成并精确核验 50,000,000 行。字段定义和源表原始索引均保留，生成过程按 100,000 行事务可审计、可断点续跑。

测试方案、脚本、逐批日志和详细结果统一维护在 [`_Doc/007_Data_Product_5000万行压力测试`](../_Doc/007_Data_Product_5000万行压力测试/)；目录和仓库内均未保存连接密码。

# ✅ 已完成：BatchCode 与 collection_time 索引基线及优化对比

在原始索引基线下完成 5 类查询测试，随后增加 `collection_time` 单列索引和 `(BatchCode, collection_time)` 联合索引，并以相同参数复测。时间一天范围由约 23.5 秒降至 11.9 毫秒，联合 AND 降至 0.93 毫秒，OR 由约 29.6 秒降至 102.7 毫秒；最终 `CHECK TABLE QUICK` 状态为 OK。

本轮完成的是 50M 数据构建与单连接索引 A/B；并发阶梯容量测试不在本轮范围。
