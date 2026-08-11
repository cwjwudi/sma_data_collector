"""Unit tests for OPC UA disconnect / reconnect backoff."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app import opcua_client
from app.plugin_opcua_monitor import (
    RECONNECT_INITIAL_SEC,
    RECONNECT_MAX_SEC,
    PluginOpcuaMonitor,
)


@pytest.fixture(autouse=True)
def _reset_opcua_pool():
    opcua_client.reset_pool_for_tests()
    yield
    opcua_client.reset_pool_for_tests()


def _make_monitor(**kwargs) -> PluginOpcuaMonitor:
    defaults = {
        "iter_bindings": lambda: [],
        "get_opcua": lambda: {
            "endpoint_url": "opc.tcp://127.0.0.1:4840/",
            "poll_interval_ms": 200,
            "heartbeat_node": "",
        },
        "on_snapshot_query": AsyncMock(return_value=None),
        "on_page_change": AsyncMock(return_value=None),
        "on_trigger": AsyncMock(return_value=True),
        "poll_interval_ms": 200,
    }
    defaults.update(kwargs)
    return PluginOpcuaMonitor(**defaults)


def test_reconnect_backoff_sequence_and_cap():
    monitor = _make_monitor()
    assert monitor._reconnect_delay_sec == 0.0

    delays: list[float] = []
    for _ in range(6):
        wait = monitor._wait_timeout_sec(False)
        delays.append(wait)
        assert wait == monitor._reconnect_delay_sec

    assert delays[0] == RECONNECT_INITIAL_SEC
    assert delays[1] == 1.0
    assert delays[2] == 2.0
    assert delays[3] == 4.0
    assert delays[4] == 8.0
    assert delays[5] == RECONNECT_MAX_SEC
    # Cap stays at max
    assert monitor._wait_timeout_sec(False) == RECONNECT_MAX_SEC


def test_reconnect_backoff_resets_on_success():
    monitor = _make_monitor()
    monitor._wait_timeout_sec(False)
    monitor._wait_timeout_sec(False)
    assert monitor._reconnect_delay_sec == 1.0

    wait = monitor._wait_timeout_sec(True)
    assert monitor._reconnect_delay_sec == 0.0
    assert wait == pytest.approx(0.2)  # poll_interval_ms=200


def test_read_scalar_failure_invalidates_pool():
    async def _run() -> None:
        import time

        entry = opcua_client._PoolEntry()
        fake_client = MagicMock()
        fake_node = MagicMock()
        fake_node.read_value = AsyncMock(side_effect=ConnectionError("broken"))
        fake_client.get_node.return_value = fake_node
        fake_client.disconnect = AsyncMock()
        entry.client = fake_client
        entry.endpoint_url = "opc.tcp://127.0.0.1:4840/"
        entry.last_used = time.monotonic()
        opcua_client._pool = entry

        with pytest.raises(ConnectionError):
            await opcua_client.read_scalar(
                "opc.tcp://127.0.0.1:4840/",
                "ns=2;s=Demo",
            )

        assert opcua_client._pool is not None
        assert opcua_client._pool.client is None
        assert opcua_client.is_connected() is False
        fake_client.disconnect.assert_awaited()

    asyncio.run(_run())


def test_poll_once_returns_false_on_read_failure():
    async def _run() -> bool:
        binding = {
            "plugin_key": "general_1",
            "_table_list_config": object(),
            "_table_list_advanced": {
                "prev_page_node": "ns=2;s=Prev",
                "next_page_node": "",
                "trigger_node": "",
                "batch_no_node": "",
            },
        }
        monitor = _make_monitor(
            iter_bindings=lambda: [binding],
            get_opcua=lambda: {
                "endpoint_url": "opc.tcp://127.0.0.1:4840/",
                "poll_interval_ms": 100,
                "heartbeat_node": "",
                "username": "",
                "password": "",
            },
        )
        with patch(
            "app.plugin_opcua_monitor.opcua_client.read_scalars",
            new=AsyncMock(side_effect=ConnectionError("down")),
        ):
            return await monitor._poll_once()

    assert asyncio.run(_run()) is False


def test_read_scalars_uses_one_client_batch_call():
    async def _run() -> list[object]:
        fake_client = MagicMock()
        fake_client.get_node.side_effect = lambda node_id: f"node:{node_id}"
        fake_client.read_values = AsyncMock(return_value=[10, 20])
        with patch("app.opcua_client._ensure_connected", new=AsyncMock(return_value=fake_client)):
            values = await opcua_client.read_scalars(
                "opc.tcp://127.0.0.1:4840/",
                ["ns=2;s=A", "ns=2;s=B"],
            )
        fake_client.read_values.assert_awaited_once_with(["node:ns=2;s=A", "node:ns=2;s=B"])
        return values

    assert asyncio.run(_run()) == [10, 20]


def test_heartbeat_variant_type_is_cached_until_connection_invalidates():
    async def _run() -> None:
        fake_node = MagicMock()
        fake_node.write_attribute = AsyncMock()
        fake_client = MagicMock()
        fake_client.get_node.return_value = fake_node
        with (
            patch("app.opcua_client._ensure_connected", new=AsyncMock(return_value=fake_client)),
            patch(
                "app.opcua_client._read_variant_type",
                new=AsyncMock(return_value=opcua_client.ua.VariantType.UInt16),
            ) as read_type,
        ):
            assert await opcua_client.write_heartbeat("opc.tcp://127.0.0.1:4840/", "ns=2;s=Heart")
            assert await opcua_client.write_heartbeat("opc.tcp://127.0.0.1:4840/", "ns=2;s=Heart")
            assert read_type.await_count == 1

    asyncio.run(_run())


def test_poll_once_returns_false_on_heartbeat_failure():
    async def _run() -> bool:
        monitor = _make_monitor(
            get_opcua=lambda: {
                "endpoint_url": "opc.tcp://127.0.0.1:4840/",
                "poll_interval_ms": 100,
                "heartbeat_node": "ns=2;s=Heart",
                "username": "",
                "password": "",
            },
        )
        with patch(
            "app.plugin_opcua_monitor.opcua_client.write_heartbeat",
            new=AsyncMock(return_value=False),
        ):
            return await monitor._poll_once()

    assert asyncio.run(_run()) is False


def test_monitor_run_uses_backoff_then_recovers():
    async def _run() -> list[float]:
        waits: list[float] = []
        poll_results = [False, False, True]
        call_idx = {"n": 0}

        monitor = _make_monitor(
            get_opcua=lambda: {
                "endpoint_url": "opc.tcp://127.0.0.1:4840/",
                "poll_interval_ms": 100,
                "heartbeat_node": "",
            },
            poll_interval_ms=100,
        )

        async def fake_poll() -> bool:
            i = call_idx["n"]
            call_idx["n"] += 1
            if i >= len(poll_results):
                monitor.stop()
                return True
            return poll_results[i]

        original_wait = monitor._wait_timeout_sec

        def tracking_wait(poll_ok: bool) -> float:
            sec = original_wait(poll_ok)
            waits.append(sec)
            if len(waits) >= 3:
                monitor.stop()
            return 0.0  # do not actually sleep

        with (
            patch.object(monitor, "_poll_once", side_effect=fake_poll),
            patch.object(monitor, "_wait_timeout_sec", side_effect=tracking_wait),
        ):
            await monitor.run()
        return waits

    waits = asyncio.run(_run())
    assert waits[0] == RECONNECT_INITIAL_SEC
    assert waits[1] == 1.0
    assert waits[2] == pytest.approx(0.1)  # restored poll_interval_ms=100
