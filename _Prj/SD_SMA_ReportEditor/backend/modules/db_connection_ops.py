"""数据库连接：连通性测试逻辑（与 HTTP 层解耦，不向调用方抛出驱动层异常）。"""
from __future__ import annotations

from modules import db_readonly_service
from modules.connection_error_hints import humanize_db_error
from schemas.common import DbConnectionSave


def _mysql_family(engine: str) -> bool:
    return (engine or "").lower() in ("mysql", "mariadb")


def run_connectivity_test(
    body: DbConnectionSave,
    *,
    connection_name: str | None = None,
) -> tuple[bool, str | None]:
    """
    执行一次不落库的连通性检查。
    返回 (成功, 失败原因)；不因网络/认证错误抛异常。
    """
    try:
        engine = (body.engine or "").strip().lower()
        if not engine:
            return False, "请选择数据库引擎"
        pwd = body.password or ""
        if _mysql_family(engine):
            db_readonly_service.mysql_list_databases(
                (body.host or "").strip() or "127.0.0.1",
                int(body.port or 3306),
                (body.username or "").strip(),
                pwd,
            )
        elif engine == "postgres":
            db_readonly_service.postgres_list_databases(
                (body.host or "").strip() or "127.0.0.1",
                int(body.port or 5432),
                (body.username or "").strip(),
                pwd,
            )
        elif engine == "sqlite":
            path = (body.sqlite_path or "").strip()
            if not path:
                return False, "请填写 SQLite 数据库文件路径"
            db_readonly_service.introspect_sqlite_tables(path)
        elif engine == "mongodb":
            db_readonly_service.mongo_list_databases(
                {
                    "host": (body.host or "").strip() or "127.0.0.1",
                    "port": int(body.port or 27017),
                    "username": (body.username or "").strip(),
                    "password": pwd,
                    "auth_source": (body.mongo_auth_source or "admin").strip() or "admin",
                }
            )
        else:
            return False, f"不支持的引擎: {body.engine!r}"
        return True, None
    except Exception as e:
        return False, humanize_db_error(str(e), connection_name=connection_name)
