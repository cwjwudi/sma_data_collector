from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .models import HistoryQueryRequest
from .table_partition import (
    default_baseline_table,
    list_group_names_from_tables,
    list_tables_for_group,
    normalize_partition_time,
    table_group_info,
)

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _safe_ident(name: str) -> str:
    if not _IDENT_RE.match(name):
        raise ValueError(f"Invalid identifier: {name}")
    return f"`{name}`"


class QueryDatabase:
    def __init__(self, db_config: dict[str, Any]):
        self.db_type = str(db_config.get("type", "mysql")).lower()
        self.db_config = db_config
        self.engine = self._create_engine()

    def _create_engine(self) -> Engine:
        if self.db_type == "mysql":
            encoded_password = quote_plus(str(self.db_config.get("password", "")))
            conn_str = (
                f"mysql+pymysql://{self.db_config.get('username', '')}:{encoded_password}"
                f"@{self.db_config.get('host', '127.0.0.1')}:{self.db_config.get('port', 3306)}"
                f"/{self.db_config.get('name', '')}?charset=utf8mb4"
            )
        elif self.db_type == "sqlite":
            conn_str = f"sqlite:///{self.db_config.get('name', 'query.db')}"
        else:
            raise ValueError(f"Unsupported database type: {self.db_type}")

        return create_engine(conn_str, pool_pre_ping=True, echo=False)

    def ping(self) -> bool:
        with self.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True

    def list_tables(self) -> list[str]:
        with self.engine.connect() as conn:
            if self.db_type == "mysql":
                rows = conn.execute(text("SHOW TABLES")).fetchall()
                return [str(row[0]) for row in rows]

            rows = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            ).fetchall()
            return [str(row[0]) for row in rows]

    def list_groups(self) -> list[str]:
        return list_group_names_from_tables(self.list_tables())

    def list_tables_by_group(self, group: str) -> list[str]:
        return list_tables_for_group(self.list_tables(), group)

    def get_group_schema_report(self, group: str, baseline_table: str | None = None) -> dict[str, Any]:
        tables = self.list_tables_by_group(group)
        table_kinds: dict[str, str] = {}
        for table_name in tables:
            info = table_group_info(table_name)
            if info is not None:
                table_kinds[table_name] = info.kind

        if not tables:
            return {
                "group": group,
                "tables": [],
                "table_kinds": {},
                "consistent": True,
                "baseline_table": None,
                "mismatches": [],
            }

        chosen_baseline = (
            baseline_table
            if baseline_table in tables
            else default_baseline_table(group, tables)
        )
        if not chosen_baseline:
            chosen_baseline = tables[-1]

        baseline_columns = self.list_columns(chosen_baseline)
        baseline_set = set(baseline_columns)

        mismatches: list[dict[str, Any]] = []
        consistent = True
        for table in tables:
            cols = self.list_columns(table)
            col_set = set(cols)
            missing = [c for c in baseline_columns if c not in col_set]
            extra = [c for c in cols if c not in baseline_set]
            if missing or extra:
                consistent = False
                mismatches.append(
                    {
                        "table": table,
                        "missing_vs_baseline": missing,
                        "extra_vs_baseline": extra,
                    }
                )

        return {
            "group": group,
            "tables": tables,
            "table_kinds": table_kinds,
            "consistent": consistent,
            "baseline_table": chosen_baseline,
            "baseline_columns": baseline_columns,
            "mismatches": mismatches,
        }

    def lookup_batch_start_time(
        self,
        master_table: str,
        batch_column: str,
        batch_value: Any,
        start_time_column: str,
    ) -> datetime | None:
        table_ident = _safe_ident(master_table)
        batch_ident = _safe_ident(batch_column)
        start_ident = _safe_ident(start_time_column)
        available_columns = set(self.list_columns(master_table))
        if batch_column not in available_columns or start_time_column not in available_columns:
            raise ValueError(
                f"批次主表 {master_table} 缺少字段: {batch_column} 或 {start_time_column}"
            )

        sql = (
            f"SELECT {start_ident} FROM {table_ident} "
            f"WHERE {batch_ident} = :batch_value "
            "ORDER BY {start_ident} DESC LIMIT 1"
        )
        with self.engine.connect() as conn:
            row = conn.execute(text(sql), {"batch_value": batch_value}).first()
        if not row:
            return None
        return normalize_partition_time(row[0])

    def list_columns(self, table: str) -> list[str]:
        table_ident = _safe_ident(table)
        with self.engine.connect() as conn:
            if self.db_type == "mysql":
                rows = conn.execute(text(f"SHOW COLUMNS FROM {table_ident}")).fetchall()
                return [str(row[0]) for row in rows]

            rows = conn.execute(text(f"PRAGMA table_info({table_ident})")).fetchall()
            return [str(row[1]) for row in rows]

    def query_history(self, req: HistoryQueryRequest) -> tuple[int, list[str], list[dict[str, Any]], list[str]]:
        table_ident = _safe_ident(req.table)
        available_columns = self.list_columns(req.table)
        column_set = set(available_columns)
        missing_columns: list[str] = []

        if req.columns:
            selected = [col for col in req.columns if col in column_set]
            missing_columns = [col for col in req.columns if col not in column_set]
        else:
            selected = available_columns

        if req.time_field not in column_set:
            raise ValueError(f"time_field not found in table: {req.time_field}")
        if req.sort_by not in column_set:
            raise ValueError(f"sort_by not found in table: {req.sort_by}")
        if not selected:
            raise ValueError("No valid columns selected")

        safe_cols = ", ".join(_safe_ident(c) for c in selected)
        conditions: list[str] = []
        params: dict[str, Any] = {}

        if req.start_time:
            conditions.append(f"{_safe_ident(req.time_field)} >= :start_time")
            params["start_time"] = req.start_time
        if req.end_time:
            conditions.append(f"{_safe_ident(req.time_field)} <= :end_time")
            params["end_time"] = req.end_time

        for idx, f in enumerate(req.filters):
            if f.field not in column_set:
                continue

            field_ident = _safe_ident(f.field)
            key = f"f_{idx}"

            if f.op == "eq":
                conditions.append(f"{field_ident} = :{key}")
                params[key] = f.value
            elif f.op == "ne":
                conditions.append(f"{field_ident} != :{key}")
                params[key] = f.value
            elif f.op == "gt":
                conditions.append(f"{field_ident} > :{key}")
                params[key] = f.value
            elif f.op == "gte":
                conditions.append(f"{field_ident} >= :{key}")
                params[key] = f.value
            elif f.op == "lt":
                conditions.append(f"{field_ident} < :{key}")
                params[key] = f.value
            elif f.op == "lte":
                conditions.append(f"{field_ident} <= :{key}")
                params[key] = f.value
            elif f.op == "like":
                conditions.append(f"{field_ident} LIKE :{key}")
                params[key] = str(f.value)
            elif f.op == "in":
                values = f.value if isinstance(f.value, list) else [f.value]
                placeholders = []
                for i, value in enumerate(values):
                    in_key = f"{key}_{i}"
                    placeholders.append(f":{in_key}")
                    params[in_key] = value
                if placeholders:
                    conditions.append(f"{field_ident} IN ({', '.join(placeholders)})")

        where_clause = ""
        if conditions:
            where_clause = " WHERE " + " AND ".join(conditions)

        order_clause = f" ORDER BY {_safe_ident(req.sort_by)} {req.sort_dir.upper()}"
        page = max(req.page, 1)
        page_size = max(min(req.page_size, 500), 1)
        offset = (page - 1) * page_size

        count_sql = f"SELECT COUNT(*) AS cnt FROM {table_ident}{where_clause}"
        data_sql = (
            f"SELECT {safe_cols} FROM {table_ident}{where_clause}{order_clause} "
            "LIMIT :limit_value OFFSET :offset_value"
        )

        params_with_page = dict(params)
        params_with_page["limit_value"] = page_size
        params_with_page["offset_value"] = offset

        with self.engine.connect() as conn:
            total = int(conn.execute(text(count_sql), params).scalar() or 0)
            rows = conn.execute(text(data_sql), params_with_page).mappings().all()

        normalized_rows: list[dict[str, Any]] = []
        for row in rows:
            converted = {}
            for key, value in dict(row).items():
                if isinstance(value, datetime):
                    converted[key] = value.isoformat(sep=" ", timespec="seconds")
                else:
                    converted[key] = value
            normalized_rows.append(converted)

        return total, selected, normalized_rows, missing_columns
