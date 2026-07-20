"""?????????????????? main ??????"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def resolve_data_dir() -> Path:
    override = os.environ.get("REPORT_EDITOR_DATA_DIR", "").strip()
    if override:
        return Path(override)
    return Path(__file__).resolve().parent.parent / "data"


DATA_DIR = resolve_data_dir()
TEMPLATES_DIR = DATA_DIR / "templates"
LAYOUT_PRESETS_DIR = DATA_DIR / "layout_presets"
SIGNATURE_ASSETS_DIR = DATA_DIR / "signatures"
HISTORY_DIR = DATA_DIR / "history"
CONFIG_FILE = DATA_DIR / "config.json"
QUERY_SESSION_FILE = DATA_DIR / "query_sessions.json"
BACKEND_ROOT = Path(__file__).resolve().parent.parent
APP_VERSION = "0.3.111"

DEFAULT_CONFIG = {
    "schema_version": 1,
    "app_preferences": {
        "auto_select_last_connection": True,
        "default_connection_id": None,
        "last_connection_id": None,
        "auto_select_last_opcua_server": True,
        "default_opcua_server_id": None,
        "last_opcua_server_id": None,
        "connection_probe_enabled": False,
        "connection_probe_interval_sec": 30,
        "datasource_locked": False,
    },
    "db_connections": [],
    "opcua_servers": [],
}


def init_data_dirs() -> None:
    for d in [DATA_DIR, TEMPLATES_DIR, LAYOUT_PRESETS_DIR, SIGNATURE_ASSETS_DIR, HISTORY_DIR]:
        d.mkdir(parents=True, exist_ok=True)
        logger.info("????: %s", d)

    if not CONFIG_FILE.exists():
        CONFIG_FILE.write_text(json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("???????: %s", CONFIG_FILE)
    else:
        logger.info("???????: %s", CONFIG_FILE)
