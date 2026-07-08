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


if __name__ == "__main__":
    unittest.main()
