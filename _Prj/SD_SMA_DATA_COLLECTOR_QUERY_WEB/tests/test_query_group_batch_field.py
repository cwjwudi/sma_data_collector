from __future__ import annotations

import pytest

from app.config_manager import ConfigManager, UnifiedConfigStore


def test_group_batch_field_is_saved_and_resolved(tmp_path):
    store = UnifiedConfigStore(tmp_path / "config")
    manager = ConfigManager(store)

    manager.update_query_group_config(
        view_name="table",
        group="Data_Product",
        time_field="collection_time",
        batch_field="BatchCode",
        sort_by="collection_time",
        sort_dir="desc",
        page_size=50,
        columns=[
            {"name": "id", "label_en": "id", "label_zh": "id"},
            {"name": "BatchCode", "label_en": "BatchCode", "label_zh": "批次号"},
            {"name": "collection_time", "label_en": "collection_time", "label_zh": "采集时间"},
        ],
        baseline_table="Data_Product",
    )

    saved = manager.get_query_group_config("table", "Data_Product", "Data_Product")
    resolved = manager.resolve_query_view("table", table="Data_Product", group="Data_Product")

    assert saved["batch_field"] == "BatchCode"
    assert resolved["batch_field"] == "BatchCode"


def test_view_batch_source_is_saved_and_resolved(tmp_path):
    store = UnifiedConfigStore(tmp_path / "config")
    manager = ConfigManager(store)

    manager.update_query_batch_source("table", "ProductionOrder", "OrderNo")

    assert manager.get_query_batch_source("table") == {
        "view_name": "table",
        "table": "ProductionOrder",
        "field": "OrderNo",
    }
    assert manager.resolve_batch_source("table", "ProductHistory") == {
        "table": "ProductionOrder",
        "field": "OrderNo",
    }


def test_view_batch_source_requires_table_and_field_together(tmp_path):
    store = UnifiedConfigStore(tmp_path / "config")
    manager = ConfigManager(store)

    with pytest.raises(ValueError, match="both be set"):
        manager.update_query_batch_source("table", "ProductionOrder", "")


def test_group_batch_source_overrides_view_source_when_present(tmp_path):
    store = UnifiedConfigStore(tmp_path / "config")
    manager = ConfigManager(store)
    manager.update_query_batch_source("table", "ProductionOrder", "OrderNo")
    config = manager.get_query_view_config()
    config["views"]["table"]["per_group"]["SpecialHistory"] = {
        "batch_source": {"table": "SpecialOrder", "field": "SpecialNo"}
    }
    manager.save_query_view_config(config)

    assert manager.resolve_batch_source("table", "SpecialHistory") == {
        "table": "SpecialOrder",
        "field": "SpecialNo",
    }
