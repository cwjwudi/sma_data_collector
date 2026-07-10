import unittest
from datetime import datetime
from unittest.mock import Mock

from database.data_storage import DataStorageProcessor
from database.db_manager import DatabaseManager


BATCH_CFG = {
    "start_time_point": "start_time",
    "end_time_point": "end_time",
    "update_only_when_end_time_is_null": True,
    "reject_when_end_time_exists": True,
    "allow_idempotent_same_end_time": False,
}


def collection_item(group_name, batch_no="B001", start_time=None, end_time=None, collection_time=None, value=1):
    return {
        "group_name": group_name,
        "collection_time": collection_time or datetime(2027, 1, 1, 0, 0, 0),
        "data": {
            "batch_no": {"value": batch_no},
            "start_time": {"value": start_time},
            "end_time": {"value": end_time},
            "value": {"value": value},
        },
    }


class TestBatchYearPartition(unittest.IsolatedAsyncioTestCase):
    def make_processor(self):
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
        db_manager.record_exists.return_value = False
        db_manager.execute_update.return_value = 1
        db_manager.execute_query.return_value = []

        processor = DataStorageProcessor(db_manager, batch_size=10)
        processor.group_data_points["BatchHeader"] = ["batch_no", "start_time", "end_time"]
        processor.group_data_points["BatchData"] = ["batch_no", "value"]
        processor.group_partition_interval_years["BatchHeader"] = 1
        processor.group_partition_interval_years["BatchData"] = 1
        processor.group_batch_sizes["BatchHeader"] = 1
        processor.group_batch_sizes["BatchData"] = 10
        processor.group_unique_key_points["BatchHeader"] = "batch_no"
        processor.group_batch_upsert_configs["BatchHeader"] = dict(BATCH_CFG)
        processor.batch_master_group_name = "BatchHeader"
        processor.batch_master_config = dict(BATCH_CFG)
        processor.batch_master_unique_key_point = "batch_no"
        return processor, db_manager

    def test_database_manager_uses_year_span_suffix(self):
        manager = DatabaseManager({"type": "sqlite", "name": ":memory:", "data_groups": ["BatchData"]})

        self.assertEqual(
            manager.get_current_table_name("BatchData", partition_time=datetime(2025, 12, 31)),
            "BatchData_y2025_span1",
        )
        self.assertEqual(
            manager.get_current_table_name("BatchData", partition_time=datetime(2026, 1, 1)),
            "BatchData_y2026_span1",
        )
        self.assertEqual(
            manager.get_current_table_name(
                "BatchData",
                partition_time=datetime(2026, 1, 1),
                partition_interval_years=2,
            ),
            "BatchData_y2025_span2",
        )

    def test_database_manager_fixed_table_has_no_year_suffix(self):
        manager = DatabaseManager({"type": "sqlite", "name": ":memory:"})

        self.assertEqual(
            manager.get_current_table_name("BatchHeader", fixed_table=True),
            "BatchHeader",
        )

    def test_database_manager_zero_interval_has_no_year_suffix(self):
        manager = DatabaseManager({"type": "sqlite", "name": ":memory:", "data_groups": ["SensorData"]})

        self.assertEqual(
            manager.get_current_table_name(
                "SensorData",
                partition_time=datetime(2026, 7, 9),
                partition_interval_years=0,
            ),
            "SensorData",
        )

    def test_database_manager_ignores_legacy_partition_table_names(self):
        self.assertIsNone(DatabaseManager._parse_partitioned_table_name("BatchData_2025"))
        self.assertIsNone(DatabaseManager._parse_partitioned_table_name("BatchData_20260408"))

        parsed = DatabaseManager._parse_partitioned_table_name("BatchData_y2025_span2")
        self.assertIsNotNone(parsed)
        group_name, parsed_date, interval = parsed
        self.assertEqual(group_name, "BatchData")
        self.assertEqual(parsed_date, datetime(2025, 1, 1))
        self.assertEqual(interval, 2)

    async def test_batch_open_creates_detail_table_for_start_year(self):
        processor, db_manager = self.make_processor()
        processor.initialize_tables_for_runtime()
        db_manager.create_data_table.reset_mock()

        await processor._process_group_data(
            "BatchHeader",
            [
                collection_item(
                    "BatchHeader",
                    start_time=datetime(2025, 12, 31, 23, 30, 0),
                    value=1,
                )
            ],
        )

        self.assertEqual(processor.current_batch_context["batch_no"], "B001")
        self.assertEqual(processor.current_batch_context["start_time"].year, 2025)
        created_tables = [call.args[0] for call in db_manager.create_data_table.call_args_list]
        self.assertEqual(created_tables, ["BatchData_y2025_span1"])

    async def test_batch_master_rejects_blank_batch_no(self):
        processor, db_manager = self.make_processor()
        processor.initialize_tables_for_runtime()
        db_manager.record_exists.reset_mock()
        db_manager.execute_insert.reset_mock()
        db_manager.create_data_table.reset_mock()

        blank_close = collection_item(
            "BatchHeader",
            batch_no="   ",
            start_time=datetime(2025, 12, 31, 23, 30, 0),
            end_time=datetime(2026, 1, 1, 1, 0, 0),
        )

        self.assertFalse(processor._is_batch_close_record(blank_close))

        await processor._process_group_data("BatchHeader", [blank_close])

        db_manager.record_exists.assert_not_called()
        db_manager.execute_insert.assert_not_called()
        db_manager.create_data_table.assert_not_called()
        self.assertIsNone(processor.current_batch_context)

    async def test_detail_data_uses_master_start_year_not_collection_time(self):
        processor, db_manager = self.make_processor()
        processor.initialize_tables_for_runtime()
        await processor._process_group_data(
            "BatchHeader",
            [collection_item("BatchHeader", start_time=datetime(2025, 12, 31, 23, 30, 0))],
        )
        db_manager.create_data_table.reset_mock()

        await processor._process_group_data(
            "BatchData",
            [
                collection_item(
                    "BatchData",
                    start_time=None,
                    collection_time=datetime(2026, 1, 1, 0, 10, 0),
                    value=2,
                )
            ],
        )

        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertIn("BatchData_y2025_span1", inserted_tables)
        db_manager.create_data_table.assert_not_called()

    async def test_master_close_flushes_all_groups_even_when_under_batch_size(self):
        processor, db_manager = self.make_processor()
        processor.initialize_tables_for_runtime()
        await processor._process_group_data(
            "BatchHeader",
            [collection_item("BatchHeader", start_time=datetime(2025, 12, 31, 23, 30, 0))],
        )
        processor.data_queue.clear()
        db_manager.record_exists.return_value = True
        db_manager.execute_insert.reset_mock()

        processor.add_data(collection_item("BatchData", batch_no="B001", value=10))
        self.assertFalse(processor._has_enough_data_for_batch())
        processor.add_data(
            collection_item(
                "BatchHeader",
                batch_no="B001",
                start_time=datetime(2025, 12, 31, 23, 30, 0),
                end_time=datetime(2026, 1, 1, 1, 0, 0),
                value=1,
            )
        )

        self.assertTrue(processor._has_enough_data_for_batch())
        await processor._process_data_by_groups()

        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, ["BatchData_y2025_span1"])
        self.assertEqual(processor.get_queue_size(), 0)
        self.assertIsNone(processor.current_batch_context)

    async def test_master_open_flushes_all_groups_even_when_under_batch_size(self):
        processor, db_manager = self.make_processor()
        processor.initialize_tables_for_runtime()
        db_manager.execute_insert.reset_mock()

        processor.add_data(collection_item("BatchData", batch_no="B002", value=20))
        self.assertFalse(processor._has_enough_data_for_batch())
        processor.add_data(
            collection_item(
                "BatchHeader",
                batch_no="B002",
                start_time=datetime(2026, 2, 1, 8, 0, 0),
            )
        )

        self.assertTrue(processor._has_enough_data_for_batch())
        await processor._process_data_by_groups()

        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, ["BatchHeader", "BatchData_y2026_span1"])
        self.assertEqual(processor.get_queue_size(), 0)
        self.assertEqual(processor.current_batch_context["batch_no"], "B002")

    async def test_rejected_master_open_still_flushes_non_partitioned_detail(self):
        processor, db_manager = self.make_processor()
        processor.group_partition_interval_years["BatchData"] = 0
        processor.initialize_tables_for_runtime()
        db_manager.record_exists.return_value = True
        db_manager.execute_insert.reset_mock()

        processor.add_data(collection_item("BatchData", batch_no="B003", value=30))
        processor.add_data(
            collection_item(
                "BatchHeader",
                batch_no="B003",
                start_time=datetime(2026, 3, 1, 8, 0, 0),
            )
        )
        await processor._process_data_by_groups()

        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, ["BatchData"])
        self.assertEqual(processor.get_queue_size(), 0)

    async def test_rejected_master_close_still_flushes_all_groups(self):
        processor, db_manager = self.make_processor()
        processor.initialize_tables_for_runtime()
        await processor._process_group_data(
            "BatchHeader",
            [collection_item("BatchHeader", start_time=datetime(2026, 4, 1, 8, 0, 0))],
        )
        processor.data_queue.clear()
        db_manager.record_exists.return_value = True
        db_manager.execute_update.return_value = 0
        db_manager.execute_insert.reset_mock()

        processor.add_data(collection_item("BatchData", batch_no="B001", value=40))
        processor.add_data(
            collection_item(
                "BatchHeader",
                batch_no="B001",
                start_time=datetime(2026, 4, 1, 8, 0, 0),
                end_time=datetime(2026, 4, 1, 9, 0, 0),
            )
        )
        await processor._process_data_by_groups()

        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, ["BatchData_y2026_span1"])
        self.assertEqual(processor.get_queue_size(), 0)
        self.assertIsNotNone(processor.current_batch_context)

    async def test_batch_upsert_enabled_uses_fixed_table_name(self):
        processor, db_manager = self.make_processor()
        processor.initialize_tables_for_runtime()

        await processor._process_group_data(
            "BatchHeader",
            [collection_item("BatchHeader", start_time=datetime(2026, 5, 1, 8, 0, 0), value=1)],
        )

        db_manager.get_current_table_name.assert_any_call("BatchHeader", fixed_table=True)
        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, ["BatchHeader"])

    async def test_zero_interval_detail_writes_without_batch_context(self):
        processor, db_manager = self.make_processor()
        processor.group_partition_interval_years["BatchData"] = 0
        processor.ensured_tables.add("BatchData")
        processor.initialize_tables_for_runtime()
        self.assertIsNone(processor.current_batch_context)

        await processor._process_group_data(
            "BatchData",
            [
                collection_item(
                    "BatchData",
                    start_time=None,
                    collection_time=datetime(2026, 7, 9, 14, 0, 0),
                    value=9,
                )
            ],
        )

        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertIn("BatchData", inserted_tables)
        db_manager.get_current_table_name.assert_any_call(
            "BatchData",
            partition_interval_years=0,
        )


class TestEnsureTableColumns(unittest.TestCase):
    def test_ensure_table_columns_adds_missing_columns(self):
        manager = DatabaseManager({"type": "sqlite", "name": ":memory:"})
        self.assertTrue(manager.connect())
        self.assertTrue(
            manager.create_data_table(
                "主表",
                {"rBP1": "DOUBLE", "strBatchCode": "VARCHAR(255)"},
            )
        )
        self.assertTrue(
            manager.ensure_table_columns(
                "主表",
                {
                    "rBP1": "DOUBLE",
                    "strBatchCode": "VARCHAR(255)",
                    "dtBtachStartTime": "DATETIME",
                    "dtBtachEndTime": "DATETIME",
                },
            )
        )
        columns = manager.get_table_column_names("主表")
        self.assertIn("dtBtachStartTime", columns)
        self.assertIn("dtBtachEndTime", columns)
        manager.disconnect()


if __name__ == "__main__":
    unittest.main()
