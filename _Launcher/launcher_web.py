from __future__ import annotations

import asyncio
import socket
import threading
from pathlib import Path
from typing import Any

import pymysql
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from launcher_imports import ConfigImportManager, FilesystemBrowserError
from launcher_security import LauncherSecurityStore


SESSION_COOKIE = "sd_sma_launcher_admin"
ALLOWED_ORIGINS = {"http://127.0.0.1:8090", "http://localhost:8090"}
MANAGED_DB_SERVICES = {"collector_web", "query_web", "db_admin"}


def create_management_app(
    supervisor: Any,
    security: LauncherSecurityStore,
    importer: ConfigImportManager,
    static_dir: Path,
) -> FastAPI:
    app = FastAPI(title="SD SMA Launcher", version="1.0")
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.middleware("http")
    async def local_origin_guard(request: Request, call_next: Any) -> Response:
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin", "")
            if origin and origin not in ALLOWED_ORIGINS:
                return Response("Forbidden origin", status_code=403)
        return await call_next(request)

    def require_admin(request: Request) -> str:
        token = request.cookies.get(SESSION_COOKIE)
        if not security.verify_session(token):
            raise HTTPException(401, "需要管理员 PIN 解锁")
        return str(token)

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(static_dir / "index.html")

    @app.get("/api/launcher/status")
    def status() -> dict[str, Any]:
        result = supervisor.status()
        result["security"] = {"pin_configured": security.pin_configured}
        return result

    @app.post("/api/launcher/auth/setup")
    async def setup_pin(request: Request, response: Response) -> dict[str, Any]:
        body = await request.json()
        try:
            token = security.setup_pin(str(body.get("pin", "")))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict", max_age=security.session_seconds)
        return {"ok": True, "unlocked": True}

    @app.post("/api/launcher/auth/unlock")
    async def unlock(request: Request, response: Response) -> dict[str, Any]:
        body = await request.json()
        try:
            token = security.unlock(str(body.get("pin", "")))
        except PermissionError as exc:
            raise HTTPException(429 if "秒后" in str(exc) else 401, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="strict", max_age=security.session_seconds)
        return {"ok": True, "unlocked": True}

    @app.post("/api/launcher/auth/lock")
    def lock(request: Request, response: Response) -> dict[str, Any]:
        security.lock(request.cookies.get(SESSION_COOKIE))
        response.delete_cookie(SESSION_COOKIE)
        return {"ok": True}

    @app.get("/api/launcher/auth/session")
    def session(request: Request) -> dict[str, Any]:
        return {"unlocked": security.verify_session(request.cookies.get(SESSION_COOKIE)), "pin_configured": security.pin_configured}

    @app.post("/api/launcher/services/{name}/{action}")
    def service_action(name: str, action: str, request: Request) -> dict[str, Any]:
        require_admin(request)
        try:
            return {"ok": True, "service": supervisor.command(name, action)}
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.get("/api/launcher/credentials")
    def credentials(request: Request) -> dict[str, Any]:
        require_admin(request)
        return security.public_credentials()

    @app.post("/api/launcher/credentials")
    async def save_credential(request: Request) -> dict[str, Any]:
        require_admin(request)
        body = await request.json()
        credential_id = str(body.get("id", ""))
        affected_before = security.services_for_credential(credential_id) if credential_id else []
        try:
            saved = security.upsert_credential(body)
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc
        affected = sorted(set(affected_before + security.services_for_credential(str(saved["id"]))))
        supervisor.restart_if_running(affected)
        return {"ok": True, "credential": saved, "restarted_services": affected}

    @app.delete("/api/launcher/credentials/{credential_id}")
    def delete_credential(credential_id: str, request: Request) -> dict[str, Any]:
        require_admin(request)
        affected = security.services_for_credential(credential_id)
        security.delete_credential(credential_id)
        supervisor.restart_if_running(affected)
        return {"ok": True, "restarted_services": affected}

    @app.put("/api/launcher/credentials/assignments/{service}")
    async def assign_credential(service: str, request: Request) -> dict[str, Any]:
        require_admin(request)
        if service not in MANAGED_DB_SERVICES:
            raise HTTPException(400, "该服务不使用 Launcher 数据库凭据")
        body = await request.json()
        credential_id = str(body.get("credential_id") or "") or None
        try:
            security.assign(service, credential_id)
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        supervisor.restart_if_running([service])
        return {"ok": True, "service": service, "credential_id": credential_id}

    @app.post("/api/launcher/credentials/{credential_id}/test")
    def test_credential(credential_id: str, request: Request) -> dict[str, Any]:
        require_admin(request)
        credential = security.credential_by_id(credential_id)
        if credential is None:
            raise HTTPException(404, "凭据档案不存在")
        try:
            connection = pymysql.connect(
                host=str(credential.get("host", "127.0.0.1")),
                port=int(credential.get("port", 3306)),
                user=str(credential.get("username", "root")),
                password=str(credential.get("password", "")),
                database=str(credential.get("database", "")) or None,
                connect_timeout=5,
                read_timeout=5,
                write_timeout=5,
            )
            connection.close()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(400, f"连接失败：{exc}") from exc
        return {"ok": True, "message": "数据库连接成功"}

    @app.get("/api/launcher/filesystem/roots")
    def filesystem_roots(request: Request) -> dict[str, Any]:
        require_admin(request)
        return {"roots": importer.roots()}

    @app.get("/api/launcher/filesystem/entries")
    def filesystem_entries(path: str, request: Request) -> dict[str, Any]:
        require_admin(request)
        try:
            return importer.entries(path)
        except FilesystemBrowserError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.get("/api/launcher/import/settings")
    def import_settings(request: Request) -> dict[str, Any]:
        require_admin(request)
        return importer.settings()

    @app.put("/api/launcher/import/settings")
    async def update_import_settings(request: Request) -> dict[str, Any]:
        require_admin(request)
        body = await request.json()
        try:
            return importer.update_settings(list(body.get("allowed_import_roots") or []))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.post("/api/launcher/import/inspect")
    async def inspect_import(request: Request) -> dict[str, Any]:
        require_admin(request)
        body = await request.json()
        try:
            return importer.inspect(str(body.get("service", "")), list(body.get("paths") or []))
        except (ValueError, FilesystemBrowserError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.post("/api/launcher/import/apply")
    async def apply_import(request: Request) -> dict[str, Any]:
        require_admin(request)
        body = await request.json()
        service_name = ""
        try:
            result = importer.apply(str(body.get("preview_token", "")))
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc
        service_name = str(result["service"])
        before = next(
            (item for item in supervisor.status()["services"] if item["name"] == service_name),
            {},
        )
        was_running = bool(before.get("desired_running") and before.get("pid"))
        if was_running:
            supervisor.restart_if_running([service_name])
            deadline = asyncio.get_running_loop().time() + 35.0
            while asyncio.get_running_loop().time() < deadline:
                current = next(
                    (item for item in supervisor.status()["services"] if item["name"] == service_name),
                    {},
                )
                if current.get("state") == "running" and current.get("health_ready"):
                    break
                if current.get("state") == "failed":
                    deadline = 0.0
                    break
                await asyncio.sleep(0.25)
            else:
                current = {}
            if not (current.get("state") == "running" and current.get("health_ready")):
                importer.rollback(result)
                supervisor.command(service_name, "start")
                raise HTTPException(500, "新配置健康检查失败，已恢复原配置并重新启动服务")
        result["restarted_if_running"] = was_running
        return result

    return app


class ManagementServer:
    def __init__(self, app: FastAPI, host: str = "127.0.0.1", port: int = 8090) -> None:
        self.host = host
        self.port = port
        self.server = uvicorn.Server(
            uvicorn.Config(app, host=host, port=port, log_level="info", access_log=False)
        )
        self.thread: threading.Thread | None = None

    def start(self) -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.2)
            if sock.connect_ex((self.host, self.port)) == 0:
                raise RuntimeError(f"管理端口已被占用：{self.host}:{self.port}")
        self.thread = threading.Thread(target=self.server.run, name="launcher-web", daemon=True)
        self.thread.start()
        deadline = threading.Event()
        for _ in range(100):
            if self.server.started:
                return
            if self.thread and not self.thread.is_alive():
                break
            deadline.wait(0.05)
        raise RuntimeError("Launcher 管理页面启动失败")

    def stop(self) -> None:
        self.server.should_exit = True
        if self.thread:
            self.thread.join(timeout=5.0)
