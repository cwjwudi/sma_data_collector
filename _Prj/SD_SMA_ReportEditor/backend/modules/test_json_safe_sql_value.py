"""json_safe_sql_value：DATETIME 显示为库工具风格，避免 ISO T/+00:00。"""
from __future__ import annotations

import unittest
from datetime import date, datetime, time, timezone
from decimal import Decimal

from modules.db_readonly_service import json_safe_sql_rows, json_safe_sql_value


class JsonSafeSqlValueTest(unittest.TestCase):
    def test_datetime_naive_space_format(self) -> None:
        self.assertEqual(
            json_safe_sql_value(datetime(2026, 7, 10, 12, 50, 33)),
            "2026-07-10 12:50:33",
        )

    def test_datetime_aware_strips_tz_keeps_wall_clock(self) -> None:
        dt = datetime(2026, 7, 10, 13, 0, 51, tzinfo=timezone.utc)
        self.assertEqual(json_safe_sql_value(dt), "2026-07-10 13:00:51")

    def test_date_and_time(self) -> None:
        self.assertEqual(json_safe_sql_value(date(2026, 7, 10)), "2026-07-10")
        self.assertEqual(json_safe_sql_value(time(12, 50, 33)), "12:50:33")

    def test_decimal_and_rows(self) -> None:
        self.assertEqual(json_safe_sql_value(Decimal("42")), 42)
        self.assertEqual(json_safe_sql_value(Decimal("3.14")), 3.14)
        rows = json_safe_sql_rows(
            [{"DataRecipeTime": datetime(2026, 7, 10, 12, 50, 33), "n": 1}]
        )
        self.assertEqual(rows[0]["DataRecipeTime"], "2026-07-10 12:50:33")
        self.assertEqual(rows[0]["n"], 1)


if __name__ == "__main__":
    unittest.main()
