from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config_manager import CollectorConfigManager
from .models import (
    ConfigExportRequest,
    ConfigValidateRequest,
    ConfigWriteRequest,
    OpcUaConnectRequest,
)
from .opcua_browser import OpcUaBrowserService

BASE_DIR = Path(__file__).resolve().parent
COLLECTOR_ROOT = BASE_DIR.parent
CONFIG_DIR = BASE_DIR / "config"
APP_SETTINGS_PATH = CONFIG_DIR / "app_settings.json"
TEMPLATE_PATH = CONFIG_DIR / "collector_config_template.json"


def _load_settings() -> dict[str, Any]:
    if not APP_SETTINGS_PATH.exists():
        return {}
    with APP_SETTINGS_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return {}
    return data


settings = _load_settings()
# 按需求固定读取当前采集程序 config 目录，不允许切换到其他目录。
collector_config_dir = (COLLECTOR_ROOT / "config").resolve()
export_dir = Path(settings.get("export_dir", str((CONFIG_DIR / "exports").resolve())))

cfg = CollectorConfigManager(
    template_path=TEMPLATE_PATH,
    collector_config_dir=collector_config_dir,
)
opcua_browser = OpcUaBrowserService()

app = FastAPI(title="SD SMA Collector Config Web", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok"}


@app.get("/api/config/template")
def get_template() -> dict[str, Any]:
    try:
        return cfg.get_template()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/config/files")
def list_config_files() -> dict[str, Any]:
    try:
        return {"files": cfg.list_config_files()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/config/file")
def get_config_file(filename: str) -> dict[str, Any]:
    try:
        return cfg.load_config_file(filename)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/config/file")
def delete_config_file(filename: str) -> dict[str, Any]:
    try:
        path = cfg.delete_config_file(filename)
        return {"status": "deleted", "path": str(path)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config/file/delete")
def delete_config_file_post(body: dict[str, Any]) -> dict[str, Any]:
    try:
        filename = str(body.get("filename", "")).strip()
        if not filename:
            raise ValueError("filename 不能为空")
        path = cfg.delete_config_file(filename)
        return {"status": "deleted", "path": str(path)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config/template")
def save_template(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        cfg.save_template(payload)
        return {"status": "saved"}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config/validate")
def validate_template(req: ConfigValidateRequest) -> dict[str, Any]:
    try:
        return cfg.validate_template(req.payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config/export")
def export_config(req: ConfigExportRequest) -> dict[str, Any]:
    try:
        export_dir.mkdir(parents=True, exist_ok=True)
        safe_name = cfg.sanitize_filename(req.filename)
        path = cfg.export_to_path(req.payload, export_dir / safe_name)
        return {"status": "exported", "path": str(path)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config/write")
def write_config(req: ConfigWriteRequest) -> dict[str, Any]:
    try:
        path = cfg.write_collector_config(payload=req.payload, filename=req.filename)
        return {"status": "written", "path": str(path)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config/points/from-node")
def append_point_from_node(body: dict[str, Any]) -> dict[str, Any]:
    try:
        payload = body.get("payload", {})
        node_id = str(body.get("node_id", "")).strip()
        display_name = str(body.get("display_name", "")).strip()
        description = str(body.get("description", "")).strip()
        datatype = str(body.get("datatype", "")).strip()
        if not node_id:
            raise ValueError("node_id 不能为空")

        point_item = cfg.build_point_from_node(
            node_id=node_id,
            display_name=display_name or node_id,
            description=description,
            datatype=datatype or None,
        )
        new_payload = cfg.append_point(payload, point_item)
        return {"status": "ok", "point": point_item, "payload": new_payload}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/opcua/status")
def opcua_status() -> dict[str, Any]:
    return opcua_browser.status()


@app.post("/api/opcua/connect")
def opcua_connect(req: OpcUaConnectRequest) -> dict[str, Any]:
    try:
        return opcua_browser.connect(host=req.host, port=req.port)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"连接失败: {exc}") from exc


@app.post("/api/opcua/disconnect")
def opcua_disconnect() -> dict[str, Any]:
    opcua_browser.disconnect()
    return {"status": "disconnected"}


@app.get("/api/opcua/browse")
def opcua_browse(node_id: str | None = None) -> dict[str, Any]:
    try:
        return {"items": opcua_browser.browse(node_id=node_id)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/opcua/node")
def opcua_node_meta(node_id: str) -> dict[str, Any]:
    try:
        return opcua_browser.node_meta(node_id=node_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

