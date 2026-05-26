"""
OPC UA feedback writer.
"""

import logging
import os
import sys
from typing import Any, List

from opcua import ua

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from communication.opcua_client import OpcUaClient


class OpcUaFeedbackWriter:
    """Write scalar feedback values to OPC UA nodes."""

    def __init__(self, opcua_client: OpcUaClient):
        self.opcua_client = opcua_client
        self.logger = logging.getLogger(__name__)

    async def write_udint_feedback(self, node_path: str, value: int) -> bool:
        """Write a UDINT(UInt32) feedback value to a single node."""
        try:
            if not node_path:
                self.logger.warning("反馈节点为空，跳过 UDINT 反馈写入")
                return False

            if value < 0 or value > 0xFFFFFFFF:
                self.logger.error("UDINT 反馈值越界: %s", value)
                return False

            if not self.opcua_client.is_connected():
                self.logger.error("OPC UA 客户端未连接，无法写入 UDINT 反馈")
                return False

            return await self._write_to_node(
                node_path,
                [value],
                ua.VariantType.UInt32,
            )
        except Exception as exc:  # noqa: BLE001
            self.logger.error("写入 UDINT 反馈失败: %s", exc, exc_info=True)
            return False

    async def _write_to_node(self, node_path: str, values: List[Any], ua_type: Any) -> bool:
        try:
            if not self.opcua_client.client:
                self.logger.error("OPC UA 客户端不可用")
                return False

            node = self.opcua_client.client.get_node(node_path)
            variant = ua.Variant(values, ua_type)
            node.set_attribute(ua.AttributeIds.Value, ua.DataValue(variant))
            self.logger.debug("成功写入 %d 个数到 %s", len(values), node_path)
            return True
        except Exception as exc:  # noqa: BLE001
            self.logger.error("写入节点 %s 失败：%s", node_path, exc, exc_info=True)
            return False
