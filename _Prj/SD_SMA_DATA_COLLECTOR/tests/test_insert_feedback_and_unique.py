"""
唯一性校验与插入反馈测试
"""

import os
import json
import tempfile
import unittest
from datetime import datetime
from unittest.mock import AsyncMock, Mock

from core.config_loader import ConfigLoader
from database.data_storage import DataStorageProcessor


class TestUniqueAndFeedbackConfig(unittest.TestCase):
    """配置加载校验测试"""

    def _create_temp_config(self, config_data):
        temp_file = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(config_data, temp_file)
        temp_file.close()
        return temp_file.name

    def _cleanup_temp_file(self, file_path):
        if os.path.exists(file_path):
            os.unlink(file_path)

    def test_group_unique_and_feedback_config(self):
        config_data = {
            "points": [
                {"name": "point_key", "path": "ns=6;s=point_key", "description": "唯一键"},
                {"name": "point_value", "path": "ns=6;s=point_value", "description": "值"},
                {"name": "insert_feedback_code", "path": "ns=6;s=insert_feedback_code", "description": "反馈"},
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["point_key", "point_value"],
                    "unique_key_point": "point_key",
                    "insert_feedback": {
                        "feedback_point": "insert_feedback_code",
                        "code_success": 10,
                        "code_unique_conflict": 11,
                        "code_db_error": 12,
                        "code_other_error": 13,
                    },
                }
            ],
            "database": {"type": "sqlite", "name": "test.db", "data_groups": ["group1"]},
        }

        temp_file = self._create_temp_config(config_data)
        try:
            config = ConfigLoader.load_from_file(temp_file)
            group = config.groups[0]
            self.assertEqual(group.unique_key_point, "point_key")
            self.assertIsNotNone(group.insert_feedback)
            self.assertEqual(group.insert_feedback.feedback_point, "insert_feedback_code")
            self.assertEqual(group.insert_feedback.code_success, 10)
        finally:
            self._cleanup_temp_file(temp_file)

    def test_unique_key_point_must_be_in_data_points(self):
        config_data = {
            "points": [
                {"name": "point_key", "path": "ns=6;s=point_key", "description": "唯一键"},
                {"name": "point_value", "path": "ns=6;s=point_value", "description": "值"},
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["point_value"],
                    "unique_key_point": "point_key",
                }
            ],
            "database": {"type": "sqlite", "name": "test.db", "data_groups": ["group1"]},
        }

        temp_file = self._create_temp_config(config_data)
        try:
            with self.assertRaises(ValueError) as ctx:
                ConfigLoader.load_from_file(temp_file)
            self.assertIn("unique_key_point", str(ctx.exception))
        finally:
            self._cleanup_temp_file(temp_file)

    def test_insert_feedback_point_must_exist_in_points(self):
        config_data = {
            "points": [
                {"name": "point_key", "path": "ns=6;s=point_key", "description": "唯一键"},
                {"name": "point_value", "path": "ns=6;s=point_value", "description": "值"},
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["point_key", "point_value"],
                    "unique_key_point": "point_key",
                    "insert_feedback": {
                        "feedback_point": "point_not_exists"
                    },
                }
            ],
            "database": {"type": "sqlite", "name": "test.db", "data_groups": ["group1"]},
        }

        temp_file = self._create_temp_config(config_data)
        try:
            with self.assertRaises(ValueError) as ctx:
                ConfigLoader.load_from_file(temp_file)
            self.assertIn("必须引用 points 中已定义", str(ctx.exception))
        finally:
            self._cleanup_temp_file(temp_file)

    def test_variable_trigger_requires_positive_interval(self):
        config_data = {
            "points": [
                {"name": "point_key", "path": "ns=6;s=point_key", "description": "唯一键"},
                {"name": "trigger_point", "path": "ns=6;s=trigger_point", "description": "触发点"},
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": None,
                    "trigger": "variable",
                    "description": "测试组",
                    "data_points": ["point_key"],
                    "trigger_point": "trigger_point",
                }
            ],
            "database": {"type": "sqlite", "name": "test.db", "data_groups": ["group1"]},
        }

        temp_file = self._create_temp_config(config_data)
        try:
            with self.assertRaises(ValueError) as ctx:
                ConfigLoader.load_from_file(temp_file)
            self.assertIn("trigger_interval_seconds 必须为数值", str(ctx.exception))
        finally:
            self._cleanup_temp_file(temp_file)

    def test_batch_upsert_requires_unique_key(self):
        config_data = {
            "points": [
                {"name": "batch_no", "path": "ns=6;s=batch_no", "description": "批次号"},
                {"name": "start_time", "path": "ns=6;s=start_time", "description": "开批时间"},
                {"name": "end_time", "path": "ns=6;s=end_time", "description": "结批时间"},
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["batch_no", "start_time", "end_time"],
                    "batch_upsert": {
                        "enabled": True,
                        "start_time_point": "start_time",
                        "end_time_point": "end_time",
                    },
                }
            ],
            "database": {"type": "sqlite", "name": "test.db", "data_groups": ["group1"]},
        }

        temp_file = self._create_temp_config(config_data)
        try:
            with self.assertRaises(ValueError) as ctx:
                ConfigLoader.load_from_file(temp_file)
            self.assertIn("batch_upsert", str(ctx.exception))
            self.assertIn("unique_key_point", str(ctx.exception))
        finally:
            self._cleanup_temp_file(temp_file)


class TestUniqueAndFeedbackRuntime(unittest.IsolatedAsyncioTestCase):
    """入库流程唯一性与反馈测试"""

    async def test_unique_conflict_returns_feedback_code(self):
        db_manager = Mock()
        db_manager.get_current_table_name.return_value = "group1_20260429"
        db_manager.create_data_table.return_value = True
        db_manager.record_exists.side_effect = [False, True]
        db_manager.execute_insert.return_value = True

        callback = AsyncMock(return_value=True)
        processor = DataStorageProcessor(db_manager, 1, {}, callback)
        processor.group_unique_key_points["group1"] = "point_key"
        processor.group_insert_feedback_configs["group1"] = {
            "feedback_point": "ns=6;s=::DataRev:udiInsertFeedBack",
            "code_success": 0,
            "code_unique_conflict": 1,
            "code_db_error": 2,
            "code_other_error": 3,
        }

        group_data_list = [
            {
                "group_name": "group1",
                "collection_time": datetime.now(),
                "data": {
                    "point_key": {"value": "A"},
                    "point_value": {"value": 100},
                },
            },
            {
                "group_name": "group1",
                "collection_time": datetime.now(),
                "data": {
                    "point_key": {"value": "A"},
                    "point_value": {"value": 101},
                },
            },
        ]

        await processor._process_group_data("group1", group_data_list)

        self.assertEqual(db_manager.execute_insert.call_count, 1)
        callback.assert_awaited_once_with("group1", "ns=6;s=::DataRev:udiInsertFeedBack", 1)

    async def test_db_error_returns_feedback_code(self):
        db_manager = Mock()
        db_manager.get_current_table_name.return_value = "group1_20260429"
        db_manager.create_data_table.return_value = True
        db_manager.record_exists.side_effect = Exception("db query error")
        db_manager.execute_insert.return_value = True

        callback = AsyncMock(return_value=True)
        processor = DataStorageProcessor(db_manager, 1, {}, callback)
        processor.group_unique_key_points["group1"] = "point_key"
        processor.group_insert_feedback_configs["group1"] = {
            "feedback_point": "ns=6;s=::DataRev:udiInsertFeedBack",
            "code_success": 0,
            "code_unique_conflict": 1,
            "code_db_error": 2,
            "code_other_error": 3,
        }

        group_data_list = [
            {
                "group_name": "group1",
                "collection_time": datetime.now(),
                "data": {
                    "point_key": {"value": "A"},
                    "point_value": {"value": 100},
                },
            }
        ]

        await processor._process_group_data("group1", group_data_list)
        callback.assert_awaited_once_with("group1", "ns=6;s=::DataRev:udiInsertFeedBack", 2)

    async def test_batch_upsert_updates_end_time_when_open(self):
        db_manager = Mock()
        db_manager.get_current_table_name.return_value = "group1_20260429"
        db_manager.create_data_table.return_value = True
        db_manager.record_exists.return_value = True
        db_manager.execute_update.return_value = 1
        db_manager.execute_insert.return_value = True
        db_manager.execute_query.return_value = []

        callback = AsyncMock(return_value=True)
        processor = DataStorageProcessor(db_manager, 1, {}, callback)
        processor.group_unique_key_points["group1"] = "batch_no"
        processor.group_batch_upsert_configs["group1"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
            "update_only_when_end_time_is_null": True,
            "reject_when_end_time_exists": True,
            "allow_idempotent_same_end_time": False,
        }
        processor.group_insert_feedback_configs["group1"] = {
            "feedback_point": "ns=6;s=::DataRev:udiInsertFeedBack",
            "code_success": 0,
            "code_unique_conflict": 1,
            "code_db_error": 2,
            "code_other_error": 3,
        }

        group_data_list = [
            {
                "group_name": "group1",
                "collection_time": datetime.now(),
                "data": {
                    "batch_no": {"value": "B001"},
                    "start_time": {"value": "2026-05-11 10:00:00"},
                    "end_time": {"value": "2026-05-11 10:30:00"},
                },
            }
        ]

        await processor._process_group_data("group1", group_data_list)

        db_manager.execute_update.assert_called_once()
        db_manager.execute_insert.assert_not_called()
        callback.assert_awaited_once_with("group1", "ns=6;s=::DataRev:udiInsertFeedBack", 0)

    async def test_batch_upsert_idempotent_same_end_time(self):
        db_manager = Mock()
        db_manager.get_current_table_name.return_value = "group1_20260429"
        db_manager.create_data_table.return_value = True
        db_manager.record_exists.return_value = True
        db_manager.execute_update.return_value = 0
        db_manager.execute_insert.return_value = True
        db_manager.execute_query.return_value = [("2026-05-11 10:30:00",)]

        callback = AsyncMock(return_value=True)
        processor = DataStorageProcessor(db_manager, 1, {}, callback)
        processor.group_unique_key_points["group1"] = "batch_no"
        processor.group_batch_upsert_configs["group1"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
            "update_only_when_end_time_is_null": True,
            "reject_when_end_time_exists": True,
            "allow_idempotent_same_end_time": True,
        }
        processor.group_insert_feedback_configs["group1"] = {
            "feedback_point": "ns=6;s=::DataRev:udiInsertFeedBack",
            "code_success": 0,
            "code_unique_conflict": 1,
            "code_db_error": 2,
            "code_other_error": 3,
        }

        group_data_list = [
            {
                "group_name": "group1",
                "collection_time": datetime.now(),
                "data": {
                    "batch_no": {"value": "B001"},
                    "start_time": {"value": "2026-05-11 10:00:00"},
                    "end_time": {"value": "2026-05-11 10:30:00"},
                },
            }
        ]

        await processor._process_group_data("group1", group_data_list)
        callback.assert_awaited_once_with("group1", "ns=6;s=::DataRev:udiInsertFeedBack", 0)

    async def test_batch_upsert_rejects_closed_batch(self):
        db_manager = Mock()
        db_manager.get_current_table_name.return_value = "group1_20260429"
        db_manager.create_data_table.return_value = True
        db_manager.record_exists.return_value = True
        db_manager.execute_update.return_value = 0
        db_manager.execute_insert.return_value = True
        db_manager.execute_query.return_value = [("2026-05-11 10:35:00",)]

        callback = AsyncMock(return_value=True)
        processor = DataStorageProcessor(db_manager, 1, {}, callback)
        processor.group_unique_key_points["group1"] = "batch_no"
        processor.group_batch_upsert_configs["group1"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
            "update_only_when_end_time_is_null": True,
            "reject_when_end_time_exists": True,
            "allow_idempotent_same_end_time": False,
        }
        processor.group_insert_feedback_configs["group1"] = {
            "feedback_point": "ns=6;s=::DataRev:udiInsertFeedBack",
            "code_success": 0,
            "code_unique_conflict": 1,
            "code_db_error": 2,
            "code_other_error": 3,
        }

        group_data_list = [
            {
                "group_name": "group1",
                "collection_time": datetime.now(),
                "data": {
                    "batch_no": {"value": "B001"},
                    "start_time": {"value": "2026-05-11 10:00:00"},
                    "end_time": {"value": "2026-05-11 10:30:00"},
                },
            }
        ]

        await processor._process_group_data("group1", group_data_list)
        callback.assert_awaited_once_with("group1", "ns=6;s=::DataRev:udiInsertFeedBack", 1)

    async def test_insert_sets_end_time_null_when_equals_start_time(self):
        db_manager = Mock()
        db_manager.get_current_table_name.return_value = "group1_20260429"
        db_manager.create_data_table.return_value = True
        db_manager.record_exists.return_value = False
        db_manager.execute_insert.return_value = True

        callback = AsyncMock(return_value=True)
        processor = DataStorageProcessor(db_manager, 1, {}, callback)
        processor.group_unique_key_points["group1"] = "batch_no"
        processor.group_batch_upsert_configs["group1"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
            "update_only_when_end_time_is_null": True,
            "reject_when_end_time_exists": True,
            "allow_idempotent_same_end_time": False,
        }
        processor.group_insert_feedback_configs["group1"] = {
            "feedback_point": "ns=6;s=::DataRev:udiInsertFeedBack",
            "code_success": 0,
            "code_unique_conflict": 1,
            "code_db_error": 2,
            "code_other_error": 3,
        }

        same_time = "2026-05-11 10:00:00"
        group_data_list = [
            {
                "group_name": "group1",
                "collection_time": datetime.now(),
                "data": {
                    "batch_no": {"value": "B001"},
                    "start_time": {"value": same_time},
                    "end_time": {"value": same_time},
                },
            }
        ]

        await processor._process_group_data("group1", group_data_list)

        db_manager.execute_insert.assert_called_once()
        insert_payload = db_manager.execute_insert.call_args[0][1]
        self.assertIsNone(insert_payload["end_time"])
        callback.assert_awaited_once_with("group1", "ns=6;s=::DataRev:udiInsertFeedBack", 0)

    async def test_insert_sets_end_time_null_when_earlier_than_start_time(self):
        db_manager = Mock()
        db_manager.get_current_table_name.return_value = "group1_20260429"
        db_manager.create_data_table.return_value = True
        db_manager.record_exists.return_value = False
        db_manager.execute_insert.return_value = True

        callback = AsyncMock(return_value=True)
        processor = DataStorageProcessor(db_manager, 1, {}, callback)
        processor.group_unique_key_points["group1"] = "batch_no"
        processor.group_batch_upsert_configs["group1"] = {
            "start_time_point": "start_time",
            "end_time_point": "end_time",
            "update_only_when_end_time_is_null": True,
            "reject_when_end_time_exists": True,
            "allow_idempotent_same_end_time": False,
        }
        processor.group_insert_feedback_configs["group1"] = {
            "feedback_point": "ns=6;s=::DataRev:udiInsertFeedBack",
            "code_success": 0,
            "code_unique_conflict": 1,
            "code_db_error": 2,
            "code_other_error": 3,
        }

        group_data_list = [
            {
                "group_name": "group1",
                "collection_time": datetime.now(),
                "data": {
                    "batch_no": {"value": "B001"},
                    "start_time": {"value": datetime(2026, 5, 11, 10, 0, 0)},
                    "end_time": {"value": datetime(2026, 5, 11, 9, 59, 0)},
                },
            }
        ]

        await processor._process_group_data("group1", group_data_list)

        db_manager.execute_insert.assert_called_once()
        insert_payload = db_manager.execute_insert.call_args[0][1]
        self.assertIsNone(insert_payload["end_time"])
        callback.assert_awaited_once_with("group1", "ns=6;s=::DataRev:udiInsertFeedBack", 0)


if __name__ == "__main__":
    unittest.main()
