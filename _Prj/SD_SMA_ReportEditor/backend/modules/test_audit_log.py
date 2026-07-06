"""audit_log 筛选与 CSV 导出单元测试。"""
from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path

from modules import audit_log


class AuditLogFilterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_filter_by_result_and_time(self) -> None:
        now = time.time()
        audit_log.append_audit(self.data_dir, action="demo.health_check", result="ok", summary="a")
        audit_log.append_audit(self.data_dir, action="demo.health_check", result="fail", summary="b")
        res = audit_log.list_audit(
            self.data_dir,
            result="fail",
            from_ts=now - 10,
            to_ts=now + 10,
        )
        self.assertEqual(res["total"], 1)
        self.assertEqual(res["entries"][0]["summary"], "b")

    def test_export_csv_has_header(self) -> None:
        audit_log.append_audit(self.data_dir, action="config.export", result="ok", summary="x")
        csv_text = audit_log.export_audit_csv(self.data_dir)
        lines = csv_text.strip().splitlines()
        self.assertTrue(lines[0].startswith("time,action,result"))
        self.assertGreaterEqual(len(lines), 2)

    def test_import_entries_merge_dedup(self) -> None:
        audit_log.append_audit(self.data_dir, action="a.one", summary="local")
        existing = audit_log.list_audit(self.data_dir)["entries"]
        existing_id = existing[0]["id"]
        incoming = [
            {"id": existing_id, "ts": 1.0, "action": "a.one", "summary": "dup"},
            {"id": "new-1", "ts": 2.0, "action": "b.two", "summary": "imported"},
        ]
        added = audit_log.import_audit_entries(self.data_dir, incoming, replace=False)
        self.assertEqual(added, 1)  # 已存在的 id 去重，只新增 1 条
        res = audit_log.list_audit(self.data_dir)
        self.assertEqual(res["total"], 2)

    def test_import_entries_replace(self) -> None:
        audit_log.append_audit(self.data_dir, action="a.one", summary="local")
        incoming = [{"id": "only", "ts": 5.0, "action": "b.two", "summary": "kept"}]
        added = audit_log.import_audit_entries(self.data_dir, incoming, replace=True)
        self.assertEqual(added, 1)
        res = audit_log.list_audit(self.data_dir)
        self.assertEqual(res["total"], 1)
        self.assertEqual(res["entries"][0]["action"], "b.two")


if __name__ == "__main__":
    unittest.main()
