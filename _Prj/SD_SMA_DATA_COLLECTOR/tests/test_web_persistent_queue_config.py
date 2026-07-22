from web_config.config_manager import CollectorConfigManager


def test_web_config_preserves_persistent_queue_settings(tmp_path):
    manager = CollectorConfigManager(tmp_path)
    payload = manager.default_payload()
    payload["database"].update({"type": "sqlite", "name": ":memory:"})
    payload["persistent_queue"] = {
        "enabled": True,
        "path": "runtime/queue/custom.db",
        "synchronous": "NORMAL",
        "busy_timeout_ms": 2500,
        "lease_seconds": 45,
        "retry_interval_seconds": 3,
        "max_retry_interval_seconds": 90,
        "max_attempts": 8,
        "completed_retention_days": 2,
        "cleanup_interval_seconds": 120,
        "max_queue_rows": 50000,
    }

    sanitized, _ = manager.sanitize_for_ui(payload)
    assert sanitized["persistent_queue"] == payload["persistent_queue"]
    assert manager.validate_template(sanitized) == {"ok": True}

    target = manager.write_collector_config(sanitized, "persistent.json")
    loaded = manager.load_config_file(target.name)
    assert loaded["payload"]["persistent_queue"] == payload["persistent_queue"]


def test_web_config_supplies_disabled_persistent_queue_defaults():
    sanitized, _ = CollectorConfigManager.sanitize_for_ui({})

    assert sanitized["persistent_queue"]["enabled"] is False
    assert sanitized["persistent_queue"]["synchronous"] == "FULL"
    assert sanitized["persistent_queue"]["max_queue_rows"] == 1000000
