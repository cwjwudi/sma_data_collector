"""
存储循环同步 DB 写入不阻塞事件循环测试

Bug 背景：异步存储循环里直接同步调用 db_manager.execute_insert*，
DB 慢时阻塞整个事件循环（同循环上还有 OPC UA 采集、心跳、uvicorn Web）。
修复后：同步 DB 调用包进 asyncio.to_thread，写入进行中事件循环仍可调度其他协程。
"""

import asyncio
import time
import unittest
from datetime import datetime
from unittest.mock import Mock

from database.data_storage import DataStorageProcessor

SLOW_DB_SECONDS = 0.3
TICK_INTERVAL_SECONDS = 0.02


def sensor_item(value, collection_time=None):
    return {
        "group_name": "SensorData",
        "collection_time": collection_time or datetime.now(),
        "data": {
            "value": {"value": value},
        },
    }


def make_plain_processor(batch_size=1):
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

    processor = DataStorageProcessor(db_manager, batch_size=batch_size)
    processor.group_data_points["SensorData"] = ["value"]
    processor.group_partition_interval_years["SensorData"] = 1
    processor.group_batch_sizes["SensorData"] = batch_size
    return processor, db_manager


class TestStorageNonblockingDb(unittest.IsolatedAsyncioTestCase):
    """DB 写入进行中，事件循环应仍能调度其他协程"""

    async def _count_ticks_during(self, coro):
        """运行 coro，同时统计事件循环还能调度多少次并发计数器"""
        ticks = 0

        async def ticker():
            nonlocal ticks
            while True:
                await asyncio.sleep(TICK_INTERVAL_SECONDS)
                ticks += 1

        ticker_task = asyncio.create_task(ticker())
        try:
            await coro
        finally:
            ticker_task.cancel()
            try:
                await ticker_task
            except asyncio.CancelledError:
                pass
        return ticks

    async def test_slow_bulk_insert_does_not_block_event_loop(self):
        """批量路径：execute_insert_many 慢时不应阻塞事件循环"""
        processor, db_manager = make_plain_processor()
        processor.initialize_tables_for_runtime()

        def slow_insert_many(_table, rows):
            time.sleep(SLOW_DB_SECONDS)
            return len(rows)

        db_manager.execute_insert_many.side_effect = slow_insert_many

        ticks = await self._count_ticks_during(
            processor._process_group_data("SensorData", [sensor_item(1)])
        )

        self.assertGreaterEqual(
            ticks, 5, "同步批量 DB 写入阻塞了事件循环，其他协程无法调度"
        )
        db_manager.execute_insert_many.assert_called_once()

    async def test_slow_row_insert_does_not_block_event_loop(self):
        """逐条路径（唯一键组）：execute_insert 慢时不应阻塞事件循环"""
        processor, db_manager = make_plain_processor()
        processor.group_unique_key_points["SensorData"] = "value"
        processor.initialize_tables_for_runtime()

        def slow_insert(_table, _data):
            time.sleep(SLOW_DB_SECONDS)
            return True

        db_manager.execute_insert.side_effect = slow_insert

        ticks = await self._count_ticks_during(
            processor._process_group_data("SensorData", [sensor_item(2)])
        )

        self.assertGreaterEqual(
            ticks, 5, "同步逐条 DB 写入阻塞了事件循环，其他协程无法调度"
        )
        db_manager.execute_insert.assert_called_once()

    async def test_slow_unique_check_does_not_block_event_loop(self):
        """逐条路径：唯一性校验查询慢时不应阻塞事件循环"""
        processor, db_manager = make_plain_processor()
        processor.group_unique_key_points["SensorData"] = "value"
        processor.initialize_tables_for_runtime()

        def slow_record_exists(_table, _column, _value):
            time.sleep(SLOW_DB_SECONDS)
            return False

        db_manager.record_exists.side_effect = slow_record_exists

        ticks = await self._count_ticks_during(
            processor._process_group_data("SensorData", [sensor_item(3)])
        )

        self.assertGreaterEqual(
            ticks, 5, "同步唯一性校验查询阻塞了事件循环，其他协程无法调度"
        )
        db_manager.record_exists.assert_called_once()


if __name__ == "__main__":
    unittest.main()
