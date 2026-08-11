"""052: OPC UA 保存返回 saved_id；幂等删除不重复刷审计。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def opc_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "data"
    data.mkdir()
    cfg = {
        "schema_version": 1,
        "app_preferences": {"datasource_locked": False},
        "db_connections": [],
        "opcua_servers": [
            {
                "id": "bad-1",
                "name": "bad",
                "endpoint_url": "opc.tcp://203.0.113.9:4840",
                "username": None,
                "password_enc": None,
            }
        ],
    }
    (data / "config.json").write_text(json.dumps(cfg), encoding="utf-8")

    from core import settings as settings_mod
    from modules import audit_log, config_store, datasource_lock
    from api.routers import opcua as opcua_router

    monkeypatch.setattr(settings_mod, "DATA_DIR", data)
    monkeypatch.setattr(settings_mod, "CONFIG_FILE", data / "config.json")
    monkeypatch.setattr(opcua_router, "DATA_DIR", data)
    monkeypatch.setattr(opcua_router, "CONFIG_FILE", data / "config.json")
    monkeypatch.setattr(datasource_lock, "DATA_DIR", data)
    monkeypatch.setattr(config_store, "DATA_DIR", data, raising=False)

    # 避免真实连 OPC
    async def _drop(_sid: str):
        return None

    monkeypatch.setattr(opcua_router.opcua_service, "drop_saved_server_pool", _drop)

    from main import app

    return TestClient(app), data


def test_upsert_returns_saved_id_and_second_with_id_is_upsert(opc_client):
    client, data = opc_client
    r1 = client.post(
        "/opcua/servers",
        json={
            "id": None,
            "name": "repro",
            "endpoint_url": "opc.tcp://127.0.0.1:4840",
            "username": None,
            "password": None,
        },
    )
    assert r1.status_code == 200
    body1 = r1.json()
    assert body1.get("saved_id")
    sid = body1["saved_id"]
    assert sum(1 for s in body1["servers"] if s.get("name") == "repro") == 1

    r2 = client.post(
        "/opcua/servers",
        json={
            "id": sid,
            "name": "repro",
            "endpoint_url": "opc.tcp://127.0.0.1:4840",
            "username": None,
            "password": None,
        },
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2.get("saved_id") == sid
    assert sum(1 for s in body2["servers"] if s.get("name") == "repro") == 1

    # 无 id 再 POST 仍会新建（前端须防重）；此处锁「有 id 则 upsert」契约
    r3 = client.post(
        "/opcua/servers",
        json={
            "id": None,
            "name": "repro",
            "endpoint_url": "opc.tcp://127.0.0.1:4840",
            "username": None,
            "password": None,
        },
    )
    assert r3.status_code == 200
    assert sum(1 for s in r3.json()["servers"] if s.get("name") == "repro") == 2


def test_idempotent_delete_audits_once(opc_client, monkeypatch: pytest.MonkeyPatch):
    client, data = opc_client
    calls: list[dict] = []

    def _append(data_dir, **kwargs):
        calls.append(kwargs)
        return None

    from api.routers import opcua as opcua_router

    monkeypatch.setattr(opcua_router.audit_log, "append_audit", _append)

    r1 = client.delete("/opcua/servers/bad-1")
    assert r1.status_code == 200
    r2 = client.delete("/opcua/servers/bad-1")
    assert r2.status_code == 200
    delete_audits = [c for c in calls if c.get("action") == "opcua.connection_delete"]
    assert len(delete_audits) == 1
