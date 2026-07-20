import json

from web_config.config_manager import CollectorConfigManager


def _payload(log_level: str) -> dict:
    return {
        "communications": [],
        "connections": [],
        "points": [],
        "groups": [],
        "database": {
            "type": "sqlite",
            "name": ":memory:",
            "data_groups": [],
        },
        "logging": {"level": log_level},
    }


def test_overwrite_backup_copies_content_without_copying_metadata(tmp_path, monkeypatch):
    manager = CollectorConfigManager(tmp_path)
    original = _payload("INFO")
    updated = _payload("DEBUG")

    manager.write_collector_config(original, "collector.json")

    def fail_if_copy2_is_used(*_args, **_kwargs):
        raise OSError(127, "The specified procedure could not be found")

    monkeypatch.setattr("web_config.config_manager.shutil.copy2", fail_if_copy2_is_used)
    target = manager.write_collector_config(updated, "collector.json")

    backups = list((tmp_path / "_backup").glob("collector_*.json"))
    assert len(backups) == 1
    assert json.loads(backups[0].read_text(encoding="utf-8")) == original
    assert json.loads(target.read_text(encoding="utf-8")) == updated
