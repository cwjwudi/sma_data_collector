import unittest
from datetime import datetime
from unittest.mock import Mock

from database.data_storage import DataStorageProcessor
from database.db_manager import DatabaseManager


def collection_item(group_name, start_time, end_time=None, collection_time=None, value=1):
    return {
        "group_name": group_name,
        "collection_time": collection_time or datetime(2027, 1, 1, 0, 0, 0),
        "data": {
            "batch_no": {"value": f"B{value:03d}"},
            "start_time": {"value": start_time},
            "end_time": {"value": end_time},
            "value": {"value": value},
        },
    }


class TestBatchYearPartition(unittest.IsolatedAsyncioTestCase):
    def make_processor(self):
        db_manager = Mock()

        def resolve_table_name(group_name=None, partition_time=None, fixed_table=False):
            if fixed_table:
                return group_name
            return f"{group_name}_{partition_time.strftime('%Y')}"

        db_manager.get_current_table_name.side_effect = resolve_table_name
        db_manager.create_data_table.return_value = True
        db_manager.execute_insert.return_value = True
        db_manager.record_exists.return_value = False
        db_manager.execute_update.return_value = 1
        db_manager.execute_query.return_value = []

        processor = DataStorageProcessor(db_manager, batch_size=10)
        return processor, db_manager

    def test_database_manager_uses_year_suffix(self):
        manager = DatabaseManager({"type": "sqlite", "name": ":memory:", "data_groups": ["BatchData"]})

        self.assertEqual(
            manager.get_current_table_name("BatchData", partition_time=datetime(2026, 5, 11)),
            "BatchData_2026",
        )
        self.assertEqual(
            manager.get_current_table_name("BatchData", partition_time=datetime(2027, 1, 1)),
            "BatchData_2027",
        )

    def test_database_manager_fixed_table_has_no_year_suffix(self):
        manager = DatabaseManager({"type": "sqlite", "name": ":memory:"})

        self.assertEqual(
            manager.get_current_table_name("BatchHeader", fixed_table=True),
            "BatchHeader",
        )

    async def test_batch_data_uses_start_time_year_not_collection_time(self):
        processor, db_manager = self.make_processor()
        processor.group_batch_time_configs["BatchData"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
        }

        await processor._process_group_data(
            "BatchData",
            [
                collection_item(
                    "BatchData",
                    start_time=datetime(2026, 12, 31, 23, 30, 0),
                    collection_time=datetime(2027, 1, 1, 0, 5, 0),
                    value=1,
                ),
                collection_item(
                    "BatchData",
                    start_time=datetime(2026, 12, 31, 23, 30, 0),
                    collection_time=datetime(2027, 1, 1, 0, 10, 0),
                    value=2,
                ),
            ],
        )

        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, ["BatchData_2026", "BatchData_2026"])

    async def test_open_batch_keeps_start_year_when_later_rows_omit_start_time(self):
        processor, db_manager = self.make_processor()
        processor.group_batch_time_configs["BatchData"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
        }

        later_row = collection_item(
            "BatchData",
            start_time=None,
            collection_time=datetime(2027, 1, 1, 0, 10, 0),
            value=2,
        )

        await processor._process_group_data(
            "BatchData",
            [
                collection_item(
                    "BatchData",
                    start_time=datetime(2026, 12, 31, 23, 30, 0),
                    collection_time=datetime(2026, 12, 31, 23, 35, 0),
                    value=1,
                ),
                later_row,
            ],
        )

        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, ["BatchData_2026", "BatchData_2026"])

    async def test_batch_close_flushes_group_even_when_under_batch_size(self):
        processor, db_manager = self.make_processor()
        processor.group_batch_sizes["BatchData"] = 10
        processor.group_batch_time_configs["BatchData"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
        }

        processor.add_data(collection_item("BatchData", datetime(2026, 5, 1, 8, 0, 0), value=1))
        self.assertFalse(processor._has_enough_data_for_batch())

        processor.add_data(
            collection_item(
                "BatchData",
                datetime(2026, 5, 1, 8, 0, 0),
                datetime(2026, 5, 1, 9, 0, 0),
                value=2,
            )
        )

        self.assertTrue(processor._has_enough_data_for_batch())
        await processor._process_data_by_groups()

        self.assertEqual(processor.get_queue_size(), 0)
        self.assertEqual(db_manager.execute_insert.call_count, 2)

    async def test_batch_upsert_enabled_uses_fixed_table_name(self):
        processor, db_manager = self.make_processor()
        processor.group_unique_key_points["BatchHeader"] = "batch_no"
        processor.group_batch_upsert_configs["BatchHeader"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
            "update_only_when_end_time_is_null": True,
            "reject_when_end_time_exists": True,
            "allow_idempotent_same_end_time": False,
        }

        await processor._process_group_data(
            "BatchHeader",
            [collection_item("BatchHeader", datetime(2026, 5, 1, 8, 0, 0), value=1)],
        )

        db_manager.get_current_table_name.assert_any_call("BatchHeader", fixed_table=True)
        inserted_tables = [call.args[0] for call in db_manager.execute_insert.call_args_list]
        self.assertEqual(inserted_tables, ["BatchHeader"])


if __name__ == "__main__":
    unittest.main()
