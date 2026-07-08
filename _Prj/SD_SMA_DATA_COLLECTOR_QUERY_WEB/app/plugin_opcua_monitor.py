"""Background OPC UA rising-edge monitor for advanced plugin table-list writeback."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from . import opcua_client

logger = logging.getLogger(__name__)

DEFAULT_POLL_INTERVAL_MS = 200


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "y", "on")
    return bool(value)


class RisingEdgeDetector:
    """Detect 0→1 transitions per logical key."""

    def __init__(self) -> None:
        self._last: dict[str, bool | None] = {}

    def check(self, key: str, value: Any) -> bool:
        current = _as_bool(value)
        previous = self._last.get(key)
        self._last[key] = current
        if previous is None:
            return False
        return current and not previous

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self._last.clear()
        else:
            self._last.pop(key, None)

    def set_last(self, key: str, value: Any) -> None:
        self._last[key] = _as_bool(value)


@dataclass
class PluginRuntimeSnapshot:
    plugin_key: str
    page: int = 1
    total_pages: int = 1
    total_records: int = 0
    table: str = ""
    start_time: str | None = None
    end_time: str | None = None
    columns: list[str] = field(default_factory=list)
    rows: list[dict[str, Any]] = field(default_factory=list)
    display_columns: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    revision: int = 0
    last_trigger_batch: str = ""
    last_writeback_ok: bool | None = None

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "plugin_key": self.plugin_key,
            "mode": "advanced",
            "page": self.page,
            "total_pages": self.total_pages,
            "total_records": self.total_records,
            "table": self.table,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "columns": list(self.columns),
            "rows": list(self.rows),
            "display_columns": list(self.display_columns),
            "warnings": list(self.warnings),
            "revision": self.revision,
            "last_trigger_batch": self.last_trigger_batch,
            "last_writeback_ok": self.last_writeback_ok,
        }


QueryHandler = Callable[[str, int], Awaitable[PluginRuntimeSnapshot | None]]
TriggerHandler = Callable[[str, str], Awaitable[bool]]
BindingIterator = Callable[[], list[dict[str, Any]]]
OpcuaConnectionProvider = Callable[[], dict[str, str]]


class PluginOpcuaMonitor:
    """Poll OPC UA nodes and drive plugin pagination / table-list writeback."""

    def __init__(
        self,
        *,
        iter_bindings: BindingIterator,
        get_opcua: OpcuaConnectionProvider,
        on_page_change: QueryHandler,
        on_trigger: TriggerHandler,
        poll_interval_ms: int = DEFAULT_POLL_INTERVAL_MS,
    ) -> None:
        self._iter_bindings = iter_bindings
        self._get_opcua = get_opcua
        self._on_page_change = on_page_change
        self._on_trigger = on_trigger
        self._poll_interval_ms = max(50, poll_interval_ms)
        self._stop = asyncio.Event()
        self._edges = RisingEdgeDetector()
        self._runtime: dict[str, PluginRuntimeSnapshot] = {}

    def get_runtime(self, plugin_key: str) -> PluginRuntimeSnapshot | None:
        return self._runtime.get(plugin_key)

    def update_runtime(self, snapshot: PluginRuntimeSnapshot) -> None:
        existing = self._runtime.get(snapshot.plugin_key)
        if existing is None:
            self._runtime[snapshot.plugin_key] = snapshot
            return
        existing.page = snapshot.page
        existing.total_pages = snapshot.total_pages
        existing.total_records = snapshot.total_records
        existing.table = snapshot.table
        existing.start_time = snapshot.start_time
        existing.end_time = snapshot.end_time
        existing.columns = list(snapshot.columns)
        existing.rows = list(snapshot.rows)
        existing.display_columns = list(snapshot.display_columns)
        existing.warnings = list(snapshot.warnings)
        if snapshot.revision > existing.revision:
            existing.revision = snapshot.revision

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        logger.info("Plugin OPC UA monitor started (interval=%dms)", self._poll_interval_ms)
        try:
            while not self._stop.is_set():
                try:
                    await self._poll_once()
                except Exception:
                    logger.warning("Plugin OPC UA monitor poll failed", exc_info=True)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self._poll_interval_ms / 1000.0)
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            pass
        finally:
            logger.info("Plugin OPC UA monitor stopped")

    async def _poll_once(self) -> None:
        bindings = self._iter_bindings()
        if not bindings:
            return

        opcua = self._get_opcua()
        endpoint = opcua.get("endpoint_url", "")
        if not endpoint:
            return

        username = opcua.get("username", "")
        password = opcua.get("password", "")

        for binding in bindings:
            await self._poll_binding(binding, endpoint, username, password)

    async def _poll_binding(
        self,
        binding: dict[str, Any],
        endpoint: str,
        username: str,
        password: str,
    ) -> None:
        config = binding.get("_table_list_config")
        advanced = binding.get("_table_list_advanced")
        if config is None or advanced is None:
            return

        plugin_key = str(binding.get("plugin_key", ""))
        if not plugin_key:
            return

        prev_node = str(advanced.get("prev_page_node", "") or "").strip()
        next_node = str(advanced.get("next_page_node", "") or "").strip()
        batch_node = str(advanced.get("batch_no_node", "") or "").strip()
        trigger_node = str(advanced.get("trigger_node", "") or "").strip()

        nodes_to_read: list[tuple[str, str]] = []
        if prev_node:
            nodes_to_read.append(("prev", prev_node))
        if next_node:
            nodes_to_read.append(("next", next_node))
        if trigger_node:
            nodes_to_read.append(("trigger", trigger_node))

        if not nodes_to_read:
            return

        values: dict[str, Any] = {}
        for label, node_id in nodes_to_read:
            try:
                values[label] = await opcua_client.read_scalar(
                    endpoint,
                    node_id,
                    username=username,
                    password=password,
                )
            except Exception:
                logger.debug("OPC UA read failed plugin=%s node=%s", plugin_key, node_id, exc_info=True)
                return

        edge_key_prev = f"{plugin_key}:prev"
        if prev_node and self._edges.check(edge_key_prev, values.get("prev")):
            logger.info("OPC UA prev-page rising edge plugin=%s", plugin_key)
            await self._handle_page_delta(plugin_key, -1)
            await self._reset_bool_node(endpoint, prev_node, username, password, edge_key_prev)

        edge_key_next = f"{plugin_key}:next"
        if next_node and self._edges.check(edge_key_next, values.get("next")):
            logger.info("OPC UA next-page rising edge plugin=%s", plugin_key)
            await self._handle_page_delta(plugin_key, 1)
            await self._reset_bool_node(endpoint, next_node, username, password, edge_key_next)

        edge_key_trigger = f"{plugin_key}:trigger"
        if trigger_node and self._edges.check(edge_key_trigger, values.get("trigger")):
            batch_no = ""
            if batch_node:
                try:
                    batch_no = str(
                        await opcua_client.read_scalar(
                            endpoint,
                            batch_node,
                            username=username,
                            password=password,
                        )
                        or ""
                    ).strip()
                except Exception:
                    logger.warning(
                        "OPC UA batch read failed plugin=%s node=%s",
                        plugin_key,
                        batch_node,
                        exc_info=True,
                    )
            logger.info(
                "OPC UA trigger rising edge plugin=%s batch_no=%r",
                plugin_key,
                batch_no,
            )
            ok = await self._on_trigger(plugin_key, batch_no)
            snapshot = self._runtime.setdefault(plugin_key, PluginRuntimeSnapshot(plugin_key=plugin_key))
            snapshot.last_trigger_batch = batch_no
            snapshot.last_writeback_ok = ok
            snapshot.revision += 1
            logger.info(
                "OPC UA trigger writeback finished plugin=%s ok=%s batch_no=%r",
                plugin_key,
                ok,
                batch_no,
            )
            await self._reset_bool_node(endpoint, trigger_node, username, password, edge_key_trigger)

    async def _reset_bool_node(
        self,
        endpoint: str,
        node_id: str,
        username: str,
        password: str,
        edge_key: str,
    ) -> None:
        if not node_id:
            return
        ok = await opcua_client.write_scalar(
            endpoint,
            node_id,
            False,
            username=username,
            password=password,
        )
        if ok:
            self._edges.set_last(edge_key, False)
            logger.debug("OPC UA reset node=%s to FALSE", node_id)
        else:
            logger.warning("OPC UA reset failed node=%s", node_id)

    async def _handle_page_delta(self, plugin_key: str, delta: int) -> None:
        snapshot = self._runtime.get(plugin_key)
        current_page = snapshot.page if snapshot else 1
        total_pages = max(snapshot.total_pages if snapshot else 1, 1)
        requested = current_page + delta
        target = max(1, min(requested, total_pages))
        # 已到首页/末页时仍重新查询并回写当前页数据
        updated = await self._on_page_change(plugin_key, target)
        if updated is not None:
            updated.revision = (snapshot.revision if snapshot else 0) + 1
            self._runtime[plugin_key] = updated
            logger.info(
                "OPC UA page query finished plugin=%s page=%s/%s rows=%d",
                plugin_key,
                updated.page,
                updated.total_pages,
                len(updated.rows),
            )
