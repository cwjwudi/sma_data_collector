"""配置包 v3：审计字段校验与识别。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from modules import config_bundle as cb
from modules import json_head_scan as jhs


class ConfigBundleV3Test(unittest.TestCase):
    def test_bundle_version_is_3(self) -> None:
        self.assertEqual(cb.BUNDLE_VERSION, 3)

    def test_validate_accepts_audit_entries(self) -> None:
        data = cb.validate_bundle_payload(
            {
                "bundle_version": 3,
                "db_connections": [],
                "opcua_servers": [],
                "templates": [],
                "layout_presets": [],
                "signature_assets": [],
                "audit_entries": [{"id": "a1", "ts": 1.0, "action": "x"}],
            }
        )
        self.assertEqual(len(data["audit_entries"]), 1)

    def test_validate_defaults_missing_audit_entries(self) -> None:
        data = cb.validate_bundle_payload(
            {"bundle_version": 3, "db_connections": [], "opcua_servers": []}
        )
        self.assertEqual(data["audit_entries"], [])

    def test_is_bundle_payload_detects_audit_only(self) -> None:
        self.assertTrue(cb.is_bundle_payload({"audit_entries": []}))
        self.assertTrue(cb.is_bundle_payload({"bundle_version": 2}))


class JsonHeadScanTest(unittest.TestCase):
    def test_extract_top_level_string(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.json"
            doc = {
                "schemaVersion": 4,
                "id": "tpl-1",
                "name": "现场日报",
                "updatedAt": "2026-07-06",
                "elements": [{"id": "nested-id", "type": "image"}],
                "paperKind": "A3",
            }
            p.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
            head = jhs.read_head(p)
            self.assertEqual(jhs.extract_string(head, "id"), "tpl-1")  # 顶层 id 先于嵌套 id
            self.assertEqual(jhs.extract_string(head, "name"), "现场日报")
            self.assertEqual(jhs.extract_string(head, "updatedAt"), "2026-07-06")
            self.assertEqual(jhs.extract_string(head, "paperKind"), "A3")


if __name__ == "__main__":
    unittest.main()
