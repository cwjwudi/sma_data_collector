from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class QueryFilter(BaseModel):
    field: str
    op: Literal["eq", "ne", "gt", "gte", "lt", "lte", "like", "in"] = "eq"
    value: Any


class HistoryQueryRequest(BaseModel):
    table: str = Field(..., description="Physical table name, e.g. sensor_group_1_20260506")
    columns: list[str] = Field(default_factory=list, description="Requested columns")
    start_time: datetime | None = None
    end_time: datetime | None = None
    time_field: str = "collection_time"
    filters: list[QueryFilter] = Field(default_factory=list)
    page: int = 1
    page_size: int = 50
    sort_by: str = "collection_time"
    sort_dir: Literal["asc", "desc"] = "desc"


class HistoryQueryResponse(BaseModel):
    total: int
    page: int
    page_size: int
    columns: list[str]
    rows: list[dict[str, Any]]
    display_columns: list[dict[str, str]] = Field(default_factory=list)
    missing_columns: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ViewHistoryQueryRequest(BaseModel):
    view_name: str = Field(..., description="View name in query_view_config.json")
    table: str | None = Field(default=None, description="Physical table name")
    group: str | None = Field(default=None, description="Logical group name")
    start_time: datetime | None = None
    end_time: datetime | None = None
    page: int = 1
    page_size: int | None = None
    filters: list[QueryFilter] = Field(default_factory=list)
    columns: list[str] | None = None


class CollectorWriteRequest(BaseModel):
    filename: str = Field(..., description="Target filename under collector config directory")


class CollectorExportRequest(BaseModel):
    filename: str = Field(default="collector_config_export.json")


class QueryTableColumnConfig(BaseModel):
    name: str
    label_en: str = ""
    label_zh: str = ""


class QueryTableConfigUpdateRequest(BaseModel):
    view_name: str
    table: str
    sort_by: str
    sort_dir: Literal["asc", "desc"] = "desc"
    page_size: int = 50
    columns: list[QueryTableColumnConfig] = Field(default_factory=list)


class GroupBaselineUpdateRequest(BaseModel):
    group: str
    baseline_table: str


class QueryGroupConfigUpdateRequest(BaseModel):
    view_name: str
    group: str
    sort_by: str
    sort_dir: Literal["asc", "desc"] = "desc"
    page_size: int = 50
    columns: list[QueryTableColumnConfig] = Field(default_factory=list)
    baseline_table: str | None = None


class PluginQueryRequest(BaseModel):
    start_time: datetime | None = None
    end_time: datetime | None = None
    page: int = 1
    page_size: int | None = None
    table: str | None = None

