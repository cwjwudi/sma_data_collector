"""/database/query/sql 暴露 params：注入载荷走绑定，不进 SQL 文本。"""
from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from schemas.common import DbExecuteSqlRequest


INJECTION = "foo\\' OR 1=1 --x"


class DbExecuteSqlRequestParamsTest(unittest.TestCase):
    def test_params_field_defaults_none(self) -> None:
        body = DbExecuteSqlRequest(connection_id="c1", sql="SELECT 1")
        self.assertIsNone(body.params)

    def test_params_list_accepted(self) -> None:
        body = DbExecuteSqlRequest(
            connection_id="c1",
            sql="SELECT * FROM t WHERE name = ?",
            params=[INJECTION],
        )
        self.assertEqual(body.params, [INJECTION])
        self.assertNotIn(INJECTION, body.sql)


class QuerySqlPassesParamsTest(unittest.TestCase):
    def setUp(self) -> None:
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = sqlite3.connect(self.path)
        conn.execute("CREATE TABLE t (name TEXT)")
        conn.execute("INSERT INTO t (name) VALUES ('alice')")
        conn.commit()
        conn.close()

    def tearDown(self) -> None:
        try:
            os.remove(self.path)
        except OSError:
            pass

    def test_query_sql_forwards_params_to_sqlite(self) -> None:
        from api.routers import database as database_router

        async def _run() -> dict:
            with patch.object(
                database_router,
                "_conn_by_id",
                return_value={"engine": "sqlite", "sqlite_path": self.path},
            ), patch.object(database_router, "_credentials", return_value=("", "")):
                return await database_router.query_sql(
                    DbExecuteSqlRequest(
                        connection_id="local",
                        sql="SELECT name FROM t WHERE name = ?",
                        limit=10,
                        params=[INJECTION],
                    )
                )

        import asyncio

        res = asyncio.run(_run())
        # 绑定正确 → 0 行；若注入进字面量则可能命中全部
        self.assertEqual(res.get("rows"), [])


if __name__ == "__main__":
    unittest.main()
