"""只读 SQL 校验：黑名单必须先归一化再按 token 边界扫描，堵住绕过。

历史缺陷：用 ``"INSERT "``（带尾空格）等子串黑名单 + 首词白名单判定只读，
可被「关键字后跟制表符/换行」「/* 注释 */ 拆词」「CTE 内 DML」绕过。
"""
from __future__ import annotations

import unittest

from modules.db_readonly_service import validate_readonly_sql


class ValidateReadonlyBypassTest(unittest.TestCase):
    def test_cte_delete_with_tab_is_rejected(self) -> None:
        # 首词 WITH 在白名单内，DELETE 后用制表符，旧逻辑放行 → 实际执行 DELETE
        sql = "WITH t AS (DELETE\tFROM users RETURNING *) SELECT * FROM t"
        with self.assertRaises(ValueError):
            validate_readonly_sql(sql)

    def test_cte_insert_with_block_comment_is_rejected(self) -> None:
        sql = "WITH t AS (INSERT/**/INTO x VALUES(1) RETURNING *) SELECT * FROM t"
        with self.assertRaises(ValueError):
            validate_readonly_sql(sql)

    def test_explain_hidden_delete_with_tab_is_rejected(self) -> None:
        sql = "EXPLAIN ANALYZE DELETE\tFROM users"
        with self.assertRaises(ValueError):
            validate_readonly_sql(sql)

    def test_update_with_newline_is_rejected(self) -> None:
        sql = "WITH t AS (UPDATE\nusers SET n=1 RETURNING *) SELECT * FROM t"
        with self.assertRaises(ValueError):
            validate_readonly_sql(sql)


class ValidateReadonlyLegitimateTest(unittest.TestCase):
    """确保合法只读语句仍放行（不得回归）。"""

    def test_plain_select_ok(self) -> None:
        self.assertEqual(
            validate_readonly_sql("SELECT * FROM users WHERE id = 1"),
            "SELECT * FROM users WHERE id = 1",
        )

    def test_cte_select_ok(self) -> None:
        sql = "WITH t AS (SELECT id FROM users) SELECT * FROM t"
        self.assertEqual(validate_readonly_sql(sql), sql)

    def test_replace_function_in_select_ok(self) -> None:
        # REPLACE() 是字符串函数，非 REPLACE INTO 语句
        sql = "SELECT REPLACE(name, 'a', 'b') FROM users"
        self.assertEqual(validate_readonly_sql(sql), sql)

    def test_truncate_function_in_select_ok(self) -> None:
        sql = "SELECT TRUNCATE(price, 2) FROM goods"
        self.assertEqual(validate_readonly_sql(sql), sql)

    def test_column_named_like_keyword_ok(self) -> None:
        # updated_at / created_at 等列名不应被误判
        sql = "SELECT updated_at, created_at, is_deleted FROM users"
        self.assertEqual(validate_readonly_sql(sql), sql)

    def test_show_and_explain_ok(self) -> None:
        self.assertEqual(validate_readonly_sql("SHOW TABLES"), "SHOW TABLES")
        self.assertEqual(
            validate_readonly_sql("EXPLAIN SELECT 1"), "EXPLAIN SELECT 1"
        )


if __name__ == "__main__":
    unittest.main()
