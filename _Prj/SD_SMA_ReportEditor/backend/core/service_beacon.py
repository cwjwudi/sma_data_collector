"""运行时信标文件：在无 HTTP（或 /health 慢/超时）时也能向本应用诊断确认为 SD_SMA 后端进程。

写入位置：`<REPORT_EDITOR_DATA_DIR>/.report_editor_backend_beacon.json`
（与 Electron 传给后端的 REPORT_EDITOR_DATA_DIR 一致）。
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

from core.settings import DATA_DIR

MAGIC = "SD_SMA_ReportEditor_BACKEND_v1"
BACKEND_BEACON_MAGIC = MAGIC
BEACON_FILENAME = ".report_editor_backend_beacon.json"


def beacon_file_path(custom_data_dir: Path | None = None) -> Path:
    root = custom_data_dir if custom_data_dir is not None else DATA_DIR
    return root / BEACON_FILENAME


def write_service_beacon(*, api_version: str, data_dir: Path | None = None) -> Path:
    path = beacon_file_path(data_dir)
    port = int(os.environ.get("REPORT_EDITOR_HTTP_PORT", "8000") or "8000")
    doc = {
        "magic": MAGIC,
        "pid": os.getpid(),
        "listen_port_hint": port,
        "api_version": str(api_version),
        "started_at_unix": int(time.time()),
        "title": "SD_SMA_ReportEditor",
    }
    root = path.parent
    root.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def clear_service_beacon(data_dir: Path | None = None) -> None:
    path = beacon_file_path(data_dir)
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass
