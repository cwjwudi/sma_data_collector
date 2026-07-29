import asyncio
import unittest
from unittest.mock import AsyncMock, Mock, patch

from asyncua import ua

from communication.communication_manager import CommunicationManager
from communication.heartbeat_manager import HeartbeatManager
from communication.opcua_client import ConnectionState, OpcUaClient
from communication.opcua_feedback_writer import OpcUaFeedbackWriter
from core.config_models import (
    AppConfig,
    Communication,
    Connection,
    DatabaseConfig,
    DataPoint,
    OpcUaConfig,
)


def mark_connected(client: OpcUaClient, raw_client) -> None:
    client.client = raw_client
    client.connected = True
    client.state = ConnectionState.CONNECTED
    client._connected_event.set()


class TestOpcUaReconnect(unittest.IsolatedAsyncioTestCase):
    async def test_client_factory_supports_asyncua_without_auto_reconnect(self):
        captured = {}

        class LegacyClient:
            def __init__(self, url, timeout=4, watchdog_intervall=1.0):
                captured.update(
                    url=url,
                    timeout=timeout,
                    watchdog_intervall=watchdog_intervall,
                )

        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            health_check_interval=0,
        )
        with patch("communication.opcua_client.Client", LegacyClient):
            raw_client = client._create_client()

        self.assertIsInstance(raw_client, LegacyClient)
        self.assertEqual(captured["url"], "opc.tcp://127.0.0.1:4840")

    async def test_communication_initializes_when_plc_is_offline(self):
        config = AppConfig(
            points=[],
            groups=[],
            opcua=OpcUaConfig(),
            database=DatabaseConfig(type="sqlite", name=":memory:"),
            communications=[
                Communication(
                    name="PLC_TPS", type="opcua", host="127.0.0.1", port=4840
                ),
            ],
            connections=[],
        )
        fake_client = Mock()
        fake_client.connect = AsyncMock(return_value=False)
        fake_client.disconnect = AsyncMock()
        fake_client.is_connected.return_value = False

        with patch(
            "communication.communication_manager.OpcUaClient", return_value=fake_client
        ):
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
        client._ensure_background_tasks = AsyncMock()

        class RefusingClient:
            def __init__(self, **_kwargs):
                pass

            async def connect(self):
                raise ConnectionRefusedError(10061, "connection refused")

            async def disconnect(self):
                return None

        with patch("communication.opcua_client.Client", RefusingClient):
            self.assertFalse(await client._attempt_reconnect(wait_before_attempt=False))

        self.assertEqual(client.current_retry_count, 1)

    async def test_concurrent_reconnects_share_one_connection_attempt(self):
        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            retry_delay=0,
            health_check_interval=0,
        )
        client._ensure_background_tasks = AsyncMock()

        fake_client = Mock()
        fake_client.connect = AsyncMock()
        fake_client.disconnect = AsyncMock()

        with patch(
            "communication.opcua_client.Client", return_value=fake_client
        ) as client_factory:
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
                Communication(
                    name="PLC_TPS", type="opcua", host="127.0.0.1", port=4840
                ),
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

    async def test_batch_read_uses_async_read_values(self):
        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            retry_delay=0,
            health_check_interval=0,
        )
        raw_client = Mock()
        raw_client.get_node.side_effect = lambda path: f"node:{path}"
        raw_client.read_values = AsyncMock(return_value=[12.5, 13.5])
        raw_client.disconnect = AsyncMock()
        mark_connected(client, raw_client)
        points = [
            DataPoint(name="p1", path="ns=2;s=p1", description=""),
            DataPoint(name="p2", path="ns=2;s=p2", description=""),
        ]

        data = await client.read_data_points(points)

        self.assertEqual(data["p1"]["value"], 12.5)
        self.assertEqual(data["p2"]["value"], 13.5)
        raw_client.read_values.assert_awaited_once_with(
            ["node:ns=2;s=p1", "node:ns=2;s=p2"]
        )

    async def test_batch_read_failure_falls_back_to_async_sequential_read(self):
        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            retry_delay=0,
            health_check_interval=0,
        )
        batch_nodes = [Mock(), Mock()]
        node1 = Mock()
        node1.read_value = AsyncMock(return_value=21)
        node2 = Mock()
        node2.read_value = AsyncMock(return_value=22)
        raw_client = Mock()
        raw_client.read_values = AsyncMock(side_effect=ValueError("batch unsupported"))
        raw_client.get_node.side_effect = [*batch_nodes, node1, node2]
        raw_client.disconnect = AsyncMock()
        mark_connected(client, raw_client)
        points = [
            DataPoint(name="p1", path="ns=2;s=p1", description=""),
            DataPoint(name="p2", path="ns=2;s=p2", description=""),
        ]

        data = await client.read_data_points(points)

        self.assertEqual(data["p1"]["value"], 21)
        self.assertEqual(data["p2"]["value"], 22)
        node1.read_value.assert_awaited_once()
        node2.read_value.assert_awaited_once()

    async def test_write_uint32_uses_async_node_writer(self):
        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            retry_delay=0,
            health_check_interval=0,
        )
        node = Mock()
        node.get_access_level = AsyncMock(
            return_value={ua.AccessLevel.CurrentRead, ua.AccessLevel.CurrentWrite}
        )
        node.get_user_access_level = AsyncMock(
            return_value={ua.AccessLevel.CurrentRead, ua.AccessLevel.CurrentWrite}
        )
        node.write_value = AsyncMock()
        raw_client = Mock()
        raw_client.get_node.return_value = node
        raw_client.disconnect = AsyncMock()
        mark_connected(client, raw_client)

        self.assertTrue(await client.write_uint32_value("ns=2;s=feedback", 7))

        written = node.write_value.await_args.args[0]
        self.assertIsInstance(written, ua.DataValue)
        self.assertEqual(written.Value.Value, 7)
        self.assertEqual(written.Value.VariantType, ua.VariantType.UInt32)
        self.assertIsNone(written.SourceTimestamp)

    async def test_feedback_writer_uses_client_uint32_writer(self):
        fake_client = Mock()
        fake_client.write_uint32_value = AsyncMock(return_value=True)
        writer = OpcUaFeedbackWriter(fake_client)

        self.assertTrue(await writer.write_udint_feedback("ns=2;s=feedback", 5))

        fake_client.write_uint32_value.assert_awaited_once_with("ns=2;s=feedback", 5)

    async def test_async_operation_timeout_discards_session_without_worker_thread(self):
        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            retry_delay=0,
            health_check_interval=0,
        )
        client.operation_timeout = 0.01
        client._ensure_background_tasks = AsyncMock()
        raw_client = Mock()
        raw_client.disconnect = AsyncMock()
        mark_connected(client, raw_client)

        async def slow_operation(_raw_client):
            await asyncio.sleep(0.1)

        with self.assertRaises(TimeoutError):
            await client._run_operation("测试慢调用", slow_operation)

        self.assertFalse(client.connected)
        self.assertIsNone(client.client)
        self.assertEqual(client.state, ConnectionState.DISCONNECTED)

    async def test_reconnect_restores_registered_subscription(self):
        client = OpcUaClient(
            "opc.tcp://127.0.0.1:4840",
            retry_delay=0,
            health_check_interval=0,
        )
        client._ensure_background_tasks = AsyncMock()
        point = DataPoint("trigger", "ns=2;s=trigger", "")
        received = []
        await client.subscribe_data_change(point, received.append)
        self.assertEqual(client.get_subscription_count(), 0)

        subscription = Mock()
        subscription.subscribe_data_change = AsyncMock(return_value=42)
        subscription.delete = AsyncMock()
        raw_client = Mock()
        raw_client.connect = AsyncMock()
        raw_client.disconnect = AsyncMock()
        raw_client.create_subscription = AsyncMock(return_value=subscription)
        raw_client.get_node.return_value = Mock()

        with patch("communication.opcua_client.Client", return_value=raw_client):
            self.assertTrue(await client._attempt_reconnect(wait_before_attempt=False))

        subscription.subscribe_data_change.assert_awaited_once()
        registration = next(iter(client._subscriptions.values()))
        self.assertEqual(registration.handle, 42)
        self.assertEqual(client.get_subscription_count(), 1)


if __name__ == "__main__":
    unittest.main()
