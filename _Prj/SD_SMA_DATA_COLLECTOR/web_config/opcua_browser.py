from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Any

from opcua import Client


@dataclass
class OpcUaConnectionInfo:
    server_url: str = ""
    connected: bool = False


class OpcUaBrowserService:
    def __init__(self) -> None:
        self._client: Client | None = None
        self._info = OpcUaConnectionInfo()
        self._lock = Lock()

    def connect(self, host: str, port: int) -> dict[str, Any]:
        server_url = f"opc.tcp://{host}:{port}"
        with self._lock:
            if self._client is not None:
                try:
                    self._client.disconnect()
                except Exception:
                    pass
                self._client = None
                self._info.connected = False
            client = Client(server_url)
            client.connect()
            self._client = client
            self._info = OpcUaConnectionInfo(server_url=server_url, connected=True)
        return {"connected": True, "server_url": server_url}

    def disconnect(self) -> None:
        with self._lock:
            if self._client is not None:
                try:
                    self._client.disconnect()
                except Exception:
                    pass
            self._client = None
            self._info.connected = False

    def status(self) -> dict[str, Any]:
        return {
            "connected": self._info.connected,
            "server_url": self._info.server_url,
        }

    def _require_client(self) -> Client:
        if self._client is None or not self._info.connected:
            raise ValueError("OPC UA 未连接，请先执行连接")
        return self._client

    def browse(self, node_id: str | None = None) -> list[dict[str, Any]]:
        client = self._require_client()
        node = client.get_root_node() if not node_id else client.get_node(node_id)

        children = node.get_children()
        rows: list[dict[str, Any]] = []
        for child in children:
            try:
                display_name = child.get_display_name().Text
            except Exception:
                display_name = str(child)

            try:
                node_class = child.get_node_class().name
            except Exception:
                node_class = "Unknown"

            try:
                child_children = child.get_children()
                has_children = len(child_children) > 0
            except Exception:
                has_children = False

            rows.append(
                {
                    "node_id": child.nodeid.to_string(),
                    "display_name": display_name,
                    "node_class": node_class,
                    "has_children": has_children,
                }
            )
        return rows

    def node_meta(self, node_id: str) -> dict[str, Any]:
        client = self._require_client()
        node = client.get_node(node_id)
        meta: dict[str, Any] = {"node_id": node_id}

        try:
            meta["display_name"] = node.get_display_name().Text
        except Exception:
            meta["display_name"] = node_id

        try:
            variant_type = node.get_data_type_as_variant_type()
            meta["datatype"] = str(variant_type)
        except Exception:
            meta["datatype"] = "Unknown"

        try:
            access_level = node.get_access_level()
            meta["access_level"] = [str(item) for item in access_level]
        except Exception:
            meta["access_level"] = []

        return meta

