from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


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
    engine: str  # mysql postgres sqlite mongodb
    host: str | None = None
    port: int | None = 3306
    database: str | None = None
    username: str | None = None
    password: str | None = None
    sqlite_path: str | None = None
    mongo_auth_source: str | None = "admin"


class DbExecuteSqlRequest(BaseModel):
    connection_id: str
    sql: str
    limit: int = 200


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
    limit: int = 100


class DbDdlPreviewRequest(BaseModel):
    connection_id: str
    database: str | None = None
    table: str


class VisualQueryBuildRequest(BaseModel):
    connection_id: str
    database: str | None = None
    base_table: str
    joins: list[dict[str, str]] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    limit: int = 100


class SchemaImportBody(BaseModel):
    format: str = "json"
    content: str


class QuerySessionsSave(BaseModel):
    favorites: list[str] = Field(default_factory=list)
    history: list[str] = Field(default_factory=list)
