from unittest.mock import MagicMock, patch
from pathlib import Path

import pytest
from sqlalchemy.exc import OperationalError

from core.config_loader import ConfigLoader
from database.db_manager import DatabaseManager


def _mysql_config(auto_create=True):
    return {
        "type": "mysql",
        "name": "collector_test",
        "host": "127.0.0.1",
        "port": 3306,
        "username": "root",
        "password": "secret",
        "auto_create": auto_create,
    }


def _working_engine():
    engine = MagicMock()
    connection = MagicMock()
    context = MagicMock()
    context.__enter__.return_value = connection
    context.__exit__.return_value = False
    engine.connect.return_value = context
    return engine, connection


def _unknown_database_error():
    return OperationalError(
        "SELECT 1",
        {},
        Exception(1049, "Unknown database 'collector_test'"),
    )


def test_loader_defaults_auto_create_to_false_and_accepts_boolean_true():
    payload = {"database": {"type": "mysql", "name": "collector_test"}}
    assert ConfigLoader._parse_config(payload).database.auto_create is False

    payload["database"]["auto_create"] = True
    assert ConfigLoader._parse_config(payload).database.auto_create is True


def test_loader_rejects_non_boolean_auto_create():
    payload = {
        "database": {
            "type": "mysql",
            "name": "collector_test",
            "auto_create": "true",
        }
    }
    with pytest.raises(ValueError, match="database.auto_create"):
        ConfigLoader._parse_config(payload)


@patch("database.db_manager.MYSQL_AVAILABLE", True)
def test_connect_creates_missing_mysql_database_then_reconnects():
    manager = DatabaseManager(_mysql_config(auto_create=True))
    missing_engine = MagicMock()
    missing_engine.connect.side_effect = _unknown_database_error()
    admin_engine, admin_connection = _working_engine()
    target_engine, _ = _working_engine()

    manager._create_engine = MagicMock(
        side_effect=[missing_engine, admin_engine, target_engine]
    )
    manager._initialize_table_dates = MagicMock()

    assert manager.connect() is True
    assert manager.engine is target_engine
    assert missing_engine.dispose.call_count == 1
    assert admin_engine.dispose.call_count == 1
    assert manager._create_engine.call_count == 3
    assert manager._create_engine.call_args_list[1].kwargs == {
        "isolation_level": "AUTOCOMMIT"
    }

    create_sql = str(admin_connection.execute.call_args.args[0])
    assert "CREATE DATABASE IF NOT EXISTS `collector_test`" in create_sql
    assert "CHARACTER SET utf8mb4" in create_sql
    assert "COLLATE utf8mb4_unicode_ci" in create_sql


@pytest.mark.parametrize(
    ("auto_create", "error_code"),
    [(False, 1049), (True, 1045), (True, 2003)],
)
@patch("database.db_manager.MYSQL_AVAILABLE", True)
def test_connect_does_not_create_for_disabled_or_unrelated_errors(
    auto_create, error_code
):
    manager = DatabaseManager(_mysql_config(auto_create=auto_create))
    failed_engine = MagicMock()
    failed_engine.connect.side_effect = OperationalError(
        "SELECT 1", {}, Exception(error_code, "connection failed")
    )
    manager._create_engine = MagicMock(return_value=failed_engine)

    assert manager.connect() is False
    assert manager._create_engine.call_count == 1


def test_mysql_database_identifier_is_safely_quoted():
    assert DatabaseManager._quote_mysql_identifier("name`part") == "`name``part`"
    with pytest.raises(ValueError):
        DatabaseManager._quote_mysql_identifier("")
    with pytest.raises(ValueError):
        DatabaseManager._quote_mysql_identifier("x" * 65)


def test_config_ui_warns_about_create_permission_and_recommends_root():
    source = (
        Path(__file__).resolve().parents[1] / "web_config" / "static" / "config.js"
    ).read_text(encoding="utf-8")
    assert "自动创建数据库及数据表（仅 MySQL）" in source
    assert "服务器 CREATE 权限" in source
    assert "推荐使用 ROOT" in source
