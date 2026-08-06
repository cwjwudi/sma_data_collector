from __future__ import annotations

from fastapi.testclient import TestClient

from launcher_imports import ConfigImportManager
from launcher_security import LauncherSecurityStore
from launcher_web import create_management_app


class FakeSupervisor:
    def __init__(self) -> None:
        self.commands = []

    def status(self):
        return {"launcher": {"state": "running"}, "services": []}

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
        assert client.post("/api/launcher/services/query_web/stop").status_code == 401
        response = client.post("/api/launcher/auth/setup", json={"pin": "123456"})
        assert response.status_code == 200
        response = client.post("/api/launcher/services/query_web/stop")
        assert response.status_code == 200
    assert supervisor.commands == [("query_web", "stop")]


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
