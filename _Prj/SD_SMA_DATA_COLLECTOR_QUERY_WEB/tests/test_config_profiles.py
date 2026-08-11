from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch

from app.config_manager import ConfigManager, UnifiedConfigStore


def _write_profile(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def test_create_profile_uses_blank_query_template_with_current_runtime_settings(tmp_path: Path) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    _write_profile(
        config_dir / "source.json",
        {
            "version": 1,
            "name": "source",
            "app_settings": {
                "database": {
                    "type": "mysql",
                    "name": "prod_db",
                    "host": "192.168.1.10",
                    "port": 3306,
                    "username": "root",
                    "password": "secret",
                }
            },
            "opcua": {
                "endpoint_url": "opc.tcp://192.168.1.20:4840/",
                "username": "opc",
                "password": "pw",
            },
            "query_view": {
                "default_page_size": 25,
                "max_page_size": 400,
                "views": {
                    "table": {
                        "title": "Custom Table",
                        "description": "custom",
                        "time_field": "collection_time",
                        "columns": ["collection_time", "temp"],
                        "sort_by": "collection_time",
                        "sort_dir": "desc",
                        "page_size": 25,
                        "default_filters": [{"field": "temp", "op": "gt", "value": 10}],
                        "per_table": {"table_1": {"columns": ["temp"]}},
                        "per_group": {"GroupA": {"columns": [{"name": "temp"}]}},
                    },
                    "custom_alarm": {
                        "title": "Alarm",
                        "time_field": "ts",
                        "columns": ["ts", "code"],
                        "sort_by": "ts",
                        "sort_dir": "desc",
                        "page_size": 50,
                        "default_filters": [],
                        "per_table": {},
                        "per_group": {"AlarmGroup": {"columns": [{"name": "code"}]}},
                    },
                },
                "group_baselines": {"GroupA": "table_1"},
            },
            "plugins": {
                "modules": {
                    "general": {
                        "pages": {"1": {"bind_group": "GroupA"}},
                    }
                }
            },
        },
    )
    (config_dir / ".active_query_config").write_text("source.json", encoding="utf-8")

    store = UnifiedConfigStore(config_dir)
    result = store.create_profile("fresh.json")

    created = json.loads((config_dir / "fresh.json").read_text(encoding="utf-8"))
    assert result["status"] == "created"
    assert result["active"] == "fresh.json"
    assert created["app_settings"]["database"]["name"] == "prod_db"
    assert created["opcua"]["endpoint_url"] == "opc.tcp://192.168.1.20:4840/"
    assert created["opcua"]["poll_interval_ms"] == 500
    assert created["opcua"]["heartbeat_node"] == ""
    assert created["plugins"] == {"modules": {}}
    assert created["query_view"]["group_baselines"] == {}
    assert created["query_view"]["views"]["table"]["per_group"] == {}
    assert created["query_view"]["views"]["table"]["per_table"] == {}
    assert created["query_view"]["views"]["custom_alarm"]["per_group"] == {}


def test_delete_last_profile_resets_to_default_profile(tmp_path: Path) -> None:
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    _write_profile(
        config_dir / "last.json",
        {
            "version": 1,
            "name": "last",
            "app_settings": {"database": {"name": "will_be_cleared"}},
            "query_view": {
                "default_page_size": 10,
                "max_page_size": 100,
                "views": {
                    "table": {
                        "title": "Old Table",
                        "time_field": "collection_time",
                        "columns": [],
                        "sort_by": "collection_time",
                        "sort_dir": "desc",
                        "page_size": 10,
                        "default_filters": [],
                        "per_table": {},
                        "per_group": {"OldGroup": {"columns": []}},
                    }
                },
                "group_baselines": {"OldGroup": "old_table"},
            },
            "plugins": {"modules": {"legacy": {"pages": {"1": {}}}}},
        },
    )
    (config_dir / ".active_query_config").write_text("last.json", encoding="utf-8")

    store = UnifiedConfigStore(config_dir)
    result = store.delete_profile("last.json")

    assert result["status"] == "reset"
    assert result["active"] == "default.json"
    assert sorted(path.name for path in config_dir.glob("*.json")) == ["default.json"]

    recreated = json.loads((config_dir / "default.json").read_text(encoding="utf-8"))
    assert recreated["name"] == "default"
    assert recreated["app_settings"]["database"]["name"] == ""
    assert recreated["plugins"] == {"modules": {}}
    assert set(recreated["query_view"]["views"]) == {"table", "alarm", "audit"}


def test_empty_config_dir_bootstraps_usable_default_views(tmp_path: Path) -> None:
    config_dir = tmp_path / "config"
    store = UnifiedConfigStore(config_dir)

    assert store.get_active_profile_name() == "default.json"

    query_views = ConfigManager(store).get_query_views()
    assert set(query_views) == {"table", "alarm", "audit"}


def test_active_config_cache_isolated_and_invalidated_by_external_write(tmp_path: Path) -> None:
    config_dir = tmp_path / "config"
    store = UnifiedConfigStore(config_dir)

    with patch.object(store, "_load_json", wraps=store._load_json) as load_json:
        first, first_revision = store.get_active_config_with_revision()
        first["name"] = "mutated-by-caller"
        second, second_revision = store.get_active_config_with_revision()

        assert load_json.call_count == 1
        assert second["name"] == "default"
        assert second_revision == first_revision

        active_path = config_dir / "default.json"
        external = json.loads(active_path.read_text(encoding="utf-8"))
        external["name"] = "externally-updated-name-with-different-size"
        active_path.write_text(json.dumps(external, ensure_ascii=False, indent=2), encoding="utf-8")
        os.utime(active_path, None)

        updated, updated_revision = store.get_active_config_with_revision()
        assert load_json.call_count == 2
        assert updated["name"] == "default"
        assert updated_revision != first_revision


def test_active_config_cache_invalidates_when_profile_pointer_changes(tmp_path: Path) -> None:
    config_dir = tmp_path / "config"
    store = UnifiedConfigStore(config_dir)
    store.create_profile("second.json")
    store.set_active_profile("default.json")
    first, first_revision = store.get_active_config_with_revision()

    (config_dir / ".active_query_config").write_text("second.json", encoding="utf-8")
    second, second_revision = store.get_active_config_with_revision()

    assert first["name"] == "default"
    assert second["name"] == "second"
    assert second_revision != first_revision
