from pathlib import Path

import pytest

from core.config_loader import ConfigLoader
from database.db_manager import DatabaseManager
from web_config.config_manager import CollectorConfigManager


def _payload(index_columns):
    return {
        "points": [
            {"name": "SensorValue", "path": "ns=6;s=::Test:SensorValue", "description": "value"},
            {"name": "OtherPoint", "path": "ns=6;s=::Test:OtherPoint", "description": "other"},
        ],
        "groups": [
            {
                "name": "Data_Test",
                "interval_seconds": 1,
                "trigger": "time",
                "description": "test",
                "data_points": ["SensorValue"],
                "indexes": [
                    {
                        "name": "idx_test_columns",
                        "columns": index_columns,
                        "unique": False,
                        "index_type": "btree",
                    }
                ],
            }
        ],
        "communications": [
            {
                "name": "PLC_Test",
                "type": "opcua",
                "host": "127.0.0.1",
                "port": 4840,
            }
        ],
        "connections": [
            {
                "name": "Connection_Test",
                "communication": "PLC_Test",
                "data_groups": ["Data_Test"],
            }
        ],
        "database": {
            "type": "sqlite",
            "name": ":memory:",
            "data_groups": ["Data_Test"],
        },
    }


@pytest.mark.parametrize(
    "columns",
    [
        ["collection_time"],
        ["created_at"],
        ["collection_time", "created_at"],
        ["SensorValue", "collection_time"],
    ],
)
def test_runtime_loader_accepts_fixed_and_composite_index_columns(columns):
    config = ConfigLoader._parse_config(_payload(columns))
    assert config.groups[0].indexes[0].columns == columns


@pytest.mark.parametrize("column", ["create_time", "OtherPoint", "missing_column"])
def test_runtime_loader_rejects_unknown_or_non_group_index_columns(column):
    with pytest.raises(ValueError, match="不存在的点位或固定字段"):
        ConfigLoader._parse_config(_payload([column]))


def test_web_config_validation_accepts_fixed_index_columns(tmp_path):
    manager = CollectorConfigManager(tmp_path)
    assert manager.validate_template(
        _payload(["SensorValue", "collection_time", "created_at"])
    ) == {"ok": True}


def test_web_config_validation_rejects_create_time(tmp_path):
    manager = CollectorConfigManager(tmp_path)
    with pytest.raises(ValueError, match="不存在的点位或固定字段"):
        manager.validate_template(_payload(["create_time"]))


def test_sqlite_creates_indexes_on_both_fixed_time_columns(tmp_path):
    manager = DatabaseManager({"type": "sqlite", "name": str(tmp_path / "indexes.db")})
    assert manager.connect()
    try:
        assert manager.create_data_table("Data_Test", {"SensorValue": "REAL"})
        manager.create_indexes(
            "Data_Test",
            [
                {
                    "name": "idx_collection_time",
                    "columns": ["collection_time"],
                    "index_type": "btree",
                },
                {
                    "name": "idx_sensor_created",
                    "columns": ["SensorValue", "created_at"],
                    "index_type": "btree",
                },
            ],
        )

        collection_columns = manager.execute_query("PRAGMA index_info(`idx_collection_time`)")
        composite_columns = manager.execute_query("PRAGMA index_info(`idx_sensor_created`)")
        assert [row[2] for row in collection_columns] == ["collection_time"]
        assert [row[2] for row in composite_columns] == ["SensorValue", "created_at"]
    finally:
        manager.disconnect()


def test_index_dialog_exposes_only_fixed_and_current_group_columns():
    source = (
        Path(__file__).resolve().parents[1] / "web_config" / "static" / "config.js"
    ).read_text(encoding="utf-8")
    assert 'value: "collection_time"' in source
    assert 'value: "created_at"' in source
    assert "groupPointNames.has(item.value)" in source
    assert "createMultiSelect(indexColumnOptions" in source
