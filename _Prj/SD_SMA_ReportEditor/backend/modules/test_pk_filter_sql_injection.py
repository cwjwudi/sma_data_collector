"""表预览 pk 过滤：改用参数绑定，杜绝反斜杠转义差异导致的 MySQL 注入。

历史缺陷：``_sql_literal_filter`` 仅把 ``'`` 翻倍、不转义反斜杠，
MySQL 默认把 ``\\`` 当转义符，``foo\\' OR 1=1 --`` 类输入可逃出字符串字面量。
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest

from api.routers.database import _build_table_preview_sql
from modules.db_readonly_service import run_sqlite_readonly


# 典型 MySQL 逃逸载荷：反斜杠会吃掉后续引号（无首尾空白，避免与 strip 归一化混淆）
INJECTION = "foo\\' OR 1=1 --x"


class BuildTablePreviewSqlTest(unittest.TestCase):
    def test_mysql_filter_value_is_bound_not_inlined(self) -> None:
        select_sql, count_sql, params = _build_table_preview_sql(
            "mysql", "t", "name", INJECTION, 10, 0
        )
        # 值必须走参数绑定，不能出现在 SQL 文本里
        self.assertNotIn("OR 1=1", select_sql)
        self.assertNotIn(INJECTION, select_sql)
        self.assertIn("%s", select_sql)
        self.assertIn("%s", count_sql)
        self.assertEqual(params, [INJECTION])

    def test_sqlite_uses_qmark_placeholder(self) -> None:
        select_sql, count_sql, params = _build_table_preview_sql(
            "sqlite", "t", "name", INJECTION, 10, 0
        )
        self.assertNotIn(INJECTION, select_sql)
        self.assertIn("?", select_sql)
        self.assertEqual(params, [INJECTION])

    def test_numeric_value_keeps_typed_binding(self) -> None:
        _, _, params = _build_table_preview_sql("mysql", "t", "id", "42", 10, 0)
        self.assertEqual(params, [42])

    def test_no_filter_has_no_params(self) -> None:
        select_sql, _, params = _build_table_preview_sql("mysql", "t", None, None, 10, 0)
        self.assertEqual(params, [])
        self.assertNotIn("%s", select_sql)


class SqliteReadonlyParamBindingTest(unittest.TestCase):
    """端到端：注入载荷经参数绑定后被当作纯数据，不改变命中集合。"""

    def setUp(self) -> None:
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = sqlite3.connect(self.path)
        conn.execute("CREATE TABLE t (name TEXT)")
        conn.execute("INSERT INTO t (name) VALUES ('alice')")
        conn.execute("INSERT INTO t (name) VALUES ('bob')")
        conn.commit()
        conn.close()

    def tearDown(self) -> None:
        try:
            os.remove(self.path)
        except OSError:
            pass

    def test_injection_payload_matches_zero_rows(self) -> None:
        select_sql, _, params = _build_table_preview_sql(
            "sqlite", "t", "name", INJECTION, 10, 0
        )
        res = run_sqlite_readonly(self.path, select_sql, 10, params=params)
        # 若发生注入，OR 1=1 会返回全部 2 行；正确绑定则 0 行命中
        self.assertEqual(res["rows"], [])


if __name__ == "__main__":
    unittest.main()
