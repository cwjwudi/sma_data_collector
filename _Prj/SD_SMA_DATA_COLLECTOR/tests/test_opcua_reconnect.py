import asyncio
import sys
import types
import unittest
from unittest.mock import AsyncMock, Mock, patch

try:
    import opcua  # noqa: F401
except ModuleNotFoundError:
    fake_opcua = types.ModuleType("opcua")
    fake_opcua.Client = object
    fake_opcua.ua = types.SimpleNamespace(
        AttributeIds=types.SimpleNamespace(
            AccessLevel="AccessLevel",
            UserAccessLevel="UserAccessLevel",
            Value="Value",
        ),
        DataValue=lambda value: value,
        Variant=lambda value, variant_type: (value, variant_type),
        VariantType=types.SimpleNamespace(Boolean="Boolean", UInt16="UInt16"),
    )
    sys.modules["opcua"] = fake_opcua

from communication.communication_manager import CommunicationManager
from communication.heartbeat_manager import HeartbeatManager
from communication.opcua_client import OpcUaClient
from core.config_models import (
    AppConfig,
    Communication,
    Connection,
    DatabaseConfig,
    DataPoint,
    OpcUaConfig,
)


class TestOpcUaReconnect(unittest.IsolatedAsyncioTestCase):
    async def test_communication_initializes_when_plc_is_offline(self):
        config = AppConfig(
            points=[],
            groups=[],
            opcua=OpcUaConfig(),
            database=DatabaseConfig(type="sqlite", name=":memory:"),
            communications=[
                Communication(name="PLC_TPS", type="opcua", host="127.0.0.1", port=4840),
            ],
            connections=[],
        )
        fake_client = Mock()
        fake_client.connect = AsyncMock(return_value=False)
        fake_client.disconnect = AsyncMock()
        fake_client.is_connected.return_value = False

        with patch("communication.communication_manager.OpcUaClient", return_value=fake_client):
            manager = CommunicationManager(config)
            initialized = await manager.initialize_connections()
            self.assertTrue(initialized)
            self.assertIs(manager.get_client("PLC_TPS"), fake_client)
            self.assertEqual(manager.get_connection_status(), {"PLC_TPS": False})

            await manager.disconnect_all()
            fake_client.disconnect.assert_awaited_once()

    async def test_reconnect_does_not_stop_at_max_retry_count(self):
        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            max_retries=0,
            retry_delay=0,
            health_check_interval=0,
        )

        class RefusingClient:
            def __init__(self, _server_url):
                pass

            def connect(self):
                raise ConnectionRefusedError(10061, "connection refused")

        with patch("communication.opcua_client.Client", RefusingClient):
            self.assertFalse(await client._attempt_reconnect(wait_before_attempt=False))

        self.assertEqual(client.current_retry_count, 1)

    async def test_concurrent_reconnects_share_one_connection_attempt(self):
        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            retry_delay=0,
            health_check_interval=0,
        )

        fake_client = Mock()
        fake_client.connect.return_value = None

        with patch("communication.opcua_client.Client", return_value=fake_client) as client_factory:
            results = await asyncio.gather(
                client._attempt_reconnect(wait_before_attempt=False),
                client._attempt_reconnect(wait_before_attempt=False),
            )

        self.assertEqual(results, [True, True])
        self.assertEqual(client_factory.call_count, 1)
        self.assertTrue(client.is_connected())

    async def test_heartbeat_uses_uint16_client_writer(self):
        config = AppConfig(
            points=[
                DataPoint(
                    name="gDataSQLHeartBeat",
                    path="ns=6;s=::AsGlobalPV:gDataSQLHeartBeat",
                    description="heartbeat",
                ),
            ],
            groups=[],
            opcua=OpcUaConfig(),
            database=DatabaseConfig(type="sqlite", name=":memory:"),
            communications=[
                Communication(name="PLC_TPS", type="opcua", host="127.0.0.1", port=4840),
            ],
            connections=[
                Connection(
                    name="Connection_TPS",
                    communication="PLC_TPS",
                    data_groups=[],
                    heartbeat="gDataSQLHeartBeat",
                ),
            ],
        )
        heartbeat_manager = HeartbeatManager(config, Mock())
        fake_client = Mock()
        fake_client.write_uint16_value = AsyncMock(return_value=True)

        success = await heartbeat_manager._write_heartbeat(
            fake_client,
            "ns=6;s=::AsGlobalPV:gDataSQLHeartBeat",
        )

        self.assertTrue(success)
        fake_client.write_uint16_value.assert_awaited_once_with(
            "ns=6;s=::AsGlobalPV:gDataSQLHeartBeat",
            1,
        )


if __name__ == "__main__":
    unittest.main()
