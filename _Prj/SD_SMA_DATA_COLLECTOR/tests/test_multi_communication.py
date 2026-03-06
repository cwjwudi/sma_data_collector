"""
多通信功能测试
测试communications和connections配置的正确性和功能
"""

import unittest
import tempfile
import json
import os
from core.config_loader import ConfigLoader
from core.config_models import Communication, Connection


class TestMultiCommunication(unittest.TestCase):
    """多通信功能测试类"""
    
    def setUp(self):
        """测试前置条件"""
        # 创建临时配置文件
        self.temp_config = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        
    def tearDown(self):
        """测试后清理"""
        if os.path.exists(self.temp_config.name):
            os.unlink(self.temp_config.name)
    
    def test_basic_multi_communication_config(self):
        """测试基本的多通信配置"""
        config_data = {
            "communications": [
                {
                    "name": "PLC1",
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4840
                },
                {
                    "name": "PLC2", 
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4841
                }
            ],
            "connections": [
                {
                    "name": "conn1",
                    "communication": "PLC1",
                    "data_groups": ["group1"]
                },
                {
                    "name": "conn2",
                    "communication": "PLC2", 
                    "data_groups": ["group2"]
                }
            ],
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=::Test:point1",
                    "description": "测试点1"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组1",
                    "data_points": ["point1"],
                    "trigger_point": None
                },
                {
                    "name": "group2",
                    "interval_seconds": 2,
                    "trigger": "time", 
                    "description": "测试组2",
                    "data_points": ["point1"],
                    "trigger_point": None
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": ["group1", "group2"]
            }
        }
        
        # 写入配置文件
        json.dump(config_data, self.temp_config)
        self.temp_config.close()
        
        # 加载配置
        config = ConfigLoader.load_from_file(self.temp_config.name)
        
        # 验证配置
        self.assertEqual(len(config.communications), 2)
        self.assertEqual(len(config.connections), 2)
        
        # 验证通信配置
        plc1 = next(c for c in config.communications if c.name == "PLC1")
        self.assertEqual(plc1.type, "opcua")
        self.assertEqual(plc1.host, "127.0.0.1")
        self.assertEqual(plc1.port, 4840)
        self.assertEqual(plc1.server_url, "opc.tcp://127.0.0.1:4840")
        
        plc2 = next(c for c in config.communications if c.name == "PLC2")
        self.assertEqual(plc2.port, 4841)
        self.assertEqual(plc2.server_url, "opc.tcp://127.0.0.1:4841")
        
        # 验证连接配置
        conn1 = next(c for c in config.connections if c.name == "conn1")
        self.assertEqual(conn1.communication, "PLC1")
        self.assertEqual(conn1.data_groups, ["group1"])
        
        conn2 = next(c for c in config.connections if c.name == "conn2")
        self.assertEqual(conn2.communication, "PLC2")
        self.assertEqual(conn2.data_groups, ["group2"])
        
        # 验证映射关系
        self.assertEqual(config.get_groups_for_communication("PLC1"), ["group1"])
        self.assertEqual(config.get_groups_for_communication("PLC2"), ["group2"])
        self.assertEqual(config.get_communication_for_group("group1"), "PLC1")
        self.assertEqual(config.get_communication_for_group("group2"), "PLC2")
    
    def test_communication_name_uniqueness_validation(self):
        """测试通信名称唯一性验证"""
        config_data = {
            "communications": [
                {
                    "name": "PLC1",
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4840
                },
                {
                    "name": "PLC1",  # 重复名称
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4841
                }
            ],
            "connections": [],
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=::Test:point1",
                    "description": "测试点"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["point1"],
                    "trigger_point": None
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": ["group1"]
            }
        }
        
        # 写入配置文件
        json.dump(config_data, self.temp_config)
        self.temp_config.close()
        
        # 应该抛出异常
        with self.assertRaises(ValueError) as context:
            ConfigLoader.load_from_file(self.temp_config.name)
        
        self.assertIn("通信名称必须唯一", str(context.exception))
    
    def test_connection_name_uniqueness_validation(self):
        """测试连接名称唯一性验证"""
        config_data = {
            "communications": [
                {
                    "name": "PLC1",
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4840
                }
            ],
            "connections": [
                {
                    "name": "conn1",
                    "communication": "PLC1",
                    "data_groups": ["group1"]
                },
                {
                    "name": "conn1",  # 重复名称
                    "communication": "PLC1",
                    "data_groups": ["group2"]
                }
            ],
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=::Test:point1",
                    "description": "测试点"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组1",
                    "data_points": ["point1"],
                    "trigger_point": None
                },
                {
                    "name": "group2",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组2",
                    "data_points": ["point1"],
                    "trigger_point": None
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": ["group1", "group2"]
            }
        }
        
        json.dump(config_data, self.temp_config)
        self.temp_config.close()
        
        with self.assertRaises(ValueError) as context:
            ConfigLoader.load_from_file(self.temp_config.name)
        
        self.assertIn("连接名称必须唯一", str(context.exception))
    
    def test_invalid_communication_reference(self):
        """测试无效的通信引用"""
        config_data = {
            "communications": [
                {
                    "name": "PLC1",
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4840
                }
            ],
            "connections": [
                {
                    "name": "conn1",
                    "communication": "PLC2",  # 不存在的通信
                    "data_groups": ["group1"]
                }
            ],
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=::Test:point1",
                    "description": "测试点"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["point1"],
                    "trigger_point": None
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": ["group1"]
            }
        }
        
        json.dump(config_data, self.temp_config)
        self.temp_config.close()
        
        with self.assertRaises(ValueError) as context:
            ConfigLoader.load_from_file(self.temp_config.name)
        
        self.assertIn("引用了不存在的通信", str(context.exception))
    
    def test_invalid_group_reference(self):
        """测试无效的数据组引用"""
        config_data = {
            "communications": [
                {
                    "name": "PLC1",
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4840
                }
            ],
            "connections": [
                {
                    "name": "conn1",
                    "communication": "PLC1",
                    "data_groups": ["group2"]  # 不存在的数据组
                }
            ],
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=::Test:point1",
                    "description": "测试点"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["point1"],
                    "trigger_point": None
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": ["group1"]
            }
        }
        
        json.dump(config_data, self.temp_config)
        self.temp_config.close()
        
        with self.assertRaises(ValueError) as context:
            ConfigLoader.load_from_file(self.temp_config.name)
        
        self.assertIn("引用了不存在的数据组", str(context.exception))
    
    def test_duplicate_group_reference(self):
        """测试数据组被多次引用"""
        config_data = {
            "communications": [
                {
                    "name": "PLC1",
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4840
                },
                {
                    "name": "PLC2",
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4841
                }
            ],
            "connections": [
                {
                    "name": "conn1",
                    "communication": "PLC1",
                    "data_groups": ["group1"]  # 第一次引用
                },
                {
                    "name": "conn2",
                    "communication": "PLC2",
                    "data_groups": ["group1"]  # 第二次引用
                }
            ],
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=::Test:point1",
                    "description": "测试点"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["point1"],
                    "trigger_point": None
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": ["group1"]
            }
        }
        
        json.dump(config_data, self.temp_config)
        self.temp_config.close()
        
        with self.assertRaises(ValueError) as context:
            ConfigLoader.load_from_file(self.temp_config.name)
        
        self.assertIn("被多个连接引用", str(context.exception))
    
    def test_missing_group_reference(self):
        """测试有数据组未被引用"""
        config_data = {
            "communications": [
                {
                    "name": "PLC1",
                    "type": "opcua",
                    "host": "127.0.0.1",
                    "port": 4840
                }
            ],
            "connections": [
                {
                    "name": "conn1",
                    "communication": "PLC1",
                    "data_groups": ["group1"]  # 只引用了group1
                }
            ],
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=::Test:point1",
                    "description": "测试点"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组1",
                    "data_points": ["point1"],
                    "trigger_point": None
                },
                {
                    "name": "group2",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组2",
                    "data_points": ["point1"],
                    "trigger_point": None
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": ["group1", "group2"]  # 数据库引用了group2但连接没引用
            }
        }
        
        json.dump(config_data, self.temp_config)
        self.temp_config.close()
        
        with self.assertRaises(ValueError) as context:
            ConfigLoader.load_from_file(self.temp_config.name)
        
        self.assertIn("未被任何连接引用", str(context.exception))
    
    def test_backward_compatibility(self):
        """测试向后兼容性 - 旧配置格式仍应工作"""
        # 使用旧的配置格式（只有opcua字段，没有communications和connections）
        config_data = {
            "opcua": {
                "host": "127.0.0.1",
                "port": 4840
            },
            "points": [
                {
                    "name": "point1",
                    "path": "ns=6;s=::Test:point1",
                    "description": "测试点"
                }
            ],
            "groups": [
                {
                    "name": "group1",
                    "interval_seconds": 1,
                    "trigger": "time",
                    "description": "测试组",
                    "data_points": ["point1"],
                    "trigger_point": None
                }
            ],
            "database": {
                "type": "sqlite",
                "name": "test.db",
                "data_groups": ["group1"]
            }
        }
        
        json.dump(config_data, self.temp_config)
        self.temp_config.close()
        
        # 应该能正常加载并自动创建默认通信和连接
        config = ConfigLoader.load_from_file(self.temp_config.name)
        
        # 验证自动创建的默认通信
        self.assertEqual(len(config.communications), 1)
        default_comm = config.communications[0]
        self.assertEqual(default_comm.name, "default")
        self.assertEqual(default_comm.type, "opcua")
        self.assertEqual(default_comm.host, "127.0.0.1")
        self.assertEqual(default_comm.port, 4840)
        
        # 验证自动创建的默认连接
        self.assertEqual(len(config.connections), 1)
        default_conn = config.connections[0]
        self.assertEqual(default_conn.name, "default_connection")
        self.assertEqual(default_conn.communication, "default")
        self.assertEqual(default_conn.data_groups, ["group1"])
        
        # 验证映射关系
        self.assertEqual(config.get_groups_for_communication("default"), ["group1"])
        self.assertEqual(config.get_communication_for_group("group1"), "default")


if __name__ == '__main__':
    unittest.main()
