"""
单元测试模块
测试各个核心组件的功能
"""

import unittest
import asyncio
import tempfile
import os
import json
from datetime import datetime
from unittest.mock import MagicMock, Mock, patch
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

# 导入被测试的模块
from core.config_models import DataPoint, DataGroup, DatabaseConfig, AppConfig, TriggerType
from core.config_loader import ConfigLoader
from database.db_manager import DatabaseManager


class TestConfigModels(unittest.TestCase):
    """测试配置模型"""
    
    def test_data_point_creation(self):
        """测试数据点创建"""
        point = DataPoint(
            name="test_point",
            path="ns=6;s=test.path",
            description="测试数据点"
        )
        self.assertEqual(point.name, "test_point")
        self.assertEqual(point.path, "ns=6;s=test.path")
        self.assertEqual(point.description, "测试数据点")
    
    def test_data_group_creation(self):
        """测试数据组创建"""
        group = DataGroup(
            name="test_group",
            interval_seconds=5,
            trigger=TriggerType.TIME,
            description="测试数据组",
            data_points=["point1", "point2"]
        )
        self.assertEqual(group.name, "test_group")
        self.assertEqual(group.interval_seconds, 5)
        self.assertEqual(group.trigger, TriggerType.TIME)
        self.assertEqual(group.data_points, ["point1", "point2"])


class TestConfigLoader(unittest.TestCase):
    """测试配置加载器"""
    
    def setUp(self):
        """测试前准备"""
        self.test_config = {
            "points": [
                {
                    "name": "temp_sensor",
                    "path": "ns=6;s=Temp.Value",
                    "description": "温度传感器"
                }
            ],
            "groups": [
                {
                    "name": "sensor_group",
                    "interval_seconds": 10,
                    "trigger": "time",
                    "description": "传感器组",
                    "data_points": ["temp_sensor"]
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db"
            }
        }
        
        # 创建临时配置文件
        self.temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        json.dump(self.test_config, self.temp_file)
        self.temp_file.close()
    
    def tearDown(self):
        """测试后清理"""
        os.unlink(self.temp_file.name)
    
    def test_load_valid_config(self):
        """测试加载有效配置"""
        config = ConfigLoader.load_from_file(self.temp_file.name)
        self.assertIsInstance(config, AppConfig)
        self.assertEqual(len(config.points), 1)
        self.assertEqual(len(config.groups), 1)
        self.assertEqual(config.database.type, "sqlite")
    
    def test_load_nonexistent_file(self):
        """测试加载不存在的文件"""
        with self.assertRaises(FileNotFoundError):
            ConfigLoader.load_from_file("nonexistent.json")


class TestDatabaseManager(unittest.TestCase):
    """测试数据库管理器"""
    
    def setUp(self):
        """测试前准备"""
        self.db_config = {
            'type': 'sqlite',
            'name': ':memory:',  # 使用内存数据库进行测试
            'host': 'localhost',
            'port': 3306,
            'username': '',
            'password': '',
            'recreate_interval_days': 30
        }
        self.db_manager = DatabaseManager(self.db_config)
    
    def test_database_connection(self):
        """测试数据库连接"""
        self.assertTrue(self.db_manager.connect())
        self.db_manager.disconnect()
    
    def test_get_current_table_name(self):
        """测试获取当前表名"""
        self.db_manager.connect()
        table_name = self.db_manager.get_current_table_name()
        self.assertIsNotNone(table_name)
        self.assertTrue(table_name.endswith(f"_y{datetime.now().strftime('%Y')}_span1"))

    def test_execute_insert_many_commits_all_rows(self):
        self.assertTrue(self.db_manager.connect())
        with self.db_manager.engine.begin() as conn:
            conn.execute(text(
                "CREATE TABLE bulk_insert_test (id INTEGER PRIMARY KEY, value TEXT)"
            ))

        rows = [
            {"id": 1, "value": "A"},
            {"id": 2, "value": "B"},
            {"id": 3, "value": "C"},
        ]
        self.assertEqual(
            self.db_manager.execute_insert_many("bulk_insert_test", rows),
            3,
        )
        result = self.db_manager.execute_query(
            "SELECT id, value FROM bulk_insert_test ORDER BY id"
        )
        self.assertEqual(result, [(1, "A"), (2, "B"), (3, "C")])

    def test_execute_insert_many_rolls_back_entire_batch(self):
        self.assertTrue(self.db_manager.connect())
        with self.db_manager.engine.begin() as conn:
            conn.execute(text(
                "CREATE TABLE bulk_rollback_test (id INTEGER PRIMARY KEY, value TEXT UNIQUE)"
            ))

        rows = [
            {"id": 1, "value": "duplicate"},
            {"id": 2, "value": "duplicate"},
        ]
        self.assertEqual(
            self.db_manager.execute_insert_many("bulk_rollback_test", rows),
            -1,
        )
        result = self.db_manager.execute_query(
            "SELECT COUNT(*) FROM bulk_rollback_test"
        )
        self.assertEqual(result[0][0], 0)

    def test_execute_insert_many_retries_entire_batch_after_disconnect(self):
        manager = DatabaseManager(self.db_config)
        manager.engine = MagicMock()
        disconnected = OperationalError(
            "INSERT",
            {},
            Exception(2006, "server has gone away"),
        )
        successful_transaction = MagicMock()
        manager.engine.begin.side_effect = [disconnected, successful_transaction]
        manager._attempt_reconnect = Mock(return_value=True)

        rows = [{"id": 1, "value": "A"}, {"id": 2, "value": "B"}]
        self.assertEqual(manager.execute_insert_many("bulk_retry_test", rows), 2)
        self.assertEqual(manager.engine.begin.call_count, 2)
        manager._attempt_reconnect.assert_called_once_with("批量插入数据")


def run_async_test(coro):
    """运行异步测试的辅助函数"""
    return asyncio.get_event_loop().run_until_complete(coro)


if __name__ == '__main__':
    # 运行所有测试
    unittest.main(verbosity=2)
