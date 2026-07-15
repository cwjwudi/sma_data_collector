from __future__ import annotations

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
