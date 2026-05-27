from __future__ import annotations

import os
import re
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from .config_manager import ConfigManager, UnifiedConfigStore
from .database import QueryDatabase
from .models import (
    GroupBaselineUpdateRequest,
    HistoryQueryRequest,
    HistoryQueryResponse,
    QueryGroupConfigUpdateRequest,
    PluginQueryRequest,
    QueryTableConfigUpdateRequest,
    QueryFilter,
    ViewHistoryQueryRequest,
)

BASE_DIR = Path(__file__).resolve().parent.parent


def _resolve_config_dir(env_name: str, default: Path) -> Path:
    raw = os.getenv(env_name)
    if not raw:
        return default.resolve()
    value = raw.replace("${QUERY_WEB_ROOT}", str(BASE_DIR))
    path = Path(os.path.expandvars(value))
    if not path.is_absolute():
        path = BASE_DIR / path
    return path.resolve()


CONFIG_DIR = _resolve_config_dir("SD_SMA_QUERY_WEB_CONFIG_DIR", BASE_DIR / "config")
APP_SETTINGS_PATH = CONFIG_DIR / "app_settings.json"
QUERY_VIEW_CONFIG_PATH = CONFIG_DIR / "query_view_config.json"
PLUGIN_CONFIG_PATH = CONFIG_DIR / "plugins_config.json"


def _normalize_app_settings(data: dict[str, Any] | None) -> dict[str, Any]:
    source = data if isinstance(data, dict) else {}
    raw_database = source.get("database")
    database = raw_database if isinstance(raw_database, dict) else {}
    raw_query_limits = source.get("query_limits")
    query_limits = raw_query_limits if isinstance(raw_query_limits, dict) else {}
    db_type = str(database.get("type", "mysql") or "mysql").lower()
    if db_type not in {"mysql", "sqlite"}:
        raise ValueError("database.type 仅支持 mysql 或 sqlite")

    return {
        "database": {
            "type": db_type,
            "name": str(database.get("name", "") or ""),
            "host": str(database.get("host", "127.0.0.1") or "127.0.0.1"),
            "port": int(database.get("port", 3306) or 3306),
            "username": str(database.get("username", "") or ""),
            "password": str(database.get("password", "") or ""),
        },
        "query_limits": {
            "requests_per_minute": max(int(query_limits.get("requests_per_minute", 120) or 120), 0),
            "default_window_hours": max(int(query_limits.get("default_window_hours", 24) or 24), 1),
            "max_window_hours": max(int(query_limits.get("max_window_hours", 168) or 168), 1),
        },
    }


def _load_app_settings() -> dict[str, Any]:
    return _normalize_app_settings(config_store.get_app_settings())


def _save_app_settings(data: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_app_settings(data)
    config_store.save_app_settings(normalized)
    return normalized


def _apply_runtime_settings(updated_settings: dict[str, Any]) -> None:
    global settings, db, QUERY_LIMITS, RATE_LIMIT_PER_MINUTE, DEFAULT_WINDOW_HOURS, MAX_WINDOW_HOURS

    settings = updated_settings
    db = QueryDatabase(settings.get("database", {}))
    QUERY_LIMITS = settings.get("query_limits", {})
    RATE_LIMIT_PER_MINUTE = int(QUERY_LIMITS.get("requests_per_minute", 120))
    DEFAULT_WINDOW_HOURS = int(QUERY_LIMITS.get("default_window_hours", 24))
    MAX_WINDOW_HOURS = int(QUERY_LIMITS.get("max_window_hours", 168))


config_store = UnifiedConfigStore(
    CONFIG_DIR,
    legacy_app_settings_path=APP_SETTINGS_PATH,
    legacy_query_view_config_path=QUERY_VIEW_CONFIG_PATH,
    legacy_plugin_config_path=PLUGIN_CONFIG_PATH,
)
settings = _load_app_settings()
db = QueryDatabase(settings.get("database", {}))
cfg = ConfigManager(config_store)
QUERY_LIMITS = settings.get("query_limits", {})
RATE_LIMIT_PER_MINUTE = int(QUERY_LIMITS.get("requests_per_minute", 120))
DEFAULT_WINDOW_HOURS = int(QUERY_LIMITS.get("default_window_hours", 24))
MAX_WINDOW_HOURS = int(QUERY_LIMITS.get("max_window_hours", 168))
_REQUEST_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
PLUGIN_KEY_PATTERN = re.compile(r"^([A-Za-z0-9_]+)_([1-5])$")

app = FastAPI(title="SD SMA Query Web", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")


def _raise_db_error(exc: Exception) -> None:
    detail = (
        "数据库连接失败，请检查 "
        "当前统一 config 中 app_settings.database 的 host/port/name/username/password 是否正确。"
    )
    raise HTTPException(status_code=503, detail=f"{detail} 原因: {exc}") from exc


def _client_id(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _enforce_rate_limit(request: Request) -> None:
    if RATE_LIMIT_PER_MINUTE <= 0:
        return
    client = _client_id(request)
    now = time.time()
    bucket = _REQUEST_BUCKETS[client]
    threshold = now - 60.0
    while bucket and bucket[0] < threshold:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT_PER_MINUTE:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后重试")
    bucket.append(now)


def _now_like(start_time: datetime | None, end_time: datetime | None) -> datetime:
    if end_time and end_time.tzinfo:
        return datetime.now(end_time.tzinfo)
    if start_time and start_time.tzinfo:
        return datetime.now(start_time.tzinfo)
    return datetime.now()


def _apply_time_guardrails(
    start_time: datetime | None,
    end_time: datetime | None,
) -> tuple[datetime | None, datetime | None, list[str]]:
    warnings: list[str] = []
    default_window = timedelta(hours=max(DEFAULT_WINDOW_HOURS, 1))
    max_window = timedelta(hours=max(MAX_WINDOW_HOURS, 1))

    if not start_time and not end_time:
        end_time = _now_like(start_time, end_time)
        start_time = end_time - default_window
        warnings.append(f"未指定时间范围，默认查询最近 {DEFAULT_WINDOW_HOURS} 小时")
    elif not start_time and end_time:
        start_time = end_time - default_window
        warnings.append(f"缺少开始时间，自动使用结束时间前 {DEFAULT_WINDOW_HOURS} 小时")
    elif start_time and not end_time:
        end_time = _now_like(start_time, end_time)
        warnings.append("缺少结束时间，自动使用当前时间")

    if start_time and end_time:
        if start_time > end_time:
            start_time, end_time = end_time, start_time
            warnings.append("开始/结束时间顺序已自动纠正")
        if (end_time - start_time) > max_window:
            start_time = end_time - max_window
            warnings.append(f"查询窗口超限，已截断为最近 {MAX_WINDOW_HOURS} 小时")

    return start_time, end_time, warnings


def _load_plugin_config() -> dict[str, Any]:
    data = config_store.get_plugins_config()
    if not isinstance(data, dict):
        return {"modules": {}}
    if "modules" not in data or not isinstance(data["modules"], dict):
        data["modules"] = {}
    return data


def _save_plugin_config(data: dict[str, Any]) -> None:
    if not isinstance(data, dict):
        raise ValueError("plugins 配置必须为 JSON 对象")
    modules = data.get("modules")
    if not isinstance(modules, dict):
        raise ValueError("plugins 配置必须包含 modules 对象")

    for module_name, module_cfg in modules.items():
        if not isinstance(module_cfg, dict):
            raise ValueError(f"模块配置无效: {module_name}")
        pages = module_cfg.get("pages")
        if not isinstance(pages, dict):
            raise ValueError(f"模块 {module_name} 缺少 pages 配置")
        for idx in ["1", "2", "3", "4", "5"]:
            if idx not in pages:
                raise ValueError(f"模块 {module_name} 缺少第 {idx} 页配置")
            if not isinstance(pages[idx], dict):
                raise ValueError(f"模块 {module_name} 第 {idx} 页配置无效")

    config_store.save_plugins_config(data)


def _resolve_plugin_binding(plugin_key: str) -> dict[str, Any]:
    match = PLUGIN_KEY_PATTERN.match(plugin_key)
    if not match:
        raise ValueError("插件路径必须是 <module>_<1-5> 格式")
    module_name, page_index = match.group(1), match.group(2)

    plugin_cfg = _load_plugin_config()
    modules = plugin_cfg.get("modules", {})
    module_cfg = modules.get(module_name)
    if not isinstance(module_cfg, dict):
        raise ValueError(f"未找到模块配置: {module_name}")

    pages = module_cfg.get("pages", {})
    if not isinstance(pages, dict):
        raise ValueError(f"模块 pages 配置无效: {module_name}")
    page_cfg = pages.get(page_index)
    if not isinstance(page_cfg, dict):
        raise ValueError(f"模块 {module_name} 的第 {page_index} 页未配置")

    enabled = bool(page_cfg.get("enabled", True))
    if not enabled:
        raise ValueError(f"模块 {module_name} 第 {page_index} 页已禁用")

    bind_group = page_cfg.get("bind_group", module_cfg.get("bind_group"))
    # 插件绑定改为只绑定 group，table 由插件页右上角手动选择。
    bind_table = None
    view_name = str(page_cfg.get("view_name", module_cfg.get("view_name", "table")))
    page_size = int(page_cfg.get("page_size", module_cfg.get("page_size", 10)))

    if not bind_group and not bind_table:
        raise ValueError("插件必须至少配置 bind_group 或 bind_table")

    return {
        "plugin_key": plugin_key,
        "module": module_name,
        "page_index": int(page_index),
        "title": str(page_cfg.get("title", module_cfg.get("title", plugin_key))),
        "view_name": view_name,
        "bind_group": bind_group,
        "bind_table": bind_table,
        "page_size": max(1, page_size),
        "target": str(page_cfg.get("target", module_cfg.get("target", ""))),
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "app" / "static" / "query.html")


@app.get("/query")
def query_page() -> FileResponse:
    return FileResponse(BASE_DIR / "app" / "static" / "query.html")


@app.get("/config")
def config_page() -> FileResponse:
    return FileResponse(BASE_DIR / "app" / "static" / "config.html")


@app.get("/plugins/{plugin_page}.html")
def plugin_page(plugin_page: str) -> FileResponse:
    # 路径仅用于标识插件，实际页面使用统一 SpecializedQuery 组件
    try:
        _resolve_plugin_binding(plugin_page)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(BASE_DIR / "app" / "static" / "specialized_query.html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    try:
        db.ping()
        return {"status": "ok"}
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Health check failed: {exc}") from exc


@app.get("/api/db/check")
def check_database(request: Request) -> dict[str, Any]:
    _enforce_rate_limit(request)
    try:
        db.ping()
        groups = db.list_groups()
        return {
            "status": "ok",
            "db_type": db.db_type,
            "database": db.db_config.get("name", ""),
            "groups_count": len(groups),
        }
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database check failed: {exc}") from exc


@app.get("/api/config/app-settings")
def get_app_settings() -> dict[str, Any]:
    return _load_app_settings()


@app.get("/api/config/profiles")
def list_config_profiles() -> dict[str, Any]:
    return {
        "active": config_store.get_active_profile_name(),
        "profiles": config_store.list_profiles(),
    }


@app.post("/api/config/profiles/active")
def set_active_config_profile(payload: dict[str, Any]) -> dict[str, Any]:
    filename = str(payload.get("filename", "")).strip()
    try:
        config_store.set_active_profile(filename)
        _apply_runtime_settings(_load_app_settings())
        return {
            "status": "loaded",
            "active": config_store.get_active_profile_name(),
            "profiles": config_store.list_profiles(),
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config/app-settings")
def save_app_settings(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        normalized = _save_app_settings(payload)
        _apply_runtime_settings(normalized)
        return {"status": "saved", "settings": normalized}
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/meta/groups")
def meta_groups(request: Request) -> dict[str, Any]:
    _enforce_rate_limit(request)
    try:
        return {"groups": db.list_groups()}
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"List groups failed: {exc}") from exc


@app.get("/api/meta/tables")
def meta_tables(group: str, request: Request) -> dict[str, Any]:
    _enforce_rate_limit(request)
    try:
        return {"tables": db.list_tables_by_group(group)}
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"List tables failed: {exc}") from exc


@app.get("/api/meta/group-schema")
def meta_group_schema(group: str, request: Request) -> dict[str, Any]:
    _enforce_rate_limit(request)
    try:
        baseline = cfg.get_group_baseline(group)
        report = db.get_group_schema_report(group=group, baseline_table=baseline)
        report["saved_baseline_table"] = baseline
        return report
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Group schema check failed: {exc}") from exc


@app.get("/api/meta/columns")
def meta_columns(table: str, request: Request) -> dict[str, Any]:
    _enforce_rate_limit(request)
    try:
        return {"columns": db.list_columns(table)}
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/history", response_model=HistoryQueryResponse)
def history(req: HistoryQueryRequest, request: Request) -> HistoryQueryResponse:
    _enforce_rate_limit(request)
    start_time, end_time, warnings = _apply_time_guardrails(req.start_time, req.end_time)
    req.start_time = start_time
    req.end_time = end_time
    try:
        total, columns, rows, missing_columns = db.query_history(req)
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return HistoryQueryResponse(
        total=total,
        page=req.page,
        page_size=req.page_size,
        columns=columns,
        rows=rows,
        display_columns=[{"name": c, "label_en": c, "label_zh": c} for c in columns],
        missing_columns=missing_columns,
        warnings=warnings,
    )


@app.get("/api/query/views")
def get_query_views() -> dict[str, Any]:
    try:
        return {"views": cfg.get_query_views()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/query/configured-groups")
def get_configured_groups(view_name: str) -> dict[str, Any]:
    try:
        groups = cfg.list_configured_groups_by_view(view_name)
        return {"view_name": view_name, "groups": groups}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/plugins/resolve/{plugin_key}")
def resolve_plugin(plugin_key: str, request: Request) -> dict[str, Any]:
    _enforce_rate_limit(request)
    try:
        binding = _resolve_plugin_binding(plugin_key)
        resolved_table = binding["bind_table"]
        resolved_group = binding["bind_group"]
        schema_report = None
        if resolved_group:
            saved_baseline = cfg.get_group_baseline(resolved_group)
            schema_report = db.get_group_schema_report(resolved_group, saved_baseline)
        if not resolved_table and resolved_group:
            saved_baseline = cfg.get_group_baseline(resolved_group)
            resolved_table = schema_report.get("baseline_table")
        if not resolved_table:
            raise ValueError("无法解析插件绑定表")
        binding["resolved_table"] = resolved_table
        binding["resolved_group"] = resolved_group
        binding["schema_report"] = schema_report
        return binding
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/plugins/query/{plugin_key}", response_model=HistoryQueryResponse)
def query_plugin(plugin_key: str, payload: PluginQueryRequest, request: Request) -> HistoryQueryResponse:
    _enforce_rate_limit(request)
    try:
        binding = _resolve_plugin_binding(plugin_key)
        target_table = payload.table or binding["bind_table"]
        target_group = binding["bind_group"]
        warnings: list[str] = []
        if target_group:
            schema_report = db.get_group_schema_report(target_group, cfg.get_group_baseline(target_group))
            available_tables = schema_report.get("tables", [])
            if payload.table and payload.table not in available_tables:
                raise ValueError(f"所选表不属于 group {target_group}: {payload.table}")
        if not target_table and target_group:
            saved_baseline = cfg.get_group_baseline(target_group)
            schema_report = db.get_group_schema_report(target_group, saved_baseline)
            target_table = schema_report.get("baseline_table")
            if not schema_report.get("consistent", True):
                warnings.append("当前 group 表结构不一致，已按基准表查询")
        if not target_table:
            raise ValueError("插件未绑定可用数据表")

        view = cfg.resolve_query_view(binding["view_name"], table=target_table, group=target_group)
        start_time, end_time, time_warnings = _apply_time_guardrails(payload.start_time, payload.end_time)
        warnings.extend(time_warnings)

        page_size = payload.page_size if payload.page_size else int(binding["page_size"])
        page_size = min(max(page_size, 1), int(view["max_page_size"]))

        history_req = HistoryQueryRequest(
            table=target_table,
            columns=view.get("columns", []),
            start_time=start_time,
            end_time=end_time,
            time_field=view["time_field"],
            filters=[],
            page=max(payload.page, 1),
            page_size=page_size,
            sort_by=view["sort_by"],
            sort_dir=view["sort_dir"],
        )
        total, columns, rows, missing_columns = db.query_history(history_req)
        if missing_columns:
            warnings.append("部分配置列在当前表中不存在，已自动忽略")

        return HistoryQueryResponse(
            total=total,
            page=history_req.page,
            page_size=history_req.page_size,
            columns=columns,
            rows=rows,
            display_columns=[
                {
                    "name": c,
                    "label_en": view.get("column_labels", {}).get(c, {}).get("label_en", c),
                    "label_zh": view.get("column_labels", {}).get(c, {}).get("label_zh", c),
                }
                for c in columns
            ],
            missing_columns=missing_columns,
            warnings=warnings,
        )
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/history/by-view", response_model=HistoryQueryResponse)
def history_by_view(req: ViewHistoryQueryRequest, request: Request) -> HistoryQueryResponse:
    _enforce_rate_limit(request)
    target_table = req.table
    target_group = req.group

    if not target_table:
        if not target_group:
            raise HTTPException(status_code=400, detail="table 或 group 必须提供一个")
        saved_baseline = cfg.get_group_baseline(target_group)
        schema_report = db.get_group_schema_report(target_group, saved_baseline)
        target_table = schema_report.get("baseline_table")
        if not target_table:
            raise HTTPException(status_code=400, detail=f"group 没有可用数据表: {target_group}")

    try:
        view = cfg.resolve_query_view(req.view_name, table=target_table, group=target_group)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    merged_filters: list[QueryFilter] = []
    warnings: list[str] = []
    for item in view.get("default_filters", []):
        if isinstance(item, dict):
            merged_filters.append(QueryFilter(**item))
    merged_filters.extend(req.filters)

    page_size = req.page_size if req.page_size else int(view["page_size"])
    page_size = min(max(page_size, 1), int(view["max_page_size"]))
    start_time, end_time, time_warnings = _apply_time_guardrails(req.start_time, req.end_time)
    warnings.extend(time_warnings)

    try:
        available_columns = db.list_columns(target_table)
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"读取表结构失败: {exc}") from exc

    time_field = view["time_field"]
    if time_field not in available_columns:
        if "collection_time" in available_columns:
            time_field = "collection_time"
        elif available_columns:
            time_field = available_columns[0]
        warnings.append(f"视图时间字段不存在，已回退为 {time_field}")

    sort_by = view["sort_by"]
    if sort_by not in available_columns:
        sort_by = time_field
        warnings.append(f"视图排序字段不存在，已回退为 {sort_by}")

    history_req = HistoryQueryRequest(
        table=target_table,
        columns=req.columns if req.columns is not None else view.get("columns", []),
        start_time=start_time,
        end_time=end_time,
        time_field=time_field,
        filters=merged_filters,
        page=req.page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=view["sort_dir"],
    )

    try:
        total, columns, rows, missing_columns = db.query_history(history_req)
    except (OperationalError, SQLAlchemyError) as exc:
        _raise_db_error(exc)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if missing_columns:
        warnings.append("部分配置列在当前表中不存在，已自动忽略")
    if total == 0:
        warnings.append("当前查询条件下没有数据")
    if target_group:
        warnings.append(f"group={target_group}，本次使用基准表 {target_table} 查询")

    return HistoryQueryResponse(
        total=total,
        page=history_req.page,
        page_size=history_req.page_size,
        columns=columns,
        rows=rows,
        display_columns=[
            {
                "name": c,
                "label_en": view.get("column_labels", {}).get(c, {}).get("label_en", c),
                "label_zh": view.get("column_labels", {}).get(c, {}).get("label_zh", c),
            }
            for c in columns
        ],
        missing_columns=missing_columns,
        warnings=warnings,
    )


@app.get("/api/config/query-view")
def get_query_view_config() -> dict[str, Any]:
    return cfg.get_query_view_config()


@app.post("/api/config/query-view")
def save_query_view_config(payload: dict[str, Any]) -> dict[str, str]:
    try:
        cfg.save_query_view_config(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "saved"}


@app.get("/api/config/query-table")
def get_query_table_config(view_name: str, table: str) -> dict[str, Any]:
    try:
        return cfg.get_query_table_config(view_name, table)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config/query-table")
def save_query_table_config(payload: QueryTableConfigUpdateRequest) -> dict[str, str]:
    try:
        cfg.update_query_table_config(
            view_name=payload.view_name,
            table=payload.table,
            sort_by=payload.sort_by,
            sort_dir=payload.sort_dir,
            page_size=payload.page_size,
            columns=[c.model_dump() for c in payload.columns],
        )
        return {"status": "saved"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/config/group-baseline")
def get_group_baseline(group: str) -> dict[str, Any]:
    return {"group": group, "baseline_table": cfg.get_group_baseline(group)}


@app.post("/api/config/group-baseline")
def set_group_baseline(payload: GroupBaselineUpdateRequest) -> dict[str, str]:
    cfg.set_group_baseline(payload.group, payload.baseline_table)
    return {"status": "saved"}


@app.get("/api/config/query-group")
def get_query_group_config(view_name: str, group: str) -> dict[str, Any]:
    saved_baseline = cfg.get_group_baseline(group)
    schema_report = db.get_group_schema_report(group=group, baseline_table=saved_baseline)
    baseline_table = schema_report.get("baseline_table")
    if not baseline_table:
        raise HTTPException(status_code=400, detail=f"group 没有可用数据表: {group}")
    data = cfg.get_query_group_config(view_name=view_name, group=group, baseline_table=baseline_table)
    data["schema_report"] = schema_report
    return data


@app.post("/api/config/query-group")
def save_query_group_config(payload: QueryGroupConfigUpdateRequest) -> dict[str, str]:
    cfg.update_query_group_config(
        view_name=payload.view_name,
        group=payload.group,
        time_field=payload.time_field,
        sort_by=payload.sort_by,
        sort_dir=payload.sort_dir,
        page_size=payload.page_size,
        columns=[c.model_dump() for c in payload.columns],
        baseline_table=payload.baseline_table,
    )
    return {"status": "saved"}


@app.delete("/api/config/query-group")
def delete_query_group_config(view_name: str, group: str) -> dict[str, Any]:
    try:
        existed = cfg.delete_query_group_config(view_name=view_name, group=group)
        return {"status": "deleted" if existed else "not_found", "view_name": view_name, "group": group}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/config/plugins")
def get_plugins_config() -> dict[str, Any]:
    return _load_plugin_config()


@app.post("/api/config/plugins")
def save_plugins_config(payload: dict[str, Any]) -> dict[str, str]:
    try:
        _save_plugin_config(payload)
        return {"status": "saved"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
