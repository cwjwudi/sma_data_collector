"""Pytest configuration and shared fixtures."""

from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _wait_for_port(host: str, port: int, timeout_sec: float = 15.0) -> None:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError(f"OPC UA mock server did not start on {host}:{port}")


def _wait_for_meta(meta_path: Path, timeout_sec: float = 15.0) -> dict[str, Any]:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if meta_path.exists():
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("endpoint_url"):
                return data
        time.sleep(0.25)
    raise RuntimeError(f"OPC UA mock server metadata not written: {meta_path}")


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "integration: OPC UA integration tests (requires mock server)")


@pytest.fixture(scope="session")
def opcua_mock_meta(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    script = ROOT / "scripts" / "query_web_opcua_mock_server.py"
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    meta_path = tmp_path_factory.mktemp("opcua") / "mock_meta.json"
    proc = subprocess.Popen(
        [
            sys.executable,
            str(script),
            "--port",
            str(port),
            "--host",
            "127.0.0.1",
            "--meta-out",
            str(meta_path),
        ],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait_for_port("127.0.0.1", port)
        meta = _wait_for_meta(meta_path)
    except RuntimeError:
        proc.kill()
        output = proc.stdout.read() if proc.stdout else ""
        raise RuntimeError(f"Failed to start OPC UA mock server:\n{output}") from None

    yield meta
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture(scope="session")
def opcua_mock_server(opcua_mock_meta: dict[str, Any]) -> str:
    return str(opcua_mock_meta["endpoint_url"])


@pytest.fixture
def test_profile_dir(tmp_path: Path, opcua_mock_meta: dict[str, Any]) -> Path:
    profile = {
        "version": 1,
        "name": "pytest",
        "app_settings": {
            "database": {
                "type": "sqlite",
                "name": str(tmp_path / "test.db"),
                "host": "",
                "port": 0,
                "username": "",
                "password": "",
            },
            "query_limits": {
                "requests_per_minute": 1000,
                "default_window_hours": 24,
                "max_window_hours": 8760,
            },
        },
        "opcua": {
            "endpoint_url": opcua_mock_meta["endpoint_url"],
            "username": "",
            "password": "",
        },
        "query_view": {
            "default_page_size": 10,
            "max_page_size": 500,
            "views": {
                "alarm": {
                    "title": "alarm",
                    "time_field": "ts",
                    "columns": ["ts", "code", "msg"],
                    "sort_by": "ts",
                    "sort_dir": "desc",
                    "page_size": 10,
                    "default_filters": [],
                    "per_table": {},
                    "per_group": {
                        "alarm_group_1": {
                            "columns": [
                                {"name": "ts", "label_en": "ts", "label_zh": "ts"},
                                {"name": "code", "label_en": "code", "label_zh": "code"},
                                {"name": "msg", "label_en": "msg", "label_zh": "msg"},
                            ],
                            "sort_by": "ts",
                            "sort_dir": "desc",
                            "page_size": 10,
                        }
                    },
                }
            },
            "group_baselines": {},
        },
        "plugins": {
            "modules": {
                "alarm": {
                    "title": "Alarm",
                    "view_name": "alarm",
                    "bind_group": "alarm_group_1",
                    "page_size": 10,
                    "pages": {
                        "1": {"title": "P1", "enabled": True, "bind_group": "alarm_group_1"},
                        "2": {
                            "title": "P2",
                            "enabled": True,
                            "bind_group": "alarm_group_1",
                            "view_name": "alarm",
                            "page_size": 10,
                            "opcua_writeback": {
                                "cursor": opcua_mock_meta["cursor"],
                                "columns": {
                                    "code": opcua_mock_meta["arCode"],
                                    "msg": opcua_mock_meta["arMsg"],
                                },
                            },
                        },
                        "3": {"title": "P3", "enabled": True, "bind_group": "alarm_group_1"},
                        "4": {"title": "P4", "enabled": False, "bind_group": "alarm_group_1"},
                        "5": {"title": "P5", "enabled": False, "bind_group": "alarm_group_1"},
                    },
                }
            }
        },
    }
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    profile_path = config_dir / "pytest.json"
    profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    (config_dir / ".active_query_config").write_text("pytest.json", encoding="utf-8")
    return config_dir
