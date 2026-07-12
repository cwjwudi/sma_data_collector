"""
运行期跨年分表补建测试

Bug 背景：非 batch_master 的年份分表组只在启动时按当年建表，
运行中跨年后新年份表名不在 ensured_tables 中，
_is_table_ready_for_insert 返回 False，新年数据被当 DB_ERROR 丢弃直到重启。
修复后：插入前发现目标分表未 ensure 时，运行期走与启动相同的建表逻辑补建。
"""

import unittest
from datetime import datetime
from unittest.mock import Mock

from database.data_storage import DataStorageProcessor

NEXT_YEAR = datetime.now().year + 1


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


class TestRuntimeYearRollover(unittest.IsolatedAsyncioTestCase):
    """跨年后新年份分表应在运行期自动补建"""

    async def test_new_year_partition_table_created_at_runtime(self):
        """批量路径：跨年后应运行期补建新年份分表并写入，而不是丢数"""
        processor, db_manager = make_plain_processor()
        processor.initialize_tables_for_runtime()  # 启动时只按当年建表
        db_manager.create_data_table.reset_mock()

        new_year_table = f"SensorData_y{NEXT_YEAR:04d}_span1"
        await processor._process_group_data(
            "SensorData",
            [sensor_item(1, collection_time=datetime(NEXT_YEAR, 1, 1, 0, 0, 5))],
        )

        created_tables = [call.args[0] for call in db_manager.create_data_table.call_args_list]
        self.assertEqual(created_tables, [new_year_table], "跨年后应按启动相同逻辑补建新年份分表")
        inserted_tables = [call.args[0] for call in db_manager.execute_insert_many.call_args_list]
        self.assertIn(new_year_table, inserted_tables, "新年数据应写入新年份分表而不是被丢弃")

    async def test_new_year_table_created_for_unique_key_group(self):
        """逐条路径（唯一键组）：跨年后同样应运行期补建并写入"""
        processor, db_manager = make_plain_processor()
        processor.group_unique_key_points["SensorData"] = "value"
        processor.initialize_tables_for_runtime()
        db_manager.create_data_table.reset_mock()

        new_year_table = f"SensorData_y{NEXT_YEAR:04d}_span1"
        await processor._process_group_data(
            "SensorData",
            [sensor_item(2, collection_time=datetime(NEXT_YEAR, 1, 2, 8, 0, 0))],
        )

        created_tables = [call.args[0] for call in db_manager.create_data_table.call_args_list]
        self.assertEqual(created_tables, [new_year_table])
        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, [new_year_table])

    async def test_runtime_ensure_failure_requeues_data(self):
        """跨年补建失败（如 DB 断开）时数据应回队重试，而不是静默丢弃"""
        processor, db_manager = make_plain_processor()
        processor.initialize_tables_for_runtime()
        db_manager.create_data_table.return_value = False  # 模拟补建新表失败

        processor.add_data(sensor_item(3, collection_time=datetime(NEXT_YEAR, 1, 1, 0, 0, 5)))
        await processor._process_data_by_groups()

        self.assertEqual(processor.get_queue_size(), 1, "补建失败的数据应回队等待重试")
        self.assertEqual(processor.data_queue[0]["data"]["value"]["value"], 3)

    async def test_runtime_ensure_only_attempted_once_per_table_per_cycle(self):
        """同一轮内同一张新表只补建一次，避免 DB 故障时重复建表请求拖慢循环"""
        processor, db_manager = make_plain_processor()
        processor.initialize_tables_for_runtime()
        db_manager.create_data_table.reset_mock()
        db_manager.create_data_table.return_value = False

        await processor._process_group_data(
            "SensorData",
            [
                sensor_item(4, collection_time=datetime(NEXT_YEAR, 1, 1, 0, 0, 5)),
                sensor_item(5, collection_time=datetime(NEXT_YEAR, 1, 1, 0, 0, 6)),
            ],
        )

        self.assertEqual(db_manager.create_data_table.call_count, 1)


if __name__ == "__main__":
    unittest.main()
