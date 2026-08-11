"""数据库密码支持 SD_SMA_DB_PASSWORD 环境变量注入，配置文件不再需要明文口令。"""

import json
import os
import tempfile
import unittest
from unittest.mock import patch

from core.config_loader import ConfigLoader

MINIMAL_CONFIG = {
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
        "type": "mysql",
        "name": "test_db",
        "host": "127.0.0.1",
        "port": 3306,
        "username": "test_user",
        "password": "file_pw"
    }
}


class TestEnvDbPasswordOverride(unittest.TestCase):
    """SD_SMA_DB_PASSWORD 环境变量优先于配置文件中的 database.password"""

    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        json.dump(MINIMAL_CONFIG, self.temp_file)
        self.temp_file.close()

    def tearDown(self):
        os.unlink(self.temp_file.name)

    def test_env_var_overrides_config_password(self):
        """设置环境变量时使用环境变量中的密码"""
        with patch.dict(os.environ, {"SD_SMA_DB_PASSWORD": "env_pw"}):
            config = ConfigLoader.load_from_file(self.temp_file.name)
        self.assertEqual(config.database.password, "env_pw")
        stored = json.loads(open(self.temp_file.name, encoding="utf-8").read())
        self.assertNotIn("password", stored["database"])
        self.assertTrue(stored["database"]["password_enc"])

    def test_launcher_managed_connection_overrides_imported_account(self):
        env = {
            "SD_SMA_DB_HOST": "central-db",
            "SD_SMA_DB_PORT": "3307",
            "SD_SMA_DB_USERNAME": "central-user",
            "SD_SMA_DB_DATABASE": "central-name",
            "SD_SMA_DB_PASSWORD": "central-password",
        }
        with patch.dict(os.environ, env, clear=False):
            config = ConfigLoader.load_from_file(self.temp_file.name)
        self.assertEqual(config.database.host, "central-db")
        self.assertEqual(config.database.port, 3307)
        self.assertEqual(config.database.username, "central-user")
        self.assertEqual(config.database.name, "central-name")
        self.assertEqual(config.database.password, "central-password")

    def test_without_env_var_uses_config_password(self):
        """未设置环境变量时使用从旧配置自动迁移的密文"""
        env = {k: v for k, v in os.environ.items() if k != "SD_SMA_DB_PASSWORD"}
        with patch.dict(os.environ, env, clear=True):
            config = ConfigLoader.load_from_file(self.temp_file.name)
        self.assertEqual(config.database.password, "file_pw")

    def test_empty_env_var_falls_back_to_config(self):
        """环境变量为空字符串时使用从旧配置自动迁移的密文"""
        with patch.dict(os.environ, {"SD_SMA_DB_PASSWORD": ""}):
            config = ConfigLoader.load_from_file(self.temp_file.name)
        self.assertEqual(config.database.password, "file_pw")


if __name__ == '__main__':
    unittest.main()
