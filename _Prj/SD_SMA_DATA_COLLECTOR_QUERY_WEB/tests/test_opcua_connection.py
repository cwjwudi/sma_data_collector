"""Unit tests for OPC UA connection check."""

from __future__ import annotations

import asyncio

from app.config_manager import normalize_opcua_endpoint_url
from app.opcua_client import check_connection


def test_normalize_opcua_endpoint_url_fixes_typo_and_bare_host_port():
    assert normalize_opcua_endpoint_url("opc tcp://192.168.50.233:4840") == "opc.tcp://192.168.50.233:4840/"
    assert normalize_opcua_endpoint_url("192.168.50.233:4840") == "opc.tcp://192.168.50.233:4840/"
    assert normalize_opcua_endpoint_url("opc.tcp://127.0.0.1:4840") == "opc.tcp://127.0.0.1:4840/"


def test_normalize_opcua_endpoint_url_rejects_invalid_host():
    assert normalize_opcua_endpoint_url("opc.tcp://") == ""


def test_check_connection_requires_endpoint():
    result = asyncio.run(check_connection(""))
    assert result["ok"] is False
    assert "Endpoint" in result["message"]


def test_check_connection_invalid_endpoint():
    result = asyncio.run(
        check_connection("opc.tcp://127.0.0.1:59999/invalid/", username="", password="")
    )
    assert result["ok"] is False
    assert "失败" in result["message"]
