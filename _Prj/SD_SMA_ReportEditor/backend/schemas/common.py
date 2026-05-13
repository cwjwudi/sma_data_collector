from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class FixRequest(BaseModel):
    actions: list[str] = Field(default_factory=list)


class OpcUaTestRequest(BaseModel):
    endpoint_url: str
    username: str | None = None
    password: str | None = None


class OpcUaBrowseRequest(OpcUaTestRequest):
    node_id: str | None = None


class OpcUaReadRequest(OpcUaTestRequest):
    node_id: str


class OpcUaServerSave(BaseModel):
    id: str | None = None
    name: str = ""
    endpoint_url: str = ""
    security_policy: str | None = None
    message_security_mode: str | None = None
    username: str | None = None
    password: str | None = None


class DbConnectionSave(BaseModel):
    id: str | None = None
    name: str = ""
    engine: str  # mysql | mariadb | postgres | sqlite | mongodb
    host: str | None = None
    port: int | None = 3306
    database: str | None = None
    username: str | None = None
    password: str | None = None
    sqlite_path: str | None = None
    mongo_auth_source: str | None = "admin"

    @field_validator("engine", mode="before")
    @classmethod
    def _norm_engine(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v).strip().lower()

    @field_validator("port", mode="before")
    @classmethod
    def _norm_port(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        if isinstance(v, bool):
            raise ValueError("端口无效")
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError("端口必须是有效整数") from None
        if n < 1 or n > 65535:
            raise ValueError("端口必须在 1–65535 之间")
        return n


class DbExecuteSqlRequest(BaseModel):
    connection_id: str
    sql: str
    limit: int = 200
    database: str | None = None  # 对象树当前库，优先于连接默认 database（MySQL/PG）


class DbMongoAggregateRequest(BaseModel):
    connection_id: str
    database: str
    collection: str
    pipeline: list[Any] = Field(default_factory=list)
    limit: int = 200


class DbTablePreviewRequest(BaseModel):
    connection_id: str
    database: str | None = None
    table: str
    limit: int = 1000
    offset: int = 0
    """为 True 时在响应中包含 total（精确 COUNT），仅建议在首页请求以降低开销"""
    include_total: bool = False
    pk_filter_column: str | None = None
    pk_filter_value: str | None = None


class DbDdlPreviewRequest(BaseModel):
    connection_id: str
    database: str | None = None
    table: str


class DbTableColumnsRequest(BaseModel):
    connection_id: str
    database: str | None = None
    table: str


class DbSchemaForeignKeysRequest(BaseModel):
    connection_id: str
    database: str | None = None
    tables: list[str] = Field(default_factory=list)


class DbTableMetaRequest(BaseModel):
    connection_id: str
    database: str | None = None
    table: str


class DbRelationOrphanRequest(BaseModel):
    connection_id: str
    database: str | None = None
    child_table: str
    parent_table: str
    child_columns: list[str] = Field(default_factory=list)
    parent_columns: list[str] = Field(default_factory=list)


class DbRelationConsistencyRequest(BaseModel):
    connection_id: str
    database: str | None = None
    child_table: str
    child_column: str
    parent_table: str
    parent_column: str


class VisualQueryBuildRequest(BaseModel):
    connection_id: str
    database: str | None = None
    base_table: str
    joins: list[dict[str, Any]] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    limit: int = 100


class DbChartFilterEquals(BaseModel):
    column: str = ""
    value: str = ""


class DbChartProfileRequest(BaseModel):
    connection_id: str
    database: str | None = None
    table: str


class DbChartSeriesRequest(BaseModel):
    connection_id: str
    database: str | None = None
    table: str
    time_column: str | None = None
    metric_columns: list[str] = Field(default_factory=list)
    sample_limit: int = 2000
    time_start: str | None = None
    time_end: str | None = None
    filters: list[DbChartFilterEquals] = Field(default_factory=list)
    category_column: str | None = None

    @field_validator("sample_limit", mode="before")
    @classmethod
    def _cap_sample(cls, v: Any) -> int:
        try:
            n = int(v)
        except (TypeError, ValueError):
            return 2000
        return max(1, min(n, 5000))


class DbPreviewDrillRequest(BaseModel):
    connection_id: str
    database: str | None = None
    table: str
    limit: int = 500
    offset: int = 0
    time_column: str | None = None
    time_start: str | None = None
    time_end: str | None = None
    filters: list[DbChartFilterEquals] = Field(default_factory=list)
    order_column: str | None = None

    @field_validator("limit", mode="before")
    @classmethod
    def _cap_lim(cls, v: Any) -> int:
        try:
            n = int(v)
        except (TypeError, ValueError):
            return 500
        return max(1, min(n, 5000))


    @field_validator("offset", mode="before")
    @classmethod
    def _cap_off(cls, v: Any) -> int:
        try:
            n = int(v)
        except (TypeError, ValueError):
            return 0
        return max(0, min(n, 9_999_999))


class SchemaImportBody(BaseModel):
    format: str = "json"
    content: str


class QuerySessionsSave(BaseModel):
    favorites: list[str] = Field(default_factory=list)
    history: list[str] = Field(default_factory=list)


class AppPreferencesPatch(BaseModel):
    """仅允许更新白名单字段；未传字段保持不变。"""

    auto_select_last_connection: bool | None = None
    default_connection_id: str | None = None
    last_connection_id: str | None = None
    auto_select_last_opcua_server: bool | None = None
    default_opcua_server_id: str | None = None
    last_opcua_server_id: str | None = None
