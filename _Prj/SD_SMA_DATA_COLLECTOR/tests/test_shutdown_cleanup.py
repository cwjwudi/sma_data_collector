import asyncio
import sys
import types
import unittest
from unittest.mock import Mock

try:
    import opcua  # noqa: F401
except ModuleNotFoundError:
    fake_opcua = types.ModuleType("opcua")
    fake_opcua.Client = object
    fake_opcua.ua = types.SimpleNamespace()
    sys.modules["opcua"] = fake_opcua

from communication.data_collector import DataCollector
from database.data_storage import DataStorageProcessor


def pending_event_wait_tasks():
    current = asyncio.current_task()
    return [
        task
        for task in asyncio.all_tasks()
        if task is not current
        and not task.done()
        and getattr(task.get_coro(), "__qualname__", "") == "Event.wait"
    ]


class TestShutdownCleanup(unittest.IsolatedAsyncioTestCase):
    async def test_storage_stop_cleans_batch_ready_wait_task(self):
        processor = DataStorageProcessor(Mock(), batch_size=10)

        await processor.start_processing()
        for _ in range(50):
            if pending_event_wait_tasks():
                break
            await asyncio.sleep(0.001)

        self.assertTrue(pending_event_wait_tasks())

        await processor.stop_processing()
        await asyncio.sleep(0)

        self.assertIsNone(processor.processing_task)
        self.assertFalse(pending_event_wait_tasks())

    async def test_data_collector_stop_waits_for_tasks_to_finish(self):
        collector = DataCollector(Mock())
        cleanup_complete = asyncio.Event()

        async def worker():
            try:
                await asyncio.Event().wait()
            finally:
                cleanup_complete.set()

        task = asyncio.create_task(worker())
        collector.collectors["group1"] = task
        await asyncio.sleep(0)

        await collector.stop_collection()

        self.assertTrue(cleanup_complete.is_set())
        self.assertTrue(task.done())
        self.assertEqual(collector.collectors, {})

    async def test_storage_stop_flushes_sub_batch_before_clearing_table_cache(self):
        db = Mock()
        db.get_current_table_name.return_value = "Data_Alarm"
        db.execute_insert_many.return_value = 3
        processor = DataStorageProcessor(db, batch_size=100)
        processor.group_batch_sizes["Data_Alarm"] = 100
        processor.group_data_points["Data_Alarm"] = ["AlarmCode"]
        processor.group_partition_interval_years["Data_Alarm"] = 0
        processor.ensured_tables.add("Data_Alarm")
        await processor.start_processing()
        for value in range(3):
            processor.add_data(
                {
                    "group_name": "Data_Alarm",
                    "collection_time": __import__("datetime").datetime.now(),
                    "trigger_type": "variable",
                    "data": {"AlarmCode": {"value": value}},
                }
            )
        await processor.stop_processing()
        self.assertEqual(processor.get_queue_size(), 0)
        self.assertEqual(len(processor.retry_queue), 0)
        db.execute_insert_many.assert_called_once()
        self.assertEqual(processor.metrics["shutdown_rows_remaining"], 0)

    async def test_database_failure_is_retained_for_retry(self):
        db = Mock()
        db.get_current_table_name.return_value = "Data_Audit"
        db.execute_insert_many.return_value = -1
        processor = DataStorageProcessor(db, batch_size=1)
        processor.group_data_points["Data_Audit"] = ["AuditText"]
        processor.group_partition_interval_years["Data_Audit"] = 0
        processor.ensured_tables.add("Data_Audit")
        row = {
            "group_name": "Data_Audit",
            "collection_time": __import__("datetime").datetime.now(),
            "trigger_type": "variable",
            "data": {"AuditText": {"value": "x"}},
        }
        await processor._process_batch([row], requeue_db_failures=True)
        self.assertEqual(list(processor.retry_queue), [row])
        self.assertEqual(processor.metrics["db_rows_queued_for_retry"], 1)

    async def test_background_retry_commits_retained_batch_after_recovery(self):
        db = Mock()
        db.get_current_table_name.return_value = "Data_Audit"
        db.execute_insert_many.side_effect = [-1, 1]
        processor = DataStorageProcessor(db, batch_size=1)
        processor.retry_interval_seconds = 0.01
        processor.group_batch_sizes["Data_Audit"] = 1
        processor.group_data_points["Data_Audit"] = ["AuditText"]
        processor.group_partition_interval_years["Data_Audit"] = 0
        processor.ensured_tables.add("Data_Audit")
        await processor.start_processing()
        processor.add_data(
            {
                "group_name": "Data_Audit",
                "collection_time": __import__("datetime").datetime.now(),
                "trigger_type": "variable",
                "data": {"AuditText": {"value": "retry-me"}},
            }
        )
        for _ in range(200):
            if db.execute_insert_many.call_count >= 2 and not processor.retry_queue:
                break
            await asyncio.sleep(0.01)
        await processor.stop_processing()
        self.assertEqual(db.execute_insert_many.call_count, 2)
        self.assertEqual(processor.metrics["db_rows_retried"], 1)
        self.assertEqual(processor.metrics["db_rows_committed"], 1)

    async def test_shutdown_timeout_reports_rows_without_silently_dropping_them(self):
        db = Mock()
        db.get_current_table_name.return_value = "Data_Alarm"
        db.execute_insert_many.return_value = -1
        processor = DataStorageProcessor(db, batch_size=100)
        processor.shutdown_flush_timeout_seconds = 0
        processor.group_batch_sizes["Data_Alarm"] = 100
        processor.group_data_points["Data_Alarm"] = ["AlarmCode"]
        processor.group_partition_interval_years["Data_Alarm"] = 0
        processor.ensured_tables.add("Data_Alarm")
        await processor.start_processing()
        row = {
            "group_name": "Data_Alarm",
            "collection_time": __import__("datetime").datetime.now(),
            "trigger_type": "variable",
            "data": {"AlarmCode": {"value": 1}},
        }
        processor.add_data(row)
        await processor.stop_processing()
        self.assertEqual(processor.metrics["shutdown_rows_remaining"], 1)
        self.assertEqual(list(processor.retry_queue), [row])

    async def test_non_retryable_conversion_error_is_retained_as_dead_letter(self):
        db = Mock()
        db.get_current_table_name.return_value = "Data_Alarm"
        processor = DataStorageProcessor(db, batch_size=1)
        processor.group_data_points["Data_Alarm"] = ["AlarmCode"]
        processor.group_partition_interval_years["Data_Alarm"] = 0
        processor.ensured_tables.add("Data_Alarm")
        row = {
            "group_name": "Data_Alarm",
            "trigger_type": "variable",
            "data": {},
        }
        await processor._process_batch([row], requeue_db_failures=True)
        self.assertEqual(list(processor.dead_letter_queue), [row])
        self.assertEqual(processor.get_runtime_metrics()["dead_letter_queue_size"], 1)


if __name__ == "__main__":
    unittest.main()
