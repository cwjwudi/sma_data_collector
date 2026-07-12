"""QueryDatabase 的 MySQL 连接密码支持 SD_SMA_DB_PASSWORD 环境变量注入。"""

from __future__ import annotations

import os
from unittest.mock import patch

from app.database import QueryDatabase

MYSQL_CONFIG = {
    "type": "mysql",
    "host": "127.0.0.1",
    "port": 3306,
    "username": "test_user",
    "password": "file_pw",
    "name": "test_db",
}


def test_env_var_overrides_config_password() -> None:
    with patch.dict(os.environ, {"SD_SMA_DB_PASSWORD": "env_pw"}):
        db = QueryDatabase(dict(MYSQL_CONFIG))
    assert db.engine.url.password == "env_pw"


def test_without_env_var_uses_config_password() -> None:
    env = {k: v for k, v in os.environ.items() if k != "SD_SMA_DB_PASSWORD"}
    with patch.dict(os.environ, env, clear=True):
        db = QueryDatabase(dict(MYSQL_CONFIG))
    assert db.engine.url.password == "file_pw"


def test_empty_env_var_falls_back_to_config() -> None:
    with patch.dict(os.environ, {"SD_SMA_DB_PASSWORD": ""}):
        db = QueryDatabase(dict(MYSQL_CONFIG))
    assert db.engine.url.password == "file_pw"
