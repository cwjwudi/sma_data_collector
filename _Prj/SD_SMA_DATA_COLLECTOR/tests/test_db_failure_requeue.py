"""
DB 故障时数据不丢失（回队重试）与队列上限保护测试

Bug 背景：存储循环把批次从内存 data_queue 取出后，若 DB 插入失败，
批量路径（execute_insert_many 返回 -1）与逐条路径（execute_insert 返回 False）
都只计数不回队，导致 DB 故障期间数据被静默丢弃。
"""

import unittest
from datetime import datetime
from unittest.mock import Mock

from database.data_storage import DataStorageProcessor


def sensor_item(value, collection_time=None):
    return {
        "group_name": "SensorData",
        "collection_time": collection_time or datetime.now(),
        "data": {
            "value": {"value": value},
        },
    }


def make_plain_processor(batch_size=3, **kwargs):
    """构造一个不启用 batch_master 的普通年份分表组处理器"""
    db_manager = Mock()

    def resolve_table_name(group_name=None, partition_time=None, fixed_table=False, partition_interval_years=1):
        if fixed_table or int(partition_interval_years or 0) == 0:
            return group_name
        interval = max(1, int(partition_interval_years or 1))
        year = partition_time.year
        suffix_year = year - ((year - 1) % interval)
        return f"{group_name}_y{suffix_year:04d}_span{interval}"

    db_manager.get_current_table_name.side_effect = resolve_table_name
    db_manager.create_data_table.return_value = True
    db_manager.execute_insert.return_value = True
    db_manager.execute_insert_many.side_effect = lambda _table, rows: len(rows)
    db_manager.record_exists.return_value = False
    db_manager.execute_update.return_value = 1
    db_manager.execute_query.return_value = []

    processor = DataStorageProcessor(db_manager, batch_size=batch_size, **kwargs)
    processor.group_data_points["SensorData"] = ["value"]
    processor.group_partition_interval_years["SensorData"] = 1
    processor.group_batch_sizes["SensorData"] = batch_size
    return processor, db_manager


class TestDbFailureRequeue(unittest.IsolatedAsyncioTestCase):
    """DB 插入失败时的回队重试行为"""

    async def test_bulk_insert_failure_requeues_batch_at_head(self):
        """批量路径：execute_insert_many 返回 -1 时整批数据应回队头并保持时序"""
        processor, db_manager = make_plain_processor(batch_size=3)
        processor.initialize_tables_for_runtime()
        db_manager.execute_insert_many.side_effect = lambda _table, rows: -1

        for value in range(3):
            processor.add_data(sensor_item(value))
        await processor._process_data_by_groups()

        self.assertEqual(processor.get_queue_size(), 3, "DB 插入失败的批次不应被静默丢弃")
        queued_values = [item["data"]["value"]["value"] for item in processor.data_queue]
        self.assertEqual(queued_values, [0, 1, 2], "回队数据应放回队头并保持原始时序")

    async def test_requeued_batch_retries_and_inserts_next_round(self):
        """回队数据在 DB 恢复后应于下一轮按原顺序重试写入"""
        processor, db_manager = make_plain_processor(batch_size=3)
        processor.initialize_tables_for_runtime()
        db_manager.execute_insert_many.side_effect = lambda _table, rows: -1

        for value in range(3):
            processor.add_data(sensor_item(value))
        await processor._process_data_by_groups()

        inserted_rows = []

        def succeed(_table, rows):
            inserted_rows.extend(rows)
            return len(rows)

        db_manager.execute_insert_many.side_effect = succeed
        await processor._process_data_by_groups()

        self.assertEqual(
            [row["value"] for row in inserted_rows],
            [0, 1, 2],
            "DB 恢复后应把失败批次按原顺序重试写入",
        )
        self.assertEqual(processor.get_queue_size(), 0)

    async def test_row_insert_failure_requeues_item(self):
        """逐条路径（唯一键组）：execute_insert 返回 False 时数据应回队"""
        processor, db_manager = make_plain_processor(batch_size=1)
        processor.group_unique_key_points["SensorData"] = "value"
        processor.initialize_tables_for_runtime()
        db_manager.execute_insert.return_value = False

        processor.add_data(sensor_item(7))
        await processor._process_data_by_groups()

        self.assertEqual(processor.get_queue_size(), 1, "逐条插入失败的数据不应被静默丢弃")
        self.assertEqual(processor.data_queue[0]["data"]["value"]["value"], 7)

    async def test_unique_check_db_error_requeues_item(self):
        """逐条路径：唯一性校验查询因 DB 故障抛异常时数据应回队"""
        processor, db_manager = make_plain_processor(batch_size=1)
        processor.group_unique_key_points["SensorData"] = "value"
        processor.initialize_tables_for_runtime()
        db_manager.record_exists.side_effect = Exception("db connection lost")

        processor.add_data(sensor_item(8))
        await processor._process_data_by_groups()

        self.assertEqual(processor.get_queue_size(), 1, "唯一性校验 DB 故障的数据不应被静默丢弃")
        self.assertEqual(processor.data_queue[0]["data"]["value"]["value"], 8)


class TestQueueSizeLimit(unittest.IsolatedAsyncioTestCase):
    """队列上限保护：防止 DB 长期宕机时回队重试导致内存无限膨胀"""

    def test_max_queue_size_has_reasonable_default(self):
        processor, _ = make_plain_processor()
        self.assertEqual(getattr(processor, "max_queue_size", None), 100000)

    def test_max_queue_size_configurable_via_constructor(self):
        processor, _ = make_plain_processor(max_queue_size=500)
        self.assertEqual(processor.max_queue_size, 500)

    def test_queue_overflow_drops_oldest(self):
        processor, _ = make_plain_processor(batch_size=100)
        processor.max_queue_size = 5

        for value in range(8):
            processor.add_data(sensor_item(value))

        self.assertEqual(processor.get_queue_size(), 5, "队列超限时应丢弃最旧数据并保持上限")
        queued_values = [item["data"]["value"]["value"] for item in processor.data_queue]
        self.assertEqual(queued_values, [3, 4, 5, 6, 7], "超限时应丢弃最旧数据保留最新数据")

    def test_queue_overflow_logs_with_throttle(self):
        processor, _ = make_plain_processor(batch_size=100)
        processor.max_queue_size = 2
        processor.add_data(sensor_item(0))
        processor.add_data(sensor_item(1))

        # 首次超限丢弃必须告警（不能静默）
        with self.assertLogs("database.data_storage", level="WARNING") as captured:
            processor.add_data(sensor_item(2))
        self.assertTrue(
            any("丢弃" in message for message in captured.output),
            f"丢弃数据必须打印告警日志: {captured.output}",
        )

        # 节流窗口内继续丢弃不再重复刷日志
        with self.assertNoLogs("database.data_storage", level="WARNING"):
            processor.add_data(sensor_item(3))

        # 模拟节流窗口过期后再次丢弃，应再次告警并带累计计数
        processor._last_drop_log_ts = 0.0
        with self.assertLogs("database.data_storage", level="WARNING") as captured_again:
            processor.add_data(sensor_item(4))
        self.assertTrue(any("累计" in message for message in captured_again.output))
        self.assertEqual(processor.dropped_records_total, 3)


if __name__ == "__main__":
    unittest.main()
