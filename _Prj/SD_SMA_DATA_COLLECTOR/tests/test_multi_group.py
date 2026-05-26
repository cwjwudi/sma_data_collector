"""
多组数据采集功能测试
测试程序对多个data_group的支持能力
"""

import unittest
import tempfile
import os
import json
from datetime import datetime
from core.config_loader import ConfigLoader
from core.config_models import DatabaseConfig


class TestMultiGroupSupport(unittest.TestCase):
    """测试多组采集支持"""
    
    def setUp(self):
        """测试前准备"""
        pass
        
    def tearDown(self):
        """测试后清理"""
        pass
    
    def _create_temp_config(self, config_data):
        """创建临时配置文件"""
        temp_config = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        json.dump(config_data, temp_config)
        temp_config.close()
        return temp_config.name
    
    def _cleanup_temp_file(self, file_path):
        """清理临时文件"""
        if os.path.exists(file_path):
            os.unlink(file_path)
    
    def test_backward_compatibility_single_group(self):
        """测试向后兼容性 - 单个数据组"""
        config_data = {
            "points": [
                {
                    "name": "test_point",
                    "path": "ns=6;s=test.path",
                    "description": "测试数据点"
                }
            ],
            "groups": [
                {
                    "name": "test_group",
                    "interval_seconds": 5,
                    "trigger": "time",
                    "description": "测试数据组",
                    "data_points": ["test_point"]
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_group": "test_group"  # 旧格式
            }
        }
        
        temp_file = self._create_temp_config(config_data)
        
        try:
            # 加载配置
            config = ConfigLoader.load_from_file(temp_file)
            
            # 验证配置正确加载且保持向后兼容
            self.assertEqual(len(config.database.data_groups), 1)
            self.assertEqual(config.database.data_groups[0], "test_group")
        finally:
            self._cleanup_temp_file(temp_file)
    
    def test_multi_group_configuration(self):
        """测试多组配置"""
        config_data = {
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=path1",
                    "description": "数据点1"
                },
                {
                    "name": "point2", 
                    "path": "ns=6;s=path2",
                    "description": "数据点2"
                },
                {
                    "name": "point3",
                    "path": "ns=6;s=path3", 
                    "description": "数据点3"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "组1",
                    "data_points": ["point1", "point2"]
                },
                {
                    "name": "group2",
                    "interval_seconds": 2,
                    "trigger": "time", 
                    "description": "组2",
                    "data_points": ["point2", "point3"]
                },
                {
                    "name": "group3",
                    "interval_seconds": 0,
                    "trigger": "variable",
                    "description": "组3",
                    "data_points": ["point1"],
                    "trigger_point": "point3",
                    "trigger_interval_seconds": 0.5
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "multi_test.db",
                "data_groups": ["group1", "group2", "group3"]  # 新格式
            }
        }
        
        temp_file = self._create_temp_config(config_data)
        
        try:
            # 加载配置
            config = ConfigLoader.load_from_file(temp_file)
            
            # 验证多组配置正确加载
            self.assertEqual(len(config.database.data_groups), 3)
            self.assertIn("group1", config.database.data_groups)
            self.assertIn("group2", config.database.data_groups)
            self.assertIn("group3", config.database.data_groups)
            
            # 验证所有引用的数据点都存在
            point_names = {point.name for point in config.points}
            for group in config.groups:
                for point_name in group.data_points:
                    self.assertIn(point_name, point_names)
        finally:
            self._cleanup_temp_file(temp_file)
    
    def test_empty_groups_handling(self):
        """测试空数据组处理"""
        config_data = {
            "points": [
                {
                    "name": "test_point",
                    "path": "ns=6;s=test.path",
                    "description": "测试数据点"
                }
            ],
            "groups": [
                {
                    "name": "test_group",
                    "interval_seconds": 5,
                    "trigger": "time",
                    "description": "测试数据组",
                    "data_points": ["test_point"]
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": []  # 空数组
            }
        }
        
        temp_file = self._create_temp_config(config_data)
        
        try:
            # 加载配置应该成功
            config = ConfigLoader.load_from_file(temp_file)
            self.assertEqual(len(config.database.data_groups), 0)
        finally:
            self._cleanup_temp_file(temp_file)
    
    def test_database_config_default_values(self):
        """测试数据库配置默认值"""
        # 测试DatabaseConfig的默认值处理
        db_config = DatabaseConfig(
            type="sqlite",
            name="test.db"
        )
        
        # 默认情况下data_groups应该是空列表而不是None
        self.assertEqual(db_config.data_groups, [])
        self.assertIsNotNone(db_config.data_groups)
        
        # 测试显式传入None的情况
        db_config_none = DatabaseConfig(
            type="sqlite",
            name="test.db",
            data_groups=None
        )
        self.assertEqual(db_config_none.data_groups, [])


if __name__ == '__main__':
    unittest.main()
