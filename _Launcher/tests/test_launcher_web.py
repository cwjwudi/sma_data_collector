from __future__ import annotations

import json

from fastapi.testclient import TestClient

from launcher_imports import ConfigImportManager
from launcher_security import LauncherSecurityStore
from launcher_web import create_management_app


class FakeSupervisor:
    def __init__(self) -> None:
        self.commands = []
        self.services = []

    def status(self):
        return {"launcher": {"state": "running"}, "services": self.services}

    def command(self, name, action):
        self.commands.append((name, action))
        return {"name": name, "state": action}

    def restart_if_running(self, names):
        self.commands.append(("restart_if_running", tuple(names)))


def test_status_is_public_but_actions_require_pin(tmp_path) -> None:
    supervisor = FakeSupervisor()
    security = LauncherSecurityStore(tmp_path / "security.json")
    (tmp_path / "static").mkdir(exist_ok=True)
    (tmp_path / "static" / "index.html").write_text("ok", encoding="utf-8")
    app = create_management_app(supervisor, security, ConfigImportManager(tmp_path), tmp_path / "static")
    with TestClient(app) as client:
        assert client.get("/api/launcher/status").status_code == 200
        assert client.post("/api/launcher/services/query_web/stop").status_code == 428
        response = client.post("/api/launcher/auth/setup", json={"pin": "123456"})
        assert response.status_code == 200
        response = client.post("/api/launcher/services/query_web/stop")
        assert response.status_code == 200
    assert supervisor.commands == [("query_web", "stop")]


def test_pin_can_be_disabled_before_setup_and_actions_are_open(tmp_path) -> None:
    supervisor = FakeSupervisor()
    security = LauncherSecurityStore(tmp_path / "security.json")
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("ok", encoding="utf-8")
    app = create_management_app(supervisor, security, ConfigImportManager(tmp_path), static)
    with TestClient(app) as client:
        response = client.post("/api/launcher/auth/disable")
        assert response.status_code == 200
        assert response.json()["pin_mode"] == "disabled"
        assert client.post("/api/launcher/services/query_web/stop").status_code == 200
        assert client.get("/api/launcher/auth/session").json()["unlocked"] is True


def test_foreign_origin_is_rejected(tmp_path) -> None:
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("ok", encoding="utf-8")
    app = create_management_app(
        FakeSupervisor(), LauncherSecurityStore(tmp_path / "security.json"), ConfigImportManager(tmp_path), static
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/launcher/auth/setup", json={"pin": "123456"}, headers={"Origin": "http://evil.example"}
        )
    assert response.status_code == 403


def test_actual_same_origin_is_accepted(tmp_path) -> None:
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("ok", encoding="utf-8")
    app = create_management_app(
        FakeSupervisor(), LauncherSecurityStore(tmp_path / "security.json"), ConfigImportManager(tmp_path), static
    )
    with TestClient(app, base_url="http://192.168.10.20:8090") as client:
        response = client.post(
            "/api/launcher/auth/setup", json={"pin": "123456"}, headers={"Origin": "http://192.168.10.20:8090"}
        )
    assert response.status_code == 200


def test_whole_folder_import_restarts_only_running_services(tmp_path) -> None:
    supervisor = FakeSupervisor()
    supervisor.services = [
        {
            "name": name,
            "desired_running": name != "report_copy",
            "pid": None if name == "report_copy" else 100,
            "state": "stopped" if name == "report_copy" else "running",
            "health_ready": name != "report_copy",
        }
        for name in ("collector_web", "query_web", "db_admin", "report_copy")
    ]
    source = tmp_path / "usb" / "config"
    payloads = {
        "collector": {"database": {}},
        "query_web": {"app_settings": {}},
        "db_admin": {"default_connection": {}},
        "report_copy": {"report_source_dir": "D:/Reports"},
    }
    for folder, payload in payloads.items():
        directory = source / folder
        directory.mkdir(parents=True)
        (directory / "default.json").write_text(json.dumps(payload), encoding="utf-8")
    importer = ConfigImportManager(tmp_path / "data")
    importer.update_settings([str(source.parent)])
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("ok", encoding="utf-8")
    app = create_management_app(supervisor, LauncherSecurityStore(tmp_path / "security.json"), importer, static)

    with TestClient(app) as client:
        assert client.post("/api/launcher/auth/disable").status_code == 200
        preview = client.post(
            "/api/launcher/import/inspect", json={"service": "all", "paths": [str(source)]}
        )
        assert preview.status_code == 200
        applied = client.post(
            "/api/launcher/import/apply", json={"preview_token": preview.json()["preview_token"]}
        )

    assert applied.status_code == 200
    assert applied.json()["restarted_services"] == ["collector_web", "query_web", "db_admin"]
    assert supervisor.commands[-1] == (
        "restart_if_running",
        ("collector_web", "query_web", "db_admin"),
    )
