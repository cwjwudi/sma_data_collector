from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app import main
from app.plugin_opcua_monitor import PluginRuntimeSnapshot


def test_runtime_state_revision_returns_lightweight_unchanged_response() -> None:
    monitor = MagicMock()
    monitor.get_runtime.return_value = PluginRuntimeSnapshot(
        plugin_key="general_1",
        page=2,
        total_pages=3,
        total_records=25,
        rows=[{"BatchCode": "B01"}],
        revision=7,
    )
    client = TestClient(main.app, client=("127.0.0.1", 50000))

    with patch("app.main._plugin_opcua_monitor", monitor):
        unchanged = client.get("/api/plugins/runtime-state/general_1?since_revision=7")
        changed = client.get("/api/plugins/runtime-state/general_1?since_revision=6")
        legacy = client.get("/api/plugins/runtime-state/general_1")

    assert unchanged.status_code == 200
    assert unchanged.json() == {
        "plugin_key": "general_1",
        "revision": 7,
        "changed": False,
    }
    assert changed.json()["changed"] is True
    assert changed.json()["rows"] == [{"BatchCode": "B01"}]
    assert legacy.json()["changed"] is True
    assert legacy.json()["revision"] == 7


def test_runtime_state_without_snapshot_supports_revision_zero() -> None:
    monitor = MagicMock()
    monitor.get_runtime.return_value = None
    client = TestClient(main.app, client=("127.0.0.1", 50001))

    with (
        patch("app.main._plugin_opcua_monitor", monitor),
        patch(
            "app.main._resolve_plugin_binding",
            return_value={
                "plugin_key": "general_1",
                "bind_group": "Data_Batch",
                "table_list_writeback": {
                    "enabled": True,
                    "mode": "advanced",
                    "advanced": {"query_node": "ns=2;s=Query"},
                },
            },
        ),
    ):
        response = client.get("/api/plugins/runtime-state/general_1?since_revision=0")

    assert response.status_code == 200
    assert response.json() == {
        "plugin_key": "general_1",
        "revision": 0,
        "changed": False,
    }
