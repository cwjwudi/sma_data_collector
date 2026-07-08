"""Plugin page batch table-name OPC UA writeback."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from . import opcua_client
from .table_partition import (
    build_table_name_array,
    normalize_partition_time,
    resolve_matching_partitioned_tables,
)

logger = logging.getLogger(__name__)

DEFAULT_MAX_TABLES = 50
DEFAULT_STRING_MAX_LEN = 80


@dataclass(frozen=True)
class TableListWritebackConfig:
    enabled: bool
    batch_column: str
    buffer_node: str
    start_time_column: str = ""
    batch_master_table: str = ""
    max_tables: int = DEFAULT_MAX_TABLES
    string_max_len: int = DEFAULT_STRING_MAX_LEN

    @classmethod
    def from_binding(cls, raw: Any, *, bind_group: str | None = None) -> TableListWritebackConfig | None:
        if not isinstance(raw, dict):
            return None
        if not bool(raw.get("enabled")):
            return None

        batch_column = str(raw.get("batch_column", "") or "").strip()
        buffer_node = str(raw.get("buffer_node", "") or "").strip()
        if not batch_column or not buffer_node:
            return None

        start_time_column = str(raw.get("start_time_column", "") or "").strip()
        batch_master_table = str(raw.get("batch_master_table", "") or "").strip()
        if not batch_master_table and bind_group:
            batch_master_table = str(bind_group).strip()

        max_tables = int(raw.get("max_tables", DEFAULT_MAX_TABLES) or DEFAULT_MAX_TABLES)
        string_max_len = int(raw.get("string_max_len", DEFAULT_STRING_MAX_LEN) or DEFAULT_STRING_MAX_LEN)

        return cls(
            enabled=True,
            batch_column=batch_column,
            buffer_node=buffer_node,
            start_time_column=start_time_column,
            batch_master_table=batch_master_table,
            max_tables=max(1, min(max_tables, DEFAULT_MAX_TABLES)),
            string_max_len=max(1, min(string_max_len, DEFAULT_STRING_MAX_LEN)),
        )


def should_write_table_list(
    config: TableListWritebackConfig | None,
    endpoint_url: str,
    cursor: int,
) -> bool:
    return config is not None and bool(endpoint_url) and bool(config.buffer_node) and cursor >= 0


def resolve_batch_start_time(
    row: dict[str, Any],
    config: TableListWritebackConfig,
    *,
    lookup_start_time,
) -> datetime | None:
    if config.start_time_column:
        value = row.get(config.start_time_column)
        parsed = normalize_partition_time(value)
        if parsed is not None:
            return parsed

    batch_value = row.get(config.batch_column)
    if batch_value is None or str(batch_value).strip() == "":
        return None
    return lookup_start_time(config.batch_master_table, config.batch_column, batch_value)


def resolve_table_names_for_row(
    row: dict[str, Any],
    config: TableListWritebackConfig,
    *,
    list_tables,
    lookup_start_time,
) -> list[str]:
    batch_start = resolve_batch_start_time(row, config, lookup_start_time=lookup_start_time)
    if batch_start is None:
        logger.warning(
            "Table list writeback skipped: cannot resolve batch start time (batch_column=%s)",
            config.batch_column,
        )
        return build_table_name_array(
            config.batch_master_table,
            [],
            max_tables=config.max_tables,
            string_max_len=config.string_max_len,
        )

    detail_tables = resolve_matching_partitioned_tables(list_tables(), batch_start)
    return build_table_name_array(
        config.batch_master_table,
        detail_tables,
        max_tables=config.max_tables,
        string_max_len=config.string_max_len,
    )


def empty_table_name_array(config: TableListWritebackConfig) -> list[str]:
    return build_table_name_array(
        "",
        [],
        max_tables=config.max_tables,
        string_max_len=config.string_max_len,
    )


async def write_table_list_async(
    endpoint_url: str,
    username: str,
    password: str,
    config: TableListWritebackConfig | None,
    table_names: list[str] | None,
    *,
    cursor: int,
) -> None:
    if config is None or not endpoint_url:
        return

    if cursor < 0 or table_names is None:
        values = empty_table_name_array(config)
    else:
        values = table_names

    ok = await opcua_client.write_array(
        endpoint_url,
        config.buffer_node,
        values,
        username=username,
        password=password,
        string_max_len=config.string_max_len,
    )
    if ok:
        filled = sum(1 for item in values if str(item or "").strip())
        logger.debug(
            "OPC UA table list writeback node=%s cursor=%s filled=%d",
            config.buffer_node,
            cursor,
            filled,
        )
    else:
        logger.warning("OPC UA table list writeback failed node=%s", config.buffer_node)
